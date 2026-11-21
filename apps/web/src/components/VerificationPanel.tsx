import React, { useState } from 'react';
import { Diagnostic, VerifierResult, VoxelIR } from '@omnivoxel/core';

interface VerificationPanelProps {
  result: VerifierResult | null;
  ir: VoxelIR | null;
  selectedVoxelId: string | null;
  onSelectVoxel: (id: string | null) => void;
}

interface GateConfig {
  number: 1 | 2 | 3 | 4 | 5;
  title: string;
  description: string;
}

const GATES: GateConfig[] = [
  {
    number: 1,
    title: 'Spatial & Connectivity',
    description: 'Grid overlap, lattice connectivity graph, room bounds & obstacle collisions',
  },
  {
    number: 2,
    title: 'Dual-Plane Bus',
    description: 'Control plane (I2C/CAN-FD) & high-speed display routing',
  },
  {
    number: 3,
    title: 'Power & Rail Isolation',
    description: 'Dual-rail capacity (compute & actuator) and noise isolation',
  },
  {
    number: 4,
    title: 'Thermal Budget',
    description: 'Passive heatsink dissipation capacity vs cluster TDP',
  },
  {
    number: 5,
    title: 'Static Mechanical Load',
    description: 'Vertical stack column compressive force vs mechanical limit',
  },
];

export const VerificationPanel: React.FC<VerificationPanelProps> = ({
  result,
  ir,
  selectedVoxelId,
  onSelectVoxel,
}) => {
  const [expandedGates, setExpandedGates] = useState<Record<number, boolean>>({
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
  });

  const toggleGate = (gateNum: number) => {
    setExpandedGates((prev) => ({ ...prev, [gateNum]: !prev[gateNum] }));
  };

  const getGateDiagnostics = (gateNum: number): Diagnostic[] => {
    if (!result) return [];
    return result.diagnostics.filter((d) => d.gate === gateNum);
  };

  const getGateStatus = (gateNum: number): 'PASS' | 'FAIL' | 'WARN' => {
    const diags = getGateDiagnostics(gateNum);
    if (diags.some((d) => d.severity === 'error')) return 'FAIL';
    if (diags.some((d) => d.severity === 'warning')) return 'WARN';
    return 'PASS';
  };

  const overallStatus = !result
    ? 'PENDING'
    : result.errors.length > 0
    ? 'FAIL'
    : result.warnings.length > 0
    ? 'WARN'
    : 'PASS';

  return (
    <div className="flex h-full flex-col bg-[#0b101c] overflow-y-auto">
      {/* Header & Status Banner */}
      <div className="sticky top-0 z-10 border-b border-slate-800 bg-[#0d1424] px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-emerald-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              5-Gate Deterministic Verification
            </span>
          </div>

          {/* Overall Badge */}
          <div>
            {overallStatus === 'PASS' && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 shadow-sm shadow-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                ALL GATES PASSED
              </span>
            )}
            {overallStatus === 'FAIL' && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-950/60 px-2.5 py-0.5 text-xs font-semibold text-rose-300 shadow-sm shadow-rose-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                {result?.errors.length} VIOLATION{result?.errors.length === 1 ? '' : 'S'}
              </span>
            )}
            {overallStatus === 'WARN' && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-950/60 px-2.5 py-0.5 text-xs font-semibold text-amber-300 shadow-sm shadow-amber-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                PASSED WITH WARNINGS
              </span>
            )}
            {overallStatus === 'PENDING' && (
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-400">
                AWAITING COMPILATION
              </span>
            )}
          </div>
        </div>

        {/* Metrics Summary Strip */}
        {ir?.metrics && (
          <div className="mt-2 grid grid-cols-4 gap-1.5 rounded-md border border-slate-800/80 bg-slate-950/60 p-2 font-mono text-[10px]">
            <div className="flex flex-col">
              <span className="text-slate-500">MASS</span>
              <span className="font-semibold text-slate-200">
                {ir.metrics.totalMassKg.toFixed(3)} kg
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500">TDP / COOLING</span>
              <span
                className={`font-semibold ${
                  ir.metrics.totalPassiveDissipationWatts >= ir.metrics.totalTdpWatts
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {ir.metrics.totalTdpWatts}W / {ir.metrics.totalPassiveDissipationWatts}W
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500">COMPUTE PWR</span>
              <span
                className={`font-semibold ${
                  ir.metrics.computePowerProvidedWatts >= ir.metrics.computePowerDemandedWatts
                    ? 'text-cyan-400'
                    : 'text-rose-400'
                }`}
              >
                {ir.metrics.computePowerDemandedWatts}W / {ir.metrics.computePowerProvidedWatts}W
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500">ACTUATOR PWR</span>
              <span
                className={`font-semibold ${
                  ir.metrics.actuatorPowerProvidedWatts >= ir.metrics.actuatorPowerDemandedWatts
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {ir.metrics.actuatorPowerDemandedWatts}W / {ir.metrics.actuatorPowerProvidedWatts}W
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Gates Accordion List */}
      <div className="flex-1 divide-y divide-slate-800/80 p-3 space-y-2">
        {GATES.map((gate) => {
          const status = getGateStatus(gate.number);
          const diagnostics = getGateDiagnostics(gate.number);
          const isExpanded = expandedGates[gate.number];

          return (
            <div
              key={gate.number}
              className="rounded-lg border border-slate-800/90 bg-[#0e1627] overflow-hidden transition"
            >
              {/* Gate Row Header */}
              <button
                onClick={() => toggleGate(gate.number)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left transition hover:bg-slate-800/40"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-800 font-mono text-[11px] font-bold text-slate-300">
                    {gate.number}
                  </span>
                  <div>
                    <div className="text-xs font-semibold text-slate-200">{gate.title}</div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">
                      {gate.description}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {status === 'PASS' && (
                    <span className="rounded bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-400">
                      PASS
                    </span>
                  )}
                  {status === 'WARN' && (
                    <span className="rounded bg-amber-950/70 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-400">
                      WARN ({diagnostics.filter((d) => d.severity === 'warning').length})
                    </span>
                  )}
                  {status === 'FAIL' && (
                    <span className="rounded bg-rose-950/70 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold tracking-wider text-rose-400">
                      FAIL ({diagnostics.filter((d) => d.severity === 'error').length})
                    </span>
                  )}

                  <svg
                    className={`h-4 w-4 text-slate-400 transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {/* Expanded Diagnostics Content */}
              {isExpanded && (
                <div className="border-t border-slate-800/60 bg-[#090f1c] px-3.5 py-2.5 space-y-2 text-xs">
                  {diagnostics.length === 0 ? (
                    <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                      <svg
                        className="h-3.5 w-3.5 text-emerald-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Verification passed cleanly with no violations or warnings.</span>
                    </div>
                  ) : (
                    diagnostics.map((diag, idx) => {
                      const isError = diag.severity === 'error';
                      return (
                        <div
                          key={idx}
                          className={`rounded-md border p-2.5 space-y-1.5 ${
                            isError
                              ? 'border-rose-900/40 bg-rose-950/20 text-rose-200'
                              : 'border-amber-900/40 bg-amber-950/20 text-amber-200'
                          }`}
                        >
                          {/* Diagnostic Cause Message */}
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                                isError ? 'bg-rose-900/70 text-rose-200' : 'bg-amber-900/70 text-amber-200'
                              }`}
                            >
                              {diag.severity}
                            </span>
                            <span className="flex-1 font-medium leading-relaxed text-[11px]">
                              {diag.message}
                            </span>
                          </div>

                          {/* Affected Voxels */}
                          {diag.voxelIds && diag.voxelIds.length > 0 && (
                            <div className="flex items-center gap-1.5 font-mono text-[10px]">
                              <span className="text-slate-400">Affected:</span>
                              {diag.voxelIds.map((vid) => (
                                <button
                                  key={vid}
                                  onClick={() => onSelectVoxel(vid)}
                                  className={`rounded px-1.5 py-0.5 transition ${
                                    selectedVoxelId === vid
                                      ? 'bg-cyan-500 text-slate-950 font-bold'
                                      : 'bg-slate-800 text-cyan-300 hover:bg-slate-700'
                                  }`}
                                >
                                  {vid}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Suggested Fix Action */}
                          {diag.suggestedFix && (
                            <div className="rounded border border-cyan-900/40 bg-cyan-950/30 p-2 text-[11px] text-cyan-300 flex items-start gap-1.5">
                              <span className="font-semibold text-cyan-400 shrink-0">
                                💡 Suggested Fix:
                              </span>
                              <span className="leading-snug">{diag.suggestedFix}</span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
