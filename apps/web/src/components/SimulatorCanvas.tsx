import React, { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  EnvironmentObstacle,
  RoomEnvironment as OmniRoomEnvironment,
  VoxelIR,
  VoxelInstance,
} from '@omnivoxel/core';
import { VisualMode } from '../types';

interface SimulatorCanvasProps {
  ir: VoxelIR | null;
  room: OmniRoomEnvironment;
  visualMode: VisualMode;
  selectedVoxelId: string | null;
  selectedObstacleId?: string | null;
  showRoomBounds: boolean;
  showObstacles: boolean;
  showGrid: boolean;
  onSelectVoxel: (id: string | null) => void;
  onSelectObstacle?: (id: string | null) => void;
  cameraTrigger?: number;
}

interface VoxelMeshEntry {
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  detailGroup?: THREE.Group;
  voxel: VoxelInstance;
}

interface ObstacleMeshEntry {
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  baseOpacity: number;
  baseEdgeOpacity: number;
  obstacle: EnvironmentObstacle;
}

interface MeshRegistry {
  voxels: Map<string, VoxelMeshEntry>;
  obstacles: Map<string, ObstacleMeshEntry>;
  voxelPickList: THREE.Mesh[];
  obstaclePickList: THREE.Mesh[];
}

const FIT_VIEW_DIRECTION = new THREE.Vector3(0.76, -1.04, 0.72).normalize();

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
      node.geometry?.dispose();
      if (Array.isArray(node.material)) {
        node.material.forEach((m) => m.dispose());
      } else {
        node.material?.dispose();
      }
    }
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const SimulatorCanvas: React.FC<SimulatorCanvasProps> = ({
  ir,
  room,
  visualMode,
  selectedVoxelId,
  selectedObstacleId = null,
  showRoomBounds,
  showObstacles,
  showGrid,
  onSelectVoxel,
  onSelectObstacle,
  cameraTrigger = 0,
}) => {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Three.js core singletons stored in refs (decoupled from React render cycles)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const pointerRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const requestRenderRef = useRef<() => void>(() => {});
  const hasAutoFittedRef = useRef<boolean>(false);

  // Scene sub-groups
  const assemblyGroupRef = useRef<THREE.Group | null>(null);
  const roomGroupRef = useRef<THREE.Group | null>(null);

  // Mutable mesh registry ref for O(1) in-place highlight/material updates
  const meshesRef = useRef<MeshRegistry>({
    voxels: new Map(),
    obstacles: new Map(),
    voxelPickList: [],
    obstaclePickList: [],
  });

  // Cached canvas bounding rect to avoid synchronous layout reflows during pointermove
  const canvasRectRef = useRef<{ left: number; top: number; width: number; height: number }>({
    left: 0,
    top: 0,
    width: 800,
    height: 600,
  });

  // Hover & pointer interaction refs (zero React re-renders on hover/move)
  const hoveredVoxelIdRef = useRef<string | null>(null);
  const hoveredObstacleIdRef = useRef<string | null>(null);
  const pointerDownPosRef = useRef<{ x: number; y: number; button: number }>({
    x: 0,
    y: 0,
    button: 0,
  });
  const isDraggingRef = useRef<boolean>(false);

  // Stable refs for latest props & callbacks
  const irRef = useRef<VoxelIR | null>(ir);
  irRef.current = ir;
  const onSelectVoxelRef = useRef(onSelectVoxel);
  onSelectVoxelRef.current = onSelectVoxel;
  const onSelectObstacleRef = useRef(onSelectObstacle);
  onSelectObstacleRef.current = onSelectObstacle;
  const selectedVoxelIdRef = useRef<string | null>(selectedVoxelId);
  selectedVoxelIdRef.current = selectedVoxelId;
  const selectedObstacleIdRef = useRef<string | null>(selectedObstacleId ?? null);
  selectedObstacleIdRef.current = selectedObstacleId ?? null;
  const visualModeRef = useRef<VisualMode>(visualMode);
  visualModeRef.current = visualMode;

  // Frame camera tightly around the active voxel assembly
  const fitCameraToAssembly = useCallback(() => {
    const camera = cameraRef.current;
    const controls = orbitRef.current;
    const assemblyGroup = assemblyGroupRef.current;
    if (!camera || !controls || !assemblyGroup) return;

    const box = new THREE.Box3();
    let hasVoxel = false;

    meshesRef.current.voxels.forEach((entry) => {
      entry.group.updateMatrixWorld(true);
      box.expandByObject(entry.mesh);
      hasVoxel = true;
    });

    if (!hasVoxel) {
      controls.target.set(0.2, 0.2, 0.15);
      camera.position.set(1.0, -1.25, 0.95);
      controls.minDistance = 0.25;
      controls.maxDistance = 12;
      controls.update();
      requestRenderRef.current();
      return;
    }

    const center = new THREE.Vector3();
    const sphere = new THREE.Sphere();
    box.getCenter(center);
    box.getBoundingSphere(sphere);

    const radius = Math.max(sphere.radius, 0.14);
    const vFovRad = THREE.MathUtils.degToRad(camera.fov);
    const aspect = Math.max(0.5, camera.aspect || 1.33);
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
    const limitingHalfFov = Math.min(vFovRad, hFovRad) / 2;

    // Frame voxels large and central (~62% of viewport) with comfortable breathing room
    const fitDistance = Math.max(
      (radius / Math.sin(limitingHalfFov)) * 1.18,
      0.56
    );

    controls.target.copy(center);
    camera.position
      .copy(center)
      .addScaledVector(FIT_VIEW_DIRECTION, fitDistance);
    controls.minDistance = Math.max(0.22, radius * 0.75);
    controls.maxDistance = Math.max(10, radius * 16);
    camera.updateProjectionMatrix();
    controls.update();
    requestRenderRef.current();
  }, []);

  // In-place material update helper using current refs (zero geometry/mesh recreation)
  const updateAllMaterialsInPlace = useCallback(() => {
    const currentSelectedVoxelId = selectedVoxelIdRef.current;
    const currentSelectedObstacleId = selectedObstacleIdRef.current;
    const currentHoveredVoxelId = hoveredVoxelIdRef.current;
    const currentHoveredObstacleId = hoveredObstacleIdRef.current;
    const currentMode = visualModeRef.current;

    meshesRef.current.voxels.forEach((entry) => {
      const isSelected = currentSelectedVoxelId === entry.voxel.id;
      const isHovered = currentHoveredVoxelId === entry.voxel.id;
      applyVoxelStyle(entry, isSelected, isHovered, currentMode);
    });

    const busLinesGroup = assemblyGroupRef.current?.getObjectByName('busLinesGroup');
    if (busLinesGroup) {
      busLinesGroup.visible = currentMode === 'Bus' || currentMode === 'Assembly';
      busLinesGroup.children.forEach((child) => {
        if (child.userData?.isControlPlaneDot) {
          child.visible = currentMode === 'Bus';
        }
      });
    }

    meshesRef.current.obstacles.forEach((entry) => {
      const { mesh, edges, obstacle, baseOpacity, baseEdgeOpacity } = entry;
      const isSelected = currentSelectedObstacleId === obstacle.id;
      const isHovered = currentHoveredObstacleId === obstacle.id;

      mesh.material.opacity = isSelected
        ? Math.min(0.42, baseOpacity + 0.2)
        : isHovered
        ? Math.min(0.32, baseOpacity + 0.1)
        : baseOpacity;
      mesh.material.emissive.setHex(
        isSelected ? 0x38bdf8 : isHovered ? 0xf59e0b : 0x000000
      );
      mesh.material.emissiveIntensity = isSelected ? 0.35 : isHovered ? 0.18 : 0;

      edges.material.color.setHex(
        isSelected
          ? 0x38bdf8
          : isHovered
          ? 0xfbbf24
          : obstacle.isFixed
          ? 0x64748b
          : 0x60a5fa
      );
      edges.material.opacity = isSelected
        ? 0.85
        : isHovered
        ? 0.65
        : baseEdgeOpacity;
    });

    requestRenderRef.current();
  }, []);

  // =========================================================================
  // 1. One-Time Scene, Camera, Renderer & OrbitControls Setup
  // =========================================================================
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const initialRect = mount.getBoundingClientRect();
    const width = Math.max(1, initialRect.width || mount.clientWidth || 800);
    const height = Math.max(1, initialRect.height || mount.clientHeight || 600);
    canvasRectRef.current = {
      left: initialRect.left,
      top: initialRect.top,
      width,
      height,
    };

    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl =
        probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // Scene with subtle studio dark slate background & gentle depth fog
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090e1a);
    scene.fog = new THREE.FogExp2(0x090e1a, 0.045);
    sceneRef.current = scene;

    // Camera (+Z vertical CAD coordinate convention, crisp 38° architectural FOV)
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.02, 80);
    camera.up.set(0, 0, 1);
    camera.position.set(1.1, -1.4, 1.0);
    cameraRef.current = camera;

    // Renderer (capped pixelRatio <= 2, ACES Filmic tone mapping)
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Procedural Studio Environment Reflections (PMREM RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // OrbitControls attached directly to renderer.domElement
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 + 0.12;
    controls.target.set(0.08, 0.08, 0.08);
    controls.update();
    orbitRef.current = controls;

    // Balanced 3-Point Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.6);
    keyLight.position.set(3.5, -4.0, 6.5);
    keyLight.castShadow = !isSoftwareGl;
    if (keyLight.castShadow) {
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0004;
      keyLight.shadow.normalBias = 0.015;
    }
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.65);
    fillLight.position.set(-4.5, 3.0, 2.5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    rimLight.position.set(0.5, 5.0, 3.5);
    scene.add(rimLight);

    // Persistent Scene Sub-Groups
    const roomGroup = new THREE.Group();
    roomGroup.name = 'roomEnvironmentGroup';
    scene.add(roomGroup);
    roomGroupRef.current = roomGroup;

    const assemblyGroup = new THREE.Group();
    assemblyGroup.name = 'voxelAssemblyGroup';
    scene.add(assemblyGroup);
    assemblyGroupRef.current = assemblyGroup;

    // Coalesced On-Demand Render Loop
    let rafId = 0;
    let renderScheduled = false;

    const renderFrame = () => {
      renderScheduled = false;
      const stillDamping = controls.update();
      renderer.render(scene, camera);
      if (controls.enableDamping && stillDamping) {
        scheduleRender();
      }
    };

    const scheduleRender = () => {
      if (renderScheduled) return;
      renderScheduled = true;
      rafId = requestAnimationFrame(renderFrame);
    };

    requestRenderRef.current = scheduleRender;

    const onControlsStart = () => {
      if (tooltipRef.current) {
        tooltipRef.current.style.display = 'none';
      }
    };

    const onControlsChange = () => {
      scheduleRender();
    };

    controls.addEventListener('start', onControlsStart);
    controls.addEventListener('change', onControlsChange);

    // Resize handling (ResizeObserver + window resize)
    const updateSizeAndRect = () => {
      const rect = mount.getBoundingClientRect();
      const newWidth = Math.max(1, rect.width || mount.clientWidth);
      const newHeight = Math.max(1, rect.height || mount.clientHeight);
      canvasRectRef.current = {
        left: rect.left,
        top: rect.top,
        width: newWidth,
        height: newHeight,
      };
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(
        isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
      );
      renderer.setSize(newWidth, newHeight);
      scheduleRender();
    };

    const resizeObserver = new ResizeObserver(() => {
      updateSizeAndRect();
    });
    resizeObserver.observe(mount);
    window.addEventListener('resize', updateSizeAndRect, { passive: true });

    // =========================================================================
    // Non-Blocking Pointer & Raycast Handlers (Throttled to rAF, Zero setState)
    // =========================================================================
    const dom = renderer.domElement;
    let hoverRafId = 0;
    let latestMoveEvent: { clientX: number; clientY: number; buttons: number } | null =
      null;

    const updateTooltipDom = (
      voxel: VoxelInstance | null,
      obstacle: EnvironmentObstacle | null
    ) => {
      const tooltipEl = tooltipRef.current;
      if (!tooltipEl) return;

      if (!voxel && !obstacle) {
        tooltipEl.style.display = 'none';
        return;
      }

      if (voxel) {
        const mass = voxel.manifest.mechanical?.massKg ?? 0;
        const tdp = voxel.manifest.thermal?.tdpWatts ?? 0;
        const dissip = voxel.manifest.thermal?.passiveDissipationWatts ?? 0;
        tooltipEl.innerHTML = `
          <div class="space-y-1">
            <div class="flex items-center justify-between gap-3">
              <span class="font-mono font-bold text-sky-400">${escapeHtml(voxel.id)}</span>
              <span class="font-mono text-[10px] uppercase text-slate-400">${escapeHtml(voxel.manifest.category)}</span>
            </div>
            <div class="text-[11px] font-medium text-slate-200">${escapeHtml(voxel.manifest.name)}</div>
            <div class="grid grid-cols-2 gap-x-3 pt-1 font-mono text-[10px] tabular-nums text-slate-400">
              <span>Coord: (${voxel.coord.x}, ${voxel.coord.y}, ${voxel.coord.z})</span>
              <span>Mass: ${mass} kg</span>
              <span>TDP: ${tdp} W</span>
              <span>Cool: ${dissip} W</span>
            </div>
          </div>
        `;
      } else if (obstacle) {
        tooltipEl.innerHTML = `
          <div class="space-y-1">
            <div class="flex items-center justify-between gap-3">
              <span class="font-semibold text-amber-400">${escapeHtml(obstacle.name || obstacle.id)}</span>
              <span class="font-mono text-[10px] uppercase text-slate-400">${escapeHtml(obstacle.type)}</span>
            </div>
            <div class="font-mono text-[10px] tabular-nums text-slate-400">
              ${obstacle.boundsMinMm.x}..${obstacle.boundsMaxMm.x} × ${obstacle.boundsMinMm.y}..${obstacle.boundsMaxMm.y} × ${obstacle.boundsMinMm.z}..${obstacle.boundsMaxMm.z} mm
            </div>
          </div>
        `;
      }

      tooltipEl.style.display = 'block';
    };

    const pickAtClientPoint = (clientX: number, clientY: number) => {
      const rect = canvasRectRef.current;
      if (rect.width <= 0 || rect.height <= 0) return { voxel: null, obstacle: null };

      const pointer = pointerRef.current;
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = raycasterRef.current;
      raycaster.setFromCamera(pointer, camera);

      const voxelHits = raycaster.intersectObjects(
        meshesRef.current.voxelPickList,
        false
      );
      if (voxelHits.length > 0 && voxelHits[0].object.userData?.isVoxel) {
        return {
          voxel: voxelHits[0].object.userData.voxel as VoxelInstance,
          obstacle: null,
        };
      }

      const obstacleHits = raycaster.intersectObjects(
        meshesRef.current.obstaclePickList,
        false
      );
      if (obstacleHits.length > 0 && obstacleHits[0].object.userData?.isObstacle) {
        return {
          voxel: null,
          obstacle: obstacleHits[0].object.userData.obstacle as EnvironmentObstacle,
        };
      }

      return { voxel: null, obstacle: null };
    };

    const processHoverFrame = () => {
      hoverRafId = 0;
      const evt = latestMoveEvent;
      if (!evt) return;

      const rect = canvasRectRef.current;
      const localX = evt.clientX - rect.left + 14;
      const localY = evt.clientY - rect.top + 14;
      if (tooltipRef.current) {
        const maxX = Math.max(8, rect.width - 250);
        const maxY = Math.max(8, rect.height - 130);
        tooltipRef.current.style.left = `${Math.min(localX, maxX)}px`;
        tooltipRef.current.style.top = `${Math.min(localY, maxY)}px`;
      }

      const { voxel: foundVoxel, obstacle: foundObstacle } = pickAtClientPoint(
        evt.clientX,
        evt.clientY
      );

      const nextVoxelId = foundVoxel?.id || null;
      const nextObstacleId = foundObstacle?.id || null;

      if (
        nextVoxelId !== hoveredVoxelIdRef.current ||
        nextObstacleId !== hoveredObstacleIdRef.current
      ) {
        hoveredVoxelIdRef.current = nextVoxelId;
        hoveredObstacleIdRef.current = nextObstacleId;
        updateAllMaterialsInPlace();
        updateTooltipDom(foundVoxel, foundObstacle);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      canvasRectRef.current = {
        left: rect.left,
        top: rect.top,
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      };
      pointerDownPosRef.current = {
        x: e.clientX,
        y: e.clientY,
        button: e.button,
      };
      isDraggingRef.current = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons !== 0) {
        const dx = e.clientX - pointerDownPosRef.current.x;
        const dy = e.clientY - pointerDownPosRef.current.y;
        if (dx * dx + dy * dy > 16) {
          isDraggingRef.current = true;
          if (tooltipRef.current) {
            tooltipRef.current.style.display = 'none';
          }
        }
        return;
      }

      latestMoveEvent = {
        clientX: e.clientX,
        clientY: e.clientY,
        buttons: e.buttons,
      };
      if (!hoverRafId) {
        hoverRafId = requestAnimationFrame(processHoverFrame);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - pointerDownPosRef.current.x;
      const dy = e.clientY - pointerDownPosRef.current.y;
      const distSq = dx * dx + dy * dy;

      if (e.button !== 0 || distSq > 25 || isDraggingRef.current) {
        isDraggingRef.current = false;
        return;
      }
      isDraggingRef.current = false;

      const { voxel: hitVoxel, obstacle: hitObstacle } = pickAtClientPoint(
        e.clientX,
        e.clientY
      );

      if (hitVoxel) {
        if (selectedVoxelIdRef.current !== hitVoxel.id) {
          selectedVoxelIdRef.current = hitVoxel.id;
          selectedObstacleIdRef.current = null;
          updateAllMaterialsInPlace();
          onSelectVoxelRef.current(hitVoxel.id);
          onSelectObstacleRef.current?.(null);
        }
      } else if (hitObstacle) {
        if (selectedObstacleIdRef.current !== hitObstacle.id) {
          selectedObstacleIdRef.current = hitObstacle.id;
          selectedVoxelIdRef.current = null;
          updateAllMaterialsInPlace();
          onSelectObstacleRef.current?.(hitObstacle.id);
          onSelectVoxelRef.current(null);
        }
      } else if (
        selectedVoxelIdRef.current !== null ||
        selectedObstacleIdRef.current !== null
      ) {
        selectedVoxelIdRef.current = null;
        selectedObstacleIdRef.current = null;
        updateAllMaterialsInPlace();
        onSelectVoxelRef.current(null);
        onSelectObstacleRef.current?.(null);
      }
    };

    const onPointerLeave = () => {
      if (hoverRafId) {
        cancelAnimationFrame(hoverRafId);
        hoverRafId = 0;
      }
      latestMoveEvent = null;

      if (hoveredVoxelIdRef.current || hoveredObstacleIdRef.current) {
        hoveredVoxelIdRef.current = null;
        hoveredObstacleIdRef.current = null;
        updateAllMaterialsInPlace();
      }
      if (tooltipRef.current) {
        tooltipRef.current.style.display = 'none';
      }
    };

    dom.addEventListener('pointerdown', onPointerDown, { passive: true });
    dom.addEventListener('pointermove', onPointerMove, { passive: true });
    dom.addEventListener('pointerup', onPointerUp, { passive: true });
    dom.addEventListener('pointerleave', onPointerLeave, { passive: true });

    scheduleRender();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (hoverRafId) cancelAnimationFrame(hoverRafId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSizeAndRect);
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('change', onControlsChange);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointerleave', onPointerLeave);

      disposeObjectTree(scene);
      scene.clear();
      envTarget.dispose();
      controls.dispose();
      renderer.dispose();

      meshesRef.current.voxels.clear();
      meshesRef.current.obstacles.clear();
      meshesRef.current.voxelPickList = [];
      meshesRef.current.obstaclePickList = [];

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      orbitRef.current = null;
      hasAutoFittedRef.current = false;
    };
  }, [updateAllMaterialsInPlace]);

  // =========================================================================
  // 2. Build Subtle Room Bounds, Floor Grid & Translucent Furniture Guides
  // =========================================================================
  useEffect(() => {
    const roomGroup = roomGroupRef.current;
    if (!roomGroup) return;

    disposeObjectTree(roomGroup);
    roomGroup.clear();
    meshesRef.current.obstacles.clear();
    meshesRef.current.obstaclePickList = [];

    const minX = (room.boundsMinMm?.x ?? 0) / 1000;
    const minY = (room.boundsMinMm?.y ?? 0) / 1000;
    const minZ = (room.boundsMinMm?.z ?? 0) / 1000;
    const maxX = (room.boundsMaxMm?.x ?? room.dimensionsMm.x) / 1000;
    const maxY = (room.boundsMaxMm?.y ?? room.dimensionsMm.y) / 1000;
    const maxZ = (room.boundsMaxMm?.z ?? room.dimensionsMm.z) / 1000;

    const sizeX = Math.max(0.3, maxX - minX);
    const sizeY = Math.max(0.3, maxY - minY);
    const sizeZ = Math.max(0.3, maxZ - minZ);
    const centerX = minX + sizeX / 2;
    const centerY = minY + sizeY / 2;
    const centerZ = minZ + sizeZ / 2;

    // Subtle Architectural Floor Grid (Sized to Room Bounds)
    if (showGrid) {
      const gridSpan = Math.max(sizeX, sizeY);
      const divisions = Math.max(8, Math.min(32, Math.round(gridSpan / 0.15)));
      const gridHelper = new THREE.GridHelper(
        gridSpan,
        divisions,
        0x1e3a5f,
        0x131d31
      );
      gridHelper.rotation.x = Math.PI / 2;
      gridHelper.position.set(centerX, centerY, minZ - 0.002);
      const gridMat = gridHelper.material;
      if (Array.isArray(gridMat)) {
        gridMat.forEach((m) => {
          m.transparent = true;
          m.opacity = 0.42;
          m.depthWrite = false;
        });
      } else {
        gridMat.transparent = true;
        gridMat.opacity = 0.42;
        gridMat.depthWrite = false;
      }
      roomGroup.add(gridHelper);
    }

    // Subtle Hairline Room Bounds Wireframe
    if (showRoomBounds) {
      const boxGeo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
      const edgeGeo = new THREE.EdgesGeometry(boxGeo);
      boxGeo.dispose();
      const line = new THREE.LineSegments(
        edgeGeo,
        new THREE.LineBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        })
      );
      line.position.set(centerX, centerY, centerZ);
      roomGroup.add(line);
    }

    // Translucent Furniture & Architectural Obstacle Guides
    if (showObstacles && room.obstacles) {
      for (const obst of room.obstacles) {
        const oMinX = obst.boundsMinMm.x / 1000;
        const oMinY = obst.boundsMinMm.y / 1000;
        const oMinZ = obst.boundsMinMm.z / 1000;
        const oMaxX = obst.boundsMaxMm.x / 1000;
        const oMaxY = obst.boundsMaxMm.y / 1000;
        const oMaxZ = obst.boundsMaxMm.z / 1000;

        const oSizeX = Math.max(0.01, oMaxX - oMinX);
        const oSizeY = Math.max(0.01, oMaxY - oMinY);
        const oSizeZ = Math.max(0.01, oMaxZ - oMinZ);

        const oCenterX = oMinX + oSizeX / 2;
        const oCenterY = oMinY + oSizeY / 2;
        const oCenterZ = oMinZ + oSizeZ / 2;

        const obstGroup = new THREE.Group();
        obstGroup.position.set(oCenterX, oCenterY, oCenterZ);

        let baseColor = 0x475569;
        let baseOpacity = 0.14;
        let baseEdgeOpacity = 0.34;
        if (obst.type === 'wall') {
          baseColor = 0x334155;
          baseOpacity = 0.08;
          baseEdgeOpacity = 0.22;
        } else if (obst.type === 'furniture') {
          baseColor = obst.color
            ? parseInt(obst.color.replace('#', '0x'), 16)
            : 0x64748b;
          baseOpacity = 0.18;
          baseEdgeOpacity = 0.4;
        } else if (obst.type === 'appliance') {
          baseColor = 0x475569;
          baseOpacity = 0.14;
          baseEdgeOpacity = 0.32;
        }

        const meshGeo = new THREE.BoxGeometry(oSizeX, oSizeY, oSizeZ);
        const meshMat = new THREE.MeshStandardMaterial({
          color: baseColor,
          transparent: true,
          opacity: baseOpacity,
          roughness: 0.9,
          metalness: 0.05,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(meshGeo, meshMat);
        mesh.userData = { isObstacle: true, obstacle: obst };
        mesh.renderOrder = 1;
        obstGroup.add(mesh);

        const edgesGeo = new THREE.EdgesGeometry(meshGeo);
        const edgesMat = new THREE.LineBasicMaterial({
          color: obst.isFixed ? 0x64748b : 0x60a5fa,
          transparent: true,
          opacity: baseEdgeOpacity,
          depthWrite: false,
        });
        const edges = new THREE.LineSegments(edgesGeo, edgesMat);
        edges.renderOrder = 2;
        obstGroup.add(edges);

        meshesRef.current.obstacles.set(obst.id, {
          group: obstGroup,
          mesh,
          edges,
          baseOpacity,
          baseEdgeOpacity,
          obstacle: obst,
        });
        meshesRef.current.obstaclePickList.push(mesh);
        roomGroup.add(obstGroup);
      }
    }

    updateAllMaterialsInPlace();
  }, [room, showRoomBounds, showObstacles, showGrid, updateAllMaterialsInPlace]);

  // =========================================================================
  // 4. Build Beveled Voxel Meshes & Bus Conduits (Runs ONLY when IR changes)
  // =========================================================================
  useEffect(() => {
    const assemblyGroup = assemblyGroupRef.current;
    if (!assemblyGroup) return;

    disposeObjectTree(assemblyGroup);
    assemblyGroup.clear();
    meshesRef.current.voxels.clear();
    meshesRef.current.voxelPickList = [];

    if (!ir || ir.voxels.length === 0) {
      requestRenderRef.current();
      return;
    }

    const voxelEntries = new Map<string, VoxelMeshEntry>();
    const pickMeshes: THREE.Mesh[] = [];

    for (const v of ir.voxels) {
      const pitch = v.manifest.mechanical?.dimensionsMm ?? {
        x: 150,
        y: 150,
        z: 150,
      };
      const sizeX = pitch.x / 1000;
      const sizeY = pitch.y / 1000;
      const sizeZ = pitch.z / 1000;

      const posX = (v.coord.x * pitch.x + pitch.x / 2) / 1000;
      const posY = (v.coord.y * pitch.y + pitch.y / 2) / 1000;
      const posZ = (v.coord.z * pitch.z + pitch.z / 2) / 1000;

      const group = new THREE.Group();
      group.position.set(posX, posY, posZ);

      const gapScale = 0.94;
      const w = sizeX * gapScale;
      const d = sizeY * gapScale;
      const h = sizeZ * gapScale;
      const bevelRadius = Math.min(w, d, h) * 0.065;

      // Chamfered / Beveled Cube Geometry for crisp specular edge highlights
      const voxelGeo = new RoundedBoxGeometry(w, d, h, 2, bevelRadius);
      const voxelMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.45,
        roughness: 0.32,
      });

      const mesh = new THREE.Mesh(voxelGeo, voxelMat);
      mesh.userData = { isVoxel: true, voxel: v };
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      // Subtle Crisp Architectural Edge Cage
      const edgeBoxGeo = new THREE.BoxGeometry(w * 1.004, d * 1.004, h * 1.004);
      const edgeGeo = new THREE.EdgesGeometry(edgeBoxGeo);
      edgeBoxGeo.dispose();
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0.65,
      });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      group.add(edges);

      let detailGroup: THREE.Group | undefined;

      // Display module recessed glass face accent
      if (v.manifest.category === 'display') {
        detailGroup = new THREE.Group();
        const bezelGeo = new THREE.PlaneGeometry(w * 0.88, d * 0.88);
        const bezelMat = new THREE.MeshStandardMaterial({
          color: 0x0b1220,
          roughness: 0.25,
          metalness: 0.3,
        });
        const bezel = new THREE.Mesh(bezelGeo, bezelMat);
        bezel.position.set(0, 0, h / 2 + 0.0012);
        detailGroup.add(bezel);

        const screenGeo = new THREE.PlaneGeometry(w * 0.78, d * 0.78);
        const screenMat = new THREE.MeshStandardMaterial({
          color: 0x0ea5e9,
          emissive: 0x38bdf8,
          emissiveIntensity: 0.55,
          roughness: 0.12,
          metalness: 0.1,
        });
        const screenMesh = new THREE.Mesh(screenGeo, screenMat);
        screenMesh.position.set(0, 0, h / 2 + 0.0022);
        detailGroup.add(screenMesh);
        group.add(detailGroup);
      }

      // Heatsink fin lines on top face of structural aluminum voxels
      if (v.manifest.thermal?.isHeatsink) {
        detailGroup = detailGroup ?? new THREE.Group();
        const finGeo = new THREE.BoxGeometry(w * 0.78, d * 0.045, 0.003);
        const finMat = new THREE.MeshStandardMaterial({
          color: 0xcbd5e1,
          metalness: 0.8,
          roughness: 0.28,
        });
        for (let i = -2; i <= 2; i++) {
          const fin = new THREE.Mesh(finGeo, finMat);
          fin.position.set(0, i * (d * 0.14), h / 2 + 0.0015);
          detailGroup.add(fin);
        }
        group.add(detailGroup);
      }

      voxelEntries.set(v.id, { group, mesh, edges, detailGroup, voxel: v });
      pickMeshes.push(mesh);
      assemblyGroup.add(group);
    }

    meshesRef.current.voxels = voxelEntries;
    meshesRef.current.voxelPickList = pickMeshes;

    // Bus Interconnect Conduits
    const busLinesGroup = new THREE.Group();
    busLinesGroup.name = 'busLinesGroup';

    for (const link of ir.links) {
      const vA = ir.getVoxel(link.sourceId);
      const vB = ir.getVoxel(link.targetId);
      if (!vA || !vB) continue;

      const pA = vA.manifest.mechanical?.dimensionsMm ?? {
        x: 150,
        y: 150,
        z: 150,
      };
      const pB = vB.manifest.mechanical?.dimensionsMm ?? {
        x: 150,
        y: 150,
        z: 150,
      };

      const posA = new THREE.Vector3(
        (vA.coord.x * pA.x + pA.x / 2) / 1000,
        (vA.coord.y * pA.y + pA.y / 2) / 1000,
        (vA.coord.z * pA.z + pA.z / 2) / 1000
      );
      const posB = new THREE.Vector3(
        (vB.coord.x * pB.x + pB.x / 2) / 1000,
        (vB.coord.y * pB.y + pB.y / 2) / 1000,
        (vB.coord.z * pB.z + pB.z / 2) / 1000
      );

      if (link.highSpeedPlane.connected) {
        const curve = new THREE.LineCurve3(posA, posB);
        const tubeGeo = new THREE.TubeGeometry(curve, 6, 0.011, 8, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: 0x8b5cf6,
          transparent: true,
          opacity: 0.9,
        });
        const tube = new THREE.Mesh(tubeGeo, tubeMat);
        busLinesGroup.add(tube);
      }

      if (link.controlPlane.connected) {
        const midPoint = new THREE.Vector3()
          .addVectors(posA, posB)
          .multiplyScalar(0.5);
        const sphereGeo = new THREE.SphereGeometry(0.014, 8, 8);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.copy(midPoint);
        sphere.userData = { isControlPlaneDot: true };
        busLinesGroup.add(sphere);
      }
    }
    assemblyGroup.add(busLinesGroup);

    updateAllMaterialsInPlace();

    // Auto-fit camera closely to the assembly on initial load
    if (!hasAutoFittedRef.current) {
      hasAutoFittedRef.current = true;
      fitCameraToAssembly();
    }
  }, [ir, updateAllMaterialsInPlace, fitCameraToAssembly]);

  // =========================================================================
  // 4. Camera Fit Trigger (Runs AFTER IR Meshes Are Built)
  // =========================================================================
  useEffect(() => {
    if (cameraTrigger === 0) return;
    fitCameraToAssembly();
  }, [cameraTrigger, fitCameraToAssembly]);

  // =========================================================================
  // 5. Fast In-Place Selection & Visual Mode Updates
  // =========================================================================
  useEffect(() => {
    updateAllMaterialsInPlace();
  }, [visualMode, selectedVoxelId, selectedObstacleId, updateAllMaterialsInPlace]);

  return (
    <div className="relative h-full w-full cursor-grab overflow-hidden select-none active:cursor-grabbing">
      {/* Dedicated Three.js Canvas Mount Node */}
      <div ref={canvasMountRef} className="absolute inset-0 h-full w-full" />

      {/* 3D Floating Tooltip (Updated via DOM ref — 0 React re-renders on hover) */}
      <div
        ref={tooltipRef}
        style={{ display: 'none' }}
        className="pointer-events-none absolute z-20 rounded-md border border-slate-700/90 bg-[#0d1526] px-3 py-2 text-xs text-slate-100 shadow-2xl"
      />

      {/* Subtle Axis Orientation Legend (Bottom-Left) */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-md border border-slate-800/80 bg-[#090e1a]/90 px-2.5 py-1 text-[11px] font-mono text-slate-400">
        <span className="text-rose-400">+X</span>
        <span className="text-emerald-400">+Y</span>
        <span className="text-sky-400">+Z</span>
      </div>

      {/* Mode-Specific Compact Scale Legend (Bottom-Right, only in Thermal or Bus mode) */}
      {visualMode === 'Thermal' && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-2.5 rounded-md border border-slate-800/80 bg-[#090e1a]/90 px-3 py-1.5 text-[11px] text-slate-300">
          <span className="text-sky-400">Cool</span>
          <div
            className="h-2 w-24 rounded-sm"
            style={{
              background:
                'linear-gradient(90deg, #0284c7 0%, #14b8a6 32%, #f59e0b 66%, #ef4444 100%)',
            }}
          />
          <span className="text-red-400">Hot</span>
        </div>
      )}

      {visualMode === 'Bus' && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-3 rounded-md border border-slate-800/80 bg-[#090e1a]/90 px-3 py-1.5 text-[11px] text-slate-300">
          <span className="text-violet-400">High-Speed Bus</span>
          <span className="text-slate-600">·</span>
          <span className="text-emerald-400">Control Plane</span>
        </div>
      )}
    </div>
  );
};

/**
 * Updates colors, PBR roughness/metalness, and highlights on existing mesh materials in-place.
 */
function applyVoxelStyle(
  entry: VoxelMeshEntry,
  isSelected: boolean,
  isHovered: boolean,
  mode: VisualMode
) {
  const { mesh, edges, detailGroup, voxel } = entry;

  let cubeColor = 0x94a3b8;
  let emissiveColor = 0x000000;
  let emissiveIntensity = 0;
  let metalness = 0.45;
  let roughness = 0.34;
  let edgeColor = 0x1e293b;
  let edgeOpacity = 0.65;

  if (mode === 'Assembly') {
    switch (voxel.manifest.category) {
      case 'structural':
        cubeColor = 0xb8c4d4;
        metalness = 0.72;
        roughness = 0.28;
        edgeColor = 0x334155;
        break;
      case 'actuated':
        cubeColor = 0xf97316;
        metalness = 0.52;
        roughness = 0.34;
        edgeColor = 0x7c2d12;
        break;
      case 'compute':
        cubeColor = 0x3730a3;
        emissiveColor = 0x0ea5e9;
        emissiveIntensity = 0.22;
        metalness = 0.48;
        roughness = 0.26;
        edgeColor = 0x38bdf8;
        edgeOpacity = 0.55;
        break;
      case 'display':
        cubeColor = 0x1e293b;
        emissiveColor = 0x0284c7;
        emissiveIntensity = 0.18;
        metalness = 0.35;
        roughness = 0.22;
        edgeColor = 0x38bdf8;
        edgeOpacity = 0.55;
        break;
      case 'power':
        cubeColor = 0x10b981;
        emissiveColor = 0x047857;
        emissiveIntensity = 0.14;
        metalness = 0.42;
        roughness = 0.34;
        edgeColor = 0x064e3b;
        break;
      case 'io':
        cubeColor = 0xeab308;
        metalness = 0.28;
        roughness = 0.38;
        edgeColor = 0x713f12;
        break;
    }
  } else if (mode === 'Thermal') {
    const tdp = voxel.manifest.thermal?.tdpWatts ?? 0;
    const dissipation = voxel.manifest.thermal?.passiveDissipationWatts ?? 0;
    metalness = 0.18;
    roughness = 0.38;

    // Clear Thermal Heatmap: Cool Blue/Teal -> Warm Amber -> Hot Red
    if (tdp >= 25) {
      // Hot crimson core (e.g., 35W GPU)
      cubeColor = 0xef4444;
      emissiveColor = 0xdc2626;
      emissiveIntensity = 0.52;
      edgeColor = 0xfca5a5;
      edgeOpacity = 0.75;
    } else if (tdp >= 10) {
      // Deep orange heat zone
      cubeColor = 0xf97316;
      emissiveColor = 0xea580c;
      emissiveIntensity = 0.36;
      edgeColor = 0xfdba74;
      edgeOpacity = 0.7;
    } else if (tdp >= 4) {
      // Warm amber-orange (e.g., 6W OLED display)
      cubeColor = 0xf59e0b;
      emissiveColor = 0xd97706;
      emissiveIntensity = 0.28;
      edgeColor = 0xfde68a;
      edgeOpacity = 0.65;
    } else if (tdp >= 1.5) {
      // Mild warm amber (e.g., 3W battery / actuator)
      cubeColor = 0xeab308;
      emissiveColor = 0xca8a04;
      emissiveIntensity = 0.18;
      edgeColor = 0xfef08a;
      edgeOpacity = 0.55;
    } else if (tdp > 0) {
      // Cool teal low-power (e.g., 0.5W gamepad IO)
      cubeColor = 0x14b8a6;
      emissiveColor = 0x0f766e;
      emissiveIntensity = 0.2;
      edgeColor = 0x5eead4;
      edgeOpacity = 0.55;
    } else if (dissipation >= 10) {
      // Active passive heatsink (0W TDP, 12W cooling) -> Cool Deep Blue
      cubeColor = 0x0284c7;
      emissiveColor = 0x0369a1;
      emissiveIntensity = 0.26;
      edgeColor = 0x7dd3fc;
      edgeOpacity = 0.6;
    } else {
      // Neutral cool cyan
      cubeColor = 0x06b6d4;
      emissiveColor = 0x0e7490;
      emissiveIntensity = 0.18;
      edgeColor = 0x67e8f9;
      edgeOpacity = 0.55;
    }
  } else if (mode === 'Bus') {
    const hasHs = voxel.manifest.electrical?.highSpeedPlane?.supported;
    const hasCp = voxel.manifest.electrical?.controlPlane?.supported;
    metalness = 0.3;
    roughness = 0.35;

    if (hasHs) {
      cubeColor = 0x7c3aed;
      emissiveColor = 0x8b5cf6;
      emissiveIntensity = 0.34;
      edgeColor = 0xc4b5fd;
      edgeOpacity = 0.7;
    } else if (hasCp) {
      cubeColor = 0x059669;
      emissiveColor = 0x10b981;
      emissiveIntensity = 0.24;
      edgeColor = 0x6ee7b7;
      edgeOpacity = 0.65;
    } else {
      cubeColor = 0x334155;
      metalness = 0.15;
      roughness = 0.85;
      edgeColor = 0x475569;
    }
  }

  if (isSelected) {
    emissiveColor = 0x38bdf8;
    emissiveIntensity = 0.65;
    edgeColor = 0x7dd3fc;
    edgeOpacity = 0.95;
  } else if (isHovered) {
    emissiveColor = 0x67e8f9;
    emissiveIntensity = Math.max(emissiveIntensity, 0.38);
    edgeColor = 0xa5f3fc;
    edgeOpacity = 0.9;
  }

  mesh.material.color.setHex(cubeColor);
  mesh.material.emissive.setHex(emissiveColor);
  mesh.material.emissiveIntensity = emissiveIntensity;
  mesh.material.metalness = metalness;
  mesh.material.roughness = roughness;

  edges.material.color.setHex(edgeColor);
  edges.material.opacity = edgeOpacity;

  if (detailGroup) {
    detailGroup.visible = mode === 'Assembly';
  }
}
