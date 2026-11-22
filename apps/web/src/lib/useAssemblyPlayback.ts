import { useCallback, useEffect, useRef, useState } from 'react';

/** Seconds one voxel takes to travel container → lattice at 1× speed. */
export const STEP_SECONDS = 1.8;
export const SPEEDS = [0.5, 1, 2, 4] as const;

const EPS = 1e-6;

type Mode = 'idle' | 'play' | 'seek';

export interface AssemblyPlaybackController {
  /** 0..total. Step i is in flight while progress ∈ [i, i+1]. */
  progress: number;
  total: number;
  playing: boolean;
  complete: boolean;
  speed: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stepForward: () => void;
  stepBack: () => void;
  reset: () => void;
  seek: (progress: number) => void;
  setSpeed: (speed: number) => void;
}

/**
 * Drives assembly playback. Defaults to the *completed* state so the viewport shows
 * the finished lattice until the user presses play. When the assembly changes size
 * (edit, move, gallery switch) a completed assembly stays completed.
 */
export function useAssemblyPlayback(total: number): AssemblyPlaybackController {
  const [progress, setProgressState] = useState(total);
  const [playing, setPlaying] = useState(false);
  const [running, setRunning] = useState(false);
  const [speed, setSpeedState] = useState(1);

  const progressRef = useRef(total);
  const totalRef = useRef(total);
  const modeRef = useRef<Mode>('idle');
  const targetRef = useRef(total);
  const speedRef = useRef(1);
  speedRef.current = speed;

  const setProgress = useCallback((value: number) => {
    progressRef.current = value;
    setProgressState(value);
  }, []);

  const stop = useCallback(() => {
    modeRef.current = 'idle';
    setPlaying(false);
    setRunning(false);
  }, []);

  // Assembly size changed
  useEffect(() => {
    const previous = totalRef.current;
    totalRef.current = total;
    if (previous === total) return;
    const wasComplete = progressRef.current >= previous - EPS;
    setProgress(wasComplete ? total : Math.min(progressRef.current, total));
    targetRef.current = Math.min(targetRef.current, total);
    if (modeRef.current === 'play') targetRef.current = total;
    if (total === 0) stop();
  }, [total, setProgress, stop]);

  // Animation loop (only alive while playing / seeking)
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const current = progressRef.current;
      const target = targetRef.current;
      const dir = Math.sign(target - current);
      const delta = (dt * speedRef.current) / STEP_SECONDS;
      let next = current + dir * delta;
      const arrived = dir === 0 || (dir > 0 && next >= target) || (dir < 0 && next <= target);
      if (arrived) next = target;
      setProgress(next);
      if (arrived) {
        stop();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, setProgress, stop]);

  const play = useCallback(() => {
    const n = totalRef.current;
    if (n === 0) return;
    if (progressRef.current >= n - EPS) setProgress(0); // replay from the container
    targetRef.current = n;
    modeRef.current = 'play';
    setPlaying(true);
    setRunning(true);
  }, [setProgress]);

  const pause = useCallback(() => stop(), [stop]);

  const toggle = useCallback(() => {
    if (modeRef.current === 'play') stop();
    else play();
  }, [play, stop]);

  const stepForward = useCallback(() => {
    const n = totalRef.current;
    const current = progressRef.current;
    if (n === 0 || current >= n - EPS) return;
    targetRef.current = Math.min(n, Math.floor(current + EPS) + 1);
    modeRef.current = 'seek';
    setPlaying(false);
    setRunning(true);
  }, []);

  const stepBack = useCallback(() => {
    const current = progressRef.current;
    if (current <= EPS) return;
    targetRef.current = Math.max(0, Math.ceil(current - EPS) - 1);
    modeRef.current = 'seek';
    setPlaying(false);
    setRunning(true);
  }, []);

  const reset = useCallback(() => {
    stop();
    setProgress(0);
  }, [setProgress, stop]);

  const seek = useCallback(
    (value: number) => {
      stop();
      setProgress(Math.min(totalRef.current, Math.max(0, value)));
    },
    [setProgress, stop]
  );

  return {
    progress,
    total,
    playing,
    complete: total === 0 || progress >= total - EPS,
    speed,
    play,
    pause,
    toggle,
    stepForward,
    stepBack,
    reset,
    seek,
    setSpeed: setSpeedState,
  };
}
