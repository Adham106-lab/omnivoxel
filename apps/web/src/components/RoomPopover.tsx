import React, { useEffect, useState } from 'react';
import {
  getRoomBoundsMm,
  type DockToFurnitureOptions,
  type EnvironmentObstacle,
  type RoomEnvironment,
  type SnapToRoomOptions,
} from '@omnivoxel/core';
import type { Guides, Selection } from '../types';
import { OBSTACLE_DEFAULT_COLOR } from '../lib/theme';
import { usePopover } from '../lib/usePopover';
import { ChevronDownIcon, RoomIcon } from './icons';

interface RoomPopoverProps {
  room: RoomEnvironment;
  selection: Selection;
  guides: Guides;
  hasAssembly: boolean;
  dockTarget: EnvironmentObstacle | undefined;
  onRoomChange: (room: RoomEnvironment) => void;
  onToggleGuide: (key: keyof Guides) => void;
  onSnap: (alignment: NonNullable<SnapToRoomOptions['alignment']>) => void;
  onDock: (alignment: NonNullable<DockToFurnitureOptions['alignment']>) => void;
  onSelectObstacle: (id: string) => void;
  onFit: () => void;
}

type Axis = 'x' | 'y' | 'z';
const AXES: readonly Axis[] = ['x', 'y', 'z'] as const;

const SectionTitle: React.FC<{ children: React.ReactNode; aside?: React.ReactNode }> = ({
  children,
  aside,
}) => (
  <div className="mb-1.5 flex items-center justify-between gap-2">
    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{children}</h3>
    {aside}
  </div>
);

const ActionButton: React.FC<{
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}> = ({ children, disabled, onClick, title }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    title={title}
    className="h-7 flex-1 rounded-md border border-slate-700 bg-slate-800/60 px-2 text-[11px] font-medium text-slate-200 hover:border-sky-500/60 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-700 disabled:hover:bg-slate-800/60"
  >
    {children}
  </button>
);

const GuideToggle: React.FC<{ label: string; on: boolean; onClick: () => void }> = ({
  label,
  on,
  onClick,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    onClick={onClick}
    className={`h-7 flex-1 rounded-md border px-2 text-[11px] font-medium ${
      on
        ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
        : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200'
    }`}
  >
    {label}
  </button>
);

export const RoomPopover: React.FC<RoomPopoverProps> = ({
  room,
  selection,
  guides,
  hasAssembly,
  dockTarget,
  onRoomChange,
  onToggleGuide,
  onSnap,
  onDock,
  onSelectObstacle,
  onFit,
}) => {
  const { open, toggle, ref } = usePopover<HTMLDivElement>();

  // Draft dimension values commit on blur / Enter so typing never recompiles
  const [draft, setDraft] = useState<Record<Axis, string>>({
    x: String(room.dimensionsMm.x),
    y: String(room.dimensionsMm.y),
    z: String(room.dimensionsMm.z),
  });
  useEffect(() => {
    setDraft({
      x: String(room.dimensionsMm.x),
      y: String(room.dimensionsMm.y),
      z: String(room.dimensionsMm.z),
    });
  }, [room.dimensionsMm.x, room.dimensionsMm.y, room.dimensionsMm.z]);

  const commitAxis = (axis: Axis) => {
    const parsed = Number(draft[axis]);
    if (!Number.isFinite(parsed) || parsed < 100) {
      setDraft((d) => ({ ...d, [axis]: String(room.dimensionsMm[axis]) }));
      return;
    }
    if (parsed === room.dimensionsMm[axis]) return;
    const dimensionsMm = { ...room.dimensionsMm, [axis]: parsed };
    const min = getRoomBoundsMm(room).min;
    onRoomChange({
      ...room,
      dimensionsMm,
      boundsMinMm: min,
      boundsMaxMm: { x: min.x + dimensionsMm.x, y: min.y + dimensionsMm.y, z: min.z + dimensionsMm.z },
    });
  };

  const selectedObstacleId = selection?.kind === 'obstacle' ? selection.id : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex h-8 items-center gap-2 rounded-md border px-2.5 text-[12px] font-medium ${
          open
            ? 'border-sky-500/60 bg-sky-500/10 text-sky-200'
            : 'border-slate-700/80 bg-slate-900/70 text-slate-200 hover:border-slate-500'
        }`}
      >
        <RoomIcon className="h-4 w-4" />
        <span className="whitespace-nowrap">Room &amp; Layout</span>
        <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Room and layout"
          className="absolute right-0 top-full z-50 mt-1.5 max-h-[calc(100vh-4rem)] w-[min(380px,calc(100vw-1.5rem))] space-y-4 overflow-y-auto rounded-lg border border-slate-700 bg-[#0f172a] p-3 shadow-2xl"
        >
          {/* Room */}
          <section>
            <SectionTitle>Room</SectionTitle>
            <div className="mb-2 truncate text-[12px] font-semibold text-slate-100">
              {room.name ?? room.id ?? 'Custom room'}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {AXES.map((axis) => (
                <label key={axis} className="block">
                  <span className="mb-0.5 block text-[10px] uppercase text-slate-500">
                    {axis} (mm)
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={100}
                    step={50}
                    value={draft[axis]}
                    onChange={(e) => setDraft((d) => ({ ...d, [axis]: e.target.value }))}
                    onBlur={() => commitAxis(axis)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className="h-7 w-full rounded-md border border-slate-700 bg-slate-950/60 px-2 font-mono text-[12px] tabular-nums text-slate-100 outline-none focus:border-sky-500"
                  />
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-slate-500">
              Changing dimensions re-runs Gate 1 against the new room bounds.
            </p>
          </section>

          {/* Obstacles */}
          <section>
            <SectionTitle
              aside={<span className="text-[10px] text-slate-500">{room.obstacles.length}</span>}
            >
              Obstacles
            </SectionTitle>
            {room.obstacles.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-700 px-2 py-2 text-[11px] text-slate-500">
                No obstacles in this room.
              </div>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto pr-0.5">
                {room.obstacles.map((o) => {
                  const w = o.boundsMaxMm.x - o.boundsMinMm.x;
                  const d = o.boundsMaxMm.y - o.boundsMinMm.y;
                  const h = o.boundsMaxMm.z - o.boundsMinMm.z;
                  const active = o.id === selectedObstacleId;
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => onSelectObstacle(o.id)}
                        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left ${
                          active
                            ? 'border-amber-400/60 bg-amber-400/10'
                            : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'
                        }`}
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-sm border border-white/20"
                          style={{ backgroundColor: o.color ?? OBSTACLE_DEFAULT_COLOR[o.type] }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-slate-100">
                            {o.name ?? o.id}
                          </span>
                          <span className="block truncate font-mono text-[10px] text-slate-500">
                            {w} × {d} × {h} mm
                          </span>
                        </span>
                        <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                          {o.type}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Layout actions */}
          <section>
            <SectionTitle>Layout</SectionTitle>
            <div className="space-y-2">
              <div>
                <div className="mb-1 text-[11px] text-slate-400">Snap assembly to room</div>
                <div className="flex gap-1.5">
                  <ActionButton disabled={!hasAssembly} onClick={() => onSnap('floor')}>
                    Floor
                  </ActionButton>
                  <ActionButton disabled={!hasAssembly} onClick={() => onSnap('center')}>
                    Center
                  </ActionButton>
                  <ActionButton disabled={!hasAssembly} onClick={() => onSnap('corner')}>
                    Corner
                  </ActionButton>
                </div>
              </div>
              <div>
                <div className="mb-1 truncate text-[11px] text-slate-400">
                  Dock to furniture
                  <span className="text-slate-500">
                    {' '}
                    ·{' '}
                    {dockTarget ? `target: ${dockTarget.name ?? dockTarget.id}` : 'no furniture available'}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <ActionButton disabled={!hasAssembly || !dockTarget} onClick={() => onDock('top')}>
                    Top
                  </ActionButton>
                  <ActionButton disabled={!hasAssembly || !dockTarget} onClick={() => onDock('front')}>
                    Front
                  </ActionButton>
                  <ActionButton disabled={!hasAssembly || !dockTarget} onClick={() => onDock('side')}>
                    Side
                  </ActionButton>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  Select an obstacle in the list or 3D view to dock onto it. Actions rewrite voxel
                  coordinates in the DSL and re-verify.
                </p>
              </div>
            </div>
          </section>

          {/* Guides */}
          <section>
            <SectionTitle>View guides</SectionTitle>
            <div className="flex gap-1.5">
              <GuideToggle
                label="Room bounds"
                on={guides.roomBounds}
                onClick={() => onToggleGuide('roomBounds')}
              />
              <GuideToggle
                label="Obstacles"
                on={guides.obstacles}
                onClick={() => onToggleGuide('obstacles')}
              />
              <GuideToggle label="Grid" on={guides.grid} onClick={() => onToggleGuide('grid')} />
            </div>
            <div className="mt-1.5 flex">
              <ActionButton onClick={onFit}>Fit camera to assembly</ActionButton>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
