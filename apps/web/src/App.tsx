import React, { useCallback, useEffect, useState } from 'react';
import {
  compileToIR,
  createDefaultRegistry,
  dockToFurniture,
  GALLERY_HANDHELD_CONSOLE,
  GALLERY_ITEMS,
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

  // Canvas overlays
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
  }, []);

  // Switch Gallery Item
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
      // Find voxel definition and replace its coordinate: voxel <id> @ (x, y, z)
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#080c14] text-slate-100">
      {/* =========================================================================
          LEFT COLUMN (~65% width): 3D Three.js Simulator Canvas & Compact Top Bar
          ========================================================================= */}
      <section className="relative flex h-full w-[65%] flex-col border-r border-slate-800">
        {/* Compact Top Bar */}
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
          onToggleRoomBounds={() => setShowRoomBounds(!showRoomBounds)}
          showObstacles={showObstacles}
          onToggleObstacles={() => setShowObstacles(!showObstacles)}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid(!showGrid)}
        />

        {/* 3D Canvas Viewport */}
        <div className="relative flex-1 overflow-hidden">
          <SimulatorCanvas
            ir={ir}
            room={roomEnvironment}
            visualMode={visualMode}
            selectedVoxelId={selectedVoxelId}
            selectedObstacleId={selectedObstacleId}
            showRoomBounds={showRoomBounds}
            showObstacles={showObstacles}
            showGrid={showGrid}
            onSelectVoxel={(id) => {
              setSelectedVoxelId(id);
              if (id) setSelectedObstacleId(null);
            }}
            onSelectObstacle={(id) => {
              setSelectedObstacleId(id);
              if (id) setSelectedVoxelId(null);
            }}
            cameraTrigger={cameraTrigger}
          />

          {/* Mode Pill Indicator in top-right of 3D canvas */}
          <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/80 px-3 py-1.5 text-xs font-mono backdrop-blur-md">
            <span className="text-slate-400">Mode:</span>
            <span
              className={`font-bold ${
                visualMode === 'Assembly'
                  ? 'text-cyan-400'
                  : visualMode === 'Thermal'
                  ? 'text-red-400'
                  : 'text-purple-400'
              }`}
            >
              {visualMode.toUpperCase()}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">{ir?.voxels.length ?? 0} cubes</span>
          </div>

          {/* Bottom Canvas Status Bar */}
          <div className="absolute bottom-0 left-0 right-0 flex h-8 items-center justify-between border-t border-slate-800/80 bg-[#0a0f1d]/90 px-4 text-[11px] text-slate-400 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <span>
                Room:{' '}
                <strong className="text-slate-300">
                  {roomEnvironment.name || roomEnvironment.id || 'Custom'}
                </strong>{' '}
                ({roomEnvironment.dimensionsMm.x} × {roomEnvironment.dimensionsMm.y} ×{' '}
                {roomEnvironment.dimensionsMm.z} mm)
              </span>
              <span>
                Obstacles:{' '}
                <strong className="text-slate-300">
                  {roomEnvironment.obstacles.length}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-3 font-mono">
              {selectedVoxelId ? (
                <span className="text-cyan-400">
                  Selected Voxel: <strong>{selectedVoxelId}</strong>
                </span>
              ) : selectedObstacleId ? (
                <span className="text-amber-400">
                  Selected Obstacle: <strong>{selectedObstacleId}</strong>
                </span>
              ) : (
                <span className="text-slate-500">Click a voxel or obstacle to inspect</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          RIGHT COLUMN (~35% width): Docked Sidebar split cleanly into two panels:
            1. Top (~50% height): Hardware DSL Editor + Compile & Verify button
            2. Bottom (~50% height): 5-Gate Verification Report
          ========================================================================= */}
      <aside className="flex h-full w-[35%] flex-col bg-[#0b101c]">
        {/* Panel 1 (Top): DSL Code Editor */}
        <div className="h-[48%] min-h-[220px]">
          <CodeEditorPanel
            code={dslCode}
            onChangeCode={setDslCode}
            onCompile={() => handleCompile(dslCode, roomEnvironment)}
            isCompiling={isCompiling}
            compileError={compileError}
            voxelCount={ir?.voxels.length ?? 0}
          />
        </div>

        {/* Panel 2 (Bottom): 5-Gate Verification Report */}
        <div className="h-[52%] min-h-[260px] flex-1 border-t border-slate-800">
          <VerificationPanel
            result={verificationResult}
            ir={ir}
            selectedVoxelId={selectedVoxelId}
            onSelectVoxel={setSelectedVoxelId}
          />
        </div>
      </aside>

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
