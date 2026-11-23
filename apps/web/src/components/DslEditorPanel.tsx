import React, { useMemo, useRef } from 'react';
import type { CompileFailure } from '../types';
import { QUICK_INSERTS, type QuickInsertKey } from '../lib/layout';
import { AlertIcon, PlayIcon } from './icons';

interface DslEditorPanelProps {
  value: string;
  voxelCount: number;
  dirty: boolean;
  failure: CompileFailure | null;
  onChange: (value: string) => void;
  onCompile: () => void;
  onQuickInsert: (key: QuickInsertKey) => void;
}

const LINE_HEIGHT_PX = 20; // keep in sync with leading-5 on gutter + textarea

export const DslEditorPanel: React.FC<DslEditorPanelProps> = ({
  value,
  voxelCount,
  dirty,
  failure,
  onChange,
  onCompile,
  onQuickInsert,
}) => {
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lineCount = useMemo(() => value.split('\n').length, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onCompile();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        const t = textareaRef.current;
        if (t) t.selectionStart = t.selectionEnd = start + 2;
      });
    }
  };

  const handleInsert = (key: QuickInsertKey) => {
    onQuickInsert(key);
    // Jump to the bottom so the new declaration is visible
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (t) {
        t.scrollTop = t.scrollHeight;
        if (gutterRef.current) gutterRef.current.scrollTop = t.scrollTop;
      }
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#0f172a]">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-[12px] font-semibold text-slate-100">Hardware DSL</h2>
          <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-300">
            {voxelCount} voxel{voxelCount === 1 ? '' : 's'}
          </span>
          {dirty && (
            <span
              className="flex shrink-0 items-center gap-1 text-[10px] text-amber-300"
              title="Edited since the last compile"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="hidden sm:inline">modified</span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onCompile}
          title="Compile & Verify (Ctrl/⌘ + Enter)"
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-sky-500 px-3 text-[12px] font-semibold text-slate-950 hover:bg-sky-400 active:bg-sky-500"
        >
          <PlayIcon className="h-3 w-3" />
          Compile &amp; Verify
        </button>
      </div>

      {/* Quick insert chips */}
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-800/80 px-2.5">
        <span className="mr-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Insert
        </span>
        {QUICK_INSERTS.map((q) => (
          <button
            key={q.key}
            type="button"
            title={q.title}
            onClick={() => handleInsert(q.key)}
            className="h-6 shrink-0 rounded-full border border-slate-700 bg-slate-800/60 px-2 font-mono text-[10.5px] text-slate-200 hover:border-sky-500/60 hover:text-sky-200"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#0a0f1c]">
        <div
          ref={gutterRef}
          aria-hidden
          className="w-10 shrink-0 select-none overflow-hidden border-r border-slate-800/80 bg-[#0b1120] pb-4 pr-2 pt-2 text-right font-mono text-[11px] leading-5 text-slate-600"
        >
          {Array.from({ length: lineCount }, (_, i) => {
            const n = i + 1;
            const isError = failure?.line === n;
            return (
              <div
                key={n}
                style={{ height: LINE_HEIGHT_PX }}
                className={isError ? 'font-semibold text-rose-400' : undefined}
              >
                {n}
              </div>
            );
          })}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          aria-label="Hardware DSL source"
          className="h-full min-w-0 flex-1 resize-none select-text overflow-auto bg-transparent px-3 pb-4 pt-2 font-mono text-[12px] leading-5 text-slate-200 caret-sky-400 outline-none"
        />
      </div>

      {/* Compile error */}
      {failure && (
        <div
          role="alert"
          className="flex max-h-20 shrink-0 gap-2 overflow-y-auto border-t border-rose-900/60 bg-rose-950/40 px-3 py-1.5 text-[11px] leading-snug text-rose-200"
        >
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
          <span className="min-w-0 break-words">{failure.message}</span>
        </div>
      )}
    </section>
  );
};
