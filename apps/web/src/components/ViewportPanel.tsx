import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getGalleryItem,
  type Coord3D,
  type GalleryItem,
  type RoomEnvironment,
  type VoxelIR,
} from '@omnivoxel/core';
import type { Guides, IssueSeverity, Selection, VisualMode } from '../types';
import type { VoxelThermal } from '../lib/thermal';
import { THERMAL_GRADIENT_CSS } from '../lib/thermal';
import {
  STRESS_GRADIENT_CSS,
  type PhysicsAnalysis,
  type PhysicsSummary,
  type VoxelPhysics,
} from '../lib/physics';
import { BUS_COLORS, CATEGORY_ORDER, CATEGORY_STYLE } from '../lib/theme';
import { planAssembly } from '../lib/assembly';
import {
  MORPH_CYCLE_IDS,
  planMorph,
  type MorphPlan,
  type MorphPresetId,
} from '../lib/morph';
import { useAssemblyPlayback } from '../lib/useAssemblyPlayback';
import { AssemblyPlaybar } from './AssemblyPlaybar';
import { RadialMenu, type RadialMenuAnchor } from './RadialMenu';
import { SceneCanvas, type MorphPlayback } from './SceneCanvas';
import { CloseIcon, FitIcon } from './icons';

interface ViewportPanelProps {
  galleryId: string;
  ir: VoxelIR | null;
  room: RoomEnvironment;
  mode: VisualMode;
  selection: Selection;
  issues: Map<string, IssueSeverity>;
  thermal: Map<string, VoxelThermal>;
  physics: PhysicsAnalysis;
  guides: Guides;
  cameraTrigger: number;
  notice: string | null;
  onSelect: (selection: Selection) => void;
  onFit: () => void;
  /** Applies a lattice move (DSL rewrite → recompile → 5-gate verify). Returns true if applied. */
  onMoveVoxel: (id: string, coord: Coord3D) => boolean;
  /** Radial Menu actions (immediate DSL rewrite → recompile → 5-gate verify). */
  onSwapVoxelType: (id: string, manifestId: string) => void;
  onAddNeighbor: (anchorId: string, manifestId: string) => void;
  onDeleteVoxel: (id: string) => void;
  /** Commits target furniture preset once a live Morph reconfiguration completes. */
  onCommitMorphPreset: (item: GalleryItem) => void;
}

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
);

// ------------------------------------------------------------------ selection chip

const SelectionChip: React.FC<{
  ir: VoxelIR | null;
  room: RoomEnvironment;
  mode: VisualMode;
  selection: NonNullable<Selection>;
  thermal: Map<string, VoxelThermal>;
  physics: Map<string, VoxelPhysics>;
  canOpenRadial: boolean;
  onOpenRadial: () => void;
  onClear: () => void;
}> = ({ ir, room, mode, selection, thermal, physics, canOpenRadial, onOpenRadial, onClear }) => {
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
    const phys = physics.get(voxel.id);
    title = voxel.id;
    name = CATEGORY_STYLE[m.category].label;
    detail =
      mode === 'Physics' && phys
        ? [
            `(${voxel.coord.x}, ${voxel.coord.y}, ${voxel.coord.z})`,
            `${phys.stressMpa.toFixed(1)} MPa`,
            `${phys.displacementMm.toFixed(2)} mm disp`,
            `${phys.forceN.toFixed(0)} N`,
            phys.isSupport ? 'grounded support' : `${phys.supportHops} hops to support`,
          ].join('  ·  ')
        : [
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
      {canOpenRadial && (
        <button
          type="button"
          onClick={onOpenRadial}
          title="Open voxel radial actions (or right-click any voxel)"
          className="h-6 shrink-0 rounded border border-sky-500/40 bg-sky-500/15 px-2 text-[10.5px] font-medium text-sky-200 hover:border-sky-400 hover:bg-sky-500/25 hover:text-white"
        >
          Radial
        </button>
      )}
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

// ------------------------------------------------------------------------ nudge pad

const NUDGES: ReadonlyArray<{ label: string; axis: 'x' | 'y' | 'z'; delta: 1 | -1; hint: string }> = [
  { label: '−X', axis: 'x', delta: -1, hint: '←' },
  { label: '+X', axis: 'x', delta: 1, hint: '→' },
  { label: '−Y', axis: 'y', delta: -1, hint: '↓' },
  { label: '+Y', axis: 'y', delta: 1, hint: '↑' },
  { label: '−Z', axis: 'z', delta: -1, hint: 'PgDn' },
  { label: '+Z', axis: 'z', delta: 1, hint: 'PgUp' },
];

const AXIS_TEXT: Record<'x' | 'y' | 'z', string> = {
  x: 'text-red-300',
  y: 'text-emerald-300',
  z: 'text-sky-300',
};

const NudgePad: React.FC<{ onNudge: (axis: 'x' | 'y' | 'z', delta: 1 | -1) => void }> = ({ onNudge }) => (
  <div className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-slate-700/80 bg-[#0b1020]/90 px-1.5 py-1 shadow-lg backdrop-blur">
    <span className="mr-0.5 text-[10px] uppercase tracking-wide text-slate-500">Move</span>
    {NUDGES.map((n) => (
      <button
        key={n.label}
        type="button"
        onClick={() => onNudge(n.axis, n.delta)}
        title={`Move one cell ${n.label} (${n.hint}) — or drag an axis arrow in the view`}
        className={`h-5 min-w-[1.6rem] rounded border border-slate-700/80 px-1 font-mono text-[10px] hover:border-slate-500 hover:bg-slate-800 ${AXIS_TEXT[n.axis]}`}
      >
        {n.label}
      </button>
    ))}
  </div>
);

// ------------------------------------------------------------------ physics summary

const PhysicsSummaryBar: React.FC<{ summary: PhysicsSummary }> = ({ summary }) => {
  const sfTone =
    summary.safetyFactor >= 2.0
      ? 'text-emerald-300'
      : summary.safetyFactor >= 1.2
        ? 'text-amber-300'
        : 'text-rose-400';

  return (
    <div
      className="pointer-events-none flex items-center gap-4 rounded-md border border-slate-700/80 bg-[#0b1020]/90 px-3 py-1.5 shadow-lg backdrop-blur"
      aria-label="Physics simulation results summary"
    >
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
          Max Displacement
        </div>
        <div className="font-mono text-[12px] font-semibold tabular-nums text-sky-200">
          {summary.maxDisplacementMm.toFixed(2)} mm
        </div>
      </div>
      <div className="h-6 w-px bg-slate-800" />
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
          Max Stress
        </div>
        <div className="font-mono text-[12px] font-semibold tabular-nums text-amber-300">
          {summary.maxStressMpa.toFixed(1)} MPa
        </div>
      </div>
      <div className="h-6 w-px bg-slate-800" />
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
          Safety Factor
        </div>
        <div className={`font-mono text-[12px] font-semibold tabular-nums ${sfTone}`}>
          {summary.safetyFactor.toFixed(1)}×
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------ legend

const Legend: React.FC<{ mode: VisualMode; physicsSummary: PhysicsSummary }> = ({
  mode,
  physicsSummary,
}) => {
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
          <li className="col-span-2 mt-0.5 flex items-center gap-3 whitespace-nowrap border-t border-slate-800 pt-1 text-slate-400">
            <span className="flex items-center gap-1.5">
              <Dot color={BUS_COLORS.control.css} /> Control link
            </span>
            <span className="flex items-center gap-1.5">
              <Dot color={BUS_COLORS.highSpeed.css} /> High-speed
            </span>
            <span className="flex items-center gap-1.5">
              <Dot color="#fbbf24" /> Pivot axis
            </span>
          </li>
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

      {mode === 'Physics' && (
        <div className="w-48">
          <div className="mb-1 text-slate-400">Cuboctahedron Truss Stress (von Mises)</div>
          <div className="h-2 rounded-full" style={{ background: STRESS_GRADIENT_CSS }} />
          <div className="mt-0.5 flex justify-between font-mono text-[9px] text-slate-500">
            <span>0 MPa</span>
            <span>{(physicsSummary.maxStressMpa * 0.5).toFixed(1)}</span>
            <span>{physicsSummary.maxStressMpa.toFixed(1)} MPa</span>
          </div>
        </div>
      )}
    </div>
  );
};

const MORPH_LABELS: Record<MorphPresetId, string> = {
  'voxel-chair': 'Chair',
  'voxel-table': 'Table',
  'voxel-couch': 'Couch',
};

// ------------------------------------------------------------------------ panel

export const ViewportPanel: React.FC<ViewportPanelProps> = ({
  galleryId,
  ir,
  room,
  mode,
  selection,
  issues,
  thermal,
  physics,
  guides,
  cameraTrigger,
  notice,
  onSelect,
  onFit,
  onMoveVoxel,
  onSwapVoxelType,
  onAddNeighbor,
  onDeleteVoxel,
  onCommitMorphPreset,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const projectVoxelRef = useRef<((id: string) => { x: number; y: number } | null) | null>(null);
  const [stageBounds, setStageBounds] = useState({ width: 800, height: 600 });
  const [radialAnchor, setRadialAnchor] = useState<RadialMenuAnchor | null>(null);

  // Live Chair ↔ Table ↔ Couch morph state
  const [activeMorph, setActiveMorph] = useState<{
    plan: MorphPlan;
    targetItem: GalleryItem;
    progress: number;
  } | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStageBounds({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Dismiss radial menu & cancel active morph if the preset or voxel set changes externally
  useEffect(() => {
    setRadialAnchor(null);
  }, [galleryId]);

  useEffect(() => {
    if (radialAnchor && (!ir || !ir.voxelMap.has(radialAnchor.voxelId))) {
      setRadialAnchor(null);
    }
  }, [ir, radialAnchor]);

  const plan = useMemo(() => (ir && ir.voxels.length > 0 ? planAssembly(ir) : null), [ir]);
  const playback = useAssemblyPlayback(plan?.steps.length ?? 0);
  const assembly = useMemo(() => ({ plan, progress: playback.progress }), [plan, playback.progress]);

  // Animate active morph smoothly (Launch → Surface Traversal → 90° Pivot → Catch)
  const activeMorphTarget = activeMorph?.targetItem ?? null;
  const activeMorphSteps = activeMorph?.plan.steps.length ?? 0;

  useEffect(() => {
    if (!activeMorphTarget) return;
    if (activeMorphSteps === 0) {
      setActiveMorph(null);
      onCommitMorphPreset(activeMorphTarget);
      onFit();
      return;
    }

    let raf = 0;
    let last = performance.now();
    let progress = 0;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      progress += dt * 1.9;
      if (progress >= activeMorphSteps) {
        setActiveMorph(null);
        onCommitMorphPreset(activeMorphTarget);
        onFit();
        return;
      }
      setActiveMorph((prev) => (prev ? { ...prev, progress } : null));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [activeMorphTarget, activeMorphSteps, onCommitMorphPreset, onFit]);

  const morphPlayback: MorphPlayback | null = useMemo(
    () => (activeMorph ? { plan: activeMorph.plan, progress: activeMorph.progress } : null),
    [activeMorph]
  );

  // Editing is only offered on the finished lattice (not mid-assembly or mid-morph)
  const selectedVoxel = selection?.kind === 'voxel' ? ir?.getVoxel(selection.id) ?? null : null;
  const editable = playback.complete && !activeMorph && selectedVoxel !== null;

  const canMorphFurniture =
    playback.complete &&
    ir !== null &&
    ir.voxels.length === 12 &&
    (MORPH_CYCLE_IDS as readonly string[]).includes(galleryId);

  const startMorphTo = useCallback(
    (targetId: MorphPresetId) => {
      if (!ir || targetId === galleryId || activeMorph) return;
      const targetItem = getGalleryItem(targetId);
      if (!targetItem) return;
      const { ir: targetIr } = targetItem.compile();
      if (targetIr.voxels.length !== ir.voxels.length) {
        onCommitMorphPreset(targetItem);
        return;
      }
      setRadialAnchor(null);
      onSelect(null);
      const morphPlan = planMorph(ir, targetIr, galleryId, targetId);
      setActiveMorph({ plan: morphPlan, targetItem, progress: 0 });
    },
    [ir, galleryId, activeMorph, onCommitMorphPreset, onSelect]
  );

  const nudge = (axis: 'x' | 'y' | 'z', delta: 1 | -1) => {
    if (!selectedVoxel) return;
    onMoveVoxel(selectedVoxel.id, { ...selectedVoxel.coord, [axis]: selectedVoxel.coord[axis] + delta });
  };

  const handleOpenRadialForVoxel = useCallback(
    (voxelId: string, x: number, y: number) => {
      if (!playback.complete || activeMorph) return;
      const voxel = ir?.getVoxel(voxelId);
      if (!voxel) return;
      setRadialAnchor({ voxelId, currentManifestId: voxel.manifest.id, x, y });
    },
    [ir, playback.complete, activeMorph]
  );

  const handleOpenRadialFromChip = useCallback(() => {
    if (!selectedVoxel) return;
    const projected = projectVoxelRef.current?.(selectedVoxel.id);
    const x = projected ? projected.x : stageBounds.width * 0.5;
    const y = projected ? projected.y : stageBounds.height * 0.45;
    setRadialAnchor({
      voxelId: selectedVoxel.id,
      currentManifestId: selectedVoxel.manifest.id,
      x,
      y,
    });
  }, [selectedVoxel, stageBounds.width, stageBounds.height]);

  const handleCanvasSelect = useCallback(
    (next: Selection) => {
      setRadialAnchor(null);
      onSelect(next);
    },
    [onSelect]
  );

  const handleOrbitStart = useCallback(() => {
    setRadialAnchor(null);
  }, []);

  // Keyboard nudging: ←/→ = X, ↓/↑ = Y, PgDn/PgUp = Z
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, ['x' | 'y' | 'z', 1 | -1]> = {
        ArrowLeft: ['x', -1],
        ArrowRight: ['x', 1],
        ArrowDown: ['y', -1],
        ArrowUp: ['y', 1],
        PageDown: ['z', -1],
        PageUp: ['z', 1],
      };
      const hit = map[e.key];
      if (!hit) return;
      e.preventDefault();
      nudge(hit[0], hit[1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editable, selectedVoxel]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[#090d16]">
      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden">
        <SceneCanvas
          ir={ir}
          room={room}
          mode={mode}
          selection={selection}
          issues={issues}
          thermal={thermal}
          physics={physics.byVoxel}
          guides={guides}
          cameraTrigger={cameraTrigger}
          assembly={assembly}
          morph={morphPlayback}
          editable={editable}
          onMoveVoxel={onMoveVoxel}
          onSelect={handleCanvasSelect}
          onContextMenuVoxel={handleOpenRadialForVoxel}
          onOrbitStart={handleOrbitStart}
          projectVoxelRef={projectVoxelRef}
        />

        {/* Top overlay row: selection chip (left) + morph controls & fit button (right). Never blocks canvas. */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            {selection && (
              <SelectionChip
                ir={ir}
                room={room}
                mode={mode}
                selection={selection}
                thermal={thermal}
                physics={physics.byVoxel}
                canOpenRadial={editable}
                onOpenRadial={handleOpenRadialFromChip}
                onClear={() => {
                  setRadialAnchor(null);
                  onSelect(null);
                }}
              />
            )}
            {editable && <NudgePad onNudge={nudge} />}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {(canMorphFurniture || activeMorph) && (
              <div
                className="pointer-events-auto flex h-7 items-center gap-1 rounded-md border border-slate-700/80 bg-[#0b1020]/90 px-1.5 shadow-lg backdrop-blur"
                role="group"
                aria-label="Morph furniture reconfiguration"
              >
                <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Morph
                </span>
                {MORPH_CYCLE_IDS.map((id) => {
                  const isCurrent = !activeMorph && id === galleryId;
                  const isTarget = activeMorph?.targetItem.id === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={isCurrent || Boolean(activeMorph)}
                      onClick={() => startMorphTo(id)}
                      title={`Reconfigure via pivoting & traversal into ${MORPH_LABELS[id]}`}
                      className={`h-5 rounded px-1.5 text-[10.5px] font-medium transition-colors ${
                        isTarget
                          ? 'bg-sky-500/30 text-sky-100 ring-1 ring-sky-400/70'
                          : isCurrent
                            ? 'bg-slate-800 text-slate-200'
                            : 'text-slate-400 hover:bg-slate-800/90 hover:text-sky-200 disabled:opacity-50'
                      }`}
                    >
                      {MORPH_LABELS[id]}
                    </button>
                  );
                })}
              </div>
            )}

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
        </div>

        {/* Non-blocking contextual Radial Menu anchored to selected/right-clicked voxel */}
        {radialAnchor && (
          <RadialMenu
            anchor={radialAnchor}
            bounds={stageBounds}
            onSwapType={onSwapVoxelType}
            onAddNeighbor={onAddNeighbor}
            onDelete={onDeleteVoxel}
            onClose={() => setRadialAnchor(null)}
          />
        )}

        {/* Bottom-left mode legend */}
        <div className="pointer-events-none absolute bottom-3 left-3">
          <Legend mode={mode} physicsSummary={physics.summary} />
        </div>

        {/* Bottom-right Physics FEA Simulation Results Summary (Physics mode only) */}
        {mode === 'Physics' && ir && ir.voxels.length > 0 && (
          <div className="pointer-events-none absolute bottom-3 right-3">
            <PhysicsSummaryBar summary={physics.summary} />
          </div>
        )}
      </div>

      {plan && <AssemblyPlaybar plan={plan} playback={playback} />}

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
          {activeMorph ? (
            <span className="font-mono text-sky-300">
              Morphing → {activeMorph.targetItem.name} (step{' '}
              {Math.min(activeMorph.plan.steps.length, Math.floor(activeMorph.progress) + 1)}/
              {activeMorph.plan.steps.length})
            </span>
          ) : notice ? (
            <span className="text-sky-300">{notice}</span>
          ) : (
            <span className="text-slate-500">
              {editable
                ? 'Right-click a voxel for Radial actions · drag axis arrows or press ←→↑↓ PgUp/PgDn to move'
                : 'Click to inspect · right-click any voxel for Radial menu'}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
};
