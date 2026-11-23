import {
  calculateVoxelBoundsMm,
  type Coord3D,
  type VoxelIR,
} from '@omnivoxel/core';
import {
  easeInOutCubic,
  pivotPositionAt,
  type Axis,
  type PivotSpec,
  type StepPhase,
  type Vec3,
} from './assembly';

/**
 * Pure (Three.js-free) modular reconfiguration planner for live furniture
 * morphing (`Chair ↔ Table ↔ Couch`).
 *
 * Every moving voxel detaches from its source cell, traverses step-by-step
 * along free 6-connected lattice cells hugging the stationary skeleton (surface
 * traversal), and executes an articulated 90° corner-edge pivot (`Pivoting`)
 * into its destination cell.
 */

export const MORPH_CYCLE_IDS = ['voxel-chair', 'voxel-table', 'voxel-couch'] as const;
export type MorphPresetId = (typeof MORPH_CYCLE_IDS)[number];

export interface MorphStep {
  index: number;
  voxelId: string;
  fromCoord: Coord3D;
  toCoord: Coord3D;
  fromMm: Vec3;
  toMm: Vec3;
  /** Surface-connected lattice path (mm) from source cell to pre-pivot staging. */
  surfacePathMm: Vec3[];
  /** Optional 90° corner-edge pivot into the destination cell. */
  pivot: PivotSpec | null;
}

export interface MorphPlan {
  sourcePresetId: string;
  targetPresetId: string;
  steps: MorphStep[];
  /** Voxels that remain stationary throughout the morph (shared skeleton). */
  stationaryCoords: Map<string, Vec3>;
}

export interface MorphVoxelPose {
  position: Vec3;
  rotationAxis: Axis;
  rotationAngleRad: number;
  phase: StepPhase;
  isMoving: boolean;
}

export interface MorphSample {
  poses: Map<string, MorphVoxelPose>;
  activeStep: MorphStep | null;
  activePhase: StepPhase;
}

const cellKey = (c: Coord3D) => `${c.x},${c.y},${c.z}`;
const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const add3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const sub3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const scale3 = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);
const cross3 = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 =>
  v3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const DIRS_6: readonly Coord3D[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

const AXIS_UNIT: Record<Axis, Vec3> = {
  x: v3(1, 0, 0),
  y: v3(0, 1, 0),
  z: v3(0, 0, 1),
};

function cellCenterMm(coord: Coord3D, pitchMm: number): Vec3 {
  return v3((coord.x + 0.5) * pitchMm, (coord.y + 0.5) * pitchMm, (coord.z + 0.5) * pitchMm);
}

function manhattan(a: Coord3D, b: Coord3D): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

function samplePolyline(pts: readonly Vec3[], t: number): Vec3 {
  if (pts.length === 0) return v3(0, 0, 0);
  if (pts.length === 1 || t <= 0) return pts[0];
  if (t >= 1) return pts[pts.length - 1];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  if (total < 1e-6) return pts[pts.length - 1];
  let rem = t * total;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (rem <= seg || i === pts.length - 1) {
      return lerp3(pts[i - 1], pts[i], seg < 1e-6 ? 1 : clamp01(rem / seg));
    }
    rem -= seg;
  }
  return pts[pts.length - 1];
}

/**
 * Finds a shortest surface-hugging 6-connected cell path from `start` to `goal`
 * avoiding all `occupied` cells and preferring cells adjacent to `occupied`.
 */
function findSurfaceCellPath(
  start: Coord3D,
  goal: Coord3D,
  occupied: ReadonlySet<string>,
  minBounds: Coord3D,
  maxBounds: Coord3D
): Coord3D[] {
  const startKey = cellKey(start);
  const goalKey = cellKey(goal);
  if (startKey === goalKey) return [start];

  // Build skin set (18-connected neighbors of occupied cells)
  const skin = new Set<string>();
  for (const key of occupied) {
    const [ox, oy, oz] = key.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= 2) {
            skin.add(`${ox + dx},${oy + dy},${oz + dz}`);
          }
        }
      }
    }
  }

  const distCost = new Map<string, number>([[startKey, 0]]);
  const parent = new Map<string, string>();
  const coordMap = new Map<string, Coord3D>([[startKey, start]]);
  const closed = new Set<string>();
  const open: string[] = [startKey];

  let found = false;
  while (open.length > 0) {
    let bestIdx = 0;
    let bestCost = distCost.get(open[0])!;
    for (let i = 1; i < open.length; i++) {
      const c = distCost.get(open[i])!;
      if (c < bestCost) {
        bestCost = c;
        bestIdx = i;
      }
    }
    const currKey = open.splice(bestIdx, 1)[0];
    if (closed.has(currKey)) continue;
    closed.add(currKey);
    if (currKey === goalKey) {
      found = true;
      break;
    }

    const curr = coordMap.get(currKey)!;
    for (const d of DIRS_6) {
      const next: Coord3D = { x: curr.x + d.x, y: curr.y + d.y, z: curr.z + d.z };
      if (
        next.x < minBounds.x ||
        next.x > maxBounds.x ||
        next.y < minBounds.y ||
        next.y > maxBounds.y ||
        next.z < minBounds.z ||
        next.z > maxBounds.z
      ) {
        continue;
      }
      const nextKey = cellKey(next);
      if (closed.has(nextKey)) continue;
      if (nextKey !== goalKey && occupied.has(nextKey)) continue;

      const stepCost = skin.has(nextKey) ? 1.0 : 3.2;
      const tentative = bestCost + stepCost;
      const existing = distCost.get(nextKey);
      if (existing === undefined || tentative < existing) {
        distCost.set(nextKey, tentative);
        parent.set(nextKey, currKey);
        coordMap.set(nextKey, next);
        if (existing === undefined) open.push(nextKey);
      }
    }
  }

  if (!found) return [start, goal];

  const chain: Coord3D[] = [];
  let cur: string | undefined = goalKey;
  while (cur !== undefined) {
    chain.push(coordMap.get(cur)!);
    cur = parent.get(cur);
  }
  chain.reverse();
  return chain;
}

/**
 * Constructs a 90° corner-edge pivot entering `goal` from an adjacent `anchor`
 * cell along the last approach direction when space permits.
 */
function buildMorphPivot(
  goal: Coord3D,
  prev: Coord3D,
  occupied: ReadonlySet<string>,
  pitchMm: number
): PivotSpec | null {
  const half = pitchMm * 0.5;
  const targetMm = cellCenterMm(goal, pitchMm);

  // Look for a seated neighbor cell adjacent to `goal` that can serve as the pivot fulcrum
  for (const d of DIRS_6) {
    const anchor: Coord3D = { x: goal.x + d.x, y: goal.y + d.y, z: goal.z + d.z };
    if (!occupied.has(cellKey(anchor))) continue;

    const dockNormal = v3(-d.x, -d.y, -d.z); // anchor -> goal
    const approach = v3(prev.x - goal.x, prev.y - goal.y, prev.z - goal.z);
    // Pick a hinge axis orthogonal to both dockNormal and approach when possible
    const axisCandidates: Axis[] = ['y', 'x', 'z'];
    for (const axis of axisCandidates) {
      const u = AXIS_UNIT[axis];
      const dotN = Math.abs(u.x * dockNormal.x + u.y * dockNormal.y + u.z * dockNormal.z);
      if (dotN > 0.5) continue;

      const baseSide = cross3(u, dockNormal);
      // Orient swing toward approach vector or +Z
      const dotA = baseSide.x * approach.x + baseSide.y * approach.y + baseSide.z * approach.z;
      const sign: 1 | -1 = dotA !== 0 ? (dotA > 0 ? 1 : -1) : baseSide.z >= 0 ? 1 : -1;
      const sideDir = scale3(baseSide, sign);

      const hingePoint = add3(sub3(targetMm, scale3(dockNormal, half)), scale3(sideDir, half));
      const startAngleRad = sign * (Math.PI / 2);

      const pivot: PivotSpec = {
        hingePoint,
        axis,
        startAngleRad,
        dockNormal,
        arcPoints: [],
      };
      const arcPoints: Vec3[] = [];
      for (let i = 0; i <= 12; i++) {
        const angle = startAngleRad * (1 - i / 12);
        arcPoints.push(pivotPositionAt(targetMm, pivot, angle));
      }
      pivot.arcPoints = arcPoints;
      return pivot;
    }
  }
  return null;
}

/**
 * Plans a sequential, surface-connected Pivoting & Traversal morph from `sourceIr`
 * into `targetIr` (requires equal voxel count, e.g. Chair ↔ Table ↔ Couch, all 12 voxels).
 */
export function planMorph(
  sourceIr: VoxelIR,
  targetIr: VoxelIR,
  sourcePresetId = 'source',
  targetPresetId = 'target'
): MorphPlan {
  const firstVoxel = sourceIr.voxels[0];
  const pitchMm = firstVoxel
    ? Math.max(
        firstVoxel.manifest.mechanical.dimensionsMm.x,
        firstVoxel.manifest.mechanical.dimensionsMm.y,
        firstVoxel.manifest.mechanical.dimensionsMm.z
      )
    : 150;

  const targetKeys = new Map<string, Coord3D>();
  for (const tv of targetIr.voxels) {
    targetKeys.set(cellKey(tv.coord), tv.coord);
  }

  const stationaryCoords = new Map<string, Vec3>();
  const movingVoxels: Array<{ id: string; from: Coord3D }> = [];
  const unmatchedTargets = new Map<string, Coord3D>(targetKeys);

  // 1. Keep shared cells stationary as the structural skeleton
  for (const sv of sourceIr.voxels) {
    const k = cellKey(sv.coord);
    const bounds = calculateVoxelBoundsMm(sv);
    const center = v3(
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2,
      (bounds.min.z + bounds.max.z) / 2
    );
    if (unmatchedTargets.has(k)) {
      stationaryCoords.set(sv.id, center);
      unmatchedTargets.delete(k);
    } else {
      movingVoxels.push({ id: sv.id, from: sv.coord });
    }
  }

  // 2. Order target cells connected-outward from the stationary skeleton so every placed
  //    voxel immediately docks onto an already-seated neighbor (zero detached intermediate legs)
  const placedTargetKeys = new Set<string>();
  for (const sv of sourceIr.voxels) {
    if (stationaryCoords.has(sv.id)) placedTargetKeys.add(cellKey(sv.coord));
  }
  const remainingTargets = [...unmatchedTargets.values()];
  const orderedTargets: Coord3D[] = [];
  while (remainingTargets.length > 0) {
    const adjacentIdx = remainingTargets.findIndex((t) =>
      DIRS_6.some((d) =>
        placedTargetKeys.has(cellKey({ x: t.x + d.x, y: t.y + d.y, z: t.z + d.z }))
      )
    );
    const pickIdx =
      adjacentIdx >= 0
        ? adjacentIdx
        : remainingTargets.reduce(
            (best, cur, idx) =>
              cur.z < remainingTargets[best].z ||
              (cur.z === remainingTargets[best].z && cur.x < remainingTargets[best].x)
                ? idx
                : best,
            0
          );
    const [picked] = remainingTargets.splice(pickIdx, 1);
    orderedTargets.push(picked);
    placedTargetKeys.add(cellKey(picked));
  }

  // Pair each ordered target with the highest-Z / nearest remaining moving voxel (peel top/outer first)
  const remainingMovers = [...movingVoxels];
  const pairs: Array<{ id: string; from: Coord3D; to: Coord3D }> = [];

  for (const target of orderedTargets) {
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < remainingMovers.length; i++) {
      const mv = remainingMovers[i];
      // Prefer peeling highest-Z movers first so lower supports stay anchored while top modules relocate
      const score = -mv.from.z * 2.5 + manhattan(mv.from, target);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const [chosen] = remainingMovers.splice(bestIdx, 1);
    pairs.push({ id: chosen.id, from: chosen.from, to: target });
  }

  // Compute grid search bounds covering both source and target shapes
  const allCoords = [...sourceIr.voxels.map((v) => v.coord), ...targetIr.voxels.map((v) => v.coord)];
  const minBounds: Coord3D = {
    x: Math.min(...allCoords.map((c) => c.x)) - 1,
    y: Math.min(...allCoords.map((c) => c.y)) - 1,
    z: Math.max(0, Math.min(...allCoords.map((c) => c.z))),
  };
  const maxBounds: Coord3D = {
    x: Math.max(...allCoords.map((c) => c.x)) + 1,
    y: Math.max(...allCoords.map((c) => c.y)) + 1,
    z: Math.max(...allCoords.map((c) => c.z)) + 2,
  };

  // 3. Maintain live occupancy as each moving voxel traverses & pivots to its new cell
  const occupied = new Set<string>(sourceIr.voxels.map((v) => cellKey(v.coord)));
  const steps: MorphStep[] = [];

  pairs.forEach((pair, index) => {
    occupied.delete(cellKey(pair.from));
    const cellPath = findSurfaceCellPath(pair.from, pair.to, occupied, minBounds, maxBounds);
    const prevCell = cellPath.length >= 2 ? cellPath[cellPath.length - 2] : pair.from;
    const pivot = buildMorphPivot(pair.to, prevCell, occupied, pitchMm);

    const surfacePathMm = cellPath.map((c) => cellCenterMm(c, pitchMm));
    if (pivot && pivot.arcPoints.length > 0) {
      // Connect surface traversal smoothly into the 90° pivot staging point
      surfacePathMm[surfacePathMm.length - 1] = pivot.arcPoints[0];
    }

    steps.push({
      index,
      voxelId: pair.id,
      fromCoord: pair.from,
      toCoord: pair.to,
      fromMm: cellCenterMm(pair.from, pitchMm),
      toMm: cellCenterMm(pair.to, pitchMm),
      surfacePathMm,
      pivot,
    });

    occupied.add(cellKey(pair.to));
  });

  return {
    sourcePresetId,
    targetPresetId,
    steps,
    stationaryCoords,
  };
}

/**
 * Samples every voxel's pose during a morph at continuous progress `progress ∈ [0, plan.steps.length]`.
 */
export function sampleMorphPose(plan: MorphPlan, progress: number): MorphSample {
  const poses = new Map<string, MorphVoxelPose>();
  for (const [id, pos] of plan.stationaryCoords) {
    poses.set(id, {
      position: pos,
      rotationAxis: 'y',
      rotationAngleRad: 0,
      phase: 'seated',
      isMoving: false,
    });
  }

  let activeStep: MorphStep | null = null;
  let activePhase: StepPhase = 'seated';

  for (const step of plan.steps) {
    const t = clamp01(progress - step.index);
    if (t <= 0) {
      poses.set(step.voxelId, {
        position: step.fromMm,
        rotationAxis: step.pivot?.axis ?? 'y',
        rotationAngleRad: 0,
        phase: 'stowed',
        isMoving: false,
      });
      continue;
    }
    if (t >= 1) {
      poses.set(step.voxelId, {
        position: step.toMm,
        rotationAxis: step.pivot?.axis ?? 'y',
        rotationAngleRad: 0,
        phase: 'seated',
        isMoving: false,
      });
      continue;
    }

    activeStep = step;
    // Stage breakdown: Launch (0..0.15) → Surface Traversal (0.15..0.58) → Pivot (0.58..0.88) → Catch (0.88..1)
    if (t < 0.15) {
      const u = easeInOutCubic(t / 0.15);
      const lift = v3(step.fromMm.x, step.fromMm.y, step.fromMm.z + 28 * u);
      activePhase = 'launch';
      poses.set(step.voxelId, {
        position: lift,
        rotationAxis: step.pivot?.axis ?? 'y',
        rotationAngleRad: 0,
        phase: 'launch',
        isMoving: true,
      });
    } else if (t < 0.58) {
      const u = easeInOutCubic((t - 0.15) / 0.43);
      const pos = samplePolyline(step.surfacePathMm, u);
      const rot = step.pivot ? step.pivot.startAngleRad * easeInOutCubic(clamp01((u - 0.4) / 0.6)) : 0;
      activePhase = 'travel';
      poses.set(step.voxelId, {
        position: pos,
        rotationAxis: step.pivot?.axis ?? 'y',
        rotationAngleRad: rot,
        phase: 'travel',
        isMoving: true,
      });
    } else if (t < 0.88) {
      const u = easeInOutCubic((t - 0.58) / 0.3);
      if (step.pivot) {
        const angle = step.pivot.startAngleRad * (1 - u);
        activePhase = 'pivot';
        poses.set(step.voxelId, {
          position: pivotPositionAt(step.toMm, step.pivot, angle),
          rotationAxis: step.pivot.axis,
          rotationAngleRad: angle,
          phase: 'pivot',
          isMoving: true,
        });
      } else {
        const lastSurface = step.surfacePathMm[step.surfacePathMm.length - 1] ?? step.fromMm;
        activePhase = 'travel';
        poses.set(step.voxelId, {
          position: lerp3(lastSurface, step.toMm, u),
          rotationAxis: 'y',
          rotationAngleRad: 0,
          phase: 'travel',
          isMoving: true,
        });
      }
    } else {
      activePhase = 'catch';
      poses.set(step.voxelId, {
        position: step.toMm,
        rotationAxis: step.pivot?.axis ?? 'y',
        rotationAngleRad: 0,
        phase: 'catch',
        isMoving: true,
      });
    }
  }

  return { poses, activeStep, activePhase };
}
