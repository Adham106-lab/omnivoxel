/**
 * Basic 3D discrete grid coordinate.
 */
export interface Coord3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * 6 faces of a unit cube voxel.
 */
export type Face = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export const ALL_FACES: readonly Face[] = ['+x', '-x', '+y', '-y', '+z', '-z'] as const;

export const OPPOSITE_FACE: Record<Face, Face> = {
  '+x': '-x',
  '-x': '+x',
  '+y': '-y',
  '-y': '+y',
  '+z': '-z',
  '-z': '+z',
};

export const FACE_DELTAS: Record<Face, Coord3D> = {
  '+x': { x: 1, y: 0, z: 0 },
  '-x': { x: -1, y: 0, z: 0 },
  '+y': { x: 0, y: 1, z: 0 },
  '-y': { x: 0, y: -1, z: 0 },
  '+z': { x: 0, y: 0, z: 1 },
  '-z': { x: 0, y: 0, z: -1 },
};

/**
 * Supported functional categories of voxels.
 */
export type VoxelCategory =
  | 'structural'
  | 'actuated'
  | 'compute'
  | 'display'
  | 'power'
  | 'io'
  | 'storage';

/**
 * Control plane bus protocols (low-speed / management / telemetry).
 */
export type ControlPlaneProtocol =
  | 'i2c'
  | 'can-fd'
  | 'spi'
  | 'uart'
  | 'gpio'
  | 'none';

/**
 * High-speed plane protocols (video / PCIe / high-bandwidth data).
 */
export type HighSpeedPlaneProtocol =
  | 'usb4'
  | 'pcie'
  | 'dp'
  | 'edp'
  | 'mipi-csi'
  | 'none';

/**
 * Diagnostic severities for deterministic verification.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * Structured diagnostic produced by a verification gate.
 */
export interface Diagnostic {
  gate: 1 | 2 | 3 | 4 | 5;
  gateName: string;
  severity: DiagnosticSeverity;
  message: string;
  voxelIds?: string[];
  suggestedFix?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated verification outcome.
 */
export interface VerifierResult {
  passed: boolean;
  diagnostics: Diagnostic[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
}
