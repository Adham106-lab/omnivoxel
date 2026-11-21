import { describe, expect, it } from 'vitest';
import {
  compileToIR,
  createDefaultRegistry,
  dockToFurniture,
  parseDSL,
  RoomEnvironment,
  snapToRoom,
  verifyAssembly,
} from '../src/index.js';

describe('Room Environment, Obstacles & Placement Helpers', () => {
  const registry = createDefaultRegistry();

  const testRoom: RoomEnvironment = {
    id: 'test-room-1',
    name: 'Test Engineering Lab',
    dimensionsMm: { x: 3000, y: 3000, z: 2500 },
    boundsMinMm: { x: 0, y: 0, z: 0 },
    boundsMaxMm: { x: 3000, y: 3000, z: 2500 },
    obstacles: [
      {
        id: 'desk-bench',
        name: 'Standing Desk Bench',
        type: 'furniture',
        boundsMinMm: { x: 500, y: 500, z: 0 },
        boundsMaxMm: { x: 1700, y: 1300, z: 750 },
        isFixed: true,
        color: '#64748b',
      },
      {
        id: 'north-wall',
        name: 'Concrete Partition Wall',
        type: 'wall',
        boundsMinMm: { x: 0, y: 0, z: 0 },
        boundsMaxMm: { x: 3000, y: 150, z: 2500 },
        isFixed: true,
        color: '#334155',
      },
    ],
  };

  it('detects room boundary violation when voxels exceed room limits', () => {
    // Voxel placed at coordinate (25, 0, 0) -> 25 * 150mm = 3750mm, exceeding room max 3000mm
    const dsl = `
      voxel out_of_bounds @ (25, 5, 5) {
        type: "vox.struct.alu-150"
      }
    `;
    const ir = compileToIR(parseDSL(dsl), registry);
    const result = verifyAssembly(ir, testRoom);

    expect(result.passed).toBe(false);
    const roomErrors = result.errors.filter(
      (e) => e.gate === 1 && e.message.includes('Room bounds violation')
    );
    expect(roomErrors).toHaveLength(1);
    expect(roomErrors[0].voxelIds).toContain('out_of_bounds');
    expect(roomErrors[0].suggestedFix).toContain('snap-to-room');
  });

  it('detects spatial collision with fixed furniture obstacle', () => {
    // Desk obstacle is at [500, 500, 0] to [1700, 1300, 750] mm
    // Placing voxel at grid (5, 5, 2) -> [750, 750, 300] mm, right inside the desk volume!
    const dsl = `
      voxel colliding_cube @ (5, 5, 2) {
        type: "vox.struct.alu-150"
      }
    `;
    const ir = compileToIR(parseDSL(dsl), registry);
    const result = verifyAssembly(ir, testRoom);

    expect(result.passed).toBe(false);
    const collisionErrors = result.errors.filter(
      (e) => e.gate === 1 && e.message.includes('Spatial collision detected')
    );
    expect(collisionErrors.length).toBeGreaterThan(0);
    expect(collisionErrors[0].message).toContain('Standing Desk Bench');
    expect(collisionErrors[0].suggestedFix).toContain('dock-to-furniture');
  });

  it('warns when voxel is dangerously close to fixed wall obstacle (low clearance)', () => {
    // North wall is [0, 0, 0] to [3000, 150, 2500] mm
    // Placing voxel at physical offset y = 155 mm (5 mm clearance, below default 15mm clearance)
    const dsl = `
      voxel close_cube @ (2, 0, 5) {
        type: "vox.struct.alu-150"
      }
    `;
    const ir = compileToIR(parseDSL(dsl), registry);
    // Use verifyAssembly with options specifying placement offset
    const result = verifyAssembly(ir, {
      room: testRoom,
      roomPlacement: {
        offsetMm: { x: 0, y: 155, z: 0 },
      },
      minClearanceMm: 20,
    });

    const clearanceWarnings = result.warnings.filter(
      (w) => w.gate === 1 && w.message.includes('Low clearance warning')
    );
    expect(clearanceWarnings.length).toBeGreaterThan(0);
    expect(clearanceWarnings[0].suggestedFix).toContain('clearance');
  });

  it('correctly snaps an assembly to the room floor using snapToRoom', () => {
    const dsl = `
      voxel a @ (0, 0, 0) { type: "vox.struct.alu-150" }
      voxel b @ (1, 0, 0) { type: "vox.struct.alu-150" }
    `;
    const ir = compileToIR(parseDSL(dsl), registry);
    const placement = snapToRoom(ir, testRoom, { alignment: 'floor' });

    expect(placement.gridOffset).toBeDefined();
    expect(placement.transformedIr.voxels).toHaveLength(2);
    // Verify transformed IR is completely within room bounds
    const verification = verifyAssembly(placement.transformedIr, testRoom);
    const roomErrors = verification.errors.filter((e) =>
      e.message.includes('Room bounds violation')
    );
    expect(roomErrors).toHaveLength(0);
  });

  it('correctly docks an assembly on top of furniture using dockToFurniture', () => {
    const dsl = `
      voxel a @ (0, 0, 0) { type: "vox.struct.alu-150" }
      voxel b @ (0, 1, 0) { type: "vox.struct.alu-150" }
    `;
    const ir = compileToIR(parseDSL(dsl), registry);
    const desk = testRoom.obstacles[0];
    const placement = dockToFurniture(ir, desk, { alignment: 'top' });

    expect(placement.assemblyBoundsMm.min.z).toBeGreaterThanOrEqual(desk.boundsMaxMm.z);
    expect(placement.transformedIr.voxels).toHaveLength(2);

    // Verify it doesn't collide with the desk
    const verification = verifyAssembly(placement.transformedIr, testRoom);
    const collisionErrors = verification.errors.filter((e) =>
      e.message.includes('Spatial collision detected')
    );
    expect(collisionErrors).toHaveLength(0);
  });
});
