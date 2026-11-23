import React from 'react';
import { GALLERY_ITEMS, type GalleryItem } from '@omnivoxel/core';
import { usePopover } from '../lib/usePopover';
import { CheckIcon, ChevronDownIcon } from './icons';

interface GallerySelectProps {
  currentId: string;
  onSelect: (item: GalleryItem) => void;
}

const GROUPS: ReadonlyArray<{ category: GalleryItem['category']; label: string }> = [
  { category: 'device', label: 'Device assemblies' },
  { category: 'setup', label: 'Room & furniture setups' },
  { category: 'structural', label: 'Structural & furniture lattices' },
];

export const GallerySelect: React.FC<GallerySelectProps> = ({ currentId, onSelect }) => {
  const { open, toggle, close, ref } = usePopover<HTMLDivElement>();
  const current = GALLERY_ITEMS.find((g) => g.id === currentId);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-8 max-w-full items-center gap-2 rounded-md border border-slate-700/80 bg-slate-900/70 px-2.5 text-[12px] text-slate-200 hover:border-slate-500"
      >
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Preset
        </span>
        <span className="min-w-0 truncate font-medium">{current?.name ?? 'Custom assembly'}</span>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1.5 max-h-[calc(100vh-4rem)] w-[min(380px,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-slate-700 bg-[#0f172a] p-1.5 shadow-2xl"
        >
          {GROUPS.map((group) => {
            const items = GALLERY_ITEMS.filter((g) => g.category === group.category);
            return (
              <div key={group.category} className="mb-1 last:mb-0">
                <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {group.label}
                </div>
                {items.map((item) => {
                  const active = item.id === currentId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onSelect(item);
                        close();
                      }}
                      className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-800/80 ${
                        active ? 'bg-slate-800/60' : ''
                      }`}
                    >
                      <span className="mt-0.5 h-4 w-4 shrink-0 text-sky-400">
                        {active && <CheckIcon className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold text-slate-100">
                          {item.name}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-slate-400">
                          {item.description}
                        </span>
                        <span className="mt-1 block truncate text-[10px] text-slate-500">
                          {item.roomEnvironment.name} · {item.roomEnvironment.obstacles.length} obstacle
                          {item.roomEnvironment.obstacles.length === 1 ? '' : 's'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
