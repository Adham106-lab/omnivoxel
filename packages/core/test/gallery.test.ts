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

  it('includes and verifies Modular ARM Phone preset (dedicated onboard + docked NVMe)', () => {
    const item = getGalleryItem('arm-modular-phone');
    expect(item).toBeDefined();

    const { ir, roomEnvironment } = item!.compile(registry);
    expect(ir.voxels.some((v) => v.manifest.id === 'vox.device.phone-core')).toBe(true);
    expect(ir.voxels.some((v) => v.manifest.id === 'vox.storage.nvme-bay')).toBe(true);
    expect(ir.metrics.dedicatedStorageGb).toBe(256);
    expect(ir.metrics.modularStorageGb).toBe(2048);

    const result = verifyAssembly(ir, roomEnvironment);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('includes and verifies ARM Modular Laptop preset cleanly across all 5 gates', () => {
    const item = getGalleryItem('arm-modular-laptop');
    expect(item).toBeDefined();

    const { ir, roomEnvironment } = item!.compile(registry);
    expect(ir.voxels.some((v) => v.manifest.id === 'vox.device.phone-core')).toBe(true);
    expect(ir.voxels.some((v) => v.manifest.id === 'vox.compute.arm-soc')).toBe(true);
    expect(ir.voxels.some((v) => v.manifest.id === 'vox.storage.nvme-bay')).toBe(true);
    expect(ir.metrics.totalStorageGb).toBe(2304);

    const result = verifyAssembly(ir, roomEnvironment);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('includes and verifies ARM Desktop / PC Workstation preset with multi-ARM cluster & NVMe array', () => {
    const item = getGalleryItem('arm-pc-workstation');
    expect(item).toBeDefined();

    const { ir, roomEnvironment } = item!.compile(registry);
    const armNodes = ir.voxels.filter((v) => v.manifest.id === 'vox.compute.arm-soc');
    const storageBays = ir.voxels.filter((v) => v.manifest.id === 'vox.storage.nvme-bay');
    expect(armNodes.length).toBeGreaterThanOrEqual(2);
    expect(storageBays.length).toBeGreaterThanOrEqual(2);
    expect(ir.metrics.modularStorageGb).toBe(4096);

    const result = verifyAssembly(ir, roomEnvironment);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('includes and verifies Modular Voxel Chair, Table, Couch, and Bridge structural presets across all 5 gates', () => {
    const structuralIds = [
      { id: 'voxel-chair', expectedCount: 12 },
      { id: 'voxel-table', expectedCount: 12 },
      { id: 'voxel-couch', expectedCount: 12 },
      { id: 'voxel-bridge', expectedCount: 10 },
    ] as const;

    for (const { id, expectedCount } of structuralIds) {
      const item = getGalleryItem(id);
      expect(item).toBeDefined();
      expect(item!.category).toBe('structural');

      const { ir, roomEnvironment } = item!.compile(registry);
      expect(ir.voxels).toHaveLength(expectedCount);
      expect(ir.links.length).toBeGreaterThanOrEqual(expectedCount - 1);

      const result = verifyAssembly(ir, roomEnvironment);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.passed).toBe(true);
    }
  });
});

