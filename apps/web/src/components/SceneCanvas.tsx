import React, { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment as ThreeRoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  calculateVoxelBoundsMm,
  FACE_DELTAS,
  getRoomBoundsMm,
  type Coord3D,
  type EnvironmentObstacle,
  type Face,
  type RoomEnvironment,
  type VoxelCategory,
  type VoxelIR,
  type VoxelLink,
} from '@omnivoxel/core';
import type { Guides, IssueSeverity, Selection, VisualMode } from '../types';
import { BUS_COLORS, CATEGORY_STYLE, OBSTACLE_DEFAULT_COLOR } from '../lib/theme';
import { thermalHex, type VoxelThermal } from '../lib/thermal';
import {
  deriveJointAxis,
  sampleStepPose,
  type Axis,
  type AssemblyPlan,
  type StepPhase,
} from '../lib/assembly';
import {
  buildHingeFulcrumGuide,
  buildLinkConnectorRig,
  buildMoveHandles,
  buildPivotArcGuide,
  buildPivotMarker,
  buildVoxelDetails,
  orientConnector,
  type HandlePick,
  type LatchDirection,
  type LinkConnectorRig,
} from '../lib/voxelModels';
import { buildDockModel } from '../lib/dockModel';

const MM = 0.001;
/** Cell fill. The remaining ~5.5 % is the visible joint gap that link connectors bridge. */
const VOXEL_FILL = 0.945;
const FIT_DIRECTION = new THREE.Vector3(0.8, -1.0, 0.7).normalize();
/** Duration (seconds) for live move latch/unlatch connector transitions. */
const MOVE_LATCH_DURATION = 0.5;

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
  /** Container → lattice playback state. `progress` runs 0..steps.length. */
  assembly: AssemblyPlayback;
  /** Voxel move handles are only offered when true (assembly complete). */
  editable: boolean;
  /** Request a move to a new lattice cell; resolves true when it was applied. */
  onMoveVoxel: (id: string, coord: Coord3D) => boolean;
  onSelect: (selection: Selection) => void;
}

export interface AssemblyPlayback {
  plan: AssemblyPlan | null;
  progress: number;
}

interface VoxelEntry {
  id: string;
  group: THREE.Group;
  body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  details: THREE.Group;
  /** Hinge-axis overlay (actuated voxels only). */
  joint: THREE.Group | null;
  category: VoxelCategory;
  heat: number;
  coord: Coord3D;
  /** Lattice pitch (m) per axis. */
  stepM: THREE.Vector3;
  /** Rendered body size (m). */
  sizeM: THREE.Vector3;
}

interface LinkSnapshot {
  key: string;
  sourceId: string;
  targetId: string;
  sourceFace: Face;
  link: VoxelLink;
  midpoint: THREE.Vector3;
  gap: number;
  u: number;
}

interface LinkEntry extends LinkSnapshot {
  rig: LinkConnectorRig;
  connector: THREE.Group;
  bus: THREE.Group;
}

interface GuideEntry {
  path: THREE.Line;
  ghost: THREE.LineSegments;
  hinge: THREE.Group | null;
  pivotArc: THREE.Group | null;
}

interface ObstacleEntry {
  id: string;
  body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  baseOpacity: number;
  baseColor: THREE.Color;
}

interface DetachingConnector {
  rig: LinkConnectorRig;
  startEngagement: number;
  elapsed: number;
  duration: number;
}

interface AttachingLink {
  elapsed: number;
  duration: number;
}

interface DragTension {
  voxelId: string;
  /** 0 = resting locked, up to ~0.42 = visibly pre-releasing under drag pull. */
  amount: number;
}

interface Content {
  root: THREE.Group;
  links: THREE.Group;
  connectors: THREE.Group;
  linkEntries: LinkEntry[];
  linkByKey: Map<string, LinkEntry>;
  dock: THREE.Group | null;
  guides: Map<string, GuideEntry>;
  stepIndex: Map<string, number>;
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
  /** Move handles for the selected voxel (outside `content`, so rebuilds don't drop a drag). */
  handles: THREE.Group | null;
  ghost: THREE.LineSegments | null;
  /** Transient unlatching connectors spawned when a voxel moves away from a neighbor. */
  transientGroup: THREE.Group;
  detaching: DetachingConnector[];
  /** Newly formed links animating 0 → 1 after a voxel moves next to a neighbor. */
  attaching: Map<string, AttachingLink>;
  /** Live pre-release tension applied while pulling a selected voxel along an axis arrow. */
  dragTension: DragTension | null;
  /** Previous IR link snapshot used to detect broken/newly formed joints on voxel moves. */
  prevSnapshot: { voxelIdsKey: string; links: Map<string, LinkSnapshot> } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function linkKey(sourceId: string, targetId: string): string {
  return sourceId < targetId ? `${sourceId}|${targetId}` : `${targetId}|${sourceId}`;
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((node) => {
    const renderable = node as THREE.Mesh;
    if (renderable.geometry) renderable.geometry.dispose();
    const material = renderable.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}

function clearTransientAnims(rig: Rig): void {
  for (const d of rig.detaching) {
    rig.transientGroup.remove(d.rig.group);
    disposeTree(d.rig.group);
  }
  rig.detaching.length = 0;
  rig.attaching.clear();
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
  thermal: Map<string, VoxelThermal>,
  plan: AssemblyPlan | null
): Content {
  const root = new THREE.Group();
  const links = new THREE.Group();
  const connectors = new THREE.Group();
  const linkEntries: LinkEntry[] = [];
  const linkByKey = new Map<string, LinkEntry>();
  const guideEntries = new Map<string, GuideEntry>();
  const stepIndex = new Map<string, number>();
  let dock: THREE.Group | null = null;
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
      const jointAxis: Axis | null = category === 'actuated' ? deriveJointAxis(ir, v.id) : null;
      const details = buildVoxelDetails(category, sx, sy, sz, jointAxis ?? 'y');
      const joint = jointAxis ? buildPivotMarker(jointAxis, sx, sy, sz) : null;

      const group = new THREE.Group();
      group.position.copy(center);
      group.add(body, edges, details);
      if (joint) group.add(joint);
      body.userData.id = v.id;
      root.add(group);
      pickVoxels.push(body);

      const dim = v.manifest.mechanical.dimensionsMm;
      voxels.set(v.id, {
        id: v.id,
        group,
        body,
        edges,
        details,
        joint,
        category,
        heat: thermal.get(v.id)?.heat ?? 0,
        coord: v.coord,
        stepM: new THREE.Vector3(dim.x, dim.y, dim.z).multiplyScalar(MM),
        sizeM: new THREE.Vector3(sx, sy, sz),
      });
    }

    // Bus links (visible only in Bus mode) + articulated electromechanical connectors
    const controlMat = new THREE.MeshBasicMaterial({ color: BUS_COLORS.control.hex });
    const highSpeedMat = new THREE.MeshBasicMaterial({ color: BUS_COLORS.highSpeed.hex });
    const noneMat = new THREE.MeshBasicMaterial({ color: BUS_COLORS.none.hex });
    const up = new THREE.Vector3(0, 0, 1);

    for (const link of ir.links) {
      const a = centers.get(link.sourceId);
      const b = centers.get(link.targetId);
      if (!a || !b) continue;

      const bus = new THREE.Group();
      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      const perp = new THREE.Vector3().crossVectors(dir, up);
      if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
      perp.normalize();

      const cp = link.controlPlane.connected;
      const hs = link.highSpeedPlane.connected;
      const lane = cp && hs ? 0.009 : 0;

      if (hs) {
        bus.add(
          makeSegment(
            a.clone().addScaledVector(perp, -lane),
            b.clone().addScaledVector(perp, -lane),
            0.007,
            highSpeedMat
          )
        );
      }
      if (cp) {
        bus.add(
          makeSegment(
            a.clone().addScaledVector(perp, lane),
            b.clone().addScaledVector(perp, lane),
            0.0045,
            controlMat
          )
        );
      }
      if (!cp && !hs) bus.add(makeSegment(a, b, 0.003, noneMat));
      links.add(bus);

      // Physical articulated connector bridging the joint gap between the two voxel bodies
      const sa = voxels.get(link.sourceId);
      const sb = voxels.get(link.targetId);
      if (sa && sb) {
        const axisKey = FACE_DELTAS[link.sourceFace].x !== 0 ? 'x' : FACE_DELTAS[link.sourceFace].y !== 0 ? 'y' : 'z';
        const pitch = (sa.stepM[axisKey] + sb.stepM[axisKey]) / 2;
        const body = (sa.sizeM[axisKey] + sb.sizeM[axisKey]) / 2;
        const gap = Math.max(0.001, pitch - body);
        const u = Math.min(sa.sizeM.x, sa.sizeM.y, sa.sizeM.z, sb.sizeM.x, sb.sizeM.y, sb.sizeM.z);
        const connectorRig = buildLinkConnectorRig(link, gap, u);
        orientConnector(connectorRig.group, link.sourceFace);
        const midpoint = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
        connectorRig.group.position.copy(midpoint);
        connectors.add(connectorRig.group);

        const key = linkKey(link.sourceId, link.targetId);
        const entry: LinkEntry = {
          key,
          sourceId: link.sourceId,
          targetId: link.targetId,
          sourceFace: link.sourceFace,
          link,
          midpoint,
          gap,
          u,
          rig: connectorRig,
          connector: connectorRig.group,
          bus,
        };
        linkEntries.push(entry);
        linkByKey.set(key, entry);
      }
    }
    links.visible = false;
    root.add(links);
    root.add(connectors);

    // Assembly Container + guided paths + target ghosts + hinge-edge fulcrum guides
    if (plan && plan.steps.length > 0) {
      dock = buildDockModel(plan.dock, plan.steps.length);
      root.add(dock);
      focusBox
        .expandByPoint(new THREE.Vector3(plan.dock.minMm.x, plan.dock.minMm.y, plan.dock.minMm.z).multiplyScalar(MM))
        .expandByPoint(new THREE.Vector3(plan.dock.maxMm.x, plan.dock.maxMm.y, plan.dock.maxMm.z).multiplyScalar(MM));

      for (const step of plan.steps) {
        stepIndex.set(step.voxelId, step.index);
        const entry = voxels.get(step.voxelId);
        if (!entry) continue;

        const u = Math.min(entry.sizeM.x, entry.sizeM.y, entry.sizeM.z);
        const transitPts = (step.transitPath.length >= 2 ? step.transitPath : step.path).map((p) =>
          new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(MM)
        );
        const pathColor = !step.collisionFree
          ? 0xf87171
          : step.docking.mode === 'pivot-hinge'
            ? 0xfbbf24
            : 0x38bdf8;
        const path = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(transitPts),
          new THREE.LineDashedMaterial({
            color: pathColor,
            dashSize: 0.011,
            gapSize: 0.008,
            transparent: true,
            opacity: step.docking.mode === 'keystone' ? 0.78 : 0.48,
          })
        );
        path.computeLineDistances();
        path.visible = false;

        const ghost = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(entry.sizeM.x, entry.sizeM.y, entry.sizeM.z)),
          new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.3 })
        );
        ghost.position.set(step.target.x, step.target.y, step.target.z).multiplyScalar(MM);
        ghost.visible = false;

        let hinge: THREE.Group | null = null;
        let pivotArc: THREE.Group | null = null;
        const arcColor = step.collisionFree ? 0x38bdf8 : 0xf87171;
        if (step.docking.pivot) {
          const pv = step.docking.pivot;
          hinge = buildHingeFulcrumGuide(pv.axis, entry.sizeM[pv.axis], u);
          hinge.position.set(pv.hingePoint.x * MM, pv.hingePoint.y * MM, pv.hingePoint.z * MM);
          hinge.visible = false;
          root.add(hinge);

          const arcPtsM = pv.arcPoints.map((p) => new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(MM));
          pivotArc = buildPivotArcGuide(arcPtsM, u, arcColor);
          pivotArc.visible = false;
          root.add(pivotArc);
        } else if (step.docking.mode === 'guided-dock') {
          const st = step.docking.stagingPoint;
          const tg = step.target;
          pivotArc = buildPivotArcGuide(
            [
              new THREE.Vector3(st.x, st.y, st.z).multiplyScalar(MM),
              new THREE.Vector3(tg.x, tg.y, tg.z).multiplyScalar(MM),
            ],
            u,
            arcColor
          );
          pivotArc.visible = false;
          root.add(pivotArc);
        }

        root.add(path, ghost);
        guideEntries.set(step.voxelId, { path, ghost, hinge, pivotArc });
      }
    }
  }

  if (focusBox.isEmpty()) {
    focusBox.set(roomMin, roomMax);
  }

  return {
    root,
    links,
    connectors,
    linkEntries,
    linkByKey,
    dock,
    guides: guideEntries,
    stepIndex,
    voxels,
    obstacles,
    pickVoxels,
    pickObstacles,
    focusBox,
  };
}

function fitCamera(rig: Rig, box: THREE.Box3): void {
  const padded = box.clone().expandByScalar(0.08);
  const sphere = padded.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.12);
  // Fit against the tighter of the vertical / horizontal field of view.
  // 0.82: the bounding sphere is conservative for an oblique view of a box
  const vFov = THREE.MathUtils.degToRad(rig.camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.2, rig.camera.aspect));
  const distance = (radius * 0.82) / Math.sin(Math.min(vFov, hFov) / 2);

  rig.camera.position.copy(sphere.center).addScaledVector(FIT_DIRECTION, distance);
  rig.controls.target.copy(sphere.center);
  rig.camera.near = Math.max(0.005, distance / 500);
  rig.camera.far = Math.max(60, distance * 40);
  rig.camera.updateProjectionMatrix();
  rig.controls.update();
  rig.requestRender();
}

/** Applies live drag pre-release tension to connectors attached to the dragged voxel. */
function applyDragTension(rig: Rig): void {
  const content = rig.content;
  if (!content) return;
  const tension = rig.dragTension;
  for (const link of content.linkEntries) {
    if (rig.attaching.has(link.key)) continue;
    const pulled =
      tension !== null &&
      (link.sourceId === tension.voxelId || link.targetId === tension.voxelId);
    if (pulled && tension.amount > 0.01) {
      link.connector.visible = true;
      link.rig.setEngagement(1 - tension.amount, -1);
    } else {
      link.connector.visible = true;
      link.rig.setEngagement(1, 0);
    }
  }
}

/**
 * Advances active move-triggered latch/unlatch connector animations.
 * Returns true while any animation still needs redrawing.
 */
function stepTransientAnims(rig: Rig, dt: number): boolean {
  let active = false;

  // 1. Unlatching ghost connectors left behind when a voxel moved away from a neighbor
  for (let i = rig.detaching.length - 1; i >= 0; i--) {
    const anim = rig.detaching[i];
    anim.elapsed += dt;
    const u = Math.min(1, anim.elapsed / anim.duration);
    // Ease out swiftly so jaws visibly release first, then pins retract smoothly
    const eased = u * u * (3 - 2 * u);
    const engagement = anim.startEngagement * (1 - eased);
    anim.rig.setEngagement(engagement, -1);
    active = true;
    if (u >= 1) {
      rig.transientGroup.remove(anim.rig.group);
      disposeTree(anim.rig.group);
      rig.detaching.splice(i, 1);
    }
  }

  // 2. Newly formed links engaging/latching after a voxel moved adjacent to a neighbor
  if (rig.attaching.size > 0 && rig.content) {
    for (const [key, anim] of rig.attaching) {
      const entry = rig.content.linkByKey.get(key);
      if (!entry) {
        rig.attaching.delete(key);
        continue;
      }
      anim.elapsed += dt;
      const u = Math.min(1, anim.elapsed / anim.duration);
      const eased = u * u * (3 - 2 * u);
      entry.connector.visible = eased > 0.01;
      entry.bus.visible = eased >= 0.55;
      entry.rig.setEngagement(eased, u < 1 ? 1 : 0);
      active = true;
      if (u >= 1) {
        rig.attaching.delete(key);
      }
    }
  }

  return active;
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
  const lastActiveRef = useRef<string | null>(null);
  const activePhaseRef = useRef<StepPhase>('seated');
  const lastProgressRef = useRef<number>(props.assembly.progress);
  const lastScrubDirRef = useRef<LatchDirection>(1);
  const syncHandlesRef = useRef<() => void>(() => undefined);

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

    const { plan, progress } = propsRef.current.assembly;
    const total = plan?.steps.length ?? 0;
    const complete = total === 0 || progress >= total - 1e-6;
    const activeId = !complete && plan ? plan.steps[Math.min(total - 1, Math.floor(progress))]?.voxelId : null;

    content.links.visible = mode === 'Bus';
    content.connectors.visible = mode !== 'Thermal';
    rig.transientGroup.visible = mode !== 'Thermal';
    // Joint axes are an engineering overlay: Assembly + Bus views only
    if (content.dock) content.dock.visible = mode === 'Assembly' || !complete;

    for (const entry of content.voxels.values()) {
      if (entry.joint) entry.joint.visible = mode !== 'Thermal';
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

      const activePhase = activePhaseRef.current;
      if (isSelected) {
        material.emissive.setHex(0x38bdf8);
        material.emissiveIntensity = 0.5;
      } else if (isHovered) {
        material.emissive.setHex(0xffffff);
        material.emissiveIntensity = 0.16;
      } else if (activeId === entry.id) {
        if (activePhase === 'launch') {
          material.emissive.setHex(0xf97316);
          material.emissiveIntensity = 0.34;
        } else if (activePhase === 'catch') {
          material.emissive.setHex(0xe879f9);
          material.emissiveIntensity = 0.34;
        } else if (activePhase === 'pivot' || activePhase === 'travel') {
          material.emissive.setHex(0x38bdf8);
          material.emissiveIntensity = 0.26;
        } else {
          material.emissive.setHex(0xfbbf24);
          material.emissiveIntensity = 0.22;
        }
      } else {
        material.emissive.setHex(baseEmissive);
        material.emissiveIntensity = baseEmissiveIntensity;
      }

      const edgeMaterial = entry.edges.material;
      if (isSelected) edgeMaterial.color.setHex(EDGE_COLOR.selected);
      else if (issue === 'error') edgeMaterial.color.setHex(EDGE_COLOR.error);
      else if (issue === 'warning') edgeMaterial.color.setHex(EDGE_COLOR.warning);
      else if (activeId === entry.id) {
        if (activePhase === 'launch') edgeMaterial.color.setHex(0xfb923c);
        else if (activePhase === 'catch') edgeMaterial.color.setHex(0x38bdf8);
        else edgeMaterial.color.setHex(0x7dd3fc);
      } else edgeMaterial.color.setHex(mode === 'Bus' ? 0x64748b : EDGE_COLOR.idle);
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

  /**
   * Drives every voxel's guided-docking / articulated-hinge pose and every
   * connector's mechanical latch engagement for the current playback progress.
   * Pure in-place transform/material updates: zero geometry allocations.
   */
  const applyProgress = useCallback(() => {
    const rig = rigRef.current;
    const content = rig?.content;
    if (!rig || !content) return;
    const { plan, progress } = propsRef.current.assembly;
    if (!plan) return;

    const delta = progress - lastProgressRef.current;
    const playbackDir: LatchDirection = delta > 1e-5 ? 1 : delta < -1e-5 ? -1 : 0;
    if (playbackDir !== 0) lastScrubDirRef.current = playbackDir;
    lastProgressRef.current = progress;

    const total = plan.steps.length;
    const complete = progress >= total - 1e-6;
    const activeIndex = complete ? -1 : Math.min(total - 1, Math.floor(progress));

    if (!complete && (rig.detaching.length > 0 || rig.attaching.size > 0)) {
      clearTransientAnims(rig);
    }

    const stepProgress = new Map<string, number>();
    const stepLatch = new Map<string, number>();
    let activePhase: StepPhase = 'seated';

    for (const step of plan.steps) {
      const entry = content.voxels.get(step.voxelId);
      if (!entry) continue;

      const t = Math.min(1, Math.max(0, progress - step.index));
      const pose = sampleStepPose(step, t);
      entry.group.position.set(pose.position.x * MM, pose.position.y * MM, pose.position.z * MM);
      entry.group.rotation.set(0, 0, 0);
      if (Math.abs(pose.rotationAngleRad) > 1e-5) {
        entry.group.rotation[pose.rotationAxis] = pose.rotationAngleRad;
      }

      stepProgress.set(step.voxelId, t);
      stepLatch.set(step.voxelId, pose.latchProgress);

      const isCurrent = step.index === activeIndex;
      if (isCurrent) activePhase = pose.phase;

      const guide = content.guides.get(step.voxelId);
      if (guide) {
        const showGuides = !complete && t < 1;
        guide.ghost.visible = showGuides;
        (guide.ghost.material as THREE.LineBasicMaterial).opacity = isCurrent ? 0.95 : 0.22;
        guide.path.visible = showGuides && isCurrent;
        if (guide.hinge) {
          guide.hinge.visible =
            showGuides &&
            isCurrent &&
            (pose.phase === 'travel' || pose.phase === 'pivot' || pose.phase === 'catch');
        }
        if (guide.pivotArc) {
          guide.pivotArc.visible =
            showGuides &&
            isCurrent &&
            (pose.phase === 'launch' ||
              pose.phase === 'travel' ||
              pose.phase === 'pivot' ||
              pose.phase === 'catch');
        }
      }
    }

    // Drive every connector's corner clamps, edge coils, dowel pins, bayonet twist-lock, and bus
    for (const link of content.linkEntries) {
      if (complete) {
        // Respect any active move-triggered attach animation or live drag tension
        if (rig.attaching.has(link.key)) continue;
        const pulled =
          rig.dragTension !== null &&
          (link.sourceId === rig.dragTension.voxelId || link.targetId === rig.dragTension.voxelId);
        link.connector.visible = true;
        link.bus.visible = true;
        if (pulled && rig.dragTension!.amount > 0.01) {
          link.rig.setEngagement(1 - rig.dragTension!.amount, -1);
        } else {
          link.rig.setEngagement(1, 0);
        }
        continue;
      }

      const idxA = content.stepIndex.get(link.sourceId) ?? 0;
      const idxB = content.stepIndex.get(link.targetId) ?? 0;
      const firstId = idxA <= idxB ? link.sourceId : link.targetId;
      const secondId = idxA <= idxB ? link.targetId : link.sourceId;

      const tFirst = stepProgress.get(firstId) ?? 0;
      const latchSecond = stepLatch.get(secondId) ?? 0;
      const engagement = tFirst >= 1 - 1e-5 ? latchSecond : 0;

      const visible = engagement > 0.01;
      link.connector.visible = visible;
      link.bus.visible = engagement >= 0.55;
      if (visible) {
        const dir: LatchDirection =
          engagement >= 0.999 ? 0 : playbackDir !== 0 ? playbackDir : lastScrubDirRef.current;
        link.rig.setEngagement(engagement, dir);
      }
    }

    const activeId = activeIndex >= 0 ? plan.steps[activeIndex]?.voxelId ?? null : null;
    if (activeId !== lastActiveRef.current || activePhase !== activePhaseRef.current) {
      lastActiveRef.current = activeId;
      activePhaseRef.current = activePhase;
      applyAppearance();
    }
    rig.requestRender();
  }, [applyAppearance]);

  /** Shows (or hides) the axis handles for the currently selected voxel. */
  const syncHandles = useCallback(() => {
    const rig = rigRef.current;
    if (!rig) return;
    if (rig.handles) {
      rig.scene.remove(rig.handles);
      disposeTree(rig.handles);
      rig.handles = null;
    }
    const { selection, editable } = propsRef.current;
    const content = rig.content;
    if (editable && selection?.kind === 'voxel' && content) {
      const entry = content.voxels.get(selection.id);
      if (entry) {
        const handles = buildMoveHandles(entry.sizeM.x, entry.sizeM.y, entry.sizeM.z);
        handles.position.copy(entry.group.position);
        rig.scene.add(handles);
        rig.handles = handles;
      }
    }
    rig.requestRender();
  }, []);
  syncHandlesRef.current = syncHandles;

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

    const transientGroup = new THREE.Group();
    scene.add(transientGroup);

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

    const rig: Rig = {
      renderer,
      scene,
      camera,
      controls,
      requestRender,
      content: null,
      handles: null,
      ghost: null,
      transientGroup,
      detaching: [],
      attaching: new Map(),
      dragTension: null,
      prevSnapshot: null,
    };
    rigRef.current = rig;
    hasFittedRef.current = false;

    // Render loop: draws only when controls damp, state changes, or latch anims run
    let raf = 0;
    let lastTick = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0, (now - lastTick) / 1000));
      lastTick = now;
      const animActive = stepTransientAnims(rig, dt);
      const moved = controls.update();
      if (moved || dirty || animActive) {
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

    // ---- Axis-handle dragging: moves the selected voxel along one lattice axis, cell by cell
    interface DragState {
      id: string;
      axis: Axis;
      startCoord: Coord3D;
      origin: THREE.Vector3;
      axisVec: THREE.Vector3;
      s0: number;
      stepM: number;
      sizeM: THREE.Vector3;
      stepVec: THREE.Vector3;
      lastCells: number;
      lastKey: string;
      pointerId: number;
    }
    let drag: DragState | null = null;

    const setRay = (x: number, y: number) => {
      ndc.set((x / size.w) * 2 - 1, -(y / size.h) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    };

    const handleAt = (x: number, y: number): HandlePick | null => {
      if (!rig.handles) return null;
      setRay(x, y);
      const hit = raycaster
        .intersectObject(rig.handles, true)
        .find((h) => h.object.userData.handle);
      return hit ? (hit.object.userData.handle as HandlePick) : null;
    };

    /** Parameter (along `axisVec` from `origin`) of the point on the axis closest to the mouse ray. */
    const axisParam = (d: DragState): number | null => {
      const o = raycaster.ray.origin;
      const dir = raycaster.ray.direction;
      const w0 = d.origin.clone().sub(o);
      const b = d.axisVec.dot(dir);
      const den = 1 - b * b;
      if (den < 1e-4) return null; // looking straight down the axis: no usable depth
      return (b * dir.dot(w0) - d.axisVec.dot(w0)) / den;
    };

    const showGhost = (d: DragState, coord: Coord3D, blocked: boolean) => {
      if (!blocked) {
        if (rig.ghost) rig.ghost.visible = false;
        return;
      }
      if (!rig.ghost) {
        rig.ghost = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(d.sizeM.x, d.sizeM.y, d.sizeM.z)),
          new THREE.LineBasicMaterial({ color: 0xf87171, depthTest: false, transparent: true })
        );
        rig.ghost.renderOrder = 25;
        scene.add(rig.ghost);
      }
      rig.ghost.position.set(
        (coord.x + 0.5) * d.stepVec.x,
        (coord.y + 0.5) * d.stepVec.y,
        (coord.z + 0.5) * d.stepVec.z
      );
      rig.ghost.visible = true;
    };

    const endDrag = () => {
      if (!drag) return;
      try {
        canvas.releasePointerCapture(drag.pointerId);
      } catch {
        /* already released */
      }
      drag = null;
      controls.enabled = true;
      canvas.style.cursor = 'grab';
      if (rig.dragTension) {
        rig.dragTension = null;
        applyDragTension(rig);
      }
      if (rig.ghost) {
        scene.remove(rig.ghost);
        disposeTree(rig.ghost);
        rig.ghost = null;
      }
      requestRender();
    };

    /** Capture phase on the mount: runs before OrbitControls, so a handle grab never orbits. */
    const onCaptureDown = (e: PointerEvent) => {
      if (e.button !== 0 || !rig.handles || !rig.content) return;
      const pickedHandle = handleAt(e.offsetX, e.offsetY);
      const selection = propsRef.current.selection;
      if (!pickedHandle || selection?.kind !== 'voxel') return;
      const entry = rig.content.voxels.get(selection.id);
      if (!entry) return;

      const axisVec = new THREE.Vector3(
        pickedHandle.axis === 'x' ? 1 : 0,
        pickedHandle.axis === 'y' ? 1 : 0,
        pickedHandle.axis === 'z' ? 1 : 0
      );
      const next: DragState = {
        id: entry.id,
        axis: pickedHandle.axis,
        startCoord: entry.coord,
        origin: entry.group.position.clone(),
        axisVec,
        s0: 0,
        stepM: entry.stepM[pickedHandle.axis],
        sizeM: entry.sizeM.clone(),
        stepVec: entry.stepM.clone(),
        lastCells: 0,
        lastKey: `${entry.coord.x},${entry.coord.y},${entry.coord.z}`,
        pointerId: e.pointerId,
      };
      const s0 = axisParam(next);
      if (s0 === null) return;
      next.s0 = s0;

      e.stopPropagation();
      e.preventDefault();
      controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      drag = next;
    };

    const onDragMove = (e: PointerEvent) => {
      if (!drag) return;
      setRay(e.offsetX, e.offsetY);
      const s = axisParam(drag);
      if (s === null) return;
      const rawCells = (s - drag.s0) / drag.stepM;
      const cells = Math.round(rawCells);

      // Show tactile pre-release bayonet tension while pulling away before cell snap
      const frac = Math.abs(rawCells - drag.lastCells);
      const tensionAmount = frac > 0.08 ? Math.min(0.42, (frac - 0.08) * 0.9) : 0;
      rig.dragTension = tensionAmount > 0.01 ? { voxelId: drag.id, amount: tensionAmount } : null;
      applyDragTension(rig);

      const coord: Coord3D = {
        ...drag.startCoord,
        [drag.axis]: drag.startCoord[drag.axis] + cells,
      };
      const key = `${coord.x},${coord.y},${coord.z}`;
      if (key === drag.lastKey) {
        requestRender();
        return;
      }
      drag.lastKey = key;
      const applied = propsRef.current.onMoveVoxel(drag.id, coord);
      if (applied) drag.lastCells = cells;
      showGhost(drag, coord, !applied);
      requestRender();
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
      if (drag) {
        endDrag();
        return;
      }
      if (downButton !== 0 || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 5 || performance.now() - downAt > 600) return; // orbit / pan drag, not a click
      propsRef.current.onSelect(pick(e.offsetX, e.offsetY));
    };

    let hoverFrame = 0;
    let pendingMove: { x: number; y: number; buttons: number } | null = null;
    const onPointerMove = (e: PointerEvent) => {
      if (drag) {
        onDragMove(e);
        return;
      }
      pendingMove = { x: e.offsetX, y: e.offsetY, buttons: e.buttons };
      if (hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        const move = pendingMove;
        pendingMove = null;
        if (!move || drag) return;
        const overHandle = move.buttons === 0 && handleAt(move.x, move.y) !== null;
        const hit = move.buttons === 0 && !overHandle ? pick(move.x, move.y) : null;
        const next = hit ? `${hit.kind === 'voxel' ? 'v' : 'o'}:${hit.id}` : null;
        canvas.style.cursor = overHandle ? 'grab' : hit ? 'pointer' : 'grab';
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
    mount.addEventListener('pointerdown', onCaptureDown, true);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', endDrag);
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
      endDrag();
      mount.removeEventListener('pointerdown', onCaptureDown, true);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      controls.removeEventListener('change', requestRender);
      controls.dispose();

      clearTransientAnims(rig);
      scene.remove(transientGroup);

      if (rig.handles) {
        scene.remove(rig.handles);
        disposeTree(rig.handles);
        rig.handles = null;
      }
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

    const prevSnapshot = rig.prevSnapshot;

    if (rig.content) {
      rig.scene.remove(rig.content.root);
      disposeTree(rig.content.root);
      rig.content = null;
    }
    hoverRef.current = null;

    const content = buildContent(props.ir, props.room, props.guides, props.thermal, props.assembly.plan);
    rig.scene.add(content.root);
    rig.content = content;

    // Detect broken / newly formed joints when an existing voxel is moved in place
    const nextVoxelIdsKey = props.ir
      ? [...props.ir.voxels.map((v) => v.id)].sort().join(',')
      : '';
    const nextLinks = new Map<string, LinkSnapshot>();
    for (const e of content.linkEntries) {
      nextLinks.set(e.key, {
        key: e.key,
        sourceId: e.sourceId,
        targetId: e.targetId,
        sourceFace: e.sourceFace,
        link: e.link,
        midpoint: e.midpoint.clone(),
        gap: e.gap,
        u: e.u,
      });
    }

    const total = props.assembly.plan?.steps.length ?? 0;
    const isComplete = total === 0 || props.assembly.progress >= total - 1e-6;

    if (prevSnapshot && prevSnapshot.voxelIdsKey === nextVoxelIdsKey && isComplete) {
      // Spawn visible unlatch/release animations on every broken neighbor joint
      for (const [key, oldLink] of prevSnapshot.links) {
        if (!nextLinks.has(key)) {
          const ghostRig = buildLinkConnectorRig(oldLink.link, oldLink.gap, oldLink.u);
          orientConnector(ghostRig.group, oldLink.sourceFace);
          ghostRig.group.position.copy(oldLink.midpoint);
          const wasPulled =
            rig.dragTension !== null &&
            (oldLink.sourceId === rig.dragTension.voxelId ||
              oldLink.targetId === rig.dragTension.voxelId);
          const startEngagement = wasPulled
            ? Math.max(0.55, 1 - rig.dragTension!.amount)
            : 1;
          ghostRig.setEngagement(startEngagement, -1);
          rig.transientGroup.add(ghostRig.group);
          rig.detaching.push({
            rig: ghostRig,
            startEngagement,
            elapsed: 0,
            duration: MOVE_LATCH_DURATION,
          });
        }
      }

      // Trigger engage/latch animations on every newly formed neighbor joint
      for (const key of nextLinks.keys()) {
        if (!prevSnapshot.links.has(key)) {
          rig.attaching.set(key, { elapsed: 0, duration: MOVE_LATCH_DURATION });
          const entry = content.linkByKey.get(key);
          if (entry) {
            entry.connector.visible = false;
            entry.bus.visible = false;
            entry.rig.setEngagement(0, 1);
          }
        }
      }
    } else if (prevSnapshot && prevSnapshot.voxelIdsKey !== nextVoxelIdsKey) {
      clearTransientAnims(rig);
    }

    rig.prevSnapshot = { voxelIdsKey: nextVoxelIdsKey, links: nextLinks };

    if (!hasFittedRef.current) {
      hasFittedRef.current = true;
      fitCamera(rig, content.focusBox);
    }
    lastActiveRef.current = null;
    applyProgress();
    applyAppearance();
    syncHandlesRef.current();
    // thermal participates because heat is baked into entries at build time
  }, [
    props.ir,
    props.room,
    props.thermal,
    props.assembly.plan,
    applyProgress,
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
  const assemblyTotal = props.assembly.plan?.steps.length ?? 0;
  const assemblyComplete = assemblyTotal === 0 || props.assembly.progress >= assemblyTotal - 1e-6;

  useEffect(() => {
    applyAppearance();
  }, [props.mode, props.selection, props.issues, assemblyComplete, applyAppearance]);

  // Playback: reposition/rotate voxels along their paths and engage/unlatch joints (no rebuild)
  useEffect(() => {
    applyProgress();
  }, [props.assembly.progress, applyProgress]);

  // Axis handles follow the selection and only exist while editing is allowed
  useEffect(() => {
    syncHandles();
  }, [props.selection, props.editable, syncHandles]);

  return <div ref={mountRef} className="absolute inset-0 select-none overflow-hidden" />;
};
