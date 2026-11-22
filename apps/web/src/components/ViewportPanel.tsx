import React from 'react';
import type { RoomEnvironment, VoxelIR } from '@omnivoxel/core';
import type { Guides, IssueSeverity, Selection, VisualMode } from '../types';
import type { VoxelThermal } from '../lib/thermal';
import { THERMAL_GRADIENT_CSS } from '../lib/thermal';
import { BUS_COLORS, CATEGORY_ORDER, CATEGORY_STYLE } from '../lib/theme';
import { SceneCanvas } from './SceneCanvas';
import { CloseIcon, FitIcon } from './icons';

interface ViewportPanelProps {
  ir: VoxelIR | null;
  room: RoomEnvironment;
  mode: VisualMode;
  selection: Selection;
  issues: Map<string, IssueSeverity>;
  thermal: Map<string, VoxelThermal>;
  guides: Guides;
  cameraTrigger: number;
  notice: string | null;
  onSelect: (selection: Selection) => void;
  onFit: () => void;
}

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
);

// ------------------------------------------------------------------ selection chip

const SelectionChip: React.FC<{
  ir: VoxelIR | null;
  room: RoomEnvironment;
  selection: NonNullable<Selection>;
  thermal: Map<string, VoxelThermal>;
  onClear: () => void;
}> = ({ ir, room, selection, thermal, onClear }) => {
  let title = selection.id;
  let name = '';
  let detail = '';
  let color = '#38bdf8';

  if (selection.kind === 'voxel') {
    const voxel = ir?.getVoxel(selection.id);
    if (!voxel) return null;
    const m = voxel.manifest;
    color = CATEGORY_STYLE[m.category].css;
    const links = ir?.getLinks(voxel.id) ?? [];
    const cp = links.filter((l) => l.controlPlane.connected).length;
    const hs = links.filter((l) => l.highSpeedPlane.connected).length;
    const load = thermal.get(voxel.id);
    title = voxel.id;
    name = CATEGORY_STYLE[m.category].label;
    detail = [
      `(${voxel.coord.x}, ${voxel.coord.y}, ${voxel.coord.z})`,
      `${(m.mechanical.massKg * 1000).toFixed(0)} g`,
      `${m.thermal.tdpWatts.toFixed(1)} W TDP`,
      `${cp} CP · ${hs} HS`,
      load ? `heat load ${Math.round(load.loadRatio * 100)}%` : '',
    ]
      .filter(Boolean)
      .join('  ·  ');
  } else {
    const o = room.obstacles.find((x) => x.id === selection.id);
    if (!o) return null;
    color = '#fbbf24';
    const w = o.boundsMaxMm.x - o.boundsMinMm.x;
    const d = o.boundsMaxMm.y - o.boundsMinMm.y;
    const h = o.boundsMaxMm.z - o.boundsMinMm.z;
    title = o.name ?? o.id;
    name = o.type;
    detail = `${w} × ${d} × ${h} mm  ·  ${o.isFixed ? 'fixed' : 'movable'}`;
  }

  return (
    <div className="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-md border border-slate-700/80 bg-[#0b1020]/90 py-1 pl-2.5 pr-1 shadow-lg backdrop-blur">
      <Dot color={color} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2 leading-tight">
          <span className="truncate text-[12px] font-semibold text-slate-100">{title}</span>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-500">{name}</span>
        </div>
        <div className="truncate font-mono text-[10px] leading-tight text-slate-400">{detail}</div>
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="grid h-6 w-6 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

// ------------------------------------------------------------------------ legend

const Legend: React.FC<{ mode: VisualMode }> = ({ mode }) => {
  return (
    <div className="pointer-events-none rounded-md border border-slate-800/90 bg-[#0b1020]/85 px-2.5 py-1.5 text-[10px] text-slate-300 shadow-lg backdrop-blur">
      {mode === 'Assembly' && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {CATEGORY_ORDER.map((c) => (
            <li key={c} className="flex items-center gap-1.5 whitespace-nowrap">
              <Dot color={CATEGORY_STYLE[c].css} />
              {CATEGORY_STYLE[c].label}
            </li>
          ))}
        </ul>
      )}

      {mode === 'Thermal' && (
        <div className="w-44">
          <div className="mb-1 text-slate-400">TDP vs. heatsink dissipation</div>
          <div className="h-2 rounded-full" style={{ background: THERMAL_GRADIENT_CSS }} />
          <div className="mt-0.5 flex justify-between font-mono text-[9px] text-slate-500">
            <span>cool</span>
            <span>at budget</span>
            <span>over</span>
          </div>
        </div>
      )}

      {mode === 'Bus' && (
        <ul className="space-y-0.5">
          <li className="flex items-center gap-1.5 whitespace-nowrap">
            <Dot color={BUS_COLORS.control.css} /> Control plane (I²C / CAN-FD)
          </li>
          <li className="flex items-center gap-1.5 whitespace-nowrap">
            <Dot color={BUS_COLORS.highSpeed.css} /> High-speed plane (DP / PCIe)
          </li>
          <li className="flex items-center gap-1.5 whitespace-nowrap">
            <Dot color={BUS_COLORS.none.css} /> Mechanical only
          </li>
        </ul>
      )}
    </div>
  );
};

// ------------------------------------------------------------------------ panel

export const ViewportPanel: React.FC<ViewportPanelProps> = ({
  ir,
  room,
  mode,
  selection,
  issues,
  thermal,
  guides,
  cameraTrigger,
  notice,
  onSelect,
  onFit,
}) => {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[#090d16]">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <SceneCanvas
          ir={ir}
          room={room}
          mode={mode}
          selection={selection}
          issues={issues}
          thermal={thermal}
          guides={guides}
          cameraTrigger={cameraTrigger}
          onSelect={onSelect}
        />

        {/* Top overlay row: selection chip (left) + fit button (right). Never blocks the canvas. */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {selection && (
              <SelectionChip
                ir={ir}
                room={room}
                selection={selection}
                thermal={thermal}
                onClear={() => onSelect(null)}
              />
            )}
          </div>
          <button
            type="button"
            onClick={onFit}
            title="Fit view to assembly"
            className="pointer-events-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-slate-700/80 bg-[#0b1020]/90 px-2 text-[11px] font-medium text-slate-300 shadow-lg backdrop-blur hover:border-slate-500 hover:text-white"
          >
            <FitIcon className="h-3.5 w-3.5" />
            Fit
          </button>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3">
          <Legend mode={mode} />
        </div>
      </div>

      {/* Minimal bottom status strip */}
      <footer className="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-slate-800 bg-[#0b1020] px-3 text-[11px] text-slate-400">
        <div className="min-w-0 truncate">
          <span className="font-medium text-slate-200">{room.name ?? room.id ?? 'Custom room'}</span>
          <span className="mx-1.5 text-slate-600">·</span>
          <span className="font-mono tabular-nums">
            {room.dimensionsMm.x} × {room.dimensionsMm.y} × {room.dimensionsMm.z} mm
          </span>
        </div>
        <div className="min-w-0 truncate text-right">
          {notice ? (
            <span className="text-sky-300">{notice}</span>
          ) : (
            <span className="text-slate-500">Click a voxel or furniture item to inspect</span>
          )}
        </div>
      </footer>
    </div>
  );
};
