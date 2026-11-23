import React from 'react';
import { VISUAL_MODES, type VisualMode } from '../types';
import { CubeIcon } from './icons';

interface TopBarProps {
  left: React.ReactNode;
  right: React.ReactNode;
  mode: VisualMode;
  onModeChange: (mode: VisualMode) => void;
}

const MODE_HINT: Record<VisualMode, string> = {
  Assembly: 'Category and material look',
  Thermal: 'Heatmap: TDP vs. heatsink dissipation',
  Bus: 'Control plane vs. high-speed plane links',
  Physics: 'Open cuboctahedron truss & static mechanical load FEA',
};

export const Brand: React.FC = () => (
  <div className="flex shrink-0 items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1">
    <CubeIcon className="h-4 w-4 text-sky-400" />
    <span className="text-[12px] font-bold tracking-[0.2em] text-sky-100">OMNIVOXEL</span>
  </div>
);

export const TopBar: React.FC<TopBarProps> = ({ left, right, mode, onModeChange }) => (
  <header className="relative z-40 grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-slate-800 bg-[#0b1020] px-3">
    <div className="flex min-w-0 items-center gap-3">
      <Brand />
      {left}
    </div>

    <div
      role="tablist"
      aria-label="View mode"
      className="flex items-center rounded-md border border-slate-700/80 bg-slate-900/70 p-0.5"
    >
      {VISUAL_MODES.map((m) => {
        const active = m === mode;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            title={MODE_HINT[m]}
            onClick={() => onModeChange(m)}
            className={`h-7 rounded px-3 text-[12px] font-medium transition-colors ${
              active
                ? 'bg-sky-500/20 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.45)]'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {m}
          </button>
        );
      })}
    </div>

    <div className="flex min-w-0 justify-end">{right}</div>
  </header>
);
