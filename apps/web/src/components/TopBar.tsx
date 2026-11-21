import React from 'react';
import { GALLERY_ITEMS, GalleryItem } from '@omnivoxel/core';
import { VisualMode } from '../types';

interface TopBarProps {
  currentGalleryId: string;
  onSelectGallery: (item: GalleryItem) => void;
  visualMode: VisualMode;
  onChangeVisualMode: (mode: VisualMode) => void;
  onOpenRoomScan: () => void;
  onSnapToRoom: () => void;
  onDockToFurniture: () => void;
  onResetCamera: () => void;
  showRoomBounds: boolean;
  onToggleRoomBounds: () => void;
  showObstacles: boolean;
  onToggleObstacles: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentGalleryId,
  onSelectGallery,
  visualMode,
  onChangeVisualMode,
  onOpenRoomScan,
  onSnapToRoom,
  onDockToFurniture,
  onResetCamera,
  showRoomBounds,
  onToggleRoomBounds,
  showObstacles,
  onToggleObstacles,
  showGrid,
  onToggleGrid,
}) => {
  return (
    <div className="flex h-14 w-full items-center justify-between border-b border-slate-800 bg-[#0d1424] px-4 py-2 text-xs">
      {/* Left: Brand & Gallery Selector */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-bold tracking-tight text-white">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-md shadow-cyan-500/20">
            <svg
              className="h-4 w-4 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </div>
          <span className="text-sm">OMNIVOXEL</span>
        </div>

        <div className="h-4 w-[1px] bg-slate-800" />

        {/* Gallery Dropdown */}
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-medium text-slate-400">Gallery:</label>
          <select
            value={currentGalleryId}
            onChange={(e) => {
              const item = GALLERY_ITEMS.find((g) => g.id === e.target.value);
              if (item) onSelectGallery(item);
            }}
            className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-100 outline-none transition focus:border-cyan-500 hover:border-slate-600"
          >
            <optgroup label="Modular Devices">
              {GALLERY_ITEMS.filter((g) => g.category === 'device').map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Room & Furniture Setups">
              {GALLERY_ITEMS.filter((g) => g.category === 'setup').map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      {/* Center: Visual Mode Tabs */}
      <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5">
        {(['Assembly', 'Thermal', 'Bus'] as VisualMode[]).map((mode) => {
          const isActive = visualMode === mode;
          return (
            <button
              key={mode}
              onClick={() => onChangeVisualMode(mode)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode === 'Assembly' && (
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              )}
              {mode === 'Thermal' && (
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              )}
              {mode === 'Bus' && (
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
              )}
              {mode}
            </button>
          );
        })}
      </div>

      {/* Right: Layout Helpers & Room Scan Controls */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900/80 p-0.5">
          <button
            onClick={onSnapToRoom}
            title="Snap voxels onto room floor / bounds"
            className="rounded px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-slate-800 hover:text-cyan-400"
          >
            Snap Floor
          </button>
          <button
            onClick={onDockToFurniture}
            title="Dock voxels on top of furniture surface"
            className="rounded px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-slate-800 hover:text-cyan-400"
          >
            Dock Desk
          </button>
        </div>

        <button
          onClick={onOpenRoomScan}
          className="flex items-center gap-1.5 rounded-md border border-cyan-800/40 bg-cyan-950/30 px-2.5 py-1 text-xs font-medium text-cyan-300 transition hover:bg-cyan-900/40 hover:border-cyan-600"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
          </svg>
          Room Scan JSON
        </button>

        <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
          <button
            onClick={onResetCamera}
            title="Reset 3D Camera"
            className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>

          <button
            onClick={onToggleRoomBounds}
            title={`Room bounds: ${showRoomBounds ? 'Visible' : 'Hidden'}`}
            className={`rounded px-1.5 py-0.5 text-[10px] font-mono border transition ${
              showRoomBounds
                ? 'border-cyan-600/50 bg-cyan-950/40 text-cyan-300'
                : 'border-slate-800 text-slate-500'
            }`}
          >
            BOX
          </button>

          <button
            onClick={onToggleObstacles}
            title={`Obstacles: ${showObstacles ? 'Visible' : 'Hidden'}`}
            className={`rounded px-1.5 py-0.5 text-[10px] font-mono border transition ${
              showObstacles
                ? 'border-amber-600/50 bg-amber-950/40 text-amber-300'
                : 'border-slate-800 text-slate-500'
            }`}
          >
            OBST
          </button>

          <button
            onClick={onToggleGrid}
            title={`Grid: ${showGrid ? 'Visible' : 'Hidden'}`}
            className={`rounded px-1.5 py-0.5 text-[10px] font-mono border transition ${
              showGrid
                ? 'border-blue-600/50 bg-blue-950/40 text-blue-300'
                : 'border-slate-800 text-slate-500'
            }`}
          >
            GRID
          </button>
        </div>
      </div>
    </div>
  );
};
