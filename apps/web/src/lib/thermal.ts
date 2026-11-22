import type { VoxelIR } from '@omnivoxel/core';

/**
 * Thermal heatmap model.
 *
 * Mirrors Gate 4 of the verifier: voxels are grouped into clusters of
 * thermally-coupled (mechanically connected) neighbours, and each cluster's
 * generated TDP is compared against its passive/heatsink dissipation.
 *
 *   loadRatio = clusterTDP / clusterDissipation      (> 1 means Gate 4 fails)
 *
 * Heat sources (TDP > 0) are coloured by the cluster load ratio, scaled by their
 * share of the hottest source. Conductive neighbours fade with graph distance, so
 * heatsinks visibly "pull" heat away from the compute module.
 */

export interface VoxelThermal {
  /** 0..1 value used to pick a colour from the ramp. */
  heat: number;
  clusterTdpW: number;
  clusterCoolingW: number;
  /** TDP / dissipation for the voxel's thermal cluster (Infinity-safe). */
  loadRatio: number;
}

type Stop = readonly [number, readonly [number, number, number]];

const STOPS: readonly Stop[] = [
  [0.0, [37, 99, 235]],
  [0.25, [6, 182, 212]],
  [0.5, [34, 197, 94]],
  [0.72, [234, 179, 8]],
  [0.88, [249, 115, 22]],
  [1.0, [239, 68, 68]],
];

export const THERMAL_GRADIENT_CSS = `linear-gradient(90deg, ${STOPS.map(
  ([t, [r, g, b]]) => `rgb(${r}, ${g}, ${b}) ${t * 100}%`
).join(', ')})`;

/** Ratio at which a cluster is considered fully saturated on the ramp. */
const SATURATION_RATIO = 1.2;
const DECAY_PER_HOP = 0.62;
const MAX_HOPS = 4;
/** Visual multiplier applied to voxels flagged as heatsinks. */
const HEATSINK_COOLING_FACTOR = 0.55;

export function thermalRgb(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    if (x <= t1) {
      const [t0, c0] = STOPS[i - 1];
      const k = (x - t0) / (t1 - t0 || 1);
      return [
        c0[0] + (c1[0] - c0[0]) * k,
        c0[1] + (c1[1] - c0[1]) * k,
        c0[2] + (c1[2] - c0[2]) * k,
      ];
    }
  }
  const last = STOPS[STOPS.length - 1][1];
  return [last[0], last[1], last[2]];
}

export function thermalHex(t: number): number {
  const [r, g, b] = thermalRgb(t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export function analyzeThermal(ir: VoxelIR): Map<string, VoxelThermal> {
  const out = new Map<string, VoxelThermal>();

  const adjacency = new Map<string, string[]>();
  for (const v of ir.voxels) adjacency.set(v.id, []);
  for (const link of ir.links) {
    if (!link.thermalCoupled) continue;
    adjacency.get(link.sourceId)?.push(link.targetId);
    adjacency.get(link.targetId)?.push(link.sourceId);
  }

  const seen = new Set<string>();

  for (const start of ir.voxels) {
    if (seen.has(start.id)) continue;

    // Collect the thermal cluster
    const cluster: string[] = [];
    const stack = [start.id];
    seen.add(start.id);
    while (stack.length > 0) {
      const id = stack.pop()!;
      cluster.push(id);
      for (const n of adjacency.get(id) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }

    let tdp = 0;
    let cooling = 0;
    let maxTdp = 0;
    for (const id of cluster) {
      const th = ir.getVoxel(id)!.manifest.thermal;
      tdp += th.tdpWatts;
      cooling += th.passiveDissipationWatts;
      maxTdp = Math.max(maxTdp, th.tdpWatts);
    }

    const loadRatio = cooling > 0 ? tdp / cooling : tdp > 0 ? 2 : 0;
    const level = Math.min(loadRatio, SATURATION_RATIO) / SATURATION_RATIO;

    const heat = new Map<string, number>();
    for (const id of cluster) heat.set(id, 0);

    if (maxTdp > 0) {
      for (const srcId of cluster) {
        const srcTdp = ir.getVoxel(srcId)!.manifest.thermal.tdpWatts;
        if (srcTdp <= 0) continue;
        const h0 = level * (0.35 + 0.65 * (srcTdp / maxTdp));

        // Depth-limited BFS spreading heat with distance decay
        const dist = new Map<string, number>([[srcId, 0]]);
        const queue: string[] = [srcId];
        for (let qi = 0; qi < queue.length; qi++) {
          const id = queue[qi];
          const d = dist.get(id)!;
          const candidate = h0 * Math.pow(DECAY_PER_HOP, d);
          if (candidate > (heat.get(id) ?? 0)) heat.set(id, candidate);
          if (d >= MAX_HOPS) continue;
          for (const n of adjacency.get(id) ?? []) {
            if (!dist.has(n)) {
              dist.set(n, d + 1);
              queue.push(n);
            }
          }
        }
      }
    }

    for (const id of cluster) {
      const voxel = ir.getVoxel(id)!;
      // Heatsinks shed heat to ambient, so they read cooler than their neighbours
      const sinkFactor = voxel.manifest.thermal.isHeatsink ? HEATSINK_COOLING_FACTOR : 1;
      out.set(id, {
        heat: (heat.get(id) ?? 0) * sinkFactor,
        clusterTdpW: tdp,
        clusterCoolingW: cooling,
        loadRatio,
      });
    }
  }

  return out;
}
