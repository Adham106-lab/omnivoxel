import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomEnvironment, VerifierResult, VoxelIR } from '@omnivoxel/core';
import type { CompileFailure } from '../types';
import {
  GATES,
  gateStatus,
  groupByGate,
  passSummary,
  summarizeVerdict,
  type VerdictSummary,
} from '../lib/diagnostics';
import { GateCard } from './GateCard';

interface VerificationInspectorProps {
  result: VerifierResult | null;
  ir: VoxelIR | null;
  room: RoomEnvironment;
  failure: CompileFailure | null;
  selectedVoxelId: string | null;
  onSelectVoxel: (id: string) => void;
}

const PILL_STYLE: Record<VerdictSummary['tone'], string> = {
  idle: 'border-slate-600 bg-slate-800 text-slate-300',
  pass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  warn: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  fail: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
};

interface MetricProps {
  label: string;
  value: string;
  /** Optional demand/capacity ratio drawn as a bar. */
  ratio?: number;
  over?: boolean;
}

const Metric: React.FC<MetricProps> = ({ label, value, ratio, over }) => (
  <div className="min-w-0 rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5">
    <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {label}
    </div>
    <div
      className={`mt-0.5 truncate font-mono text-[12px] tabular-nums ${over ? 'text-rose-300' : 'text-slate-100'}`}
    >
      {value}
    </div>
    {ratio !== undefined && (
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${over ? 'bg-rose-500' : ratio > 0.85 ? 'bg-amber-400' : 'bg-emerald-500'}`}
          style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
        />
      </div>
    )}
  </div>
);

const ratioOf = (demand: number, capacity: number): number =>
  capacity > 0 ? demand / capacity : demand > 0 ? 2 : 0;

export const VerificationInspector: React.FC<VerificationInspectorProps> = ({
  result,
  ir,
  room,
  failure,
  selectedVoxelId,
  onSelectVoxel,
}) => {
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // After each compile, bring the first failing (or warning) gate into view
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !result) return;
    const target =
      root.querySelector<HTMLElement>('[data-gate-status="fail"]') ??
      root.querySelector<HTMLElement>('[data-gate-status="warn"]');
    if (!target) {
      root.scrollTo({ top: 0 });
      return;
    }
    const top = target.offsetTop;
    const bottom = top + target.offsetHeight;
    if (bottom > root.scrollTop + root.clientHeight || top < root.scrollTop) {
      root.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' });
    }
  }, [result]);

  const verdict = summarizeVerdict(result, failure !== null);
  const grouped = useMemo(() => groupByGate(result?.diagnostics ?? []), [result]);
  const m = ir?.metrics;

  const tdpRatio = m ? ratioOf(m.totalTdpWatts, m.totalPassiveDissipationWatts) : 0;
  const computeRatio = m ? ratioOf(m.computePowerDemandedWatts, m.computePowerProvidedWatts) : 0;
  const actuatorRatio = m ? ratioOf(m.actuatorPowerDemandedWatts, m.actuatorPowerProvidedWatts) : 0;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#0f172a]">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-3">
        <h2 className="min-w-0 truncate text-[12px] font-semibold text-slate-100">5-Gate Verification</h2>
        <span
          className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${PILL_STYLE[verdict.tone]}`}
          role="status"
        >
          {verdict.label}
        </span>
      </div>

      {/* Scrollable body */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
        {failure && result && (
          <div className="rounded-md border border-rose-900/60 bg-rose-950/30 px-2.5 py-1.5 text-[11px] leading-snug text-rose-200">
            The latest edit does not compile. Gates below reflect the last successful compile.
          </div>
        )}

        {m ? (
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Mass" value={`${m.totalMassKg.toFixed(3)} kg`} />
            <Metric
              label="Thermal TDP / cooling"
              value={`${m.totalTdpWatts.toFixed(1)} / ${m.totalPassiveDissipationWatts.toFixed(1)} W`}
              ratio={tdpRatio}
              over={tdpRatio > 1}
            />
            <Metric
              label="Compute power"
              value={`${m.computePowerDemandedWatts.toFixed(1)} / ${m.computePowerProvidedWatts.toFixed(1)} W`}
              ratio={computeRatio}
              over={computeRatio > 1}
            />
            <Metric
              label="Actuator power"
              value={`${m.actuatorPowerDemandedWatts.toFixed(1)} / ${m.actuatorPowerProvidedWatts.toFixed(1)} W`}
              ratio={actuatorRatio}
              over={actuatorRatio > 1}
            />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-700 px-3 py-4 text-center text-[12px] text-slate-500">
            Compile the DSL to run the 5 verification gates.
          </div>
        )}

        {ir && result && (
          <div className="space-y-1.5">
            {GATES.map((meta) => {
              const diagnostics = grouped.get(meta.gate) ?? [];
              const status = gateStatus(diagnostics);
              return (
                <GateCard
                  key={meta.gate}
                  meta={meta}
                  status={status}
                  diagnostics={diagnostics}
                  passSummary={status === 'pass' ? passSummary(meta.gate, ir, room) : null}
                  open={overrides[meta.gate] ?? status !== 'pass'}
                  selectedVoxelId={selectedVoxelId}
                  hasVoxel={(id) => ir.voxelMap.has(id)}
                  onToggle={() =>
                    setOverrides((o) => ({ ...o, [meta.gate]: !(o[meta.gate] ?? status !== 'pass') }))
                  }
                  onSelectVoxel={onSelectVoxel}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
