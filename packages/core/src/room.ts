import { Coord3D } from './types.js';
import { VoxelIR, VoxelInstance } from './ir.js';

export type ObstacleType = 'wall' | 'furniture' | 'appliance';

export interface EnvironmentObstacle {
  id: string;
  name?: string;
  type: ObstacleType;
  boundsMinMm: Coord3D;
  boundsMaxMm: Coord3D;
  isFixed: boolean;
  color?: string;
  metadata?: Record<string, unknown>;
}

export interface RoomEnvironment {
  id?: string;
  name?: string;
  dimensionsMm: Coord3D;
  boundsMinMm?: Coord3D;
  boundsMaxMm?: Coord3D;
  obstacles: EnvironmentObstacle[];
  metadata?: Record<string, unknown>;
}

export interface BoundingBoxMm {
  min: Coord3D;
  max: Coord3D;
}

export interface PlacementResult {
  offsetMm: Coord3D;
  gridOffset: Coord3D;
  assemblyBoundsMm: BoundingBoxMm;
  transformedIr: VoxelIR;
  voxelBoundsMap: Map<string, BoundingBoxMm>;
}

export interface SnapToRoomOptions {
  alignment?: 'center' | 'floor' | 'corner' | 'origin';
  clearanceMm?: number;
  voxelPitchMm?: number;
  offsetMm?: Partial<Coord3D>;
}

export interface DockToFurnitureOptions {
  alignment?: 'top' | 'front' | 'side' | 'center';
  clearanceMm?: number;
  voxelPitchMm?: number;
  offsetMm?: Partial<Coord3D>;
}

/**
 * Returns the effective room boundary min and max in millimeters.
 */
export function getRoomBoundsMm(room: RoomEnvironment): BoundingBoxMm {
  const min = room.boundsMinMm ?? { x: 0, y: 0, z: 0 };
  const max = room.boundsMaxMm ?? {
    x: room.dimensionsMm.x,
    y: room.dimensionsMm.y,
    z: room.dimensionsMm.z,
  };
  return { min, max };
}

/**
 * Calculates the bounding box in millimeters for a single voxel instance,
 * accounting for its pitch and an optional world offset.
 */
export function calculateVoxelBoundsMm(
  voxel: VoxelInstance,
  offsetMm: Coord3D = { x: 0, y: 0, z: 0 },
  defaultPitchMm: number = 150
): BoundingBoxMm {
  const dim = voxel.manifest.mechanical?.dimensionsMm ?? {
    x: defaultPitchMm,
    y: defaultPitchMm,
    z: defaultPitchMm,
  };

  const minX = offsetMm.x + voxel.coord.x * dim.x;
  const minY = offsetMm.y + voxel.coord.y * dim.y;
  const minZ = offsetMm.z + voxel.coord.z * dim.z;

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: minX + dim.x, y: minY + dim.y, z: minZ + dim.z },
  };
}

/**
 * Calculates the combined bounding box in millimeters for an entire assembly IR.
 */
export function calculateAssemblyBoundsMm(
  ir: VoxelIR,
  offsetMm: Coord3D = { x: 0, y: 0, z: 0 },
  defaultPitchMm: number = 150
): BoundingBoxMm {
  if (ir.voxels.length === 0) {
    return {
      min: { ...offsetMm },
      max: { ...offsetMm },
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const v of ir.voxels) {
    const bounds = calculateVoxelBoundsMm(v, offsetMm, defaultPitchMm);
    if (bounds.min.x < minX) minX = bounds.min.x;
    if (bounds.min.y < minY) minY = bounds.min.y;
    if (bounds.min.z < minZ) minZ = bounds.min.z;
    if (bounds.max.x > maxX) maxX = bounds.max.x;
    if (bounds.max.y > maxY) maxY = bounds.max.y;
    if (bounds.max.z > maxZ) maxZ = bounds.max.z;
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

/**
 * Checks whether two 3D axis-aligned bounding boxes overlap.
 */
export function doBoxesOverlap(a: BoundingBoxMm, b: BoundingBoxMm): boolean {
  return (
    a.min.x < b.max.x &&
    a.max.x > b.min.x &&
    a.min.y < b.max.y &&
    a.max.y > b.min.y &&
    a.min.z < b.max.z &&
    a.max.z > b.min.z
  );
}

/**
 * Calculates minimum distance (clearance) between two 3D boxes.
 * Returns 0 if they overlap.
 */
export function calculateBoxClearanceMm(a: BoundingBoxMm, b: BoundingBoxMm): number {
  if (doBoxesOverlap(a, b)) return 0;

  const dx = Math.max(0, Math.max(a.min.x - b.max.x, b.min.x - a.max.x));
  const dy = Math.max(0, Math.max(a.min.y - b.max.y, b.min.y - a.max.y));
  const dz = Math.max(0, Math.max(a.min.z - b.max.z, b.min.z - a.max.z));

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Helper to clone and translate a VoxelIR by a grid coordinate delta.
 */
function translateVoxelIR(ir: VoxelIR, delta: Coord3D): VoxelIR {
  const newVoxels: VoxelInstance[] = ir.voxels.map((v) => ({
    ...v,
    coord: {
      x: v.coord.x + delta.x,
      y: v.coord.y + delta.y,
      z: v.coord.z + delta.z,
    },
  }));

  return new VoxelIR(newVoxels, ir.links, ir.metrics);
}

/**
 * Layout placement helper: snap-to-room.
 * Arranges voxels relative to scanned room boundaries (e.g. floor, center, corner).
 */
export function snapToRoom(
  ir: VoxelIR,
  room: RoomEnvironment,
  options: SnapToRoomOptions = {}
): PlacementResult {
  const alignment = options.alignment ?? 'floor';
  const clearance = options.clearanceMm ?? 10;
  const pitch = options.voxelPitchMm ?? 150;
  const roomBounds = getRoomBoundsMm(room);
  const currentBounds = calculateAssemblyBoundsMm(ir, { x: 0, y: 0, z: 0 }, pitch);

  const assemblySizeX = currentBounds.max.x - currentBounds.min.x;
  const assemblySizeY = currentBounds.max.y - currentBounds.min.y;
  const assemblySizeZ = currentBounds.max.z - currentBounds.min.z;

  let targetMinX = roomBounds.min.x + clearance;
  let targetMinY = roomBounds.min.y + clearance;
  let targetMinZ = roomBounds.min.z + clearance;

  if (alignment === 'center') {
    targetMinX = roomBounds.min.x + ((roomBounds.max.x - roomBounds.min.x) - assemblySizeX) / 2;
    targetMinY = roomBounds.min.y + ((roomBounds.max.y - roomBounds.min.y) - assemblySizeY) / 2;
    targetMinZ = roomBounds.min.z + ((roomBounds.max.z - roomBounds.min.z) - assemblySizeZ) / 2;
  } else if (alignment === 'floor') {
    // Floor level on Z, centered on X and Y
    targetMinX = roomBounds.min.x + ((roomBounds.max.x - roomBounds.min.x) - assemblySizeX) / 2;
    targetMinY = roomBounds.min.y + ((roomBounds.max.y - roomBounds.min.y) - assemblySizeY) / 2;
    targetMinZ = roomBounds.min.z + clearance;
  } else if (alignment === 'corner') {
    targetMinX = roomBounds.min.x + clearance;
    targetMinY = roomBounds.min.y + clearance;
    targetMinZ = roomBounds.min.z + clearance;
  } else if (alignment === 'origin') {
    targetMinX = 0;
    targetMinY = 0;
    targetMinZ = 0;
  }

  if (options.offsetMm) {
    if (options.offsetMm.x !== undefined) targetMinX += options.offsetMm.x;
    if (options.offsetMm.y !== undefined) targetMinY += options.offsetMm.y;
    if (options.offsetMm.z !== undefined) targetMinZ += options.offsetMm.z;
  }

  const offsetMm: Coord3D = {
    x: targetMinX - currentBounds.min.x,
    y: targetMinY - currentBounds.min.y,
    z: targetMinZ - currentBounds.min.z,
  };

  const gridOffset: Coord3D = {
    x: Math.round(offsetMm.x / pitch),
    y: Math.round(offsetMm.y / pitch),
    z: Math.round(offsetMm.z / pitch),
  };

  const transformedIr = translateVoxelIR(ir, gridOffset);
  const assemblyBoundsMm = calculateAssemblyBoundsMm(transformedIr, { x: 0, y: 0, z: 0 }, pitch);

  const voxelBoundsMap = new Map<string, BoundingBoxMm>();
  for (const v of transformedIr.voxels) {
    voxelBoundsMap.set(v.id, calculateVoxelBoundsMm(v, { x: 0, y: 0, z: 0 }, pitch));
  }

  return {
    offsetMm,
    gridOffset,
    assemblyBoundsMm,
    transformedIr,
    voxelBoundsMap,
  };
}

/**
 * Layout placement helper: dock-to-furniture.
 * Docks voxels directly onto the top, front, or side surface of an obstacle (e.g. desk surface).
 */
export function dockToFurniture(
  ir: VoxelIR,
  obstacle: EnvironmentObstacle,
  options: DockToFurnitureOptions = {}
): PlacementResult {
  const alignment = options.alignment ?? 'top';
  const clearance = options.clearanceMm ?? 5; // mm clearance above surface
  const pitch = options.voxelPitchMm ?? 150;
  const currentBounds = calculateAssemblyBoundsMm(ir, { x: 0, y: 0, z: 0 }, pitch);

  const assemblySizeX = currentBounds.max.x - currentBounds.min.x;
  const assemblySizeY = currentBounds.max.y - currentBounds.min.y;
  const obstSizeX = obstacle.boundsMaxMm.x - obstacle.boundsMinMm.x;
  const obstSizeY = obstacle.boundsMaxMm.y - obstacle.boundsMinMm.y;

  let targetMinX = obstacle.boundsMinMm.x + (obstSizeX - assemblySizeX) / 2;
  let targetMinY = obstacle.boundsMinMm.y + (obstSizeY - assemblySizeY) / 2;
  let targetMinZ = obstacle.boundsMaxMm.z + clearance; // On top surface

  if (alignment === 'front') {
    targetMinX = obstacle.boundsMinMm.x + (obstSizeX - assemblySizeX) / 2;
    targetMinY = obstacle.boundsMinMm.y - assemblySizeY - clearance;
    targetMinZ = obstacle.boundsMinMm.z;
  } else if (alignment === 'side') {
    targetMinX = obstacle.boundsMaxMm.x + clearance;
    targetMinY = obstacle.boundsMinMm.y + (obstSizeY - assemblySizeY) / 2;
    targetMinZ = obstacle.boundsMinMm.z;
  } else if (alignment === 'center') {
    targetMinX = obstacle.boundsMinMm.x + (obstSizeX - assemblySizeX) / 2;
    targetMinY = obstacle.boundsMinMm.y + (obstSizeY - assemblySizeY) / 2;
    targetMinZ = obstacle.boundsMinMm.z + (obstacle.boundsMaxMm.z - obstacle.boundsMinMm.z) / 2;
  }

  if (options.offsetMm) {
    if (options.offsetMm.x !== undefined) targetMinX += options.offsetMm.x;
    if (options.offsetMm.y !== undefined) targetMinY += options.offsetMm.y;
    if (options.offsetMm.z !== undefined) targetMinZ += options.offsetMm.z;
  }

  const offsetMm: Coord3D = {
    x: targetMinX - currentBounds.min.x,
    y: targetMinY - currentBounds.min.y,
    z: targetMinZ - currentBounds.min.z,
  };

  const gridOffset: Coord3D = {
    x: Math.round(offsetMm.x / pitch),
    y: Math.round(offsetMm.y / pitch),
    z: Math.round(offsetMm.z / pitch),
  };

  const transformedIr = translateVoxelIR(ir, gridOffset);
  const assemblyBoundsMm = calculateAssemblyBoundsMm(transformedIr, { x: 0, y: 0, z: 0 }, pitch);

  const voxelBoundsMap = new Map<string, BoundingBoxMm>();
  for (const v of transformedIr.voxels) {
    voxelBoundsMap.set(v.id, calculateVoxelBoundsMm(v, { x: 0, y: 0, z: 0 }, pitch));
  }

  return {
    offsetMm,
    gridOffset,
    assemblyBoundsMm,
    transformedIr,
    voxelBoundsMap,
  };
}
