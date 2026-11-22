import {
  calculateVoxelBoundsMm,
  type Coord3D,
  type Face,
  type VoxelCategory,
  type VoxelIR,
  type VoxelInstance,
} from '@omnivoxel/core';

/**
 * Pure (Three.js-free) modular-robotics assembly planning modeled on
 * ElectroVoxel / edge-pivoting modular cubes:
 *  - a deterministic, connectivity-preserving build order,
 *  - an "Assembly Container" (dock box) layout with one slot per voxel,
 *  - deliberate 3-stage point-to-point motion for every step:
 *      1. Launch  — electromagnetic lift-off out of the container slot,
 *      2. Travel  — low-clearance corridor glide + articulated corner-edge
 *                   Pivoting (`pivot-hinge`) or coaxial Traversal (`guided-dock`),
 *      3. Catch   — magnetic pull-in and electromechanical connector locking,
 *  - exact reversibility (`sampleStepPose`) so `Step Back` and scrubbing first
 *    unlatch/release joints, then pivot open / back away along the guided path.
 *
 * Everything is expressed in millimetres in the same Z-up frame as the core lattice.
 */

export type Axis = 'x' | 'y' | 'z';
export type Vec3 = Coord3D;

export type DockingMode = 'keystone' | 'guided-dock' | 'pivot-hinge';
export type StepPhase = 'stowed' | 'launch' | 'travel' | 'pivot' | 'catch' | 'seated';

export interface PivotSpec {
  /** Shared hinge edge midpoint on the mating face (world mm). */
  hingePoint: Vec3;
  /** Unit hinge rotation axis ('x' | 'y' | 'z'). */
  axis: Axis;
  /** Signed open angle (rad) at staging; sweeps smoothly down to 0 when seated. */
  startAngleRad: number;
  /** Unit outward normal of the mating face (anchor → voxel). */
  dockNormal: Vec3;
  /** Smoothly sampled circular arc points from stagingPoint → target (world mm). */
  arcPoints: Vec3[];
}

export interface DockingSpec {
  mode: DockingMode;
  /** Primary already-placed anchor this voxel docks against (null for keystones). */
  primaryAnchorId: string | null;
  /** Unit approach direction pointing out from the anchor mating face (or +Z for keystones). */
  approachDir: Vec3;
  /** Pre-alignment staging centre in world mm (end of travel, start of pivot/catch). */
  stagingPoint: Vec3;
  /** Normalized step progress t ∈ (0, 1) where container launch finishes and travel starts. */
  launchEndT: number;
  /** Normalized step progress t ∈ (launchEndT, 1) where edge pivoting / final traversal starts. */
  dockStartT: number;
  /** Normalized step progress t ∈ (dockStartT, 1] where Catch latching begins. */
  latchStartT: number;
  /** Present when the step finishes with an articulated corner-edge pivot. */
  pivot: PivotSpec | null;
}

export interface StepPose {
  /** Voxel centre in world mm. */
  position: Vec3;
  /** Local rotation axis around the voxel centre. */
  rotationAxis: Axis;
  /** Local rotation angle in radians (0 when stowed or seated). */
  rotationAngleRad: number;
  /** 0 = released/disengaged, 0..1 = engaging/unlatching, 1 = fully locked. */
  latchProgress: number;
  /** Current point-to-point robotics stage (Launch → Travel/Pivot → Catch). */
  phase: StepPhase;
}

export interface AssemblyStep {
  /** 0-based position in the build order. */
  index: number;
  voxelId: string;
  category: VoxelCategory;
  /** Final voxel centre. */
  target: Vec3;
  /** Voxel size (mm). */
  size: Vec3;
  /** Resting centre inside the container. */
  slot: Vec3;
  /** Launch leg polyline from `slot` to the container exit rim. */
  launchPath: Vec3[];
  /** Low-clearance travel polyline from container exit rim to `docking.stagingPoint`. */
  travelPath: Vec3[];
  /** Combined pre-dock transit polyline from `slot` to `docking.stagingPoint`. */
  transitPath: Vec3[];
  /** Full polyline from `slot` to `target` (includes sampled pivot arc when hinged). */
  path: Vec3[];
  pathLengthMm: number;
  /** False only when no obstacle-free approach exists (path then ignores collisions). */
  collisionFree: boolean;
  /** Voxels already in place that this one docks against. */
  anchorIds: string[];
  /** Guided docking / articulated pivot specification for this step. */
  docking: DockingSpec;
}

export interface DockSpec {
  /** Outer box, mm. */
  minMm: Vec3;
  maxMm: Vec3;
  /** Inner (usable) floor rectangle, mm. */
  innerMinMm: Vec3;
  innerMaxMm: Vec3;
  /** Z of the top of the floor plate (voxels rest here). */
  floorZMm: number;
  wallHeightMm: number;
  wallThicknessMm: number;
  floorThicknessMm: number;
  cols: number;
  rows: number;
  slotPitchMm: number;
  slots: Vec3[];
}

export interface AssemblyPlan {
  steps: AssemblyStep[];
  dock: DockSpec;
  /** Highest transit altitude (mm, voxel centre) used across all steps. */
  travelZMm: number;
}

export const AXES: readonly Axis[] = ['x', 'y', 'z'] as const;

// ---------------------------------------------------------------------------
// Small vector & rotation helpers
// ---------------------------------------------------------------------------

const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const add3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const sub3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const scale3 = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);
const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross3 = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 =>
  v3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const same = (a: Vec3, b: Vec3) => dist(a, b) < 1e-6;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const AXIS_UNIT: Record<Axis, Vec3> = {
  x: v3(1, 0, 0),
  y: v3(0, 1, 0),
  z: v3(0, 0, 1),
};

interface Box {
  min: Vec3;
  max: Vec3;
}

function boxOf(v: VoxelInstance): Box {
  const b = calculateVoxelBoundsMm(v);
  return { min: b.min, max: b.max };
}

function centerOf(b: Box): Vec3 {
  return v3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
}

function sizeOf(b: Box): Vec3 {
  return v3(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
}

/** Right-handed rotation of `v` around a principal coordinate axis (matches Three.js). */
export function rotateVecAroundAxis(v: Vec3, axis: Axis, rad: number): Vec3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  if (axis === 'x') return v3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
  if (axis === 'y') return v3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
  return v3(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
}

/** World-space voxel centre when rotated by `angleRad` about `pivot.hingePoint`. */
export function pivotPositionAt(target: Vec3, pivot: PivotSpec, angleRad: number): Vec3 {
  const lever = sub3(target, pivot.hingePoint);
  return add3(pivot.hingePoint, rotateVecAroundAxis(lever, pivot.axis, angleRad));
}

/** Rotated axis-aligned half-extents of a box rotated by `rad` about `axis`. */
function rotatedHalfExtents(half: Vec3, axis: Axis, rad: number): Vec3 {
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  if (axis === 'x') return v3(half.x, half.y * c + half.z * s, half.y * s + half.z * c);
  if (axis === 'y') return v3(half.x * c + half.z * s, half.y, half.x * s + half.z * c);
  return v3(half.x * c + half.y * s, half.x * s + half.y * c, half.z);
}

/** Tolerance that lets a voxel slide face-to-face against neighbours without "colliding". */
const TOUCH_EPS_MM = 1;

/**
 * Does the segment a→b of a voxel with the given half-size pass through the
 * interior of `obstacle`? (Minkowski sum: obstacle grown by the mover's half-size.)
 */
export function segmentHitsBox(a: Vec3, b: Vec3, half: Vec3, obstacle: Box): boolean {
  let tMin = 0;
  let tMax = 1;
  for (const axis of AXES) {
    const lo = obstacle.min[axis] - half[axis] + TOUCH_EPS_MM;
    const hi = obstacle.max[axis] + half[axis] - TOUCH_EPS_MM;
    const d = b[axis] - a[axis];
    if (Math.abs(d) < 1e-9) {
      if (a[axis] <= lo || a[axis] >= hi) return false;
    } else {
      const t1 = (lo - a[axis]) / d;
      const t2 = (hi - a[axis]) / d;
      tMin = Math.max(tMin, Math.min(t1, t2));
      tMax = Math.min(tMax, Math.max(t1, t2));
      if (tMax <= tMin + 1e-9) return false;
    }
  }
  return tMax > tMin + 1e-9;
}

function pointHitsBox(p: Vec3, half: Vec3, obstacle: Box): boolean {
  for (const axis of AXES) {
    const lo = obstacle.min[axis] - half[axis] + TOUCH_EPS_MM;
    const hi = obstacle.max[axis] + half[axis] - TOUCH_EPS_MM;
    if (p[axis] <= lo || p[axis] >= hi) return false;
  }
  return true;
}

function polylineLength(points: readonly Vec3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

/** Position along a polyline at normalised arc length `t` (0..1). */
export function samplePath(points: readonly Vec3[], t: number): Vec3 {
  if (points.length === 0) return v3(0, 0, 0);
  if (points.length === 1 || t <= 0) return points[0];
  if (t >= 1) return points[points.length - 1];
  const total = polylineLength(points);
  if (total < 1e-9) return points[points.length - 1];
  let remaining = t * total;
  for (let i = 1; i < points.length; i++) {
    const seg = dist(points[i - 1], points[i]);
    if (remaining <= seg || i === points.length - 1) {
      const k = seg < 1e-9 ? 1 : Math.min(1, remaining / seg);
      return lerp3(points[i - 1], points[i], k);
    }
    remaining -= seg;
  }
  return points[points.length - 1];
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

/**
 * Evaluates a step's deterministic 6-DOF pose and electromechanical latch
 * engagement at normalised step progress `t ∈ [0, 1]`.
 *
 * Follows the 3-stage ElectroVoxel sequence:
 *  1. Launch  (0 → launchEndT): crisp electromagnetic lift-off over container rim,
 *  2. Travel  (launchEndT → dockStartT → latchStartT): guided point-to-point
 *     corridor glide followed by corner-edge Pivoting (`pivot`) or coaxial
 *     Traversal into the target face,
 *  3. Catch   (latchStartT → 1): magnetic seating & corner/edge latch lock.
 *
 * Reversible by construction: `Step Back` and scrubbing backward cleanly
 * release/unlatch joints first, then pivot open / back along the guided path.
 */
export function sampleStepPose(step: AssemblyStep, t: number): StepPose {
  const { docking } = step;
  const pivot = docking.pivot;
  const rotAxis: Axis = pivot?.axis ?? 'y';

  if (t <= 0) {
    return {
      position: step.slot,
      rotationAxis: rotAxis,
      rotationAngleRad: 0,
      latchProgress: 0,
      phase: 'stowed',
    };
  }
  if (t >= 1) {
    return {
      position: step.target,
      rotationAxis: rotAxis,
      rotationAngleRad: 0,
      latchProgress: 1,
      phase: 'seated',
    };
  }

  const { launchEndT, dockStartT, latchStartT } = docking;

  // Stage 1: Launch — crisp electromagnetic lift-off out of the container slot
  if (t < launchEndT) {
    const u = easeOutCubic(t / Math.max(1e-6, launchEndT));
    return {
      position: samplePath(step.launchPath, u),
      rotationAxis: rotAxis,
      rotationAngleRad: 0,
      latchProgress: 0,
      phase: 'launch',
    };
  }

  // Stage 2a: Guided Travel — point-to-point corridor glide to staging pose
  if (t < dockStartT) {
    const span = Math.max(1e-6, dockStartT - launchEndT);
    const u = easeInOutCubic(clamp01((t - launchEndT) / span));
    const position = samplePath(step.travelPath, u);
    // For pivot-hinge steps, smoothly pre-orient toward the open hinge angle while
    // approaching the anchor edge so the voxel catches the corner fulcrum flush at dockStartT.
    let rotationAngleRad = 0;
    if (pivot) {
      const preAlign = easeInOutCubic(clamp01((u - 0.25) / 0.75));
      rotationAngleRad = pivot.startAngleRad * preAlign;
    }
    return {
      position,
      rotationAxis: rotAxis,
      rotationAngleRad,
      latchProgress: 0,
      phase: 'travel',
    };
  }

  // Stage 2b: Articulated Corner-Edge Pivot OR Guided Coaxial Traversal into Target
  if (t < latchStartT) {
    const span = Math.max(1e-6, latchStartT - dockStartT);
    const u = clamp01((t - dockStartT) / span);
    const eased = easeInOutCubic(u);

    // Pre-contact guide pins & corner clamps begin engaging in the final 12% of approach
    const preLatch =
      step.anchorIds.length > 0 && u > 0.88
        ? 0.16 * easeOutCubic((u - 0.88) / 0.12)
        : 0;

    if (pivot) {
      const angle = pivot.startAngleRad * (1 - eased);
      return {
        position: pivotPositionAt(step.target, pivot, angle),
        rotationAxis: pivot.axis,
        rotationAngleRad: angle,
        latchProgress: preLatch,
        phase: 'pivot',
      };
    }

    return {
      position: lerp3(docking.stagingPoint, step.target, eased),
      rotationAxis: rotAxis,
      rotationAngleRad: 0,
      latchProgress: preLatch,
      phase: 'travel',
    };
  }

  // Stage 3: Catch — magnetic seating & corner/edge electromechanical locking
  const latchSpan = Math.max(1e-6, 1 - latchStartT);
  const w = clamp01((t - latchStartT) / latchSpan);
  const latchProgress =
    step.anchorIds.length > 0 ? 0.16 + 0.84 * easeOutCubic(w) : easeOutCubic(w);

  return {
    position: step.target,
    rotationAxis: rotAxis,
    rotationAngleRad: 0,
    latchProgress,
    phase: 'catch',
  };
}

// ---------------------------------------------------------------------------
// Build order
// ---------------------------------------------------------------------------

const KEYSTONE_RANK: Record<VoxelCategory, number> = {
  compute: 0,
  structural: 1,
  power: 2,
  actuated: 3,
  storage: 4,
  display: 5,
  io: 6,
};

/**
 * Deterministic build order that keeps the partial assembly connected:
 * start from the best-connected "keystone", then repeatedly add a voxel that
 * touches what is already built, preferring lower layers and then the most contacts.
 */
export function orderVoxels(ir: VoxelIR): VoxelInstance[] {
  const degree = new Map<string, number>();
  const neighbours = new Map<string, Set<string>>();
  for (const v of ir.voxels) {
    degree.set(v.id, 0);
    neighbours.set(v.id, new Set());
  }
  for (const link of ir.links) {
    neighbours.get(link.sourceId)?.add(link.targetId);
    neighbours.get(link.targetId)?.add(link.sourceId);
  }
  for (const [id, set] of neighbours) degree.set(id, set.size);

  const remaining = new Set(ir.voxels.map((v) => v.id));
  const placed = new Set<string>();
  const order: VoxelInstance[] = [];

  const byKeystone = (a: VoxelInstance, b: VoxelInstance) =>
    (degree.get(b.id)! - degree.get(a.id)!) ||
    (KEYSTONE_RANK[a.manifest.category] - KEYSTONE_RANK[b.manifest.category]) ||
    (a.coord.z - b.coord.z) ||
    a.id.localeCompare(b.id);

  while (remaining.size > 0) {
    let candidates = ir.voxels.filter(
      (v) =>
        remaining.has(v.id) &&
        placed.size > 0 &&
        [...neighbours.get(v.id)!].some((n) => placed.has(n))
    );

    let next: VoxelInstance;
    if (candidates.length === 0) {
      // First voxel, or a disconnected island: start a new keystone
      candidates = ir.voxels.filter((v) => remaining.has(v.id));
      next = candidates.sort(byKeystone)[0];
    } else {
      const contacts = (v: VoxelInstance) => [...neighbours.get(v.id)!].filter((n) => placed.has(n)).length;
      next = candidates.sort(
        (a, b) =>
          (a.coord.z - b.coord.z) ||
          (contacts(b) - contacts(a)) ||
          (a.coord.y - b.coord.y) ||
          (a.coord.x - b.coord.x) ||
          a.id.localeCompare(b.id)
      )[0];
    }

    order.push(next);
    placed.add(next.id);
    remaining.delete(next.id);
  }
  return order;
}

// ---------------------------------------------------------------------------
// Dock + guided & articulated path planning
// ---------------------------------------------------------------------------

function buildDock(
  count: number,
  pitchMm: number,
  assembly: Box
): DockSpec {
  const n = Math.max(1, count);
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cell = pitchMm * 1.14;
  const margin = pitchMm * 0.22;
  const innerW = cols * cell + margin;
  const innerD = rows * cell + margin;
  const wall = pitchMm * 0.06;
  const floorT = pitchMm * 0.09;
  const wallHeight = pitchMm * 1.3;
  const gap = pitchMm * 0.9;

  const floorZ = assembly.min.z;
  const outerW = innerW + 2 * wall;
  const outerD = innerD + 2 * wall;

  // Container sits beside the assembly on its -X side, centred on Y
  const cx = assembly.min.x - gap - outerW / 2;
  const cy = (assembly.min.y + assembly.max.y) / 2;

  const innerMin = v3(cx - innerW / 2, cy - innerD / 2, floorZ);
  const innerMax = v3(cx + innerW / 2, cy + innerD / 2, floorZ + wallHeight);

  const slots: Vec3[] = [];
  for (let k = 0; k < n; k++) {
    const col = k % cols;
    const row = Math.floor(k / cols);
    // Fill from the edge nearest the assembly (+X) so early parts have the shortest trip
    slots.push(
      v3(
        innerMax.x - margin / 2 - (col + 0.5) * cell,
        innerMin.y + margin / 2 + (row + 0.5) * cell,
        floorZ
      )
    );
  }

  return {
    minMm: v3(innerMin.x - wall, innerMin.y - wall, floorZ - floorT),
    maxMm: v3(innerMax.x + wall, innerMax.y + wall, floorZ + wallHeight),
    innerMinMm: innerMin,
    innerMaxMm: innerMax,
    floorZMm: floorZ,
    wallHeightMm: wallHeight,
    wallThicknessMm: wall,
    floorThicknessMm: floorT,
    cols,
    rows,
    slotPitchMm: cell,
    slots,
  };
}

const FALLBACK_APPROACH_DIRS: readonly Vec3[] = [
  v3(-1, 0, 0), // from container side (low-profile lateral docking first)
  v3(0, -1, 0),
  v3(0, 1, 0),
  v3(1, 0, 0),
  v3(0, 0, 1), // above
  v3(0, 0, -1),
];

function dedupe(points: Vec3[]): Vec3[] {
  const out: Vec3[] = [];
  for (const p of points) if (out.length === 0 || !same(out[out.length - 1], p)) out.push(p);
  return out;
}

function pathClear(points: readonly Vec3[], half: Vec3, obstacles: readonly Box[]): boolean {
  for (let i = 1; i < points.length; i++) {
    for (const o of obstacles) if (segmentHitsBox(points[i - 1], points[i], half, o)) return false;
  }
  return true;
}

/** Unit lattice axis normal from `from` → `to` (snapped to the dominant axis). */
function cardinalNormal(from: Vec3, to: Vec3): Vec3 {
  const d = sub3(to, from);
  const ax = Math.abs(d.x);
  const ay = Math.abs(d.y);
  const az = Math.abs(d.z);
  if (ax >= ay && ax >= az) return v3(d.x >= 0 ? 1 : -1, 0, 0);
  if (ay >= ax && ay >= az) return v3(0, d.y >= 0 ? 1 : -1, 0);
  return v3(0, 0, d.z >= 0 ? 1 : -1);
}

function axisOfUnit(u: Vec3): Axis {
  if (Math.abs(u.x) > 0.5) return 'x';
  if (Math.abs(u.y) > 0.5) return 'y';
  return 'z';
}

const PIVOT_ARC_SAMPLES = 16;

/**
 * Verifies that swinging a voxel from `pivot.startAngleRad` → `0` about
 * `pivot.hingePoint` stays collision-free against all already-placed boxes
 * (checking both rotated swept AABBs and polyline segments) and returns the
 * smoothly sampled circular arc from staging → target.
 */
function sampleAndVerifyPivotArc(
  target: Vec3,
  half: Vec3,
  pivot: Omit<PivotSpec, 'arcPoints'>,
  placedBoxes: readonly Box[]
): Vec3[] | null {
  const fullPivot: PivotSpec = { ...pivot, arcPoints: [] };
  const arcPoints: Vec3[] = [];
  for (let i = 0; i <= PIVOT_ARC_SAMPLES; i++) {
    const k = i / PIVOT_ARC_SAMPLES;
    const angle = pivot.startAngleRad * (1 - k);
    const pos = pivotPositionAt(target, fullPivot, angle);
    const rotHalf = rotatedHalfExtents(half, pivot.axis, angle);
    for (const box of placedBoxes) {
      if (pointHitsBox(pos, rotHalf, box)) return null;
    }
    arcPoints.push(pos);
  }
  if (!pathClear(arcPoints, half, placedBoxes)) return null;
  return arcPoints;
}

interface TransitSplit {
  launchPath: Vec3[];
  travelPath: Vec3[];
  transitPath: Vec3[];
}

/**
 * Builds candidate low-clearance point-to-point paths split into:
 *  - `launchPath`: crisp vertical lift-off from `slot` to clear the container rim,
 *  - `travelPath`: low-altitude glide from the container rim to `stagingPoint`.
 */
function findTransitPath(
  slot: Vec3,
  stagingPoint: Vec3,
  half: Vec3,
  dock: DockSpec,
  placedBoxes: readonly Box[],
  placedMaxZ: number,
  globalFallbackZ: number,
  pitch: number
): TransitSplit | null {
  const dockBox: Box = { min: dock.minMm, max: dock.maxMm };
  const rimClearZ = dock.floorZMm + dock.wallHeightMm + half.z + Math.max(14, pitch * 0.1);
  const dockExitX = dock.maxMm.x + half.x + Math.max(14, pitch * 0.12);

  const exitRim = v3(slot.x, slot.y, Math.max(rimClearZ, slot.z));
  const portal = v3(dockExitX, slot.y, exitRim.z);

  const externalObstacles = [...placedBoxes, dockBox];

  const verify = (externalLegs: Vec3[]): TransitSplit | null => {
    const launchPath = dedupe([slot, exitRim]);
    const rimCross = dedupe([exitRim, portal]);
    if (!pathClear(dedupe([slot, exitRim, portal]), half, placedBoxes)) return null;
    const ext = dedupe([portal, ...externalLegs, stagingPoint]);
    if (!pathClear(ext, half, externalObstacles)) return null;
    const travelPath = dedupe([...rimCross, ...ext]);
    return {
      launchPath,
      travelPath,
      transitPath: dedupe([...launchPath, ...travelPath]),
    };
  };

  // 1. Direct glide from the container lip portal straight to stagingPoint (lowest & smoothest)
  const direct = verify([]);
  if (direct) return direct;

  // 2. Low-altitude guided transfer corridors at escalating heights (starting at staging altitude)
  const lowPlacedClearZ = placedMaxZ + half.z + Math.max(18, pitch * 0.14);
  const rawHeights = [
    stagingPoint.z,
    Math.max(stagingPoint.z, rimClearZ),
    Math.max(stagingPoint.z, lowPlacedClearZ),
    Math.max(stagingPoint.z, globalFallbackZ),
  ];
  const heights: number[] = [];
  for (const z of rawHeights) {
    if (!heights.some((h) => Math.abs(h - z) < 1)) heights.push(z);
  }

  for (const z of heights) {
    // 2a. Match altitude at portal, glide laterally in Y then X to staging
    const yThenX = verify([
      v3(dockExitX, slot.y, z),
      v3(dockExitX, stagingPoint.y, z),
      v3(stagingPoint.x, stagingPoint.y, z),
    ]);
    if (yThenX) return yThenX;

    // 2b. Match altitude at portal, glide diagonally in XY to above/below staging
    const diagXY = verify([
      v3(dockExitX, slot.y, z),
      v3(stagingPoint.x, stagingPoint.y, z),
    ]);
    if (diagXY) return diagXY;

    // 2c. High lift directly above slot when needed to clear an overhang right next to dock
    const liftPt = v3(slot.x, slot.y, z);
    const highLaunch = dedupe([slot, liftPt]);
    const highTravel = dedupe([liftPt, v3(stagingPoint.x, stagingPoint.y, z), stagingPoint]);
    const combined = dedupe([...highLaunch, ...highTravel]);
    if (pathClear(combined, half, placedBoxes)) {
      return { launchPath: highLaunch, travelPath: highTravel, transitPath: combined };
    }
  }

  return null;
}

/**
 * Plans the full container → lattice assembly sequence for an IR.
 */
export function planAssembly(ir: VoxelIR): AssemblyPlan {
  const ordered = orderVoxels(ir);
  const boxes = new Map<string, Box>(ordered.map((v) => [v.id, boxOf(v)]));
  const voxelById = new Map<string, VoxelInstance>(ordered.map((v) => [v.id, v]));

  // Assembly bounds + largest voxel pitch
  const asm: Box = {
    min: v3(Infinity, Infinity, Infinity),
    max: v3(-Infinity, -Infinity, -Infinity),
  };
  let pitch = 0;
  for (const b of boxes.values()) {
    for (const a of AXES) {
      asm.min = { ...asm.min, [a]: Math.min(asm.min[a], b.min[a]) } as Vec3;
      asm.max = { ...asm.max, [a]: Math.max(asm.max[a], b.max[a]) } as Vec3;
    }
    const s = sizeOf(b);
    pitch = Math.max(pitch, s.x, s.y, s.z);
  }
  if (ordered.length === 0) {
    asm.min = v3(0, 0, 0);
    asm.max = v3(0, 0, 0);
  }
  if (pitch <= 0) pitch = 150;

  const dock = buildDock(ordered.length, pitch, asm);
  const topOfStuff = Math.max(asm.max.z, dock.floorZMm + dock.wallHeightMm);

  const neighbours = new Map<string, Set<string>>();
  for (const link of ir.links) {
    if (!neighbours.has(link.sourceId)) neighbours.set(link.sourceId, new Set());
    if (!neighbours.has(link.targetId)) neighbours.set(link.targetId, new Set());
    neighbours.get(link.sourceId)!.add(link.targetId);
    neighbours.get(link.targetId)!.add(link.sourceId);
  }

  const steps: AssemblyStep[] = [];
  const placedBoxes: Box[] = [];
  const placedIds = new Set<string>();
  const placedOrder = new Map<string, number>();
  let placedMaxZ = dock.floorZMm + dock.wallHeightMm;
  let maxTravelZ = dock.floorZMm + dock.wallHeightMm;

  ordered.forEach((v, index) => {
    const box = boxes.get(v.id)!;
    const size = sizeOf(box);
    const half = v3(size.x / 2, size.y / 2, size.z / 2);
    const target = centerOf(box);

    const rawSlot = dock.slots[index];
    const slot = v3(rawSlot.x, rawSlot.y, dock.floorZMm + half.z);
    const globalFallbackZ = topOfStuff + half.z + pitch * 0.25;

    const anchorIds = [...(neighbours.get(v.id) ?? [])]
      .filter((id) => placedIds.has(id))
      .sort((a, b) => (placedOrder.get(a)! - placedOrder.get(b)!) || a.localeCompare(b));

    const isActuated = v.manifest.category === 'actuated';
    const hasActuatedAnchor = anchorIds.some(
      (id) => voxelById.get(id)?.manifest.category === 'actuated'
    );
    // Actuated voxels, modules docking onto actuated anchors, and single-anchor
    // cantilevered docks prefer ElectroVoxel corner-edge Pivoting (`pivot-hinge`).
    // Multi-anchor corner pockets use coaxial point-to-point Traversal (`guided-dock`).
    const prefersPivot =
      anchorIds.length > 0 &&
      (isActuated || hasActuatedAnchor || anchorIds.length === 1);

    let chosenSplit: TransitSplit | null = null;
    let chosenFinalPath: Vec3[] | null = null;
    let chosenDocking: DockingSpec | null = null;

    // -----------------------------------------------------------------------
    // 1. ElectroVoxel corner-edge Pivoting (`pivot-hinge`: Launch → Travel → Pivot → Catch)
    // -----------------------------------------------------------------------
    if (prefersPivot) {
      const orderedAnchors = [...anchorIds].sort((a, b) => {
        const aa = voxelById.get(a)?.manifest.category === 'actuated' ? 0 : 1;
        const ba = voxelById.get(b)?.manifest.category === 'actuated' ? 0 : 1;
        return aa - ba || placedOrder.get(a)! - placedOrder.get(b)!;
      });

      // Full 90° quarter-turn pivot first (ElectroVoxel signature), falling back to 65° if tight
      const swingAngles =
        isActuated || hasActuatedAnchor
          ? [Math.PI / 2, Math.PI / 3]
          : [Math.PI / 2, (65 * Math.PI) / 180];

      pivotSearch: for (const anchorId of orderedAnchors) {
        const anchorBox = boxes.get(anchorId)!;
        const dockNormal = cardinalNormal(centerOf(anchorBox), target);
        const normalAxis = axisOfUnit(dockNormal);

        // Candidate hinge axes orthogonal to the mating face normal
        const preferredAxis = isActuated
          ? deriveJointAxis(ir, v.id)
          : voxelById.get(anchorId)?.manifest.category === 'actuated'
            ? deriveJointAxis(ir, anchorId)
            : normalAxis === 'y'
              ? 'x'
              : 'y';

        const candidateAxes = [preferredAxis, ...AXES].filter(
          (a, i, arr) => a !== normalAxis && arr.indexOf(a) === i
        );

        for (const hingeAxis of candidateAxes) {
          const uVec = AXIS_UNIT[hingeAxis];
          const baseSide = cross3(uVec, dockNormal);
          // Prefer pivoting in from open upper air (+Z) or container side (-X)
          const dirSigns: (1 | -1)[] = ([1, -1] as (1 | -1)[]).sort((sa, sb) => {
            const va = scale3(baseSide, sa);
            const vb = scale3(baseSide, sb);
            const score = (vec: Vec3) => vec.z * 3 - vec.x * 2 + vec.y * 0.5;
            return score(vb) - score(va);
          });

          for (const dirSign of dirSigns) {
            const sideDir = scale3(baseSide, dirSign);
            const hN = Math.abs(dot3(dockNormal, half));
            const hS = Math.abs(dot3(sideDir, half));
            const hingePoint = add3(sub3(target, scale3(dockNormal, hN)), scale3(sideDir, hS));

            for (const mag of swingAngles) {
              const pivotBase = {
                hingePoint,
                axis: hingeAxis,
                startAngleRad: dirSign * mag,
                dockNormal,
              };
              const arcPoints = sampleAndVerifyPivotArc(target, half, pivotBase, placedBoxes);
              if (!arcPoints) continue;

              const stagingPoint = arcPoints[0];
              const split = findTransitPath(
                slot,
                stagingPoint,
                half,
                dock,
                placedBoxes,
                placedMaxZ,
                globalFallbackZ,
                pitch
              );
              if (!split) continue;

              const pivot: PivotSpec = { ...pivotBase, arcPoints };
              chosenSplit = split;
              chosenFinalPath = dedupe([...split.transitPath, ...arcPoints.slice(1)]);
              chosenDocking = {
                mode: 'pivot-hinge',
                primaryAnchorId: anchorId,
                approachDir: dockNormal,
                stagingPoint,
                launchEndT: 0.2,
                dockStartT: 0.46,
                latchStartT: 0.82,
                pivot,
              };
              break pivotSearch;
            }
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // 2. Point-to-point Guided Traversal (`guided-dock`: Launch → Travel → Catch)
    // -----------------------------------------------------------------------
    if (!chosenFinalPath) {
      const primaryAnchorId = anchorIds[0] ?? null;
      const anchorNormals: Vec3[] = [];
      for (const id of anchorIds) {
        const n = cardinalNormal(centerOf(boxes.get(id)!), target);
        if (!anchorNormals.some((existing) => same(existing, n))) anchorNormals.push(n);
      }

      const candidateDirs =
        anchorIds.length === 0
          ? [v3(0, 0, 1), ...FALLBACK_APPROACH_DIRS.filter((d) => d.z === 0), v3(0, 0, -1)]
          : [
              ...anchorNormals,
              ...FALLBACK_APPROACH_DIRS.filter(
                (d) => !anchorNormals.some((n) => same(n, d))
              ),
            ];

      const offsetMultipliers = [0.55, 0.9, 1.35, 1.8];

      guidedSearch: for (const mult of offsetMultipliers) {
        for (const dir of candidateDirs) {
          const axis = axisOfUnit(dir);
          const offset = size[axis] * mult;
          const stagingPoint = add3(target, scale3(dir, offset));

          if (!pathClear([stagingPoint, target], half, placedBoxes)) continue;

          const split = findTransitPath(
            slot,
            stagingPoint,
            half,
            dock,
            placedBoxes,
            placedMaxZ,
            globalFallbackZ,
            pitch
          );
          if (!split) continue;

          chosenSplit = split;
          chosenFinalPath = dedupe([...split.transitPath, target]);
          chosenDocking = {
            mode: primaryAnchorId ? 'guided-dock' : 'keystone',
            primaryAnchorId,
            approachDir: dir,
            stagingPoint,
            launchEndT: 0.22,
            dockStartT: primaryAnchorId ? 0.56 : 0.62,
            latchStartT: primaryAnchorId ? 0.82 : 0.92,
            pivot: null,
          };
          break guidedSearch;
        }
      }
    }

    // -----------------------------------------------------------------------
    // 3. Unconditional fallback (only if completely boxed in on all 6 faces)
    // -----------------------------------------------------------------------
    const collisionFree = chosenFinalPath !== null;
    if (!chosenFinalPath || !chosenSplit || !chosenDocking) {
      const stagingPoint = v3(target.x, target.y, globalFallbackZ);
      const lift = v3(slot.x, slot.y, globalFallbackZ);
      const launchPath = dedupe([slot, lift]);
      const travelPath = dedupe([lift, stagingPoint]);
      chosenSplit = { launchPath, travelPath, transitPath: dedupe([slot, lift, stagingPoint]) };
      chosenFinalPath = dedupe([slot, lift, stagingPoint, target]);
      chosenDocking = {
        mode: anchorIds.length > 0 ? 'guided-dock' : 'keystone',
        primaryAnchorId: anchorIds[0] ?? null,
        approachDir: v3(0, 0, 1),
        stagingPoint,
        launchEndT: 0.22,
        dockStartT: 0.58,
        latchStartT: anchorIds.length > 0 ? 0.84 : 0.92,
        pivot: null,
      };
    }

    for (const pt of chosenFinalPath) {
      if (pt.z > maxTravelZ) maxTravelZ = pt.z;
    }

    steps.push({
      index,
      voxelId: v.id,
      category: v.manifest.category,
      target,
      size,
      slot,
      launchPath: chosenSplit.launchPath,
      travelPath: chosenSplit.travelPath,
      transitPath: chosenSplit.transitPath,
      path: chosenFinalPath,
      pathLengthMm: polylineLength(chosenFinalPath),
      collisionFree,
      anchorIds,
      docking: chosenDocking,
    });

    placedBoxes.push(box);
    placedIds.add(v.id);
    placedOrder.set(v.id, index);
    if (box.max.z > placedMaxZ) placedMaxZ = box.max.z;
  });

  return { steps, dock, travelZMm: maxTravelZ };
}

// ---------------------------------------------------------------------------
// Joint axes
// ---------------------------------------------------------------------------

const FACE_AXIS: Record<Face, Axis> = {
  '+x': 'x',
  '-x': 'x',
  '+y': 'y',
  '-y': 'y',
  '+z': 'z',
  '-z': 'z',
};

export function axisOfFace(face: Face): Axis {
  return FACE_AXIS[face];
}

/**
 * Pivot axis used to draw an actuated voxel's joint.
 *
 * 1. An explicit `axis: "x" | "y" | "z"` property in the DSL wins.
 * 2. Otherwise the hinge runs along the first lattice axis that no mechanical
 *    link uses (the voxel swings between its neighbours), preferring y, x, z.
 * 3. A voxel with no links defaults to y.
 */
export function deriveJointAxis(ir: VoxelIR, voxelId: string): Axis {
  const voxel = ir.getVoxel(voxelId);
  const explicit = voxel?.properties?.axis;
  if (explicit === 'x' || explicit === 'y' || explicit === 'z') return explicit;

  const used = new Set<Axis>();
  for (const link of ir.getLinks(voxelId)) {
    if (!link.mechanical) continue;
    used.add(axisOfFace(link.sourceId === voxelId ? link.sourceFace : link.targetFace));
  }
  for (const a of ['y', 'x', 'z'] as const) if (!used.has(a)) return a;
  return 'z';
}
