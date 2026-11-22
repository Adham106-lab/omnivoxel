import { describe, expect, it } from 'vitest';
import {
  createDefaultRegistry,
  STARTER_MANIFESTS,
  validateManifest,
  VoxelManifest,
  VoxelRegistry,
} from '../src/index.js';

describe('Voxel Manifest & Registry', () => {
  it('creates default registry with all 9 built-in manifests', () => {
    const registry = createDefaultRegistry();
    expect(registry.size).toBe(9);
    expect(STARTER_MANIFESTS).toHaveLength(9);

    const expectedIds = [
      'vox.struct.alu-150',
      'vox.actuated.em-60',
      'vox.compute.gpu-module',
      'vox.display.oled-6in',
      'vox.power.pd-100w',
      'vox.io.gamepad-ctrl',
      'vox.compute.arm-soc',
      'vox.device.phone-core',
      'vox.storage.nvme-bay',
    ];

    for (const id of expectedIds) {
      expect(registry.has(id)).toBe(true);
      const manifest = registry.get(id);
      expect(manifest).toBeDefined();
      expect(manifest?.id).toBe(id);
    }
  });

  it('validates physical properties of vox.struct.alu-150 from VIK paper', () => {
    const registry = createDefaultRegistry();
    const alu = registry.get('vox.struct.alu-150')!;

    expect(alu.category).toBe('structural');
    expect(alu.mechanical.dimensionsMm).toEqual({ x: 150, y: 150, z: 150 });
    expect(alu.mechanical.massKg).toBe(0.228);
    expect(alu.mechanical.maxCompressionLoadN).toBe(2243);
    expect(alu.thermal.passiveDissipationWatts).toBe(12);
    expect(alu.thermal.isHeatsink).toBe(true);
    expect(alu.electrical.controlPlane.supported).toBe(true);
    expect(alu.electrical.controlPlane.passThrough).toBe(true);
  });

  it('validates electrical characteristics of vox.actuated.em-60 from ElectroVoxel paper', () => {
    const registry = createDefaultRegistry();
    const em = registry.get('vox.actuated.em-60')!;

    expect(em.category).toBe('actuated');
    expect(em.mechanical.dimensionsMm).toEqual({ x: 60, y: 60, z: 60 });
    expect(em.mechanical.massKg).toBeCloseTo(0.1031, 3);
    expect(em.electrical.powerRails.actuatorRail?.voltage).toBe(12.0);
    expect(em.electrical.powerRails.actuatorRail?.maxPowerWatts).toBe(15.1);
    expect(em.electrical.railIsolationRequired).toBe(true);
  });

  it('validates unified ARM ecosystem manifests (arm-soc, phone-core, nvme-bay)', () => {
    const registry = createDefaultRegistry();

    const armSoc = registry.get('vox.compute.arm-soc')!;
    expect(armSoc.category).toBe('compute');
    expect(armSoc.thermal.tdpWatts).toBeLessThanOrEqual(15);
    expect(armSoc.electrical.controlPlane.supported).toBe(true);
    expect(armSoc.electrical.highSpeedPlane.supported).toBe(true);
    expect(armSoc.electrical.highSpeedPlane.protocol).toBe('pcie');
    expect(armSoc.electrical.highSpeedPlane.isSource).toBe(true);
    expect(armSoc.capabilities).toContain('arm64-compute');

    const phoneCore = registry.get('vox.device.phone-core')!;
    expect(phoneCore.category).toBe('compute');
    expect(phoneCore.storage?.scope).toBe('dedicated');
    expect(phoneCore.storage?.capacityGb).toBeGreaterThanOrEqual(128);
    expect(phoneCore.metadata?.dedicatedStorageGb).toBe(phoneCore.storage?.capacityGb);
    expect(phoneCore.electrical.highSpeedPlane.supported).toBe(true);
    expect(phoneCore.electrical.powerRails.computeRail?.type).toBe('provider');
    expect(phoneCore.thermal.passiveDissipationWatts).toBeGreaterThanOrEqual(
      phoneCore.thermal.tdpWatts
    );

    const nvmeBay = registry.get('vox.storage.nvme-bay')!;
    expect(nvmeBay.category).toBe('storage');
    expect(nvmeBay.storage?.scope).toBe('modular');
    expect(nvmeBay.storage?.capacityGb).toBeGreaterThanOrEqual(1024);
    expect(nvmeBay.storage?.requiresHostHighSpeedLink).toBe(true);
    expect(nvmeBay.electrical.highSpeedPlane.supported).toBe(true);
    expect(nvmeBay.electrical.highSpeedPlane.protocol).toBe('pcie');
    expect(nvmeBay.capabilities).toContain('hot-swappable');
  });

  it('filters registry entries by category', () => {
    const registry = createDefaultRegistry();
    const computeIds = registry.filterByCategory('compute').map((m) => m.id);
    expect(computeIds).toEqual(
      expect.arrayContaining([
        'vox.compute.gpu-module',
        'vox.compute.arm-soc',
        'vox.device.phone-core',
      ])
    );

    const displayVoxels = registry.filterByCategory('display');
    expect(displayVoxels).toHaveLength(1);
    expect(displayVoxels[0].id).toBe('vox.display.oled-6in');

    const storageVoxels = registry.filterByCategory('storage');
    expect(storageVoxels).toHaveLength(1);
    expect(storageVoxels[0].id).toBe('vox.storage.nvme-bay');
  });

  it('allows registering custom manifests', () => {
    const registry = new VoxelRegistry();
    const custom: VoxelManifest = {
      id: 'custom.sensor.lidar',
      name: 'Custom LiDAR Voxel',
      version: '0.1.0',
      category: 'io',
      mechanical: {
        dimensionsMm: { x: 150, y: 150, z: 150 },
        massKg: 0.15,
        maxCompressionLoadN: 300,
      },
      electrical: {
        controlPlane: {
          supported: true,
          protocol: 'can-fd',
          faces: 'all',
        },
        highSpeedPlane: {
          supported: false,
          protocol: 'none',
          faces: [],
        },
        powerRails: {
          computeRail: {
            voltage: 5.0,
            type: 'consumer',
            maxPowerWatts: 2.5,
          },
        },
      },
      thermal: {
        tdpWatts: 2.5,
        passiveDissipationWatts: 1.5,
      },
      capabilities: ['lidar-telemetry'],
    };

    registry.register(custom);
    expect(registry.has('custom.sensor.lidar')).toBe(true);
    expect(registry.get('custom.sensor.lidar')?.capabilities).toContain('lidar-telemetry');
  });

  it('rejects invalid manifests', () => {
    // Missing compression load
    const badManifest: any = {
      id: 'bad.manifest',
      name: 'Bad',
      version: '1.0.0',
      category: 'structural',
      mechanical: {
        dimensionsMm: { x: 150, y: 150, z: 150 },
        massKg: 0.2,
      },
      electrical: {
        controlPlane: { supported: false, protocol: 'none', faces: [] },
        highSpeedPlane: { supported: false, protocol: 'none', faces: [] },
        powerRails: {},
      },
      thermal: { tdpWatts: 0, passiveDissipationWatts: 0 },
      capabilities: [],
    };

    expect(() => validateManifest(badManifest)).toThrowError(
      /missing mechanical\.maxCompressionLoadN/
    );
  });
});
