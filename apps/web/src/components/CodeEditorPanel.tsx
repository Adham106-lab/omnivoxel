import React from 'react';

interface CodeEditorPanelProps {
  code: string;
  onChangeCode: (newCode: string) => void;
  onCompile: () => void;
  isCompiling: boolean;
  compileError: string | null;
  voxelCount: number;
}

export const CodeEditorPanel: React.FC<CodeEditorPanelProps> = ({
  code,
  onChangeCode,
  onCompile,
  isCompiling,
  compileError,
  voxelCount,
}) => {
  const lineCount = code.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Support Tab indent
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
    // Ctrl/Cmd + Enter compiles
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onCompile();
    }
  };

  const insertSnippet = (snippet: string) => {
    onChangeCode(code.trimEnd() + '\n\n' + snippet);
  };

  return (
    <div className="flex h-full flex-col border-b border-slate-800 bg-[#0c121e]">
      {/* Editor Header */}
      <div className="flex h-11 items-center justify-between border-b border-slate-800 px-3.5 py-1.5 bg-[#0f1728]">
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 text-cyan-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Hardware DSL Editor
          </span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-cyan-400">
            {voxelCount} voxels
          </span>
        </div>

        {/* Compile Button */}
        <button
          onClick={onCompile}
          disabled={isCompiling}
          title="Compile DSL and execute 5-gate deterministic verifier (Ctrl+Enter)"
          className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-cyan-600/20 transition hover:from-cyan-500 hover:to-blue-500 active:scale-95 disabled:opacity-50"
        >
          {isCompiling ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Verifying...</span>
            </>
          ) : (
            <>
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Compile & Verify</span>
              <kbd className="hidden rounded bg-cyan-800/40 px-1 py-0.2 text-[9px] font-mono text-cyan-200 sm:inline-block">
                ⌘↵
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Quick Snippet Bar */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800/60 bg-[#0a0f1a] px-3 py-1 text-[10px] text-slate-400">
        <span className="text-slate-500 pr-1">Insert:</span>
        <button
          onClick={() =>
            insertSnippet(
              `voxel gpu_node @ (0, 0, 0) {\n  type: "vox.compute.gpu-module"\n  role: "compute-core"\n}`
            )
          }
          className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-indigo-300 hover:border-indigo-600 hover:text-white"
        >
          + GPU (35W)
        </button>
        <button
          onClick={() =>
            insertSnippet(
              `voxel display_unit @ (0, 1, 0) {\n  type: "vox.display.oled-6in"\n  role: "screen"\n}`
            )
          }
          className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-cyan-300 hover:border-cyan-600 hover:text-white"
        >
          + OLED 6"
        </button>
        <button
          onClick={() =>
            insertSnippet(
              `voxel battery_pack @ (0, -1, 0) {\n  type: "vox.power.pd-100w"\n  role: "power"\n}`
            )
          }
          className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-emerald-300 hover:border-emerald-600 hover:text-white"
        >
          + Battery 100W
        </button>
        <button
          onClick={() =>
            insertSnippet(
              `voxel heatsink @ (1, 0, 0) {\n  type: "vox.struct.alu-150"\n  role: "cooling"\n}`
            )
          }
          className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-slate-300 hover:border-slate-600 hover:text-white"
        >
          + Heatsink (12W)
        </button>
        <button
          onClick={() =>
            insertSnippet(
              `voxel actuator_cube @ (0, 0, 1) {\n  type: "vox.actuated.em-60"\n  role: "pivot-joint"\n}`
            )
          }
          className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-amber-300 hover:border-amber-600 hover:text-white"
        >
          + Actuator
        </button>
      </div>

      {/* Code Text Area with Line Numbers */}
      <div className="relative flex flex-1 overflow-hidden font-mono text-xs">
        {/* Line Numbers */}
        <div className="select-none bg-[#090e18] px-2.5 py-2 text-right font-mono text-[11px] text-slate-600 border-r border-slate-800/80">
          {lineNumbers.map((num) => (
            <div key={num} className="leading-5">
              {num}
            </div>
          ))}
        </div>

        {/* Text Area */}
        <textarea
          value={code}
          onChange={(e) => onChangeCode(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className="flex-1 resize-none bg-transparent p-2 leading-5 text-slate-200 outline-none selection:bg-cyan-900/50"
          placeholder="// Enter OmniVoxel assembly DSL here..."
        />
      </div>

      {/* Compilation Error Alert */}
      {compileError && (
        <div className="flex items-start gap-2 border-t border-rose-900/50 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
          <svg
            className="h-4 w-4 shrink-0 text-rose-400 mt-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="flex-1 font-mono text-[11px] leading-tight whitespace-pre-wrap">
            {compileError}
          </div>
        </div>
      )}
    </div>
  );
};
