import React from 'react';
import type { Diagnostic } from '@omnivoxel/core';
import type { GateMeta, GateStatus } from '../lib/diagnostics';
import { ChevronDownIcon } from './icons';

interface GateCardProps {
  meta: GateMeta;
  status: GateStatus;
  diagnostics: Diagnostic[];
  passSummary: string | null;
  open: boolean;
  selectedVoxelId: string | null;
  hasVoxel: (id: string) => boolean;
  onToggle: () => void;
  onSelectVoxel: (id: string) => void;
}

const STATUS_STYLE: Record<
  GateStatus,
  { badge: string; label: string; rail: string; num: string }
> = {
  pass: {
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    label: 'PASS',
    rail: 'border-l-emerald-500',
    num: 'bg-emerald-500/15 text-emerald-300',
  },
  warn: {
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    label: 'WARN',
    rail: 'border-l-amber-500',
    num: 'bg-amber-500/15 text-amber-300',
  },
  fail: {
    badge: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    label: 'FAIL',
    rail: 'border-l-rose-500',
    num: 'bg-rose-500/15 text-rose-300',
  },
};

const SEVERITY_DOT: Record<Diagnostic['severity'], string> = {
  error: 'bg-rose-400',
  warning: 'bg-amber-400',
  info: 'bg-sky-400',
};

export const GateCard: React.FC<GateCardProps> = ({
  meta,
  status,
  diagnostics,
  passSummary,
  open,
  selectedVoxelId,
  hasVoxel,
  onToggle,
  onSelectVoxel,
}) => {
  const s = STATUS_STYLE[status];
  const bodyId = `gate-body-${meta.gate}`;

  return (
    <article
      data-gate-status={status}
      className={`overflow-hidden rounded-md border border-slate-800 border-l-2 bg-slate-900/50 ${s.rail}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-slate-800/40"
      >
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded font-mono text-[11px] font-bold ${s.num}`}
        >
          {meta.gate}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-100">
          {meta.name}
        </span>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${s.badge}`}
        >
          {s.label}
        </span>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div id={bodyId} className="space-y-2 border-t border-slate-800/80 px-2.5 py-2">
          <p className="text-[11px] leading-snug text-slate-500">{meta.checks}</p>

          {diagnostics.length === 0 && passSummary && (
            <p className="text-[12px] leading-snug text-slate-300">{passSummary}</p>
          )}

          {diagnostics.map((d, i) => (
            <div key={`${d.gate}-${i}`} className="space-y-1.5">
              <div className="flex gap-2">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[d.severity]}`}
                />
                <p className="min-w-0 break-words text-[12px] leading-snug text-slate-300">{d.message}</p>
              </div>

              {d.voxelIds && d.voxelIds.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-3.5">
                  {d.voxelIds.map((id) => {
                    const exists = hasVoxel(id);
                    const active = id === selectedVoxelId;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={!exists}
                        onClick={() => onSelectVoxel(id)}
                        title={exists ? 'Select in 3D view' : 'Voxel no longer in the assembly'}
                        className={`max-w-full truncate rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                          active
                            ? 'border-sky-400/70 bg-sky-400/15 text-sky-100'
                            : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-sky-500/60'
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        {id}
                      </button>
                    );
                  })}
                </div>
              )}

              {d.suggestedFix && (
                <div className="ml-3.5 rounded border border-sky-500/20 bg-sky-500/5 px-2 py-1.5 text-[11px] leading-snug text-sky-200">
                  <span className="font-semibold text-sky-300">Fix · </span>
                  {d.suggestedFix}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
};
