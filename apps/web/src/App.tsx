import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  compileToIR,
  createDefaultRegistry,
  DslParseError,
  dockToFurniture,
  GALLERY_HANDHELD_CONSOLE,
  parseDSL,
  snapToRoom,
  verifyAssembly,
  type DockToFurnitureOptions,
  type Coord3D,
  type EnvironmentObstacle,
  type GalleryItem,
  type PlacementResult,
  type RoomEnvironment,
  type SnapToRoomOptions,
  type VerifierResult,
  type VoxelIR,
} from '@omnivoxel/core';
import { DslEditorPanel } from './components/DslEditorPanel';
import { GallerySelect } from './components/GallerySelect';
import { RoomPopover } from './components/RoomPopover';
import { TopBar } from './components/TopBar';
import { VerificationInspector } from './components/VerificationInspector';
import { ViewportPanel } from './components/ViewportPanel';
import { buildIssueMap } from './lib/diagnostics';
import {
  addNeighborInDsl,
  deleteVoxelInDsl,
  insertQuickVoxel,
  isCellFree,
  moveVoxelInDsl,
  rewriteDslCoordinates,
  swapVoxelTypeInDsl,
  type QuickInsertKey,
} from './lib/layout';
import { analyzeThermal } from './lib/thermal';
import { analyzePhysics } from './lib/physics';
import type { CompileFailure, Guides, Selection, VisualMode } from './types';

const registry = createDefaultRegistry();

interface Compiled {
  ir: VoxelIR;
  result: VerifierResult;
}

/** DSL -> AST -> Voxel IR -> 5-gate verification. Throws on parse / compile errors. */
function compileSource(dsl: string, room: RoomEnvironment): Compiled {
  const ast = parseDSL(dsl);
  const ir = compileToIR(ast, registry);
  const result = verifyAssembly(ir, room);
  return { ir, result };
}

function toFailure(error: unknown): CompileFailure {
  if (error instanceof DslParseError) return { message: error.message, line: error.line };
  return { message: error instanceof Error ? error.message : String(error) };
}

const DEFAULT_ITEM = GALLERY_HANDHELD_CONSOLE;

export const App: React.FC = () => {
  // --- Document state ---------------------------------------------------------
  const [galleryId, setGalleryId] = useState<string>(DEFAULT_ITEM.id);
  const [dsl, setDsl] = useState<string>(DEFAULT_ITEM.dsl);
  const [compiledDsl, setCompiledDsl] = useState<string>(DEFAULT_ITEM.dsl);
  const [room, setRoom] = useState<RoomEnvironment>(DEFAULT_ITEM.roomEnvironment);
  const [compiled, setCompiled] = useState<Compiled | null>(() => {
    try {
      return compileSource(DEFAULT_ITEM.dsl, DEFAULT_ITEM.roomEnvironment);
    } catch {
      return null;
    }
  });
  const [failure, setFailure] = useState<CompileFailure | null>(null);

  // --- View state -------------------------------------------------------------
  const [mode, setMode] = useState<VisualMode>('Assembly');
  const [selection, setSelection] = useState<Selection>(null);
  const [guides, setGuides] = useState<Guides>({ roomBounds: true, obstacles: true, grid: true });
  const [cameraTrigger, setCameraTrigger] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const ir = compiled?.ir ?? null;
  const result = compiled?.result ?? null;

  // Always-current document snapshot, so rapid drag events never act on a stale render
  const latest = useRef({ dsl, compiled, room });
  latest.current = { dsl, compiled, room };

  // Derived data (memoised so the 3D scene only rebuilds when the IR / room changes)
  const issues = useMemo(() => buildIssueMap(result), [result]);
  const thermal = useMemo(() => (ir ? analyzeThermal(ir) : new Map()), [ir]);
  const physics = useMemo(
    () =>
      ir
        ? analyzePhysics(ir)
        : {
            byVoxel: new Map(),
            summary: {
              maxDisplacementMm: 0,
              maxStressMpa: 0,
              safetyFactor: 99,
              totalLoadN: 0,
              supportCount: 0,
            },
          },
    [ir]
  );

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(t);
  }, [notice]);

  const fitCamera = useCallback(() => setCameraTrigger((n) => n + 1), []);

  /** Applies a successful compile and drops selections that no longer exist. */
  const commit = useCallback((next: Compiled, source: string) => {
    setCompiled(next);
    setCompiledDsl(source);
    setFailure(null);
    setSelection((sel) =>
      sel?.kind === 'voxel' && !next.ir.voxelMap.has(sel.id) ? null : sel
    );
  }, []);

  // --- Compile & Verify -------------------------------------------------------
  const handleCompile = useCallback(() => {
    try {
      commit(compileSource(dsl, room), dsl);
    } catch (e) {
      setFailure(toFailure(e));
    }
  }, [dsl, room, commit]);

  // --- Gallery ---------------------------------------------------------------
  const handleSelectGallery = useCallback(
    (item: GalleryItem) => {
      setGalleryId(item.id);
      setDsl(item.dsl);
      setRoom(item.roomEnvironment);
      setSelection(null);
      try {
        commit(compileSource(item.dsl, item.roomEnvironment), item.dsl);
      } catch (e) {
        setFailure(toFailure(e));
      }
      fitCamera();
    },
    [commit, fitCamera]
  );

  // --- Room edits re-verify the current IR against the new room ---------------
  const handleRoomChange = useCallback(
    (nextRoom: RoomEnvironment) => {
      setRoom(nextRoom);
      setCompiled((prev) => (prev ? { ir: prev.ir, result: verifyAssembly(prev.ir, nextRoom) } : prev));
      setSelection((sel) =>
        sel?.kind === 'obstacle' && !nextRoom.obstacles.some((o) => o.id === sel.id) ? null : sel
      );
    },
    []
  );

  // --- Layout actions (snap / dock) ------------------------------------------
  const runPlacement = useCallback(
    (label: string, place: (base: VoxelIR) => PlacementResult) => {
      try {
        // Place against what is currently in the editor, not a stale compile
        const base = compileToIR(parseDSL(dsl), registry);
        const placement = place(base);
        const nextDsl = rewriteDslCoordinates(dsl, placement.transformedIr.voxels);
        const next = compileSource(nextDsl, room);
        setDsl(nextDsl);
        commit(next, nextDsl);
        fitCamera();
        const g = placement.gridOffset;
        setNotice(`${label} · moved (${g.x}, ${g.y}, ${g.z}) cells`);
      } catch (e) {
        setFailure(toFailure(e));
      }
    },
    [dsl, room, commit, fitCamera]
  );

  const handleSnap = useCallback(
    (alignment: NonNullable<SnapToRoomOptions['alignment']>) =>
      runPlacement(`Snapped to ${alignment}`, (base) => snapToRoom(base, room, { alignment })),
    [runPlacement, room]
  );

  /** Selected obstacle wins; otherwise the first furniture, then appliance. */
  const dockTarget: EnvironmentObstacle | undefined = useMemo(() => {
    if (selection?.kind === 'obstacle') {
      const picked = room.obstacles.find((o) => o.id === selection.id);
      if (picked) return picked;
    }
    return (
      room.obstacles.find((o) => o.type === 'furniture') ??
      room.obstacles.find((o) => o.type === 'appliance')
    );
  }, [room, selection]);

  const handleDock = useCallback(
    (alignment: NonNullable<DockToFurnitureOptions['alignment']>) => {
      if (!dockTarget) return;
      runPlacement(`Docked ${alignment} of ${dockTarget.name ?? dockTarget.id}`, (base) =>
        dockToFurniture(base, dockTarget, { alignment })
      );
    },
    [runPlacement, dockTarget]
  );

  // --- Interactive voxel move (axis-handle drag, nudge buttons, arrow keys) ----
  /**
   * Moves one voxel to a lattice cell: rewrites its DSL header, recompiles and re-runs
   * all five gates. Returns false (and leaves everything untouched) if the cell is taken.
   */
  const handleMoveVoxel = useCallback(
    (id: string, coord: Coord3D): boolean => {
      const { dsl: currentDsl, compiled: current, room: currentRoom } = latest.current;
      const voxel = current?.ir.getVoxel(id);
      if (!current || !voxel) return false;

      const c = voxel.coord;
      if (c.x === coord.x && c.y === coord.y && c.z === coord.z) return true;

      if (!isCellFree(current.ir, id, coord)) {
        setNotice(`Cell (${coord.x}, ${coord.y}, ${coord.z}) is occupied`);
        return false;
      }

      try {
        const nextDsl = moveVoxelInDsl(currentDsl, id, coord);
        const next = compileSource(nextDsl, currentRoom);
        latest.current = { dsl: nextDsl, compiled: next, room: currentRoom };
        setDsl(nextDsl);
        commit(next, nextDsl);
        const errors = next.result.errors.length;
        setNotice(
          `${id} → (${coord.x}, ${coord.y}, ${coord.z}) · ` +
            (errors === 0 ? 'all gates pass' : `${errors} gate error${errors === 1 ? '' : 's'}`)
        );
        return true;
      } catch (e) {
        setFailure(toFailure(e));
        return false;
      }
    },
    [commit]
  );

  // --- Radial Menu actions (immediate DSL rewrite → compile → 5-gate verify) --
  const handleSwapVoxelType = useCallback(
    (id: string, manifestId: string) => {
      const { dsl: currentDsl, room: currentRoom } = latest.current;
      const nextDsl = swapVoxelTypeInDsl(currentDsl, id, manifestId);
      if (nextDsl === currentDsl) return;
      try {
        const next = compileSource(nextDsl, currentRoom);
        latest.current = { dsl: nextDsl, compiled: next, room: currentRoom };
        setDsl(nextDsl);
        commit(next, nextDsl);
        const manifest = registry.get(manifestId);
        const errors = next.result.errors.length;
        setNotice(
          `${id} → ${manifest?.name ?? manifestId} · ` +
            (errors === 0 ? 'all gates pass' : `${errors} gate error${errors === 1 ? '' : 's'}`)
        );
      } catch (e) {
        setFailure(toFailure(e));
      }
    },
    [commit]
  );

  const handleAddNeighbor = useCallback(
    (anchorId: string, manifestId: string) => {
      const { dsl: currentDsl, room: currentRoom } = latest.current;
      const added = addNeighborInDsl(currentDsl, anchorId, manifestId, registry);
      if (!added) {
        setNotice(`No open neighbor face adjacent to ${anchorId}`);
        return;
      }
      try {
        const next = compileSource(added.dsl, currentRoom);
        latest.current = { dsl: added.dsl, compiled: next, room: currentRoom };
        setDsl(added.dsl);
        commit(next, added.dsl);
        setSelection({ kind: 'voxel', id: added.addedId });
        const errors = next.result.errors.length;
        setNotice(
          `Attached ${added.addedId} @ (${added.coord.x}, ${added.coord.y}, ${added.coord.z}) · ` +
            (errors === 0 ? 'all gates pass' : `${errors} gate error${errors === 1 ? '' : 's'}`)
        );
      } catch (e) {
        setFailure(toFailure(e));
      }
    },
    [commit]
  );

  const handleDeleteVoxel = useCallback(
    (id: string) => {
      const { dsl: currentDsl, compiled: current, room: currentRoom } = latest.current;
      if (!current || current.ir.voxels.length <= 1) {
        setNotice('Cannot remove the last voxel in the assembly');
        return;
      }
      const nextDsl = deleteVoxelInDsl(currentDsl, id);
      if (nextDsl === currentDsl) return;
      try {
        const next = compileSource(nextDsl, currentRoom);
        latest.current = { dsl: nextDsl, compiled: next, room: currentRoom };
        setDsl(nextDsl);
        commit(next, nextDsl);
        const errors = next.result.errors.length;
        setNotice(
          `Detached ${id} · ` +
            (errors === 0 ? 'all gates pass' : `${errors} gate error${errors === 1 ? '' : 's'}`)
        );
      } catch (e) {
        setFailure(toFailure(e));
      }
    },
    [commit]
  );

  /** Commits target furniture preset after live Morph reconfiguration finishes without camera jump. */
  const handleCommitMorphPreset = useCallback(
    (item: GalleryItem) => {
      setGalleryId(item.id);
      setDsl(item.dsl);
      setRoom(item.roomEnvironment);
      setSelection(null);
      try {
        const next = compileSource(item.dsl, item.roomEnvironment);
        latest.current = { dsl: item.dsl, compiled: next, room: item.roomEnvironment };
        commit(next, item.dsl);
        setNotice(`Reconfigured into ${item.name} · all gates pass`);
      } catch (e) {
        setFailure(toFailure(e));
      }
    },
    [commit]
  );

  // --- Editor helpers --------------------------------------------------------
  const handleQuickInsert = useCallback(
    (key: QuickInsertKey) => setDsl((current) => insertQuickVoxel(current, key, registry)),
    []
  );

  const handleSelect = useCallback((next: Selection) => setSelection(next), []);
  const handleSelectVoxel = useCallback((id: string) => setSelection({ kind: 'voxel', id }), []);
  const handleSelectObstacle = useCallback((id: string) => setSelection({ kind: 'obstacle', id }), []);
  const handleToggleGuide = useCallback(
    (key: keyof Guides) => setGuides((g) => ({ ...g, [key]: !g[key] })),
    []
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#090d16] text-slate-200">
      <TopBar
        mode={mode}
        onModeChange={setMode}
        left={<GallerySelect currentId={galleryId} onSelect={handleSelectGallery} />}
        right={
          <RoomPopover
            room={room}
            selection={selection}
            guides={guides}
            hasAssembly={ir !== null}
            dockTarget={dockTarget}
            onRoomChange={handleRoomChange}
            onToggleGuide={handleToggleGuide}
            onSnap={handleSnap}
            onDock={handleDock}
            onSelectObstacle={handleSelectObstacle}
            onFit={fitCamera}
          />
        }
      />

      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-12 lg:grid-rows-1">
        {/* Left: 3D viewport */}
        <section className="min-h-0 min-w-0 lg:col-span-7">
          <ViewportPanel
            galleryId={galleryId}
            ir={ir}
            room={room}
            mode={mode}
            selection={selection}
            issues={issues}
            thermal={thermal}
            physics={physics}
            guides={guides}
            cameraTrigger={cameraTrigger}
            notice={notice}
            onSelect={handleSelect}
            onFit={fitCamera}
            onMoveVoxel={handleMoveVoxel}
            onSwapVoxelType={handleSwapVoxelType}
            onAddNeighbor={handleAddNeighbor}
            onDeleteVoxel={handleDeleteVoxel}
            onCommitMorphPreset={handleCommitMorphPreset}
          />
        </section>

        {/* Right: DSL editor over verification inspector */}
        <aside className="flex min-h-0 min-w-0 flex-col gap-2 border-l border-slate-800 bg-[#0b1020] p-2 lg:col-span-5">
          <div className="min-h-0 basis-[42%]">
            <DslEditorPanel
              value={dsl}
              voxelCount={ir?.voxels.length ?? 0}
              dirty={dsl !== compiledDsl}
              failure={failure}
              onChange={setDsl}
              onCompile={handleCompile}
              onQuickInsert={handleQuickInsert}
            />
          </div>
          <div className="min-h-0 flex-1">
            <VerificationInspector
              result={result}
              ir={ir}
              room={room}
              failure={failure}
              selectedVoxelId={selection?.kind === 'voxel' ? selection.id : null}
              onSelectVoxel={handleSelectVoxel}
            />
          </div>
        </aside>
      </main>
    </div>
  );
};
