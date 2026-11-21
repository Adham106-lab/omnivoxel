import React, { useCallback, useEffect, useState } from 'react';
import {
  compileToIR,
  createDefaultRegistry,
  dockToFurniture,
  GALLERY_HANDHELD_CONSOLE,
  GalleryItem,
  parseDSL,
  RoomEnvironment,
  snapToRoom,
  verifyAssembly,
  VerifierResult,
  VoxelIR,
} from '@omnivoxel/core';
import { CodeEditorPanel } from './components/CodeEditorPanel';
import { RoomScanModal } from './components/RoomScanModal';
import { SimulatorCanvas } from './components/SimulatorCanvas';
import { TopBar } from './components/TopBar';
import { VerificationPanel } from './components/VerificationPanel';
import { VisualMode } from './types';

const registry = createDefaultRegistry();

export const App: React.FC = () => {
  // Gallery selection
  const [selectedGallery, setSelectedGallery] = useState<GalleryItem>(
    GALLERY_HANDHELD_CONSOLE
  );

  // Core assembly & verification state
  const [dslCode, setDslCode] = useState<string>(GALLERY_HANDHELD_CONSOLE.dsl);
  const [roomEnvironment, setRoomEnvironment] = useState<RoomEnvironment>(
    GALLERY_HANDHELD_CONSOLE.roomEnvironment
  );
  const [ir, setIr] = useState<VoxelIR | null>(null);
  const [verificationResult, setVerificationResult] =
    useState<VerifierResult | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);

  // Visual settings & modes
  const [visualMode, setVisualMode] = useState<VisualMode>('Assembly');
  const [selectedVoxelId, setSelectedVoxelId] = useState<string | null>(null);
  const [selectedObstacleId, setSelectedObstacleId] = useState<string | null>(null);
  const [cameraTrigger, setCameraTrigger] = useState<number>(0);

  // Canvas guide toggles
  const [showRoomBounds, setShowRoomBounds] = useState<boolean>(true);
  const [showObstacles, setShowObstacles] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // Modal
  const [isRoomScanOpen, setIsRoomScanOpen] = useState<boolean>(false);

  // Compile & Verify execution logic
  const handleCompile = useCallback(
    (codeToCompile: string, roomToVerify: RoomEnvironment) => {
      setIsCompiling(true);
      setCompileError(null);

      try {
        const ast = parseDSL(codeToCompile);
        const compiledIr = compileToIR(ast, registry);
        const result = verifyAssembly(compiledIr, roomToVerify);

        setIr(compiledIr);
        setVerificationResult(result);
      } catch (err: any) {
        setCompileError(err.message || 'Compilation failed due to syntax error');
        setVerificationResult(null);
      } finally {
        setIsCompiling(false);
      }
    },
    []
  );

  // Initial compilation on mount
  useEffect(() => {
    handleCompile(dslCode, roomEnvironment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch Gallery Item and auto-fit camera to new assembly
  const handleSelectGallery = (item: GalleryItem) => {
    setSelectedGallery(item);
    setDslCode(item.dsl);
    setRoomEnvironment(item.roomEnvironment);
    setSelectedVoxelId(null);
    setSelectedObstacleId(null);
    handleCompile(item.dsl, item.roomEnvironment);
    setCameraTrigger((prev) => prev + 1);
  };

  // Helper to re-serialize transformed IR voxels into DSL code
  const updateDslCoordinates = (transformedIr: VoxelIR, baseDsl: string): string => {
    let updated = baseDsl;
    for (const v of transformedIr.voxels) {
      const regex = new RegExp(`voxel\\s+${v.id}\\s+@\\s*\\([-\\d\\s,]+\\)`, 'g');
      updated = updated.replace(
        regex,
        `voxel ${v.id} @ (${v.coord.x}, ${v.coord.y}, ${v.coord.z})`
      );
    }
    return updated;
  };

  // Snap to Room Floor Placement
  const handleSnapToRoom = () => {
    if (!ir) return;
    const placement = snapToRoom(ir, roomEnvironment, { alignment: 'floor' });
    const newDsl = updateDslCoordinates(placement.transformedIr, dslCode);
    setDslCode(newDsl);
    handleCompile(newDsl, roomEnvironment);
    setCameraTrigger((prev) => prev + 1);
  };

  // Dock to Furniture Placement
  const handleDockToFurniture = () => {
    if (!ir) return;
    const desk =
      roomEnvironment.obstacles.find((o) => o.type === 'furniture') ||
      roomEnvironment.obstacles[0];
    if (!desk) return;

    const placement = dockToFurniture(ir, desk, { alignment: 'top' });
    const newDsl = updateDslCoordinates(placement.transformedIr, dslCode);
    setDslCode(newDsl);
    handleCompile(newDsl, roomEnvironment);
    setCameraTrigger((prev) => prev + 1);
  };

  const handleSelectVoxel = useCallback((id: string | null) => {
    setSelectedVoxelId(id);
    if (id) setSelectedObstacleId(null);
  }, []);

  const handleSelectObstacle = useCallback((id: string | null) => {
    setSelectedObstacleId(id);
    if (id) setSelectedVoxelId(null);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#080c14] text-slate-100">
      {/* Single Full-Width Top Bar */}
      <TopBar
        currentGalleryId={selectedGallery.id}
        onSelectGallery={handleSelectGallery}
        visualMode={visualMode}
        onChangeVisualMode={setVisualMode}
        onOpenRoomScan={() => setIsRoomScanOpen(true)}
        onSnapToRoom={handleSnapToRoom}
        onDockToFurniture={handleDockToFurniture}
        onResetCamera={() => setCameraTrigger((prev) => prev + 1)}
        showRoomBounds={showRoomBounds}
        onToggleRoomBounds={() => setShowRoomBounds((v) => !v)}
        showObstacles={showObstacles}
        onToggleObstacles={() => setShowObstacles((v) => !v)}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((v) => !v)}
      />

      {/* Clean 2-Column Workspace: Left (~62%) 3D Viewport | Right (~38%) DSL + 5-Gate */}
      <main className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Column (~62%): 3D Viewport + Minimal Status Bar */}
        <section className="flex min-h-0 min-w-0 w-[62%] flex-col bg-[#090e1a]">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <SimulatorCanvas
              ir={ir}
              room={roomEnvironment}
              visualMode={visualMode}
              selectedVoxelId={selectedVoxelId}
              selectedObstacleId={selectedObstacleId}
              showRoomBounds={showRoomBounds}
              showObstacles={showObstacles}
              showGrid={showGrid}
              onSelectVoxel={handleSelectVoxel}
              onSelectObstacle={handleSelectObstacle}
              cameraTrigger={cameraTrigger}
            />
          </div>

          {/* Minimal Bottom Status Bar */}
          <footer className="flex h-8 shrink-0 items-center justify-between gap-4 border-t border-slate-800/90 bg-[#0b1120] px-4 text-[11px] text-slate-400">
            <div className="min-w-0 truncate">
              <span className="text-slate-500">Room: </span>
              <span className="font-medium text-slate-200">
                {roomEnvironment.name || roomEnvironment.id || 'Custom'}
              </span>
              <span className="mx-1.5 text-slate-600">·</span>
              <span className="font-mono tabular-nums text-slate-400">
                {roomEnvironment.dimensionsMm.x} × {roomEnvironment.dimensionsMm.y} ×{' '}
                {roomEnvironment.dimensionsMm.z} mm
              </span>
            </div>

            <div className="shrink-0 whitespace-nowrap font-mono">
              {selectedVoxelId ? (
                <span className="text-sky-400">
                  Voxel: <strong className="font-semibold">{selectedVoxelId}</strong>
                </span>
              ) : selectedObstacleId ? (
                <span className="text-amber-400">
                  Obstacle: <strong className="font-semibold">{selectedObstacleId}</strong>
                </span>
              ) : (
                <span className="text-slate-500">Click a voxel to inspect</span>
              )}
            </div>
          </footer>
        </section>

        {/* Right Column (~38%): Stacked DSL Editor (top) & 5-Gate Verification (bottom) */}
        <aside className="flex min-h-0 w-[38%] min-w-[360px] flex-col border-l border-slate-800/90 bg-[#0b101c]">
          <div className="min-h-0 h-[46%] border-b border-slate-800/90">
            <CodeEditorPanel
              code={dslCode}
              onChangeCode={setDslCode}
              onCompile={() => handleCompile(dslCode, roomEnvironment)}
              isCompiling={isCompiling}
              compileError={compileError}
              voxelCount={ir?.voxels.length ?? 0}
            />
          </div>

          <div className="min-h-0 flex-1">
            <VerificationPanel
              result={verificationResult}
              ir={ir}
              selectedVoxelId={selectedVoxelId}
              onSelectVoxel={handleSelectVoxel}
            />
          </div>
        </aside>
      </main>

      {/* Room Scan JSON & Dimensions Editor Modal */}
      <RoomScanModal
        room={roomEnvironment}
        isOpen={isRoomScanOpen}
        onClose={() => setIsRoomScanOpen(false)}
        onSave={(updatedRoom) => {
          setRoomEnvironment(updatedRoom);
          handleCompile(dslCode, updatedRoom);
        }}
      />
    </div>
  );
};
