import type { VoxelIR, VoxelInstance } from '@omnivoxel/core';

const GRAVITY_M_S2 = 9.80665;

/**
 * Deterministic static mechanical load & cuboctahedron truss FEA approximation
 * derived from Gate 5 compression loads, grounded support-path routing, and
 * clear-span / cantilever bending moments.
 *
 * Pure and Three.js-free so it can be unit tested directly.
 */

export interface VoxelPhysics {
  /** Combined equivalent axial + bending load carried by this voxel cell (N). */
  forceN: number;
  /** Peak equivalent von Mises strut stress inside the cuboctahedron truss (MPa). */
  stressMpa: number;
  /** Estimated local static vertical displacement under service load (mm). */
  displacementMm: number;
  /** Normalised stress intensity in [0, 1] used to colour the FEA truss heatmap. */
  stressRatio: number;
  /** True when the voxel rests on the assembly's grounded support plane (`z === minZ`). */
  isSupport: boolean;
  /** Shortest graph hop count to the nearest grounded support voxel. */
  supportHops: number;
}

export interface PhysicsSummary {
  maxDisplacementMm: number;
  maxStressMpa: number;
  safetyFactor: number;
  totalLoadN: number;
  supportCount: number;
}

export interface PhysicsAnalysis {
  byVoxel: Map<string, VoxelPhysics>;
  summary: PhysicsSummary;
}

/** 6061-T6 aluminum cuboctahedron truss effective material properties. */
const YIELD_STRESS_MPA = 276; // 6061-T6 Al yield strength (MPa)
const ELASTIC_MODULUS_MPA = 68900; // Young's modulus (MPa)
/** Effective load-bearing strut area (12 diagonal/edge struts of 4 mm radius ≈ 150 mm²). */
const EFFECTIVE_STRUT_AREA_MM2 = 150;
/** Standard ergonomic / architectural live service load applied to top load-bearing faces (N). */
const STRUCTURAL_SERVICE_LOAD_N = 750;
const DEVICE_SERVICE_LOAD_N = 65;

const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

/**
 * Evaluates deterministic static mechanical load, von Mises strut stress,
 * displacement, and safety factor across a compiled VoxelIR.
 */
export function analyzePhysics(ir: VoxelIR): PhysicsAnalysis {
  const byVoxel = new Map<string, VoxelPhysics>();
  if (ir.voxels.length === 0) {
    return {
      byVoxel,
      summary: {
        maxDisplacementMm: 0,
        maxStressMpa: 0,
        safetyFactor: 99,
        totalLoadN: 0,
        supportCount: 0,
      },
    };
  }

  const minZ = Math.min(...ir.voxels.map((v) => v.coord.z));
  const voxelByCoord = new Map<string, VoxelInstance>();
  const adjacency = new Map<string, string[]>();

  for (const v of ir.voxels) {
    voxelByCoord.set(cellKey(v.coord.x, v.coord.y, v.coord.z), v);
    adjacency.set(v.id, []);
  }
  for (const link of ir.links) {
    adjacency.get(link.sourceId)?.push(link.targetId);
    adjacency.get(link.targetId)?.push(link.sourceId);
  }

  // 1. Identify grounded supports (z === minZ) and compute shortest hop distance to support
  const supports: VoxelInstance[] = ir.voxels.filter((v) => v.coord.z === minZ);
  const supportSet = new Set(supports.map((v) => v.id));
  const supportHops = new Map<string, number>();
  const queue: string[] = [];

  for (const s of supports) {
    supportHops.set(s.id, 0);
    queue.push(s.id);
  }
  for (let head = 0; head < queue.length; head++) {
    const curr = queue[head];
    const dist = supportHops.get(curr)!;
    for (const next of adjacency.get(curr) ?? []) {
      if (!supportHops.has(next)) {
        supportHops.set(next, dist + 1);
        queue.push(next);
      }
    }
  }

  // 2. Identify exposed top deck voxels that carry live service load
  const structuralCount = ir.voxels.filter((v) => v.manifest.category === 'structural').length;
  const isStructuralLattice = structuralCount >= ir.voxels.length * 0.6 && ir.voxels.length >= 6;
  const totalLiveLoadN = isStructuralLattice ? STRUCTURAL_SERVICE_LOAD_N : DEVICE_SERVICE_LOAD_N;

  const topExposed = ir.voxels.filter(
    (v) => !voxelByCoord.has(cellKey(v.coord.x, v.coord.y, v.coord.z + 1))
  );
  const loadedVoxels = topExposed.length > 0 ? topExposed : ir.voxels;
  const liveLoadPerLoadedN = totalLiveLoadN / loadedVoxels.length;
  const liveLoadMap = new Map<string, number>();
  for (const v of loadedVoxels) {
    liveLoadMap.set(v.id, liveLoadPerLoadedN);
  }

  // 3. Route gravity + service loads from every voxel along shortest BFS paths down to supports
  //    This captures realistic load concentration in piers/legs AND mid-span shear/bending!
  const routedForce = new Map<string, number>();
  for (const v of ir.voxels) {
    const selfWeightN = v.manifest.mechanical.massKg * GRAVITY_M_S2;
    const nodeLoadN = selfWeightN + (liveLoadMap.get(v.id) ?? 0);
    routedForce.set(v.id, (routedForce.get(v.id) ?? 0) + nodeLoadN);

    // Walk toward grounded supports along decreasing supportHops
    let frontier: Array<{ id: string; load: number }> = [{ id: v.id, load: nodeLoadN }];
    let guard = 0;
    while (frontier.length > 0 && guard < 32) {
      guard++;
      const nextFrontier = new Map<string, number>();
      for (const item of frontier) {
        const d = supportHops.get(item.id);
        if (d === undefined || d === 0) continue;
        const downNeighbors = (adjacency.get(item.id) ?? []).filter(
          (nid) => (supportHops.get(nid) ?? Infinity) === d - 1
        );
        if (downNeighbors.length === 0) continue;
        const share = item.load / downNeighbors.length;
        for (const nid of downNeighbors) {
          routedForce.set(nid, (routedForce.get(nid) ?? 0) + share);
          nextFrontier.set(nid, (nextFrontier.get(nid) ?? 0) + share);
        }
      }
      frontier = [...nextFrontier.entries()].map(([id, load]) => ({ id, load }));
    }
  }

  // 4. Vertical column load (exact Gate 5 column stack check)
  const verticalAboveN = new Map<string, number>();
  for (const v of ir.voxels) {
    let above = 0;
    for (const other of ir.voxels) {
      if (other.coord.x === v.coord.x && other.coord.y === v.coord.y && other.coord.z > v.coord.z) {
        above += other.manifest.mechanical.massKg * GRAVITY_M_S2;
      }
    }
    verticalAboveN.set(v.id, above);
  }

  // 5. Compute per-voxel strut stress (axial + span bending) and displacement
  let totalSelfWeightN = 0;
  let maxStressMpa = 0;
  let maxDisplacementMm = 0;
  let minSafetyFactor = Infinity;

  const rawRecords: Array<{
    id: string;
    forceN: number;
    stressMpa: number;
    displacementMm: number;
    isSupport: boolean;
    hops: number;
    capacityRatio: number;
  }> = [];

  for (const v of ir.voxels) {
    const massN = v.manifest.mechanical.massKg * GRAVITY_M_S2;
    totalSelfWeightN += massN;

    const isSupport = supportSet.has(v.id);
    const hops = supportHops.get(v.id) ?? 4;
    const isUnsupportedBelow = !isSupport && !voxelByCoord.has(cellKey(v.coord.x, v.coord.y, v.coord.z - 1));
    const deg = adjacency.get(v.id)?.length ?? 0;

    const pitchMm = Math.max(
      v.manifest.mechanical.dimensionsMm.x,
      v.manifest.mechanical.dimensionsMm.y,
      v.manifest.mechanical.dimensionsMm.z
    );

    const axialN = Math.max(routedForce.get(v.id) ?? massN, verticalAboveN.get(v.id) ?? 0);

    // Clear-span / cantilever bending moment amplification:
    // Unsupported deck spans (e.g. bridge mid-span & tabletop center) experience peak bending
    // proportional to their hop distance from the nearest grounded support pier.
    const spanLever = isUnsupportedBelow
      ? 1 + Math.pow(hops, 1.45) * 1.15
      : 1 + Math.max(0, hops - 1) * 0.18;
    const supportConcentration = isSupport ? 1.45 : isUnsupportedBelow ? 1.35 : 0.78;
    const effectiveForceN = axialN * spanLever * supportConcentration;

    // Peak von Mises strut stress inside the cuboctahedron lattice (N / mm² = MPa)
    // Open cellular trusses carry ~3.4x geometric stress concentration at octet node junctions
    const nodeK = 3.4;
    const stressMpa = (effectiveForceN * nodeK) / EFFECTIVE_STRUT_AREA_MM2;

    // Static deflection: axial shortening (FL/EA) + open-truss span bending deflection (mm)
    // Effective flexural rigidity EI of a 150 mm aluminum cuboctahedron beam ≈ 4.8e9 N·mm²
    const effectiveEI = 4.8e9;
    const axialDispMm = (axialN * pitchMm) / (ELASTIC_MODULUS_MPA * EFFECTIVE_STRUT_AREA_MM2);
    const spanMm = Math.max(pitchMm, hops * pitchMm);
    const bendingDispMm = isUnsupportedBelow
      ? (effectiveForceN * Math.pow(spanMm, 3)) / (12 * effectiveEI)
      : (effectiveForceN * Math.pow(spanMm, 2) * pitchMm) / (28 * effectiveEI);
    const displacementMm = isSupport
      ? axialDispMm * 1.5
      : axialDispMm + bendingDispMm + (deg <= 1 ? 0.025 : 0);

    // Safety factor against both material yield and manifest Gate 5 compression limit
    const gate5MaxN = Math.max(1, v.manifest.mechanical.maxCompressionLoadN);
    const gate5Sf = gate5MaxN / Math.max(0.1, axialN);
    const yieldSf = YIELD_STRESS_MPA / Math.max(0.05, stressMpa);
    const localSf = Math.min(gate5Sf, yieldSf);

    maxStressMpa = Math.max(maxStressMpa, stressMpa);
    maxDisplacementMm = Math.max(maxDisplacementMm, displacementMm);
    minSafetyFactor = Math.min(minSafetyFactor, localSf);

    rawRecords.push({
      id: v.id,
      forceN: effectiveForceN,
      stressMpa,
      displacementMm,
      isSupport,
      hops,
      capacityRatio: stressMpa / YIELD_STRESS_MPA,
    });
  }

  // Normalise stress heatmap: relative to assembly peak (so piers/spans always read vividly
  // from cool blue -> cyan -> green -> amber -> red) while scaling up if near yield.
  const scaleCeilingMpa = Math.max(maxStressMpa, 1e-3);
  const minRecStress = Math.min(...rawRecords.map((r) => r.stressMpa));
  const spreadMpa = Math.max(scaleCeilingMpa - minRecStress, scaleCeilingMpa * 0.35);

  for (const r of rawRecords) {
    const relative = Math.max(0, Math.min(1, (r.stressMpa - minRecStress) / spreadMpa));
    // Blend relative distribution (82%) with absolute yield proximity (18%) so lightly loaded
    // lattices still show a rich blue->amber->red FEA gradient and overloaded ones saturate red.
    const ratio = Math.min(1, Math.max(0.04, relative * 0.85 + Math.min(1, r.capacityRatio * 2.2) * 0.25));
    byVoxel.set(r.id, {
      forceN: r.forceN,
      stressMpa: r.stressMpa,
      displacementMm: r.displacementMm,
      stressRatio: ratio,
      isSupport: r.isSupport,
      supportHops: r.hops,
    });
  }

  return {
    byVoxel,
    summary: {
      maxDisplacementMm,
      maxStressMpa,
      safetyFactor: Number.isFinite(minSafetyFactor) ? Math.min(99.9, minSafetyFactor) : 99.9,
      totalLoadN: totalSelfWeightN + totalLiveLoadN,
      supportCount: supports.length,
    },
  };
}

/** FEA von Mises stress ramp: cool blue → cyan → green → amber → red. */
const STRESS_STOPS: ReadonlyArray<[number, number, number, number]> = [
  [0.0, 0x25, 0x63, 0xeb], // blue-600 (low stress)
  [0.25, 0x06, 0xb6, 0xd4], // cyan-500
  [0.5, 0x22, 0xc5, 0x5e], // green-500
  [0.75, 0xf5, 0x9e, 0x0b], // amber-500
  [1.0, 0xef, 0x44, 0x44], // red-500 (peak load)
];

/** Converts normalised stress intensity `t ∈ [0, 1]` to a 24-bit RGB hex color. */
export function stressHex(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STRESS_STOPS.length; i++) {
    const [t1, r1, g1, b1] = STRESS_STOPS[i];
    if (x <= t1) {
      const [t0, r0, g0, b0] = STRESS_STOPS[i - 1];
      const u = (x - t0) / (t1 - t0);
      const r = Math.round(r0 + (r1 - r0) * u);
      const g = Math.round(g0 + (g1 - g0) * u);
      const b = Math.round(b0 + (b1 - b0) * u);
      return (r << 16) | (g << 8) | b;
    }
  }
  return 0xef4444;
}

export const STRESS_GRADIENT_CSS =
  'linear-gradient(90deg, #2563eb 0%, #06b6d4 25%, #22c55e 50%, #f59e0b 75%, #ef4444 100%)';
