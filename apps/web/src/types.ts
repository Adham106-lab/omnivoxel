import {
  Diagnostic,
  RoomEnvironment,
  VerifierResult,
  VoxelIR,
  VoxelInstance,
} from '@omnivoxel/core';

export type VisualMode = 'Assembly' | 'Thermal' | 'Bus';

export interface SimulatorState {
  dslCode: string;
  ir: VoxelIR | null;
  roomEnvironment: RoomEnvironment;
  verificationResult: VerifierResult | null;
  visualMode: VisualMode;
  selectedVoxelId: string | null;
  hoveredVoxelId: string | null;
  selectedObstacleId: string | null;
  compileError: string | null;
  showRoomBounds: boolean;
  showObstacles: boolean;
  showGrid: boolean;
}
