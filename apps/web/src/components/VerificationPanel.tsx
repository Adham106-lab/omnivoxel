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
    2: false,
    3: false,
    4: true,
    5: false,
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
    <div className="flex h-full min-h-0 flex-col bg-[#0b101c]">
      {/* Fixed Panel Header (Separate Flex Sibling — Never Overlaps Scroll Content) */}
      <div className="shrink-0 border-b border-slate-800/90 bg-[#0f1729] px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="truncate text-xs font-semibold tracking-wide text-slate-100">
            5-Gate Verification
          </h2>

          <div className="shrink-0 whitespace-nowrap font-mono text-[11px] font-semibold">
            {overallStatus === 'PASS' && (
              <span className="text-emerald-400">All Gates Passed</span>
            )}
            {overallStatus === 'FAIL' && (
              <span className="text-rose-400">
                {result?.errors.length} Violation{result?.errors.length === 1 ? '' : 's'}
              </span>
            )}
            {overallStatus === 'WARN' && (
              <span className="text-amber-400">Passed with Warnings</span>
            )}
            {overallStatus === 'PENDING' && (
              <span className="text-slate-400">Awaiting Compilation</span>
            )}
          </div>
        </div>

        {/* Clean Tabular Metrics Strip */}
        {ir?.metrics && (
          <div className="mt-2.5 grid grid-cols-4 gap-3 border-t border-slate-800/80 pt-2 font-mono text-[11px] tabular-nums">
            <div className="min-w-0">
              <div className="text-[10px] text-slate-500">Mass</div>
              <div className="truncate font-semibold text-slate-200">
                {ir.metrics.totalMassKg.toFixed(2)} kg
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-500">Thermal</div>
              <div
                className={`truncate font-semibold ${
                  ir.metrics.totalPassiveDissipationWatts >= ir.metrics.totalTdpWatts
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {ir.metrics.totalTdpWatts}/{ir.metrics.totalPassiveDissipationWatts}W
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-500">Compute</div>
              <div
                className={`truncate font-semibold ${
                  ir.metrics.computePowerProvidedWatts >= ir.metrics.computePowerDemandedWatts
                    ? 'text-sky-400'
                    : 'text-rose-400'
                }`}
              >
                {ir.metrics.computePowerDemandedWatts}/{ir.metrics.computePowerProvidedWatts}W
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-500">Actuator</div>
              <div
                className={`truncate font-semibold ${
                  ir.metrics.actuatorPowerProvidedWatts >=
                  ir.metrics.actuatorPowerDemandedWatts
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {ir.metrics.actuatorPowerDemandedWatts}/{ir.metrics.actuatorPowerProvidedWatts}W
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Internally Scrollable Gates List */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3.5">
        {GATES.map((gate) => {
          const status = getGateStatus(gate.number);
          const diagnostics = getGateDiagnostics(gate.number);
          const isExpanded = expandedGates[gate.number] || status !== 'PASS';

          return (
            <div
              key={gate.number}
              className="overflow-hidden rounded-lg border border-slate-800/90 bg-[#0e1627]"
            >
              <button
                type="button"
                onClick={() => toggleGate(gate.number)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-800/40"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-800/90 font-mono text-[11px] font-semibold tabular-nums text-slate-300">
                    {gate.number}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-slate-100">
                      {gate.title}
                    </div>
                    <div className="truncate text-[11px] text-slate-400">
                      {gate.description}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      status === 'PASS'
                        ? 'text-emerald-400'
                        : status === 'WARN'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {status === 'PASS'
                      ? 'PASS'
                      : status === 'WARN'
                      ? `WARN (${diagnostics.filter((d) => d.severity === 'warning').length})`
                      : `FAIL (${diagnostics.filter((d) => d.severity === 'error').length})`}
                  </span>

                  <svg
                    className={`h-3.5 w-3.5 text-slate-500 transition-transform ${
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

              {isExpanded && (
                <div className="space-y-2 border-t border-slate-800/70 bg-[#090f1c] px-3.5 py-2.5 text-xs">
                  {diagnostics.length === 0 ? (
                    <div className="text-[11px] text-slate-400">
                      Passed with no violations or warnings.
                    </div>
                  ) : (
                    diagnostics.map((diag, idx) => {
                      const isError = diag.severity === 'error';
                      return (
                        <div
                          key={idx}
                          className={`space-y-2 rounded-md border p-2.5 ${
                            isError
                              ? 'border-rose-900/50 bg-rose-950/25 text-rose-200'
                              : 'border-amber-900/50 bg-amber-950/25 text-amber-200'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 shrink-0 font-mono text-[10px] font-semibold uppercase ${
                                isError ? 'text-rose-400' : 'text-amber-400'
                              }`}
                            >
                              {diag.severity}
                            </span>
                            <span className="flex-1 text-[11px] leading-relaxed">
                              {diag.message}
                            </span>
                          </div>

                          {diag.voxelIds && diag.voxelIds.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                              <span className="text-slate-400">Affected:</span>
                              {diag.voxelIds.map((vid) => (
                                <button
                                  key={vid}
                                  type="button"
                                  onClick={() => onSelectVoxel(vid)}
                                  className={`rounded px-1.5 py-0.5 transition-colors ${
                                    selectedVoxelId === vid
                                      ? 'bg-sky-500 font-bold text-slate-950'
                                      : 'bg-slate-800 text-sky-300 hover:bg-slate-700'
                                  }`}
                                >
                                  {vid}
                                </button>
                              ))}
                            </div>
                          )}

                          {diag.suggestedFix && (
                            <div className="rounded border border-sky-900/40 bg-sky-950/25 px-2.5 py-1.5 text-[11px] leading-snug text-sky-200">
                              <span className="font-semibold text-sky-400">Fix: </span>
                              {diag.suggestedFix}
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
