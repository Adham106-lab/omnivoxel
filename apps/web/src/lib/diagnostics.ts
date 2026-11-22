import type { Diagnostic, RoomEnvironment, VerifierResult, VoxelIR } from '@omnivoxel/core';
import type { IssueSeverity } from '../types';

export type GateNumber = 1 | 2 | 3 | 4 | 5;
export type GateStatus = 'pass' | 'warn' | 'fail';

export interface GateMeta {
  gate: GateNumber;
  name: string;
  /** One-line description of what the gate checks. */
  checks: string;
}

export const GATES: readonly GateMeta[] = [
  {
    gate: 1,
    name: 'Spatial & Connectivity',
    checks: 'Grid overlap, lattice connectivity, room bounds and obstacle clearance.',
  },
  {
    gate: 2,
    name: 'Dual-Plane Bus',
    checks: 'Control-plane (I²C / CAN-FD) and high-speed-plane (DP / PCIe) routing.',
  },
  {
    gate: 3,
    name: 'Power & Rail Isolation',
    checks: 'Power budget, compute vs. actuator rails and galvanic isolation.',
  },
  {
    gate: 4,
    name: 'Thermal Budget',
    checks: 'Component TDP against connected aluminum heatsink dissipation.',
  },
  {
    gate: 5,
    name: 'Static Mechanical Load',
    checks: 'Vertical compressive load and structural support of the stack.',
  },
] as const;

export function groupByGate(diagnostics: readonly Diagnostic[]): Map<number, Diagnostic[]> {
  const map = new Map<number, Diagnostic[]>();
  for (const g of GATES) map.set(g.gate, []);
  for (const d of diagnostics) {
    const list = map.get(d.gate);
    if (list) list.push(d);
  }
  return map;
}

export function gateStatus(diagnostics: readonly Diagnostic[]): GateStatus {
  if (diagnostics.some((d) => d.severity === 'error')) return 'fail';
  if (diagnostics.some((d) => d.severity === 'warning')) return 'warn';
  return 'pass';
}

/** voxelId -> worst severity, used to outline problem voxels in the 3D view. */
export function buildIssueMap(result: VerifierResult | null): Map<string, IssueSeverity> {
  const map = new Map<string, IssueSeverity>();
  if (!result) return map;
  for (const d of result.diagnostics) {
    if (d.severity === 'info' || !d.voxelIds) continue;
    for (const id of d.voxelIds) {
      if (d.severity === 'error' || !map.has(id)) map.set(id, d.severity);
    }
  }
  return map;
}

export interface VerdictSummary {
  tone: 'idle' | 'pass' | 'warn' | 'fail';
  label: string;
  errors: number;
  warnings: number;
}

export function summarizeVerdict(result: VerifierResult | null, hasError: boolean): VerdictSummary {
  if (hasError) return { tone: 'fail', label: 'COMPILE ERROR', errors: 0, warnings: 0 };
  if (!result) return { tone: 'idle', label: 'NOT VERIFIED', errors: 0, warnings: 0 };

  const errors = result.errors.length;
  const warnings = result.warnings.length;

  if (errors > 0) {
    const parts = [`${errors} FAILED`];
    if (warnings > 0) parts.push(`${warnings} WARNING${warnings === 1 ? '' : 'S'}`);
    return { tone: 'fail', label: parts.join(' · '), errors, warnings };
  }
  if (warnings > 0) {
    return {
      tone: 'warn',
      label: `PASSED · ${warnings} WARNING${warnings === 1 ? '' : 'S'}`,
      errors,
      warnings,
    };
  }
  return { tone: 'pass', label: 'ALL GATES PASSED', errors, warnings };
}

/** Short, data-driven sentence shown when a gate passes. */
export function passSummary(gate: GateNumber, ir: VoxelIR, room: RoomEnvironment): string {
  const m = ir.metrics;
  switch (gate) {
    case 1: {
      const obstacles = room.obstacles.length;
      return `${ir.voxels.length} voxels on unique cells in one connected lattice; inside “${
        room.name ?? room.id ?? 'room'
      }” with ${obstacles} obstacle${obstacles === 1 ? '' : 's'} clear.`;
    }
    case 2: {
      const cp = ir.links.filter((l) => l.controlPlane.connected).length;
      const hs = ir.links.filter((l) => l.highSpeedPlane.connected).length;
      return `${cp} control-plane and ${hs} high-speed link${hs === 1 ? '' : 's'} routed across ${
        ir.links.length
      } adjacencies.`;
    }
    case 3:
      return `Compute rail ${m.computePowerDemandedWatts.toFixed(1)} W demand / ${m.computePowerProvidedWatts.toFixed(
        1
      )} W supply · actuator rail ${m.actuatorPowerDemandedWatts.toFixed(
        1
      )} W / ${m.actuatorPowerProvidedWatts.toFixed(1)} W.`;
    case 4:
      return `${m.totalTdpWatts.toFixed(1)} W TDP is covered by ${m.totalPassiveDissipationWatts.toFixed(
        1
      )} W of passive dissipation.`;
    case 5:
      return `${m.totalMassKg.toFixed(3)} kg assembly; vertical stack within compressive limits.`;
  }
}
