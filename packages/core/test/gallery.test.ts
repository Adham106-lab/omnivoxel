import { describe, expect, it } from 'vitest';
import {
  createDefaultRegistry,
  GALLERY_ITEMS,
  getGalleryItem,
  verifyAssembly,
} from '../src/index.js';

describe('Gallery Items Catalog', () => {
  const registry = createDefaultRegistry();

  it('contains all 4 structured gallery items', () => {
    expect(GALLERY_ITEMS.length).toBeGreaterThanOrEqual(4);
    const ids = GALLERY_ITEMS.map((item) => item.id);
    expect(ids).toContain('handheld-gaming-console');
    expect(ids).toContain('modular-laptop');
    expect(ids).toContain('desk-workstation');
    expect(ids).toContain('living-room-unit');
  });

  it('compiles Handheld Gaming Console into VoxelIR and RoomEnvironment and verifies cleanly', () => {
    const item = getGalleryItem('handheld-gaming-console');
    expect(item).toBeDefined();

    const { ir, roomEnvironment } = item!.compile(registry);
    expect(ir.voxels.length).toBe(7);
    expect(roomEnvironment.obstacles.length).toBeGreaterThan(0);

    const result = verifyAssembly(ir, roomEnvironment);
    expect(result.errors).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('compiles Modular Laptop into VoxelIR and RoomEnvironment and verifies cleanly', () => {
    const item = getGalleryItem('modular-laptop');
    expect(item).toBeDefined();

    const { ir, roomEnvironment } = item!.compile(registry);
    expect(ir.voxels.length).toBeGreaterThan(0);
    expect(roomEnvironment.obstacles.length).toBeGreaterThan(0);

    const result = verifyAssembly(ir, roomEnvironment);
    expect(result.errors).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('compiles Desk Workstation into VoxelIR and RoomEnvironment and verifies cleanly', () => {
    const item = getGalleryItem('desk-workstation');
    expect(item).toBeDefined();

    const { ir, roomEnvironment } = item!.compile(registry);
    expect(ir.voxels.length).toBeGreaterThan(0);
    expect(roomEnvironment.obstacles.some((o) => o.type === 'furniture')).toBe(true);

    const result = verifyAssembly(ir, roomEnvironment);
    expect(result.errors).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('compiles Living Room Unit into VoxelIR and RoomEnvironment and verifies cleanly', () => {
    const item = getGalleryItem('living-room-unit');
    expect(item).toBeDefined();

    const { ir, roomEnvironment } = item!.compile(registry);
    expect(ir.voxels.length).toBeGreaterThan(0);
    expect(roomEnvironment.obstacles.some((o) => o.type === 'appliance')).toBe(true);

    const result = verifyAssembly(ir, roomEnvironment);
    expect(result.errors).toEqual([]);
    expect(result.passed).toBe(true);
  });
});
