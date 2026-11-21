import React, { useEffect, useRef, useState } from 'react';
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

const VISUAL_MODES: VisualMode[] = ['Assembly', 'Thermal', 'Bus'];

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="relative z-30 flex h-14 w-full shrink-0 items-center justify-between gap-6 border-b border-slate-800/90 bg-[#0b1120] px-5">
      {/* Left Zone: Brand & Gallery Preset Selector */}
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-cyan-600 text-slate-950">
            <svg
              className="h-4 w-4 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <span className="whitespace-nowrap text-sm font-bold tracking-[0.08em] text-slate-100">
            OMNIVOXEL
          </span>
        </div>

        <div className="h-5 w-px shrink-0 bg-slate-800" />

        <div className="flex min-w-0 items-center gap-2">
          <label
            htmlFor="gallery-preset-select"
            className="shrink-0 whitespace-nowrap text-xs font-medium text-slate-400"
          >
            Preset
          </label>
          <select
            id="gallery-preset-select"
            value={currentGalleryId}
            onChange={(e) => {
              const item = GALLERY_ITEMS.find((g) => g.id === e.target.value);
              if (item) onSelectGallery(item);
            }}
            className="w-56 max-w-[260px] truncate rounded-md border border-slate-700/80 bg-[#10182b] px-2.5 py-1.5 text-xs font-medium text-slate-100 outline-none transition-colors hover:border-slate-600 focus:border-sky-500"
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

      {/* Center Zone: View Mode Segmented Control */}
      <nav
        aria-label="3D Visualization Mode"
        className="flex shrink-0 items-center rounded-lg border border-slate-800 bg-[#070b14] p-0.5"
      >
        {VISUAL_MODES.map((mode) => {
          const isActive = visualMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeVisualMode(mode)}
              className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? mode === 'Thermal'
                    ? 'bg-orange-500/20 text-orange-300 ring-1 ring-inset ring-orange-500/40'
                    : mode === 'Bus'
                    ? 'bg-violet-500/20 text-violet-300 ring-1 ring-inset ring-violet-500/40'
                    : 'bg-sky-500/20 text-sky-300 ring-1 ring-inset ring-sky-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode}
            </button>
          );
        })}
      </nav>

      {/* Right Zone: Room Scan & Layout Actions Dropdown */}
      <div ref={menuContainerRef} className="relative flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className={`flex items-center gap-2 whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            menuOpen
              ? 'border-sky-500/60 bg-sky-950/50 text-sky-200'
              : 'border-slate-700/80 bg-[#10182b] text-slate-200 hover:border-slate-600 hover:text-white'
          }`}
        >
          <svg
            className="h-3.5 w-3.5 text-sky-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
          </svg>
          <span>Room &amp; Layout</span>
          <svg
            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
              menuOpen ? 'rotate-180' : ''
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-lg border border-slate-700/90 bg-[#0e1628] p-2 shadow-2xl"
          >
            {/* Placement & Room Scan Actions */}
            <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium text-slate-400">
              Room Scan &amp; Placement
            </div>
            <div className="space-y-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenRoomScan();
                }}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs font-medium text-sky-300 transition-colors hover:bg-slate-800/80"
              >
                <span>Edit Room Scan JSON</span>
                <span className="font-mono text-[10px] text-slate-500">Modal</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onSnapToRoom();
                }}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs text-slate-200 transition-colors hover:bg-slate-800/80"
              >
                <span>Snap Assembly to Floor</span>
                <span className="font-mono text-[10px] text-slate-500">Z = 0</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDockToFurniture();
                }}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs text-slate-200 transition-colors hover:bg-slate-800/80"
              >
                <span>Dock Assembly on Desk</span>
                <span className="font-mono text-[10px] text-slate-500">Surface</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onResetCamera();
                }}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs text-slate-200 transition-colors hover:bg-slate-800/80"
              >
                <span>Fit Camera to Assembly</span>
                <span className="font-mono text-[10px] text-slate-500">Reset</span>
              </button>
            </div>

            <div className="my-2 h-px bg-slate-800" />

            {/* Viewport Guide Layers */}
            <div className="px-2 pb-1.5 text-[11px] font-medium text-slate-400">
              Viewport Guides
            </div>
            <div className="space-y-1">
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={showRoomBounds}
                onClick={onToggleRoomBounds}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs text-slate-200 transition-colors hover:bg-slate-800/80"
              >
                <span>Room Bounds Wireframe</span>
                <span
                  className={`font-mono text-[11px] ${
                    showRoomBounds ? 'text-sky-400' : 'text-slate-500'
                  }`}
                >
                  {showRoomBounds ? 'On' : 'Off'}
                </span>
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={showObstacles}
                onClick={onToggleObstacles}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs text-slate-200 transition-colors hover:bg-slate-800/80"
              >
                <span>Furniture &amp; Obstacles</span>
                <span
                  className={`font-mono text-[11px] ${
                    showObstacles ? 'text-sky-400' : 'text-slate-500'
                  }`}
                >
                  {showObstacles ? 'On' : 'Off'}
                </span>
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={showGrid}
                onClick={onToggleGrid}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs text-slate-200 transition-colors hover:bg-slate-800/80"
              >
                <span>Floor Grid</span>
                <span
                  className={`font-mono text-[11px] ${
                    showGrid ? 'text-sky-400' : 'text-slate-500'
                  }`}
                >
                  {showGrid ? 'On' : 'Off'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
