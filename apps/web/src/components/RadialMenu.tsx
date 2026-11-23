import React, { useEffect, useState } from 'react';
import type { VoxelCategory } from '@omnivoxel/core';
import { CATEGORY_STYLE } from '../lib/theme';
import { CloseIcon } from './icons';

export interface RadialSwapOption {
  manifestId: string;
  label: string;
  category: VoxelCategory;
}

export const RADIAL_SWAP_OPTIONS: readonly RadialSwapOption[] = [
  { manifestId: 'vox.struct.alu-150', label: 'Truss', category: 'structural' },
  { manifestId: 'vox.actuated.em-60', label: 'Pivot', category: 'actuated' },
  { manifestId: 'vox.compute.arm-soc', label: 'ARM SoC', category: 'compute' },
  { manifestId: 'vox.display.oled-6in', label: 'OLED', category: 'display' },
  { manifestId: 'vox.storage.nvme-bay', label: 'NVMe', category: 'storage' },
  { manifestId: 'vox.power.pd-100w', label: 'Power', category: 'power' },
] as const;

export interface RadialMenuAnchor {
  voxelId: string;
  currentManifestId: string;
  x: number;
  y: number;
}

interface RadialMenuProps {
  anchor: RadialMenuAnchor;
  bounds: { width: number; height: number };
  onSwapType: (voxelId: string, manifestId: string) => void;
  onAddNeighbor: (voxelId: string, manifestId: string) => void;
  onDelete: (voxelId: string) => void;
  onClose: () => void;
}

const WHEEL_SIZE = 224;
const CENTER = WHEEL_SIZE / 2;
const INNER_R = 34;
const OUTER_R = 82;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** SVG annular sector path between `startDeg` and `endDeg` (0° = 12 o'clock, clockwise). */
function wedgePath(rIn: number, rOut: number, startDeg: number, endDeg: number): string {
  const [x1, y1] = polarToCartesian(CENTER, CENTER, rOut, startDeg);
  const [x2, y2] = polarToCartesian(CENTER, CENTER, rOut, endDeg);
  const [x3, y3] = polarToCartesian(CENTER, CENTER, rIn, endDeg);
  const [x4, y4] = polarToCartesian(CENTER, CENTER, rIn, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/**
 * Non-blocking circular Radial Menu anchored near the selected voxel's projected
 * 2D screen coordinates (strictly clamped within the viewport container).
 */
export const RadialMenu: React.FC<RadialMenuProps> = ({
  anchor,
  bounds,
  onSwapType,
  onAddNeighbor,
  onDelete,
  onClose,
}) => {
  const [swapOpen, setSwapOpen] = useState(false);

  // Reset sub-ring when switching target voxel
  useEffect(() => {
    setSwapOpen(false);
  }, [anchor.voxelId]);

  // Dismiss cleanly on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pad = swapOpen ? 148 : 118;
  const cx = Math.min(Math.max(anchor.x, pad), Math.max(pad, bounds.width - pad));
  const cy = Math.min(Math.max(anchor.y, pad), Math.max(pad, bounds.height - pad));

  const wedges: ReadonlyArray<{
    id: 'add' | 'swap' | 'delete';
    label: string;
    sub: string;
    startDeg: number;
    endDeg: number;
    labelDeg: number;
    fillClass: string;
    activeClass?: string;
    onClick: () => void;
  }> = [
    {
      id: 'add',
      label: '+ Neighbor',
      sub: 'Attach cell',
      startDeg: -56,
      endDeg: 56,
      labelDeg: 0,
      fillClass: 'fill-slate-900/90 stroke-sky-500/45 hover:fill-sky-950/95 hover:stroke-sky-400',
      onClick: () => {
        onAddNeighbor(anchor.voxelId, anchor.currentManifestId);
        onClose();
      },
    },
    {
      id: 'swap',
      label: 'Swap Type',
      sub: swapOpen ? 'Pick module' : '6 modules',
      startDeg: 64,
      endDeg: 176,
      labelDeg: 120,
      fillClass: swapOpen
        ? 'fill-sky-950/95 stroke-sky-400'
        : 'fill-slate-900/90 stroke-slate-600/80 hover:fill-slate-800/95 hover:stroke-sky-400',
      onClick: () => setSwapOpen((v) => !v),
    },
    {
      id: 'delete',
      label: 'Delete',
      sub: 'Unlatch',
      startDeg: 184,
      endDeg: 296,
      labelDeg: 240,
      fillClass: 'fill-slate-900/90 stroke-rose-500/45 hover:fill-rose-950/90 hover:stroke-rose-400',
      onClick: () => {
        onDelete(anchor.voxelId);
        onClose();
      },
    },
  ];

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30"
      role="menu"
      aria-label={`Voxel actions for ${anchor.voxelId}`}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          left: cx - WHEEL_SIZE / 2,
          top: cy - WHEEL_SIZE / 2,
          width: WHEEL_SIZE,
          height: WHEEL_SIZE,
        }}
      >
        <svg
          width={WHEEL_SIZE}
          height={WHEEL_SIZE}
          viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
          className="overflow-visible drop-shadow-[0_10px_28px_rgba(2,6,23,0.78)]"
        >
          {wedges.map((w) => {
            const [lx, ly] = polarToCartesian(CENTER, CENTER, (INNER_R + OUTER_R) / 2 + 1, w.labelDeg);
            return (
              <g
                key={w.id}
                role="menuitem"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  w.onClick();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    w.onClick();
                  }
                }}
                className="pointer-events-auto cursor-pointer outline-none"
              >
                <path
                  d={wedgePath(INNER_R, OUTER_R, w.startDeg, w.endDeg)}
                  strokeWidth={1.25}
                  className={`transition-colors ${w.fillClass}`}
                />
                <text
                  x={lx}
                  y={ly - 3}
                  textAnchor="middle"
                  className="pointer-events-none select-none fill-slate-100 text-[10.5px] font-semibold"
                >
                  {w.label}
                </text>
                <text
                  x={lx}
                  y={ly + 9}
                  textAnchor="middle"
                  className="pointer-events-none select-none fill-slate-400 text-[8.5px]"
                >
                  {w.sub}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Center voxel hub + dismiss button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title="Close radial menu (Esc)"
          aria-label="Close radial menu"
          className="pointer-events-auto absolute left-1/2 top-1/2 flex h-[60px] w-[60px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-sky-400/50 bg-[#0b1020]/95 px-1 text-center shadow-lg hover:border-sky-300"
        >
          <span className="max-w-[50px] truncate font-mono text-[9.5px] font-semibold text-sky-200">
            {anchor.voxelId}
          </span>
          <CloseIcon className="mt-0.5 h-3 w-3 text-slate-400" />
        </button>

        {/* Outer module-type arc when Swap Type is active */}
        {swapOpen && (
          <div className="pointer-events-none absolute inset-0">
            {RADIAL_SWAP_OPTIONS.map((opt, idx) => {
              // Fan neatly along the right-bottom arc (45°..195°) so it stays compact and readable
              const angleDeg = 42 + idx * 30;
              const [ox, oy] = polarToCartesian(CENTER, CENTER, OUTER_R + 34, angleDeg);
              const active = opt.manifestId === anchor.currentManifestId;
              return (
                <button
                  key={opt.manifestId}
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSwapType(anchor.voxelId, opt.manifestId);
                    onClose();
                  }}
                  style={{ left: ox, top: oy }}
                  className={`pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-[10.5px] font-medium shadow-xl backdrop-blur transition-colors ${
                    active
                      ? 'border-sky-400 bg-sky-950/95 text-sky-100'
                      : 'border-slate-700/90 bg-[#0b1020]/95 text-slate-200 hover:border-sky-400 hover:bg-slate-800'
                  }`}
                >
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-sm"
                    style={{ backgroundColor: CATEGORY_STYLE[opt.category].css }}
                  />
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
