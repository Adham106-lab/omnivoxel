import { describe, expect, it } from 'vitest';
import {
  compileToIR,
  createDefaultRegistry,
  parseDSL,
  verifyAssembly,
  VoxelManifest,
  VoxelRegistry,
} from '../src/index.js';

describe('OmniVoxel 5-Gate Deterministic Verifier', () => {
  const registry = createDefaultRegistry();

  // --------------------------------------------------------------------------
  // Gate 1: Spatial & Topology
  // --------------------------------------------------------------------------
  describe('Gate 1: Spatial & Topology', () => {
    it('detects spatial overlap collision at identical coordinates', () => {
      const dsl = `
        voxel a @ (0, 0, 0) type="vox.struct.alu-150"
        voxel b @ (0, 0, 0) type="vox.power.pd-100w"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      expect(result.passed).toBe(false);
      const gate1Errors = result.errors.filter((e) => e.gate === 1);
      expect(gate1Errors.some((e) => e.message.includes('Spatial overlap detected'))).toBe(true);
      expect(gate1Errors[0].suggestedFix).toContain('Relocate');
    });

    it('detects disconnected assembly island', () => {
      const dsl = `
        voxel a @ (0, 0, 0) type="vox.struct.alu-150"
        voxel b @ (5, 5, 5) type="vox.power.pd-100w"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      expect(result.passed).toBe(false);
      const gate1Errors = result.errors.filter((e) => e.gate === 1);
      expect(gate1Errors.some((e) => e.message.includes('Disconnected assembly detected'))).toBe(
        true
      );
      expect(gate1Errors[0].suggestedFix).toContain('Add structural voxels');
    });

    it('passes for single connected component without overlaps', () => {
      const dsl = `
        voxel a @ (0, 0, 0) type="vox.struct.alu-150"
        voxel b @ (1, 0, 0) type="vox.struct.alu-150"
        voxel c @ (1, 1, 0) type="vox.struct.alu-150"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      const gate1Errors = result.errors.filter((e) => e.gate === 1);
      expect(gate1Errors).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Gate 2: Dual-Plane Bus
  // --------------------------------------------------------------------------
  describe('Gate 2: Dual-Plane Bus', () => {
    it('fails when display voxel has no high-speed path to compute (separated by structural voxel)', () => {
      // struct.alu-150 does not have high-speed plane
      const dsl = `
        voxel gpu @ (0, 0, 0) type="vox.compute.gpu-module"
        voxel spacer @ (1, 0, 0) type="vox.struct.alu-150"
        voxel screen @ (2, 0, 0) type="vox.display.oled-6in"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      const gate2Errors = result.errors.filter((e) => e.gate === 2);
      expect(gate2Errors.some((e) => e.message.includes('requires a High-Speed Plane connection'))).toBe(
        true
      );
      expect(gate2Errors[0].suggestedFix).toContain('High-Speed Plane');
    });

    it('fails when display voxel exists without any compute module', () => {
      const dsl = `
        voxel screen @ (0, 0, 0) type="vox.display.oled-6in"
        voxel pwr @ (1, 0, 0) type="vox.power.pd-100w"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      const gate2Errors = result.errors.filter((e) => e.gate === 2);
      expect(gate2Errors.some((e) => e.message.includes('no compute voxel exists'))).toBe(true);
    });

    it('passes high-speed check when display is directly connected to compute module', () => {
      const dsl = `
        voxel gpu @ (0, 0, 0) type="vox.compute.gpu-module"
        voxel screen @ (1, 0, 0) type="vox.display.oled-6in"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      const gate2Errors = result.errors.filter((e) => e.gate === 2);
      expect(gate2Errors).toHaveLength(0);
    });

    it('warns when I2C bus length exceeds 1.0m limit (from VIK paper Section 7.2)', () => {
      // Each alu-150 voxel is 0.15m (150mm). 8 voxels in a chain = 7 hops * 0.15m = 1.05m > 1.0m
      const dsl = `
        voxel v0 @ (0, 0, 0) type="vox.struct.alu-150"
        voxel v1 @ (1, 0, 0) type="vox.struct.alu-150"
        voxel v2 @ (2, 0, 0) type="vox.struct.alu-150"
        voxel v3 @ (3, 0, 0) type="vox.struct.alu-150"
        voxel v4 @ (4, 0, 0) type="vox.struct.alu-150"
        voxel v5 @ (5, 0, 0) type="vox.struct.alu-150"
        voxel v6 @ (6, 0, 0) type="vox.struct.alu-150"
        voxel v7 @ (7, 0, 0) type="vox.struct.alu-150"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      const gate2Warnings = result.warnings.filter((w) => w.gate === 2);
      expect(
        gate2Warnings.some((w) =>
          w.message.includes('exceeds reliable 1.0m signal integrity threshold')
        )
      ).toBe(true);
      expect(gate2Warnings[0].suggestedFix).toContain('CAN-FD');
    });

    it('passes when modular NVMe storage connects to ARM SoC via High-Speed Plane', () => {
      const dsl = `
        voxel soc @ (0, 0, 0) type="vox.compute.arm-soc"
        voxel nvme @ (1, 0, 0) type="vox.storage.nvme-bay"
        voxel pwr @ (0, -1, 0) type="vox.power.pd-100w"
        voxel sink @ (-1, 0, 0) type="vox.struct.alu-150"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      expect(result.passed).toBe(true);
      expect(result.errors.filter((e) => e.gate === 2)).toHaveLength(0);
      expect(ir.metrics.modularStorageGb).toBe(2048);
    });

    it('fails Gate 2 when modular NVMe storage is only connected via Control Plane (structural spacer)', () => {
      // vox.struct.alu-150 bridges I2C control plane, but NOT High-Speed PCIe/USB4
      const dsl = `
        voxel soc @ (0, 0, 0) type="vox.compute.arm-soc"
        voxel spacer @ (1, 0, 0) type="vox.struct.alu-150"
        voxel nvme @ (2, 0, 0) type="vox.storage.nvme-bay"
        voxel pwr @ (0, -1, 0) type="vox.power.pd-100w"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      const gate2Errors = result.errors.filter((e) => e.gate === 2);
      expect(
        gate2Errors.some((e) => e.message.includes('only connected via the Control Plane'))
      ).toBe(true);
      expect(gate2Errors[0].voxelIds).toContain('nvme');
      expect(gate2Errors[0].suggestedFix).toContain('High-Speed Plane');
    });

    it('fails Gate 2 when modular NVMe storage has no compute or phone-core host', () => {
      const dsl = `
        voxel nvme @ (0, 0, 0) type="vox.storage.nvme-bay"
        voxel pwr @ (1, 0, 0) type="vox.power.pd-100w"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      const gate2Errors = result.errors.filter((e) => e.gate === 2);
      expect(
        gate2Errors.some((e) => e.message.includes('no host voxel exists'))
      ).toBe(true);
      expect(gate2Errors[0].suggestedFix).toContain('vox.compute.arm-soc');
    });

    it('fails Gate 2 when modular NVMe storage is physically disconnected from its host', () => {
      const dsl = `
        voxel phone @ (0, 0, 0) type="vox.device.phone-core"
        voxel nvme @ (4, 0, 0) type="vox.storage.nvme-bay"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      const gate2Errors = result.errors.filter((e) => e.gate === 2);
      expect(
        gate2Errors.some((e) => e.message.includes('disconnected from the High-Speed Plane'))
      ).toBe(true);
      expect(gate2Errors[0].voxelIds).toContain('nvme');
    });

    it('passes all 5 gates for a standalone Phone Core using private onboard storage and expands cleanly when docked with NVMe', () => {
      const standaloneIr = compileToIR(
        parseDSL(`voxel phone @ (0, 0, 0) type="vox.device.phone-core"`),
        registry
      );
      const standaloneResult = verifyAssembly(standaloneIr);
      expect(standaloneResult.passed).toBe(true);
      expect(standaloneResult.errors).toHaveLength(0);
      expect(standaloneResult.warnings).toHaveLength(0);
      expect(standaloneIr.metrics.dedicatedStorageGb).toBe(256);
      expect(standaloneIr.metrics.modularStorageGb).toBe(0);

      const standaloneInfo = standaloneResult.diagnostics.find(
        (d) => d.gate === 2 && d.severity === 'info'
      );
      expect(standaloneInfo?.metadata?.standaloneReady).toBe(true);
      expect(standaloneInfo?.metadata?.totalAvailableStorageGb).toBe(256);

      const dockedIr = compileToIR(
        parseDSL(`
          voxel phone @ (0, 0, 0) type="vox.device.phone-core"
          voxel nvme @ (1, 0, 0) type="vox.storage.nvme-bay"
        `),
        registry
      );
      const dockedResult = verifyAssembly(dockedIr);
      expect(dockedResult.passed).toBe(true);
      expect(dockedResult.errors).toHaveLength(0);
      expect(dockedIr.metrics.dedicatedStorageGb).toBe(256);
      expect(dockedIr.metrics.modularStorageGb).toBe(2048);
      expect(dockedIr.metrics.totalStorageGb).toBe(2304);

      const dockedInfo = dockedResult.diagnostics.find(
        (d) => d.gate === 2 && d.severity === 'info'
      );
      expect(dockedInfo?.metadata?.storageScope).toBe('hybrid');
      expect(dockedInfo?.metadata?.totalAvailableStorageGb).toBe(2304);
    });
  });

  // --------------------------------------------------------------------------
  // Gate 3: Power Budget & Rail Isolation
  // --------------------------------------------------------------------------
  describe('Gate 3: Power Budget & Rail Isolation', () => {
    it('fails when compute power demanded exceeds available power', () => {
      // 2x 35W GPUs = 70W demanded, but pd-100w provides 65W on compute rail
      const dsl = `
        voxel pwr @ (0, 0, 0) type="vox.power.pd-100w"
        voxel gpu1 @ (1, 0, 0) type="vox.compute.gpu-module"
        voxel gpu2 @ (2, 0, 0) type="vox.compute.gpu-module"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      const gate3Errors = result.errors.filter((e) => e.gate === 3);
      expect(gate3Errors.some((e) => e.message.includes('Compute power budget exceeded'))).toBe(
        true
      );
    });

    it('fails when compute components have no power provider', () => {
      const dsl = `
        voxel gpu @ (0, 0, 0) type="vox.compute.gpu-module"
        voxel screen @ (1, 0, 0) type="vox.display.oled-6in"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      const gate3Errors = result.errors.filter((e) => e.gate === 3);
      expect(
        gate3Errors.some((e) => e.message.includes('No power provider found for compute rail'))
      ).toBe(true);
    });

    it('fails when actuated cubes have no 12V actuator power provider', () => {
      const dsl = `
        voxel act @ (0, 0, 0) type="vox.actuated.em-60"
        voxel frame @ (1, 0, 0) type="vox.struct.alu-150"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      const gate3Errors = result.errors.filter((e) => e.gate === 3);
      expect(
        gate3Errors.some((e) => e.message.includes('No power provider found for actuator rail'))
      ).toBe(true);
    });

    it('detects rail isolation violation when power supply rails are not isolated', () => {
      const customRegistry = createDefaultRegistry();
      const noisyPower: VoxelManifest = {
        ...customRegistry.get('vox.power.pd-100w')!,
        id: 'vox.power.unisolated-100w',
        electrical: {
          ...customRegistry.get('vox.power.pd-100w')!.electrical,
          powerRails: {
            computeRail: { voltage: 5, type: 'provider', maxPowerWatts: 65, isolated: false },
            actuatorRail: { voltage: 12, type: 'provider', maxPowerWatts: 60, isolated: false },
          },
        },
      };
      customRegistry.register(noisyPower);

      const dsl = `
        voxel pwr @ (0, 0, 0) type="vox.power.unisolated-100w"
        voxel gpu @ (1, 0, 0) type="vox.compute.gpu-module"
        voxel em @ (0, 1, 0) type="vox.actuated.em-60"
      `;
      const ir = compileToIR(parseDSL(dsl), customRegistry);
      const result = verifyAssembly(ir);

      const gate3Errors = result.errors.filter((e) => e.gate === 3);
      expect(gate3Errors.some((e) => e.message.includes('Rail isolation violation'))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Gate 4: Thermal Budget
  // --------------------------------------------------------------------------
  describe('Gate 4: Thermal Budget', () => {
    it('fails when GPU operates without sufficient heatsink dissipation', () => {
      // GPU has 35W TDP, its own dissipation is only 2W
      const dsl = `
        voxel gpu @ (0, 0, 0) type="vox.compute.gpu-module"
        voxel pwr @ (1, 0, 0) type="vox.power.pd-100w"
      `;
      // Total TDP = 35 + 3 = 38W. Dissipation = 2 + 4 = 6W. Deficit = 32W!
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      const gate4Errors = result.errors.filter((e) => e.gate === 4);
      expect(
        gate4Errors.some((e) => e.message.includes('Thermal dissipation budget exceeded'))
      ).toBe(true);
      expect(gate4Errors[0].suggestedFix).toContain('Attach at least');
    });

    it('passes when sufficient aluminum heatsink voxels (vox.struct.alu-150) are connected', () => {
      // GPU (35W TDP, 2W diss) + 3x alu-150 (0W TDP, 12W diss each = 36W diss) + pwr (3W TDP, 4W diss)
      // Total TDP = 38W. Total Dissipation = 2 + 36 + 4 = 42W >= 38W!
      const dsl = `
        voxel gpu @ (0, 0, 0) type="vox.compute.gpu-module"
        voxel h1 @ (0, 1, 0) type="vox.struct.alu-150"
        voxel h2 @ (0, -1, 0) type="vox.struct.alu-150"
        voxel h3 @ (-1, 0, 0) type="vox.struct.alu-150"
        voxel pwr @ (1, 0, 0) type="vox.power.pd-100w"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      const gate4Errors = result.errors.filter((e) => e.gate === 4);
      expect(gate4Errors).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Gate 5: Basic Vertical Static Load
  // --------------------------------------------------------------------------
  describe('Gate 5: Vertical Static Mechanical Load', () => {
    it('fails when vertical compressive load exceeds base voxel compression rating', () => {
      const customRegistry = createDefaultRegistry();
      // Fragile base voxel with max compression of 10 N (~1 kg)
      const fragileBase: VoxelManifest = {
        ...customRegistry.get('vox.struct.alu-150')!,
        id: 'vox.struct.fragile',
        mechanical: {
          ...customRegistry.get('vox.struct.alu-150')!.mechanical,
          maxCompressionLoadN: 10,
        },
      };
      customRegistry.register(fragileBase);

      // Stack multiple heavy 0.45 kg power packs directly above fragile base
      // 3x 0.45 kg = 1.35 kg -> 13.24 N > 10 N
      const dsl = `
        voxel base @ (0, 0, 0) type="vox.struct.fragile"
        voxel p1 @ (0, 0, 1) type="vox.power.pd-100w"
        voxel p2 @ (0, 0, 2) type="vox.power.pd-100w"
        voxel p3 @ (0, 0, 3) type="vox.power.pd-100w"
      `;
      const ir = compileToIR(parseDSL(dsl), customRegistry);
      const result = verifyAssembly(ir);

      const gate5Errors = result.errors.filter((e) => e.gate === 5);
      expect(
        gate5Errors.some((e) => e.message.includes('Vertical compressive load limit exceeded'))
      ).toBe(true);
      expect(gate5Errors[0].suggestedFix).toContain('Reinforce base');
    });

    it('passes when foundation has high load capacity (alu-150 rated for 2243 N)', () => {
      // 2243 N can hold over 228 kg (from VIK paper)
      const dsl = `
        voxel base @ (0, 0, 0) type="vox.struct.alu-150"
        voxel p1 @ (0, 0, 1) type="vox.power.pd-100w"
        voxel p2 @ (0, 0, 2) type="vox.power.pd-100w"
        voxel p3 @ (0, 0, 3) type="vox.power.pd-100w"
      `;
      const ir = compileToIR(parseDSL(dsl), registry);
      const result = verifyAssembly(ir);

      const gate5Errors = result.errors.filter((e) => e.gate === 5);
      expect(gate5Errors).toHaveLength(0);
    });
  });
});
