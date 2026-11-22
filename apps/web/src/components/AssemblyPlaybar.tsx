import React from 'react';
import { sampleStepPose, type AssemblyPlan, type StepPhase } from '../lib/assembly';
import { SPEEDS, type AssemblyPlaybackController } from '../lib/useAssemblyPlayback';
import { CATEGORY_STYLE } from '../lib/theme';
import { PauseIcon, PlayIcon, ResetIcon, StepBackIcon, StepForwardIcon } from './icons';

interface AssemblyPlaybarProps {
  plan: AssemblyPlan;
  playback: AssemblyPlaybackController;
}

const iconButton =
  'grid h-6 w-6 shrink-0 place-items-center rounded text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-default disabled:text-slate-600 disabled:hover:bg-transparent';

const PHASE_LABEL: Partial<Record<StepPhase, { text: string; tone: string }>> = {
  launch: { text: 'Launch', tone: 'text-amber-400' },
  travel: { text: 'Travel', tone: 'text-sky-400' },
  pivot: { text: 'Pivot', tone: 'text-sky-300' },
  catch: { text: 'Catch', tone: 'text-fuchsia-400' },
};

/** Slim playback strip under the 3D view: reset · step back · play/pause · step forward · scrub · speed. */
export const AssemblyPlaybar: React.FC<AssemblyPlaybarProps> = ({ plan, playback }) => {
  const { progress, total, playing, complete, speed } = playback;
  const index = Math.min(total - 1, Math.floor(progress));
  const current = plan.steps[index];
  const atStart = progress <= 1e-6;

  const cycleSpeed = () => {
    const i = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
    playback.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
  };

  let label: React.ReactNode;
  if (complete) {
    label = <span className="text-slate-400">Assembled · {total} voxels</span>;
  } else if (atStart) {
    label = <span className="text-slate-400">In container · {total} voxels</span>;
  } else {
    const t = Math.min(1, Math.max(0, progress - current.index));
    const phase = sampleStepPose(current, t).phase;
    const stage = PHASE_LABEL[phase];
    label = (
      <>
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-sm"
          style={{ backgroundColor: CATEGORY_STYLE[current.category].css }}
        />
        <span className="truncate font-medium text-slate-200">{current.voxelId}</span>
        {stage && <span className={`shrink-0 font-mono text-[10px] ${stage.tone}`}>· {stage.text}</span>}
      </>
    );
  }

  const stepNumber = complete ? total : Math.min(total, index + 1);

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-1.5 border-t border-slate-800 bg-[#0b1020] px-2"
      role="group"
      aria-label="Assembly playback"
    >
      <button type="button" className={iconButton} onClick={playback.reset} disabled={atStart && !playing} title="Reset to container" aria-label="Reset">
        <ResetIcon className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={iconButton} onClick={playback.stepBack} disabled={atStart} title="Step back" aria-label="Step back">
        <StepBackIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={playback.toggle}
        title={playing ? 'Pause' : complete ? 'Replay assembly' : 'Play'}
        aria-label={playing ? 'Pause' : 'Play'}
        className="grid h-6 w-7 shrink-0 place-items-center rounded bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 hover:text-sky-100"
      >
        {playing ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
      </button>
      <button type="button" className={iconButton} onClick={playback.stepForward} disabled={complete} title="Step forward" aria-label="Step forward">
        <StepForwardIcon className="h-3.5 w-3.5" />
      </button>

      <input
        type="range"
        min={0}
        max={total}
        step={0.01}
        value={progress}
        onChange={(e) => playback.seek(Number(e.target.value))}
        aria-label="Assembly progress"
        className="mx-1 h-1 min-w-0 flex-1 cursor-pointer accent-sky-400"
      />

      <div className="flex w-[11.5rem] min-w-0 shrink-0 items-center gap-1.5 text-[11px]">
        <span className="shrink-0 font-mono tabular-nums text-slate-500">
          {stepNumber}/{total}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">{label}</span>
      </div>

      <button
        type="button"
        onClick={cycleSpeed}
        title="Playback speed"
        aria-label={`Playback speed ${speed}×`}
        className="h-6 shrink-0 rounded border border-slate-700/80 px-1.5 font-mono text-[10px] text-slate-300 hover:border-slate-500 hover:text-white"
      >
        {speed}×
      </button>
    </div>
  );
};
