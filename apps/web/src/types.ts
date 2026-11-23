export type VisualMode = 'Assembly' | 'Thermal' | 'Bus' | 'Physics';

export const VISUAL_MODES: readonly VisualMode[] = ['Assembly', 'Thermal', 'Bus', 'Physics'] as const;

/** Current 3D selection. Stored in React state but never triggers a scene rebuild. */
export type Selection =
  | { kind: 'voxel'; id: string }
  | { kind: 'obstacle'; id: string }
  | null;

export type IssueSeverity = 'error' | 'warning';

export interface Guides {
  roomBounds: boolean;
  obstacles: boolean;
  grid: boolean;
}

export interface CompileFailure {
  message: string;
  /** 1-based DSL line when the failure came from the parser. */
  line?: number;
}
