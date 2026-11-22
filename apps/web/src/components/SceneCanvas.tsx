import React, { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment as ThreeRoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  calculateVoxelBoundsMm,
  getRoomBoundsMm,
  type EnvironmentObstacle,
  type RoomEnvironment,
  type VoxelCategory,
  type VoxelIR,
} from '@omnivoxel/core';
import type { Guides, IssueSeverity, Selection, VisualMode } from '../types';
import { BUS_COLORS, CATEGORY_STYLE, OBSTACLE_DEFAULT_COLOR } from '../lib/theme';
import { thermalHex, type VoxelThermal } from '../lib/thermal';

const MM = 0.001;
const VOXEL_FILL = 0.965;
const FIT_DIRECTION = new THREE.Vector3(0.8, -1.0, 0.7).normalize();

const EDGE_COLOR = { idle: 0x0b1220, selected: 0xe0f2fe, error: 0xf87171, warning: 0xfbbf24 } as const;

interface SceneCanvasProps {
  ir: VoxelIR | null;
  room: RoomEnvironment;
  mode: VisualMode;
  selection: Selection;
  issues: Map<string, IssueSeverity>;
  thermal: Map<string, VoxelThermal>;
  guides: Guides;
  cameraTrigger: number;
  onSelect: (selection: Selection) => void;
}

interface VoxelEntry {
  id: string;
  group: THREE.Group;
  body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  details: THREE.Group;
  category: VoxelCategory;
  heat: number;
}

interface ObstacleEntry {
  id: string;
  body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  baseOpacity: number;
  baseColor: THREE.Color;
}

interface Content {
  root: THREE.Group;
  links: THREE.Group;
  voxels: Map<string, VoxelEntry>;
  obstacles: Map<string, ObstacleEntry>;
  pickVoxels: THREE.Object3D[];
  pickObstacles: THREE.Object3D[];
  focusBox: THREE.Box3;
}

interface Rig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  requestRender: () => void;
  content: Content | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function disposeTree(root: THREE.Object3D): void {
  root.traverse((node) => {
    const renderable = node as THREE.Mesh;
    if (renderable.geometry) renderable.geometry.dispose();
    const material = renderable.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}

function standard(color: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.6, ...extra });
}

/** Category-specific surface details (only shown in Assembly mode). */
function buildDetails(category: VoxelCategory, sx: number, sy: number, sz: number): THREE.Group {
  const g = new THREE.Group();
  const top = sz / 2;

  switch (category) {
    case 'structural': {
      for (let i = -2; i <= 2; i++) {
        const fin = new THREE.Mesh(
          new THREE.BoxGeometry(sx * 0.78, sy * 0.05, 0.004),
          standard(0xcbd5e1, { metalness: 0.9, roughness: 0.25 })
        );
        fin.position.set(0, i * sy * 0.17, top + 0.002);
        g.add(fin);
      }
      break;
    }
    case 'actuated': {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(sx * 0.27, 0.0045, 12, 36),
        standard(0xfde68a, { metalness: 0.6, roughness: 0.3 })
      );
      ring.position.set(0, 0, top + 0.003);
      g.add(ring);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(sx * 0.1, sx * 0.1, 0.008, 20),
        standard(0xfef3c7, { metalness: 0.5, roughness: 0.35 })
      );
      hub.rotation.x = Math.PI / 2;
      hub.position.set(0, 0, top + 0.004);
      g.add(hub);
      break;
    }
    case 'compute': {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(sx * 0.56, sy * 0.56, 0.004),
        standard(0x1e1b4b, { roughness: 0.45 })
      );
      plate.position.set(0, 0, top + 0.002);
      g.add(plate);
      const die = new THREE.Mesh(
        new THREE.BoxGeometry(sx * 0.26, sy * 0.26, 0.004),
        standard(0xc4b5fd, { metalness: 0.6, roughness: 0.3 })
      );
      die.position.set(0, 0, top + 0.0058);
      g.add(die);
      break;
    }
    case 'display': {
      const bezel = new THREE.Mesh(
        new THREE.BoxGeometry(sx * 0.92, 0.004, sz * 0.92),
        standard(0x020617, { roughness: 0.35 })
      );
      bezel.position.set(0, sy / 2 + 0.002, 0);
      g.add(bezel);
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(sx * 0.84, sz * 0.84),
        new THREE.MeshStandardMaterial({
          color: 0x0c4a6e,
          emissive: 0x38bdf8,
          emissiveIntensity: 0.55,
          roughness: 0.2,
          metalness: 0,
        })
      );
      screen.rotation.x = -Math.PI / 2; // face +Y
      screen.position.set(0, sy / 2 + 0.0043, 0);
      g.add(screen);
      break;
    }
    case 'power': {
      for (const z of [-sz * 0.22, sz * 0.22]) {
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(sx + 0.002, sy + 0.002, 0.014),
          standard(0x064e3b, { roughness: 0.55 })
        );
        band.position.set(0, 0, z);
        g.add(band);
      }
      break;
    }
    case 'io': {
      const buttonMat = standard(0xfecdd3, { roughness: 0.4 });
      for (const [bx, by] of [
        [sx * 0.2, sy * 0.1],
        [sx * 0.3, -sy * 0.06],
      ] as const) {
        const button = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.006, 16), buttonMat);
        button.rotation.x = Math.PI / 2;
        button.position.set(bx, by, top + 0.003);
        g.add(button);
      }
      const padMat = standard(0xffe4e6, { roughness: 0.45 });
      const padH = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.009, 0.006), padMat);
      const padV = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.03, 0.006), padMat);
      padH.position.set(-sx * 0.22, 0, top + 0.003);
      padV.position.set(-sx * 0.22, 0, top + 0.003);
      g.add(padH, padV);
      break;
    }
  }
  return g;
}

function makeSegment(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  material: THREE.Material
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

function obstacleBaseOpacity(o: EnvironmentObstacle): number {
  return o.type === 'wall' ? 0.14 : 0.36;
}

function buildContent(
  ir: VoxelIR | null,
  room: RoomEnvironment,
  guides: Guides,
  thermal: Map<string, VoxelThermal>
): Content {
  const root = new THREE.Group();
  const links = new THREE.Group();
  const voxels = new Map<string, VoxelEntry>();
  const obstacles = new Map<string, ObstacleEntry>();
  const pickVoxels: THREE.Object3D[] = [];
  const pickObstacles: THREE.Object3D[] = [];
  const focusBox = new THREE.Box3();

  // --- Room bounds, floor grid -------------------------------------------------
  const bounds = getRoomBoundsMm(room);
  const roomMin = new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z).multiplyScalar(MM);
  const roomMax = new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z).multiplyScalar(MM);
  const roomSize = new THREE.Vector3().subVectors(roomMax, roomMin);
  const roomCenter = new THREE.Vector3().addVectors(roomMin, roomMax).multiplyScalar(0.5);

  if (guides.roomBounds && roomSize.lengthSq() > 0) {
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(roomSize.x, roomSize.y, roomSize.z)),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35 })
    );
    wire.position.copy(roomCenter);
    root.add(wire);
  }

  if (guides.grid && roomSize.lengthSq() > 0) {
    const span = Math.max(roomSize.x, roomSize.y);
    const divisions = Math.min(40, Math.max(2, Math.round(span / 0.3)));
    const grid = new THREE.GridHelper(span, divisions, 0x334155, 0x1e293b);
    grid.rotation.x = Math.PI / 2; // lay on the XY plane (Z-up)
    grid.position.set(roomCenter.x, roomCenter.y, roomMin.z);
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.7;
    });
    root.add(grid);
  }

  // --- Obstacles ---------------------------------------------------------------
  if (guides.obstacles) {
    for (const o of room.obstacles) {
      const min = new THREE.Vector3(o.boundsMinMm.x, o.boundsMinMm.y, o.boundsMinMm.z).multiplyScalar(MM);
      const max = new THREE.Vector3(o.boundsMaxMm.x, o.boundsMaxMm.y, o.boundsMaxMm.z).multiplyScalar(MM);
      const size = new THREE.Vector3().subVectors(max, min);
      if (size.x <= 0 || size.y <= 0 || size.z <= 0) continue;

      const baseColor = new THREE.Color(o.color ?? OBSTACLE_DEFAULT_COLOR[o.type]);
      const baseOpacity = obstacleBaseOpacity(o);
      const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
      const body = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: baseColor,
          roughness: 0.8,
          metalness: 0.05,
          transparent: true,
          opacity: baseOpacity,
          depthWrite: false,
        })
      );
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: baseColor.clone().lerp(new THREE.Color(0xffffff), 0.35) })
      );
      const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
      body.position.copy(center);
      edges.position.copy(center);
      body.userData.id = o.id;
      root.add(body, edges);
      pickObstacles.push(body);
      obstacles.set(o.id, { id: o.id, body, edges, baseOpacity, baseColor });
    }
  }

  // --- Voxels ------------------------------------------------------------------
  const centers = new Map<string, THREE.Vector3>();

  if (ir) {
    for (const v of ir.voxels) {
      const b = calculateVoxelBoundsMm(v);
      const min = new THREE.Vector3(b.min.x, b.min.y, b.min.z).multiplyScalar(MM);
      const max = new THREE.Vector3(b.max.x, b.max.y, b.max.z).multiplyScalar(MM);
      const size = new THREE.Vector3().subVectors(max, min);
      const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
      centers.set(v.id, center);
      focusBox.expandByPoint(min).expandByPoint(max);

      const sx = size.x * VOXEL_FILL;
      const sy = size.y * VOXEL_FILL;
      const sz = size.z * VOXEL_FILL;
      const category = v.manifest.category;
      const style = CATEGORY_STYLE[category];

      const geometry = new THREE.BoxGeometry(sx, sy, sz);
      const body = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: style.hex,
          metalness: style.metalness,
          roughness: style.roughness,
          envMapIntensity: 0.6,
        })
      );
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: EDGE_COLOR.idle, transparent: true })
      );
      const details = buildDetails(category, sx, sy, sz);

      const group = new THREE.Group();
      group.position.copy(center);
      group.add(body, edges, details);
      body.userData.id = v.id;
      root.add(group);
      pickVoxels.push(body);

      voxels.set(v.id, {
        id: v.id,
        group,
        body,
        edges,
        details,
        category,
        heat: thermal.get(v.id)?.heat ?? 0,
      });
    }

    // Bus links (visible only in Bus mode)
    const controlMat = new THREE.MeshBasicMaterial({ color: BUS_COLORS.control.hex });
    const highSpeedMat = new THREE.MeshBasicMaterial({ color: BUS_COLORS.highSpeed.hex });
    const noneMat = new THREE.MeshBasicMaterial({ color: BUS_COLORS.none.hex });
    const up = new THREE.Vector3(0, 0, 1);

    for (const link of ir.links) {
      const a = centers.get(link.sourceId);
      const b = centers.get(link.targetId);
      if (!a || !b) continue;

      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      const perp = new THREE.Vector3().crossVectors(dir, up);
      if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
      perp.normalize();

      const cp = link.controlPlane.connected;
      const hs = link.highSpeedPlane.connected;
      const lane = cp && hs ? 0.009 : 0;

      if (hs) {
        links.add(
          makeSegment(
            a.clone().addScaledVector(perp, -lane),
            b.clone().addScaledVector(perp, -lane),
            0.007,
            highSpeedMat
          )
        );
      }
      if (cp) {
        links.add(
          makeSegment(
            a.clone().addScaledVector(perp, lane),
            b.clone().addScaledVector(perp, lane),
            0.0045,
            controlMat
          )
        );
      }
      if (!cp && !hs) links.add(makeSegment(a, b, 0.003, noneMat));
    }
    links.visible = false;
    root.add(links);
  }

  if (focusBox.isEmpty()) {
    focusBox.set(roomMin, roomMax);
  }

  return { root, links, voxels, obstacles, pickVoxels, pickObstacles, focusBox };
}

function fitCamera(rig: Rig, box: THREE.Box3): void {
  const padded = box.clone().expandByScalar(0.08);
  const sphere = padded.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.12);
  // 0.82: the bounding sphere is conservative for an oblique view of a box
  const distance = (radius * 0.82) / Math.sin(THREE.MathUtils.degToRad(rig.camera.fov / 2));

  rig.camera.position.copy(sphere.center).addScaledVector(FIT_DIRECTION, distance);
  rig.controls.target.copy(sphere.center);
  rig.camera.near = Math.max(0.005, distance / 500);
  rig.camera.far = Math.max(60, distance * 40);
  rig.camera.updateProjectionMatrix();
  rig.controls.update();
  rig.requestRender();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SceneCanvas: React.FC<SceneCanvasProps> = (props) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<Rig | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const hoverRef = useRef<string | null>(null); // "v:<id>" | "o:<id>"
  const hasFittedRef = useRef(false);
  const lastTriggerRef = useRef(props.cameraTrigger);

  /**
   * Re-colours existing meshes in place for the current mode / selection /
   * issues. Never allocates geometry, so selecting and hovering stay instant.
   */
  const applyAppearance = useCallback(() => {
    const rig = rigRef.current;
    const content = rig?.content;
    if (!rig || !content) return;
    const { mode, selection, issues } = propsRef.current;
    const hover = hoverRef.current;

    content.links.visible = mode === 'Bus';

    for (const entry of content.voxels.values()) {
      const material = entry.body.material;
      const isSelected = selection?.kind === 'voxel' && selection.id === entry.id;
      const isHovered = hover === `v:${entry.id}`;
      const issue = issues.get(entry.id);
      const style = CATEGORY_STYLE[entry.category];

      let transparent = false;
      let opacity = 1;
      let baseEmissive = 0x000000;
      let baseEmissiveIntensity = 0;

      if (mode === 'Assembly') {
        material.color.setHex(style.hex);
        material.metalness = style.metalness;
        material.roughness = style.roughness;
        entry.details.visible = true;
      } else if (mode === 'Thermal') {
        const hex = thermalHex(entry.heat);
        material.color.setHex(hex);
        material.metalness = 0.1;
        material.roughness = 0.55;
        baseEmissive = hex;
        baseEmissiveIntensity = 0.28;
        // Cooler voxels turn translucent so an enclosed hot source still reads
        transparent = true;
        opacity = isSelected ? 0.92 : 0.3 + 0.7 * Math.min(1, entry.heat / 0.8);
        entry.details.visible = false;
      } else {
        material.color.setHex(0x334155);
        material.metalness = 0.1;
        material.roughness = 0.7;
        transparent = true;
        opacity = isSelected ? 0.6 : 0.28;
        entry.details.visible = false;
      }

      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.depthWrite = !transparent;
        material.needsUpdate = true;
      }
      material.opacity = opacity;

      if (isSelected) {
        material.emissive.setHex(0x38bdf8);
        material.emissiveIntensity = 0.5;
      } else if (isHovered) {
        material.emissive.setHex(0xffffff);
        material.emissiveIntensity = 0.16;
      } else {
        material.emissive.setHex(baseEmissive);
        material.emissiveIntensity = baseEmissiveIntensity;
      }

      const edgeMaterial = entry.edges.material;
      if (isSelected) edgeMaterial.color.setHex(EDGE_COLOR.selected);
      else if (issue === 'error') edgeMaterial.color.setHex(EDGE_COLOR.error);
      else if (issue === 'warning') edgeMaterial.color.setHex(EDGE_COLOR.warning);
      else edgeMaterial.color.setHex(mode === 'Bus' ? 0x64748b : EDGE_COLOR.idle);
      edgeMaterial.opacity = mode === 'Bus' && !isSelected && !issue ? 0.5 : 1;
    }

    for (const entry of content.obstacles.values()) {
      const isSelected = selection?.kind === 'obstacle' && selection.id === entry.id;
      const isHovered = hover === `o:${entry.id}`;
      entry.body.material.opacity = Math.min(
        0.7,
        entry.baseOpacity + (isSelected ? 0.26 : isHovered ? 0.1 : 0)
      );
      entry.edges.material.color.set(
        isSelected ? 0xfbbf24 : entry.baseColor.clone().lerp(new THREE.Color(0xffffff), 0.35)
      );
    }

    rig.requestRender();
  }, []);

  // ------------------------------------------------------------------ mount once
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x090d16, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    mount.appendChild(canvas);

    const scene = new THREE.Scene();

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new ThreeRoomEnvironment();
    const envTarget = pmrem.fromScene(envScene, 0.04);
    scene.environment = envTarget.texture;
    disposeTree(envScene);

    scene.add(new THREE.HemisphereLight(0xcbd5e1, 0x0b1220, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(3.5, -4, 6.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x93c5fd, 0.45);
    fill.position.set(-4, 3, 2.5);
    scene.add(fill);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    camera.up.set(0, 0, 1); // Z-up, matching the core lattice convention
    camera.position.set(1.2, -1.5, 1.1);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.minDistance = 0.06;
    controls.maxDistance = 40;
    controls.screenSpacePanning = true;

    let dirty = true;
    const requestRender = () => {
      dirty = true;
    };
    controls.addEventListener('change', requestRender);

    const rig: Rig = { renderer, scene, camera, controls, requestRender, content: null };
    rigRef.current = rig;
    hasFittedRef.current = false;

    // Render loop: only draws when something moved or changed
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const moved = controls.update();
      if (moved || dirty) {
        dirty = false;
        renderer.render(scene, camera);
      }
    };
    raf = requestAnimationFrame(tick);

    // Resize handling
    const size = { w: 1, h: 1 };
    const applySize = (w: number, h: number) => {
      if (w < 2 || h < 2) return;
      size.w = w;
      size.h = h;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      requestRender();
    };
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) applySize(rect.width, rect.height);
    });
    observer.observe(mount);
    applySize(mount.clientWidth, mount.clientHeight);

    // Picking
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const pick = (x: number, y: number): { kind: 'voxel' | 'obstacle'; id: string } | null => {
      const content = rig.content;
      if (!content) return null;
      ndc.set((x / size.w) * 2 - 1, -(y / size.h) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);

      const voxelHit = raycaster.intersectObjects(content.pickVoxels, false)[0];
      if (voxelHit) return { kind: 'voxel', id: voxelHit.object.userData.id as string };

      const obstacleHit = raycaster.intersectObjects(content.pickObstacles, false)[0];
      if (obstacleHit) return { kind: 'obstacle', id: obstacleHit.object.userData.id as string };
      return null;
    };

    let downX = 0;
    let downY = 0;
    let downAt = 0;
    let downButton = -1;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downAt = performance.now();
      downButton = e.button;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (downButton !== 0 || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 5 || performance.now() - downAt > 600) return; // orbit / pan drag, not a click
      propsRef.current.onSelect(pick(e.offsetX, e.offsetY));
    };

    let hoverFrame = 0;
    let pendingMove: { x: number; y: number; buttons: number } | null = null;
    const onPointerMove = (e: PointerEvent) => {
      pendingMove = { x: e.offsetX, y: e.offsetY, buttons: e.buttons };
      if (hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        const move = pendingMove;
        pendingMove = null;
        if (!move) return;
        const hit = move.buttons === 0 ? pick(move.x, move.y) : null;
        const next = hit ? `${hit.kind === 'voxel' ? 'v' : 'o'}:${hit.id}` : null;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
        if (next !== hoverRef.current) {
          hoverRef.current = next;
          applyAppearance();
        }
      });
    };
    const onPointerLeave = () => {
      if (hoverRef.current !== null) {
        hoverRef.current = null;
        applyAppearance();
      }
    };

    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);

    // Window DPR changes (zoom / monitor move)
    const onWindowResize = () => applySize(mount.clientWidth, mount.clientHeight);
    window.addEventListener('resize', onWindowResize);

    return () => {
      cancelAnimationFrame(raf);
      if (hoverFrame) cancelAnimationFrame(hoverFrame);
      observer.disconnect();
      window.removeEventListener('resize', onWindowResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      controls.removeEventListener('change', requestRender);
      controls.dispose();

      if (rig.content) {
        scene.remove(rig.content.root);
        disposeTree(rig.content.root);
        rig.content = null;
      }
      envTarget.dispose();
      pmrem.dispose();
      scene.environment = null;
      renderer.dispose();
      renderer.forceContextLoss();
      if (canvas.parentElement === mount) mount.removeChild(canvas);
      rigRef.current = null;
    };
  }, [applyAppearance]);

  // -------------------------------------------- rebuild geometry on structural changes
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;

    if (rig.content) {
      rig.scene.remove(rig.content.root);
      disposeTree(rig.content.root);
      rig.content = null;
    }
    hoverRef.current = null;

    const content = buildContent(props.ir, props.room, props.guides, props.thermal);
    rig.scene.add(content.root);
    rig.content = content;

    if (!hasFittedRef.current) {
      hasFittedRef.current = true;
      fitCamera(rig, content.focusBox);
    }
    applyAppearance();
    // thermal participates because heat is baked into entries at build time
  }, [
    props.ir,
    props.room,
    props.thermal,
    props.guides.roomBounds,
    props.guides.obstacles,
    props.guides.grid,
    applyAppearance,
  ]);

  // ------------------------------------------------------- fit camera on explicit trigger
  useEffect(() => {
    if (lastTriggerRef.current === props.cameraTrigger) return;
    lastTriggerRef.current = props.cameraTrigger;
    const rig = rigRef.current;
    if (rig?.content) fitCamera(rig, rig.content.focusBox);
  }, [props.cameraTrigger]);

  // ------------------------------------------------- in-place updates (cheap, no rebuild)
  useEffect(() => {
    applyAppearance();
  }, [props.mode, props.selection, props.issues, applyAppearance]);

  return <div ref={mountRef} className="absolute inset-0 select-none overflow-hidden" />;
};
