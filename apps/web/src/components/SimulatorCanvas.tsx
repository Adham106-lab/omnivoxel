import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  EnvironmentObstacle,
  RoomEnvironment,
  VoxelIR,
  VoxelInstance,
} from '@omnivoxel/core';
import { VisualMode } from '../types';

interface SimulatorCanvasProps {
  ir: VoxelIR | null;
  room: RoomEnvironment;
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
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  voxel: VoxelInstance;
}

interface ObstacleMeshEntry {
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  obstacle: EnvironmentObstacle;
}

export const SimulatorCanvas: React.FC<SimulatorCanvasProps> = ({
  ir,
  room,
  visualMode,
  selectedVoxelId,
  selectedObstacleId,
  showRoomBounds,
  showObstacles,
  showGrid,
  onSelectVoxel,
  onSelectObstacle,
  cameraTrigger,
}) => {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Three.js Core Singletons
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Scene sub-groups
  const assemblyGroupRef = useRef<THREE.Group | null>(null);
  const roomGroupRef = useRef<THREE.Group | null>(null);

  // Registries for in-place property updates (0ms overhead)
  const voxelMeshesRef = useRef<Map<string, VoxelMeshEntry>>(new Map());
  const obstacleMeshesRef = useRef<Map<string, ObstacleMeshEntry>>(new Map());

  // Cached pick lists
  const voxelPickMeshesRef = useRef<THREE.Mesh[]>([]);
  const obstaclePickMeshesRef = useRef<THREE.Mesh[]>([]);

  // Internal Hover tracking without React re-renders
  const hoveredVoxelIdRef = useRef<string | null>(null);
  const hoveredObstacleIdRef = useRef<string | null>(null);

  // Drag vs Click state guards
  const pointerDownPosRef = useRef<{ x: number; y: number; time: number }>({
    x: 0,
    y: 0,
    time: 0,
  });
  const isDraggingRef = useRef<boolean>(false);

  // Stable callback refs to avoid recreating event listeners
  const onSelectVoxelRef = useRef(onSelectVoxel);
  onSelectVoxelRef.current = onSelectVoxel;
  const onSelectObstacleRef = useRef(onSelectObstacle);
  onSelectObstacleRef.current = onSelectObstacle;
  const selectedVoxelIdRef = useRef(selectedVoxelId);
  selectedVoxelIdRef.current = selectedVoxelId;
  const selectedObstacleIdRef = useRef(selectedObstacleId);
  selectedObstacleIdRef.current = selectedObstacleId;
  const visualModeRef = useRef(visualMode);
  visualModeRef.current = visualMode;

  // Tooltip content state (updated only on hover target change, not on mouse move coords!)
  const [hoveredInfo, setHoveredInfo] = useState<{
    voxel: VoxelInstance | null;
    obstacle: EnvironmentObstacle | null;
  } | null>(null);

  // =========================================================================
  // 1. One-Time Scene, Camera, Renderer, Controls Initialization
  // =========================================================================
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080c14);
    scene.fog = new THREE.FogExp2(0x080c14, 0.08);
    sceneRef.current = scene;

    // Camera (+Z CAD convention: Z is vertical height, Y is depth, X is width)
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 100);
    camera.up.set(0, 0, 1);
    camera.position.set(3.5, -4.5, 3.2);
    cameraRef.current = camera;

    // Renderer (Pixel ratio capped at 2 for high-DPI performance)
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Cleanly attach canvas to dedicated mount node
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // OrbitControls attached directly to renderer canvas
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;
    controls.target.set(0.8, 0.8, 0.6);
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight1.position.set(5, -5, 10);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.6);
    dirLight2.position.set(-5, 5, 2);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0x06b6d4, 1.2, 8);
    pointLight.position.set(0, 0, 2);
    scene.add(pointLight);

    // Persistent Scene sub-groups
    const roomGroup = new THREE.Group();
    roomGroup.name = 'roomEnvironmentGroup';
    scene.add(roomGroup);
    roomGroupRef.current = roomGroup;

    const assemblyGroup = new THREE.Group();
    assemblyGroup.name = 'voxelAssemblyGroup';
    scene.add(assemblyGroup);
    assemblyGroupRef.current = assemblyGroup;

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ResizeObserver cleanly updates projection matrix & canvas size
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        const newHeight = entry.contentRect.height;
        if (newWidth <= 0 || newHeight <= 0) continue;
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
      }
    });
    resizeObserver.observe(mount);

    // =========================================================================
    // Native Pointer Event Listeners on Canvas (Zero React Synthetic Jitter)
    // =========================================================================
    const dom = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPosRef.current = {
        x: e.clientX,
        y: e.clientY,
        time: performance.now(),
      };
      isDraggingRef.current = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      // 1. Check if user is orbiting/dragging with OrbitControls
      if (e.buttons !== 0) {
        const dx = e.clientX - pointerDownPosRef.current.x;
        const dy = e.clientY - pointerDownPosRef.current.y;
        if (dx * dx + dy * dy > 25) {
          isDraggingRef.current = true;
          // Hide tooltip immediately when camera rotates
          if (tooltipRef.current) {
            tooltipRef.current.style.display = 'none';
          }
        }
        return;
      }

      // 2. Direct DOM positioning of tooltip (0 React re-renders on move!)
      const rect = mount.getBoundingClientRect();
      const x = e.clientX - rect.left + 16;
      const y = e.clientY - rect.top + 16;
      if (tooltipRef.current) {
        const maxX = rect.width - 240;
        const maxY = rect.height - 140;
        tooltipRef.current.style.left = `${Math.min(x, maxX)}px`;
        tooltipRef.current.style.top = `${Math.min(y, maxY)}px`;
      }

      // 3. Fast selective raycasting
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const pickList = [
        ...voxelPickMeshesRef.current,
        ...obstaclePickMeshesRef.current,
      ];
      const intersects = raycaster.intersectObjects(pickList, false);

      let foundVoxel: VoxelInstance | null = null;
      let foundObstacle: EnvironmentObstacle | null = null;

      if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.object.userData?.isVoxel) {
          foundVoxel = hit.object.userData.voxel as VoxelInstance;
        } else if (hit.object.userData?.isObstacle) {
          foundObstacle = hit.object.userData.obstacle as EnvironmentObstacle;
        }
      }

      const nextVoxelId = foundVoxel?.id || null;
      const nextObstacleId = foundObstacle?.id || null;

      // Only trigger hover updates if hover target changed
      if (
        nextVoxelId !== hoveredVoxelIdRef.current ||
        nextObstacleId !== hoveredObstacleIdRef.current
      ) {
        // Reset previous hovered voxel highlight
        if (hoveredVoxelIdRef.current && hoveredVoxelIdRef.current !== selectedVoxelIdRef.current) {
          const prevEntry = voxelMeshesRef.current.get(hoveredVoxelIdRef.current);
          if (prevEntry) {
            applyVoxelStyle(prevEntry, false, false, visualModeRef.current);
          }
        }

        hoveredVoxelIdRef.current = nextVoxelId;
        hoveredObstacleIdRef.current = nextObstacleId;

        // Apply new hover highlight in-place
        if (nextVoxelId) {
          const newEntry = voxelMeshesRef.current.get(nextVoxelId);
          if (newEntry) {
            applyVoxelStyle(
              newEntry,
              selectedVoxelIdRef.current === nextVoxelId,
              true,
              visualModeRef.current
            );
          }
        }

        if (foundVoxel || foundObstacle) {
          setHoveredInfo({ voxel: foundVoxel, obstacle: foundObstacle });
          if (tooltipRef.current) tooltipRef.current.style.display = 'block';
        } else {
          setHoveredInfo(null);
          if (tooltipRef.current) tooltipRef.current.style.display = 'none';
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - pointerDownPosRef.current.x;
      const dy = e.clientY - pointerDownPosRef.current.y;
      const distSq = dx * dx + dy * dy;

      // If user moved > 5px or was orbiting camera, discard click
      if (distSq > 25 || isDraggingRef.current) {
        isDraggingRef.current = false;
        return;
      }
      isDraggingRef.current = false;

      // Raycast on click
      const rect = mount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const pickList = [
        ...voxelPickMeshesRef.current,
        ...obstaclePickMeshesRef.current,
      ];
      const intersects = raycaster.intersectObjects(pickList, false);

      if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.object.userData?.isVoxel) {
          const v = hit.object.userData.voxel as VoxelInstance;
          onSelectVoxelRef.current(v.id);
          if (onSelectObstacleRef.current) onSelectObstacleRef.current(null);
        } else if (hit.object.userData?.isObstacle) {
          const o = hit.object.userData.obstacle as EnvironmentObstacle;
          if (onSelectObstacleRef.current) onSelectObstacleRef.current(o.id);
          onSelectVoxelRef.current(null);
        }
      } else {
        // Clicked background space -> deselect
        onSelectVoxelRef.current(null);
        if (onSelectObstacleRef.current) onSelectObstacleRef.current(null);
      }
    };

    const onPointerLeave = () => {
      if (hoveredVoxelIdRef.current && hoveredVoxelIdRef.current !== selectedVoxelIdRef.current) {
        const prevEntry = voxelMeshesRef.current.get(hoveredVoxelIdRef.current);
        if (prevEntry) {
          applyVoxelStyle(prevEntry, false, false, visualModeRef.current);
        }
      }
      hoveredVoxelIdRef.current = null;
      hoveredObstacleIdRef.current = null;
      setHoveredInfo(null);
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    };

    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointerleave', onPointerLeave);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointerleave', onPointerLeave);
      renderer.dispose();
      controls.dispose();
      scene.clear();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  // =========================================================================
  // 2. Camera Trigger: Focus / Reset
  // =========================================================================
  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    if (cameraTrigger === undefined || cameraTrigger === 0) return;

    if (ir && ir.voxels.length > 0) {
      const bounds = ir.metrics?.boundingBox;
      if (bounds) {
        const cx = ((bounds.min.x + bounds.max.x) / 2) * 0.15;
        const cy = ((bounds.min.y + bounds.max.y) / 2) * 0.15;
        const cz = ((bounds.min.z + bounds.max.z) / 2) * 0.15;
        controlsRef.current.target.set(cx, cy, cz);
        cameraRef.current.position.set(cx + 2.5, cy - 3.2, cz + 2.2);
        controlsRef.current.update();
        return;
      }
    }
    controlsRef.current.target.set(0.8, 0.8, 0.6);
    cameraRef.current.position.set(3.2, -4.2, 3.0);
    controlsRef.current.update();
  }, [cameraTrigger, ir]);

  // =========================================================================
  // 3. Build / Update Room & Obstacles (Runs ONLY when room structure changes)
  // =========================================================================
  useEffect(() => {
    const roomGroup = roomGroupRef.current;
    if (!roomGroup) return;

    // Clean up previous children
    while (roomGroup.children.length > 0) {
      const child = roomGroup.children[0];
      roomGroup.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    }
    obstacleMeshesRef.current.clear();
    obstaclePickMeshesRef.current = [];

    const minX = (room.boundsMinMm?.x ?? 0) / 1000;
    const minY = (room.boundsMinMm?.y ?? 0) / 1000;
    const minZ = (room.boundsMinMm?.z ?? 0) / 1000;
    const maxX = (room.boundsMaxMm?.x ?? room.dimensionsMm.x) / 1000;
    const maxY = (room.boundsMaxMm?.y ?? room.dimensionsMm.y) / 1000;
    const maxZ = (room.boundsMaxMm?.z ?? room.dimensionsMm.z) / 1000;

    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const centerX = minX + sizeX / 2;
    const centerY = minY + sizeY / 2;
    const centerZ = minZ + sizeZ / 2;

    // Grid Floor
    if (showGrid) {
      const gridHelper = new THREE.GridHelper(
        Math.max(sizeX, sizeY, 6),
        Math.round(Math.max(sizeX, sizeY, 6) / 0.15),
        0x38bdf8,
        0x1e293b
      );
      gridHelper.rotation.x = Math.PI / 2;
      gridHelper.position.set(centerX, centerY, minZ);
      roomGroup.add(gridHelper);
    }

    // Room Bounding Box Wireframe
    if (showRoomBounds) {
      const boxGeo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
      const wireGeo = new THREE.WireframeGeometry(boxGeo);
      const line = new THREE.LineSegments(
        wireGeo,
        new THREE.LineBasicMaterial({
          color: 0x0284c7,
          transparent: true,
          opacity: 0.35,
        })
      );
      line.position.set(centerX, centerY, centerZ);
      roomGroup.add(line);
    }

    // Obstacles
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
        let opacity = 0.55;
        if (obst.type === 'wall') {
          baseColor = 0x334155;
          opacity = 0.45;
        } else if (obst.type === 'furniture') {
          baseColor = obst.color ? parseInt(obst.color.replace('#', '0x')) : 0x52525b;
          opacity = 0.65;
        } else if (obst.type === 'appliance') {
          baseColor = 0x475569;
          opacity = 0.6;
        }

        const meshGeo = new THREE.BoxGeometry(oSizeX, oSizeY, oSizeZ);
        const meshMat = new THREE.MeshStandardMaterial({
          color: baseColor,
          transparent: true,
          opacity,
          roughness: 0.8,
          metalness: 0.1,
        });
        const mesh = new THREE.Mesh(meshGeo, meshMat);
        mesh.userData = { isObstacle: true, obstacle: obst };
        obstGroup.add(mesh);

        const edgesGeo = new THREE.EdgesGeometry(meshGeo);
        const edgesMat = new THREE.LineBasicMaterial({
          color: obst.isFixed ? 0x94a3b8 : 0x60a5fa,
          transparent: true,
          opacity: 0.8,
        });
        const edges = new THREE.LineSegments(edgesGeo, edgesMat);
        obstGroup.add(edges);

        obstacleMeshesRef.current.set(obst.id, {
          group: obstGroup,
          mesh,
          edges,
          obstacle: obst,
        });
        obstaclePickMeshesRef.current.push(mesh);
        roomGroup.add(obstGroup);
      }
    }
  }, [room, showRoomBounds, showObstacles, showGrid]);

  // =========================================================================
  // 4. Build Voxel Meshes & Bus Conduits (Runs ONLY when IR structural graph changes)
  // =========================================================================
  useEffect(() => {
    const assemblyGroup = assemblyGroupRef.current;
    if (!assemblyGroup) return;

    while (assemblyGroup.children.length > 0) {
      const child = assemblyGroup.children[0];
      assemblyGroup.remove(child);
      child.traverse((node) => {
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

    voxelMeshesRef.current.clear();
    voxelPickMeshesRef.current = [];

    if (!ir || ir.voxels.length === 0) return;

    const voxelEntries = new Map<string, VoxelMeshEntry>();
    const pickMeshes: THREE.Mesh[] = [];

    // 1. Build Voxel Meshes
    for (const v of ir.voxels) {
      const pitch = v.manifest.mechanical?.dimensionsMm ?? { x: 150, y: 150, z: 150 };
      const sizeX = pitch.x / 1000;
      const sizeY = pitch.y / 1000;
      const sizeZ = pitch.z / 1000;

      const posX = (v.coord.x * pitch.x + pitch.x / 2) / 1000;
      const posY = (v.coord.y * pitch.y + pitch.y / 2) / 1000;
      const posZ = (v.coord.z * pitch.z + pitch.z / 2) / 1000;

      const group = new THREE.Group();
      group.position.set(posX, posY, posZ);

      const bevelScale = 0.96;
      const boxGeo = new THREE.BoxGeometry(
        sizeX * bevelScale,
        sizeY * bevelScale,
        sizeZ * bevelScale
      );
      const boxMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.5,
        roughness: 0.3,
      });

      const mesh = new THREE.Mesh(boxGeo, boxMat);
      mesh.userData = { isVoxel: true, voxel: v };
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      const edgeGeo = new THREE.EdgesGeometry(boxGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x1e293b,
        linewidth: 1,
      });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      group.add(edges);

      // Display face accent
      if (v.manifest.category === 'display') {
        const screenGeo = new THREE.PlaneGeometry(sizeX * 0.85, sizeY * 0.85);
        const screenMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          side: THREE.DoubleSide,
        });
        const screenMesh = new THREE.Mesh(screenGeo, screenMat);
        screenMesh.position.set(0, 0, (sizeZ * bevelScale) / 2 + 0.001);
        group.add(screenMesh);
      }

      voxelEntries.set(v.id, { group, mesh, edges, voxel: v });
      pickMeshes.push(mesh);
      assemblyGroup.add(group);
    }

    voxelMeshesRef.current = voxelEntries;
    voxelPickMeshesRef.current = pickMeshes;

    // 2. Build Bus Links
    const busLinesGroup = new THREE.Group();
    busLinesGroup.name = 'busLinesGroup';

    for (const link of ir.links) {
      const vA = ir.getVoxel(link.sourceId);
      const vB = ir.getVoxel(link.targetId);
      if (!vA || !vB) continue;

      const pA = vA.manifest.mechanical?.dimensionsMm ?? { x: 150, y: 150, z: 150 };
      const pB = vB.manifest.mechanical?.dimensionsMm ?? { x: 150, y: 150, z: 150 };

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

      // High-Speed Conduits (Purple / Electric Blue)
      if (link.highSpeedPlane.connected) {
        const curve = new THREE.LineCurve3(posA, posB);
        const tubeGeo = new THREE.TubeGeometry(curve, 8, 0.012, 8, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: 0x8b5cf6,
          transparent: true,
          opacity: 0.9,
        });
        const tube = new THREE.Mesh(tubeGeo, tubeMat);
        busLinesGroup.add(tube);
      }

      // Control Plane Dots (Emerald)
      if (link.controlPlane.connected) {
        const midPoint = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);
        const sphereGeo = new THREE.SphereGeometry(0.015, 8, 8);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.copy(midPoint);
        sphere.userData = { isControlPlaneDot: true };
        busLinesGroup.add(sphere);
      }
    }
    assemblyGroup.add(busLinesGroup);

    // Apply materials in-place
    updateAllMaterials();
  }, [ir]);

  // =========================================================================
  // 5. In-Place Material Update Helper (Takes < 0.1ms, Zero Reallocations)
  // =========================================================================
  const updateAllMaterials = () => {
    voxelMeshesRef.current.forEach((entry) => {
      const isSelected = selectedVoxelId === entry.voxel.id;
      const isHovered = hoveredVoxelIdRef.current === entry.voxel.id;
      applyVoxelStyle(entry, isSelected, isHovered, visualMode);
    });

    // Update bus line visibility
    const busLinesGroup = assemblyGroupRef.current?.getObjectByName('busLinesGroup');
    if (busLinesGroup) {
      busLinesGroup.visible = visualMode === 'Bus' || visualMode === 'Assembly';
      busLinesGroup.children.forEach((child) => {
        if (child.userData?.isControlPlaneDot) {
          child.visible = visualMode === 'Bus';
        }
      });
    }

    // Update obstacle selection highlights
    obstacleMeshesRef.current.forEach(({ mesh, edges, obstacle }) => {
      const isSelected = selectedObstacleId === obstacle.id;
      mesh.material.emissive.setHex(isSelected ? 0x38bdf8 : 0x000000);
      mesh.material.emissiveIntensity = isSelected ? 0.45 : 0;
      edges.material.color.setHex(
        isSelected ? 0x38bdf8 : obstacle.isFixed ? 0x94a3b8 : 0x60a5fa
      );
    });
  };

  // Re-run in-place property update on selection or mode change
  useEffect(() => {
    updateAllMaterials();
  }, [visualMode, selectedVoxelId, selectedObstacleId]);

  return (
    <div className="relative w-full h-full cursor-crosshair overflow-hidden select-none">
      {/* Three.js Canvas Mount Node */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

      {/* 3D Floating Tooltip (Positioned via CSS translate without React re-renders) */}
      <div
        ref={tooltipRef}
        style={{ display: 'none' }}
        className="pointer-events-none absolute z-20 rounded-md border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 shadow-xl backdrop-blur-md transition-none"
      >
        {hoveredInfo?.voxel ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-cyan-400">
                {hoveredInfo.voxel.id}
              </span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                {hoveredInfo.voxel.manifest.category}
              </span>
            </div>
            <div className="text-slate-300 text-[11px] font-medium">
              {hoveredInfo.voxel.manifest.name}
            </div>
            <div className="grid grid-cols-2 gap-x-2 pt-1 font-mono text-[10px] text-slate-400">
              <span>
                Coord: ({hoveredInfo.voxel.coord.x}, {hoveredInfo.voxel.coord.y},{' '}
                {hoveredInfo.voxel.coord.z})
              </span>
              <span>Mass: {hoveredInfo.voxel.manifest.mechanical?.massKg ?? 0} kg</span>
              <span>TDP: {hoveredInfo.voxel.manifest.thermal?.tdpWatts ?? 0} W</span>
              <span>
                Dissip:{' '}
                {hoveredInfo.voxel.manifest.thermal?.passiveDissipationWatts ?? 0} W
              </span>
            </div>
          </div>
        ) : hoveredInfo?.obstacle ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-amber-400">
                {hoveredInfo.obstacle.name || hoveredInfo.obstacle.id}
              </span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                {hoveredInfo.obstacle.type}
              </span>
            </div>
            <div className="font-mono text-[10px] text-slate-400">
              Fixed: {hoveredInfo.obstacle.isFixed ? 'Yes' : 'No'}
            </div>
            <div className="font-mono text-[10px] text-slate-400">
              Bounds: [{hoveredInfo.obstacle.boundsMinMm.x},{' '}
              {hoveredInfo.obstacle.boundsMinMm.y}, {hoveredInfo.obstacle.boundsMinMm.z}] to [
              {hoveredInfo.obstacle.boundsMaxMm.x}, {hoveredInfo.obstacle.boundsMaxMm.y},{' '}
              {hoveredInfo.obstacle.boundsMaxMm.z}] mm
            </div>
          </div>
        ) : null}
      </div>

      {/* Axis Gizmo Overlay / Legend in bottom-left */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-lg border border-slate-800/80 bg-slate-950/70 px-3 py-1.5 text-[11px] text-slate-400 backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500"></span>
          <span>+X Width</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500"></span>
          <span>+Y Depth</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-500"></span>
          <span>+Z Vertical</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Pure function to set colors and highlights on existing mesh materials in-place.
 */
function applyVoxelStyle(
  entry: VoxelMeshEntry,
  isSelected: boolean,
  isHovered: boolean,
  mode: VisualMode
) {
  const { mesh, edges, voxel } = entry;

  let cubeColor = 0x94a3b8;
  let emissiveColor = 0x000000;
  let emissiveIntensity = 0;
  let metalness = 0.5;
  let roughness = 0.3;

  if (mode === 'Assembly') {
    switch (voxel.manifest.category) {
      case 'structural':
        cubeColor = 0xa1a1aa;
        metalness = 0.85;
        roughness = 0.25;
        break;
      case 'actuated':
        cubeColor = 0xf97316;
        metalness = 0.7;
        roughness = 0.3;
        break;
      case 'compute':
        cubeColor = 0x312e81;
        emissiveColor = 0x06b6d4;
        emissiveIntensity = 0.35;
        metalness = 0.6;
        roughness = 0.2;
        break;
      case 'display':
        cubeColor = 0x0284c7;
        emissiveColor = 0x38bdf8;
        emissiveIntensity = 0.5;
        metalness = 0.2;
        roughness = 0.1;
        break;
      case 'power':
        cubeColor = 0x10b981;
        emissiveColor = 0x059669;
        emissiveIntensity = 0.2;
        metalness = 0.5;
        roughness = 0.3;
        break;
      case 'io':
        cubeColor = 0xeab308;
        metalness = 0.3;
        roughness = 0.4;
        break;
    }
  } else if (mode === 'Thermal') {
    const tdp = voxel.manifest.thermal?.tdpWatts ?? 0;
    const dissipation = voxel.manifest.thermal?.passiveDissipationWatts ?? 0;

    if (tdp >= 30) {
      cubeColor = 0xef4444;
      emissiveColor = 0xdc2626;
      emissiveIntensity = 0.6;
    } else if (tdp >= 10) {
      cubeColor = 0xf97316;
      emissiveColor = 0xea580c;
      emissiveIntensity = 0.4;
    } else if (tdp > 0) {
      cubeColor = 0xeab308;
      emissiveColor = 0xca8a04;
      emissiveIntensity = 0.2;
    } else if (dissipation >= 10) {
      cubeColor = 0x06b6d4;
      emissiveColor = 0x0891b2;
      emissiveIntensity = 0.35;
    } else {
      cubeColor = 0x38bdf8;
      emissiveIntensity = 0.1;
    }
  } else if (mode === 'Bus') {
    const hasHs = voxel.manifest.electrical?.highSpeedPlane?.supported;
    const hasCp = voxel.manifest.electrical?.controlPlane?.supported;

    if (hasHs) {
      cubeColor = 0x8b5cf6;
      emissiveColor = 0x7c3aed;
      emissiveIntensity = 0.5;
    } else if (hasCp) {
      cubeColor = 0x10b981;
      emissiveColor = 0x059669;
      emissiveIntensity = 0.3;
    } else {
      cubeColor = 0x334155;
      metalness = 0.1;
      roughness = 0.9;
    }
  }

  if (isSelected) {
    emissiveColor = 0x38bdf8;
    emissiveIntensity = 0.85;
  } else if (isHovered) {
    emissiveColor = 0x67e8f9;
    emissiveIntensity = 0.5;
  }

  mesh.material.color.setHex(cubeColor);
  mesh.material.emissive.setHex(emissiveColor);
  mesh.material.emissiveIntensity = emissiveIntensity;
  mesh.material.metalness = metalness;
  mesh.material.roughness = roughness;

  edges.material.color.setHex(
    isSelected ? 0x38bdf8 : isHovered ? 0xa5f3fc : 0x1e293b
  );
}
