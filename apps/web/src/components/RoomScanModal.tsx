import React, { useState } from 'react';
import { EnvironmentObstacle, ObstacleType, RoomEnvironment } from '@omnivoxel/core';

interface RoomScanModalProps {
  room: RoomEnvironment;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedRoom: RoomEnvironment) => void;
}

export const RoomScanModal: React.FC<RoomScanModalProps> = ({
  room,
  isOpen,
  onClose,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<'visual' | 'json'>('visual');
  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(room, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Visual editing state
  const [dimX, setDimX] = useState(room.dimensionsMm.x);
  const [dimY, setDimY] = useState(room.dimensionsMm.y);
  const [dimZ, setDimZ] = useState(room.dimensionsMm.z);
  const [obstacles, setObstacles] = useState<EnvironmentObstacle[]>(room.obstacles);

  // Sync state when room opens
  React.useEffect(() => {
    setDimX(room.dimensionsMm.x);
    setDimY(room.dimensionsMm.y);
    setDimZ(room.dimensionsMm.z);
    setObstacles(room.obstacles);
    setJsonText(JSON.stringify(room, null, 2));
    setJsonError(null);
  }, [room, isOpen]);

  if (!isOpen) return null;

  const handleSaveJson = () => {
    try {
      const parsed = JSON.parse(jsonText) as RoomEnvironment;
      if (!parsed.dimensionsMm || !Array.isArray(parsed.obstacles)) {
        throw new Error('RoomEnvironment must have dimensionsMm and obstacles array.');
      }
      onSave(parsed);
      onClose();
    } catch (err: any) {
      setJsonError(err.message || 'Invalid JSON syntax');
    }
  };

  const handleSaveVisual = () => {
    const updated: RoomEnvironment = {
      ...room,
      dimensionsMm: { x: Number(dimX), y: Number(dimY), z: Number(dimZ) },
      obstacles,
    };
    onSave(updated);
    onClose();
  };

  const handleAddObstacle = () => {
    const newObst: EnvironmentObstacle = {
      id: `obstacle-${Date.now().toString().slice(-4)}`,
      name: 'New Obstacle',
      type: 'furniture',
      boundsMinMm: { x: 500, y: 500, z: 0 },
      boundsMaxMm: { x: 1500, y: 1200, z: 750 },
      isFixed: true,
      color: '#64748b',
    };
    setObstacles([...obstacles, newObst]);
  };

  const handleUpdateObstacle = (index: number, partial: Partial<EnvironmentObstacle>) => {
    const next = [...obstacles];
    next[index] = { ...next[index], ...partial };
    setObstacles(next);
  };

  const handleDeleteObstacle = (index: number) => {
    setObstacles(obstacles.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="flex h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-slate-700 bg-[#0f172a] shadow-2xl overflow-hidden text-xs">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#0a0f1d] px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-950 border border-cyan-500/40 text-cyan-400">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Scanned Room Environment & Obstacles</h2>
              <p className="text-[11px] text-slate-400">Configure room boundary volumes, wall clearances, and furniture obstacles</p>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900 p-0.5">
            <button
              onClick={() => setActiveTab('visual')}
              className={`rounded px-3 py-1 text-xs font-medium transition ${
                activeTab === 'visual' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Visual Dimensions
            </button>
            <button
              onClick={() => {
                setActiveTab('json');
                setJsonText(
                  JSON.stringify(
                    {
                      ...room,
                      dimensionsMm: { x: Number(dimX), y: Number(dimY), z: Number(dimZ) },
                      obstacles,
                    },
                    null,
                    2
                  )
                );
              }}
              className={`rounded px-3 py-1 text-xs font-medium transition ${
                activeTab === 'json' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Raw JSON
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'visual' ? (
            <div className="space-y-5">
              {/* Room Dimensions */}
              <div className="rounded-lg border border-slate-800 bg-[#090d18] p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                  Room Dimensions (Millimeters)
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">X Width (mm):</label>
                    <input
                      type="number"
                      value={dimX}
                      onChange={(e) => setDimX(Number(e.target.value))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-slate-200 focus:border-cyan-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Y Depth (mm):</label>
                    <input
                      type="number"
                      value={dimY}
                      onChange={(e) => setDimY(Number(e.target.value))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-slate-200 focus:border-cyan-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Z Height (mm):</label>
                    <input
                      type="number"
                      value={dimZ}
                      onChange={(e) => setDimZ(Number(e.target.value))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-slate-200 focus:border-cyan-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Obstacles List */}
              <div className="rounded-lg border border-slate-800 bg-[#090d18] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Obstacles & Furniture ({obstacles.length})
                  </h3>
                  <button
                    onClick={handleAddObstacle}
                    className="flex items-center gap-1 rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-cyan-300 hover:bg-slate-700"
                  >
                    + Add Obstacle
                  </button>
                </div>

                <div className="space-y-3">
                  {obstacles.map((obst, i) => (
                    <div
                      key={obst.id}
                      className="rounded-md border border-slate-800/80 bg-slate-900/60 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={obst.name || obst.id}
                            onChange={(e) => handleUpdateObstacle(i, { name: e.target.value })}
                            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 font-semibold text-slate-200 outline-none"
                            placeholder="Name"
                          />
                          <select
                            value={obst.type}
                            onChange={(e) =>
                              handleUpdateObstacle(i, { type: e.target.value as ObstacleType })
                            }
                            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-300 outline-none"
                          >
                            <option value="furniture">Furniture</option>
                            <option value="wall">Wall</option>
                            <option value="appliance">Appliance</option>
                          </select>
                          <label className="flex items-center gap-1 text-[11px] text-slate-400">
                            <input
                              type="checkbox"
                              checked={obst.isFixed}
                              onChange={(e) => handleUpdateObstacle(i, { isFixed: e.target.checked })}
                              className="rounded border-slate-700 bg-slate-900"
                            />
                            Fixed Collision
                          </label>
                        </div>
                        <button
                          onClick={() => handleDeleteObstacle(i)}
                          className="rounded p-1 text-slate-500 hover:text-rose-400 transition"
                          title="Delete Obstacle"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Bounds inputs */}
                      <div className="grid grid-cols-2 gap-3 text-[11px]">
                        <div>
                          <span className="text-slate-500 block mb-0.5 font-mono">Min (X, Y, Z) mm:</span>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={obst.boundsMinMm.x}
                              onChange={(e) =>
                                handleUpdateObstacle(i, {
                                  boundsMinMm: { ...obst.boundsMinMm, x: Number(e.target.value) },
                                })
                              }
                              className="w-full rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 font-mono text-slate-300"
                            />
                            <input
                              type="number"
                              value={obst.boundsMinMm.y}
                              onChange={(e) =>
                                handleUpdateObstacle(i, {
                                  boundsMinMm: { ...obst.boundsMinMm, y: Number(e.target.value) },
                                })
                              }
                              className="w-full rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 font-mono text-slate-300"
                            />
                            <input
                              type="number"
                              value={obst.boundsMinMm.z}
                              onChange={(e) =>
                                handleUpdateObstacle(i, {
                                  boundsMinMm: { ...obst.boundsMinMm, z: Number(e.target.value) },
                                })
                              }
                              className="w-full rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 font-mono text-slate-300"
                            />
                          </div>
                        </div>

                        <div>
                          <span className="text-slate-500 block mb-0.5 font-mono">Max (X, Y, Z) mm:</span>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={obst.boundsMaxMm.x}
                              onChange={(e) =>
                                handleUpdateObstacle(i, {
                                  boundsMaxMm: { ...obst.boundsMaxMm, x: Number(e.target.value) },
                                })
                              }
                              className="w-full rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 font-mono text-slate-300"
                            />
                            <input
                              type="number"
                              value={obst.boundsMaxMm.y}
                              onChange={(e) =>
                                handleUpdateObstacle(i, {
                                  boundsMaxMm: { ...obst.boundsMaxMm, y: Number(e.target.value) },
                                })
                              }
                              className="w-full rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 font-mono text-slate-300"
                            />
                            <input
                              type="number"
                              value={obst.boundsMaxMm.z}
                              onChange={(e) =>
                                handleUpdateObstacle(i, {
                                  boundsMaxMm: { ...obst.boundsMaxMm, z: Number(e.target.value) },
                                })
                              }
                              className="w-full rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 font-mono text-slate-300"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col space-y-2">
              <textarea
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  setJsonError(null);
                }}
                className="h-96 w-full flex-1 rounded-md border border-slate-800 bg-[#080d1a] p-3 font-mono text-xs text-slate-200 outline-none selection:bg-cyan-900/50"
              />
              {jsonError && (
                <div className="rounded border border-rose-800 bg-rose-950/40 p-2 text-rose-300 font-mono text-[11px]">
                  {jsonError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-800 bg-[#0a0f1d] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-800 px-4 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={activeTab === 'visual' ? handleSaveVisual : handleSaveJson}
            className="rounded-md bg-cyan-600 px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-cyan-600/20 hover:bg-cyan-500"
          >
            Apply & Re-Verify
          </button>
        </div>
      </div>
    </div>
  );
};
