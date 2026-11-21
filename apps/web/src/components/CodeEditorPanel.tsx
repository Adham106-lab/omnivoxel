import React, { useRef } from 'react';

interface CodeEditorPanelProps {
  code: string;
  onChangeCode: (newCode: string) => void;
  onCompile: () => void;
  isCompiling: boolean;
  compileError: string | null;
  voxelCount: number;
}

const QUICK_SNIPPETS = [
  {
    label: '+ GPU',
    accent: 'text-indigo-300 hover:border-indigo-500/70 hover:text-indigo-200',
    snippet: `voxel gpu_node @ (0, 0, 0) {\n  type: "vox.compute.gpu-module"\n  role: "compute-core"\n}`,
  },
  {
    label: '+ OLED',
    accent: 'text-sky-300 hover:border-sky-500/70 hover:text-sky-200',
    snippet: `voxel display_unit @ (0, 1, 0) {\n  type: "vox.display.oled-6in"\n  role: "screen"\n}`,
  },
  {
    label: '+ Battery',
    accent: 'text-emerald-300 hover:border-emerald-500/70 hover:text-emerald-200',
    snippet: `voxel battery_pack @ (0, -1, 0) {\n  type: "vox.power.pd-100w"\n  role: "power"\n}`,
  },
  {
    label: '+ Heatsink',
    accent: 'text-slate-200 hover:border-slate-500 hover:text-white',
    snippet: `voxel heatsink @ (1, 0, 0) {\n  type: "vox.struct.alu-150"\n  role: "cooling"\n}`,
  },
];

export const CodeEditorPanel: React.FC<CodeEditorPanelProps> = ({
  code,
  onChangeCode,
  onCompile,
  isCompiling,
  compileError,
  voxelCount,
}) => {
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const lineCount = code.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      onChangeCode(newCode);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onCompile();
    }
  };

  const insertSnippet = (snippet: string) => {
    onChangeCode(code.trimEnd() + '\n\n' + snippet);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0c121f]">
      {/* Clean Non-Overlapping Panel Header */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-slate-800/90 bg-[#0f1729] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-xs font-semibold tracking-wide text-slate-100">
            Hardware DSL
          </h2>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-slate-400">
            {voxelCount} {voxelCount === 1 ? 'voxel' : 'voxels'}
          </span>
        </div>

        <button
          type="button"
          onClick={onCompile}
          disabled={isCompiling}
          title="Compile DSL and run 5-gate verification (Ctrl/Cmd + Enter)"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50"
        >
          {isCompiling ? (
            <span>Verifying…</span>
          ) : (
            <>
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Compile &amp; Verify</span>
            </>
          )}
        </button>
      </div>

      {/* Single Compact Row of Quick Insert Chips */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-800/70 bg-[#0a101d] px-4 py-1.5">
        <span className="shrink-0 whitespace-nowrap pr-1 text-[11px] text-slate-500">
          Insert:
        </span>
        {QUICK_SNIPPETS.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => insertSnippet(item.snippet)}
            className={`shrink-0 whitespace-nowrap rounded border border-slate-800 bg-[#10182b] px-2 py-0.5 text-[11px] font-medium transition-colors ${item.accent}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Internally Scrollable Editor Area with Synced Line Numbers */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden font-mono text-xs">
        <div
          ref={lineNumbersRef}
          aria-hidden="true"
          className="select-none overflow-hidden border-r border-slate-800/80 bg-[#090e19] px-3 py-2.5 text-right text-[11px] tabular-nums text-slate-600"
        >
          {lineNumbers.map((num) => (
            <div key={num} className="leading-5">
              {num}
            </div>
          ))}
        </div>

        <textarea
          value={code}
          onChange={(e) => onChangeCode(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          aria-label="Hardware DSL source code"
          className="min-h-0 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2.5 leading-5 text-slate-200 outline-none selection:bg-sky-900/50"
          placeholder="Define OmniVoxel assembly modules here..."
        />
      </div>

      {/* Compilation Error Footer */}
      {compileError && (
        <div className="flex shrink-0 items-start gap-2 border-t border-rose-900/60 bg-rose-950/40 px-4 py-2 text-xs text-rose-200">
          <span className="shrink-0 font-mono text-[10px] font-semibold uppercase text-rose-400">
            Error
          </span>
          <div className="min-w-0 flex-1 whitespace-pre-wrap font-mono text-[11px] leading-snug">
            {compileError}
          </div>
        </div>
      )}
    </div>
  );
};
