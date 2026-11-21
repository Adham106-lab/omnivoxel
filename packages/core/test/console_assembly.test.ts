import { describe, expect, it } from 'vitest';
import {
  compileToIR,
  createDefaultRegistry,
  parseDSL,
  verifyAssembly,
} from '../src/index.js';

describe('Handheld Gaming Console Full System Integration', () => {
  it('successfully compiles and verifies the Handheld Gaming Console across all 5 gates', () => {
    const registry = createDefaultRegistry();

    // Handheld Gaming Console Assembly DSL
    const consoleDsl = `
      assembly "OmniVoxel-Deck" {
        formFactor: "Handheld Gaming Console"
        architecture: "Modular VIK Cuboctahedron Lattice"
      }

      // Central High-Performance Compute Engine
      voxel gpu @ (0, 0, 0) {
        type: "vox.compute.gpu-module"
        role: "graphics-and-logic"
      }

      // Display unit connected to GPU via High-Speed Video Plane
      voxel screen @ (0, 1, 0) {
        type: "vox.display.oled-6in"
        role: "touchscreen-display"
      }

      // High-density isolated dual-rail battery pack
      voxel battery @ (0, -1, 0) {
        type: "vox.power.pd-100w"
        role: "power-supply"
      }

      // Ergonomic Gamepad IO Controller
      voxel controller @ (-1, 0, 0) {
        type: "vox.io.gamepad-ctrl"
        role: "player-inputs"
      }

      // High-capacity Aluminum PCB Heatsink Voxels for 35W Thermal Dissipation
      voxel heatsink_right @ (1, 0, 0) {
        type: "vox.struct.alu-150"
        role: "lateral-thermal-sink"
      }

      voxel heatsink_top @ (0, 0, 1) {
        type: "vox.struct.alu-150"
        role: "dorsal-thermal-sink"
      }

      voxel heatsink_bottom @ (0, 0, -1) {
        type: "vox.struct.alu-150"
        role: "ventral-thermal-sink"
      }
    `;

    // 1. Parse DSL to AST
    const ast = parseDSL(consoleDsl);
    expect(ast.voxels).toHaveLength(7);

    // 2. Compile to Unified Voxel IR with automated adjacency inference
    const ir = compileToIR(ast, registry);
    expect(ir.voxels).toHaveLength(7);

    // Verify adjacency links inferred
    // (0,0,0) GPU touches all 6 neighbors: (0,1,0), (0,-1,0), (-1,0,0), (1,0,0), (0,0,1), (0,0,-1)
    const gpuLinks = ir.getLinks('gpu');
    expect(gpuLinks).toHaveLength(6);

    // Verify GPU <-> Screen High-Speed connection
    const gpuScreenLink = gpuLinks.find(
      (l) => l.sourceId === 'screen' || l.targetId === 'screen'
    );
    expect(gpuScreenLink).toBeDefined();
    expect(gpuScreenLink?.highSpeedPlane.connected).toBe(true);
    expect(gpuScreenLink?.highSpeedPlane.protocol).toBe('dp');

    // Verify assembly metrics
    // Total compute demanded: GPU (35W) + Screen (6W) + Gamepad (0.5W) = 41.5W
    expect(ir.metrics.computePowerDemandedWatts).toBe(41.5);
    // Total compute provided: Battery (65W)
    expect(ir.metrics.computePowerProvidedWatts).toBe(65);
    expect(ir.metrics.computePowerProvidedWatts).toBeGreaterThanOrEqual(
      ir.metrics.computePowerDemandedWatts
    );

    // Total dissipation: 2 (GPU) + 2 (Screen) + 4 (Battery) + 1 (Gamepad) + 3 * 12 (Heatsinks) = 45W
    // Total TDP: 35 (GPU) + 6 (Screen) + 3 (Battery) + 0.5 (Gamepad) = 44.5W
    expect(ir.metrics.totalPassiveDissipationWatts).toBe(45);
    expect(ir.metrics.totalTdpWatts).toBe(44.5);
    expect(ir.metrics.totalPassiveDissipationWatts).toBeGreaterThanOrEqual(
      ir.metrics.totalTdpWatts
    );

    // 3. Execute 5-Gate Deterministic Verifier
    const result = verifyAssembly(ir);

    // Diagnostics inspection
    expect(result.errors).toHaveLength(0);
    expect(result.passed).toBe(true);

    // Verify no Gate 1 spatial/topology errors
    expect(result.diagnostics.filter((d) => d.gate === 1)).toHaveLength(0);

    // Verify Gate 2 passed without warnings (all nodes within 0.45m < 1.0m limit)
    expect(result.diagnostics.filter((d) => d.gate === 2)).toHaveLength(0);

    // Verify Gate 3 power & isolation passed
    expect(result.diagnostics.filter((d) => d.gate === 3)).toHaveLength(0);

    // Verify Gate 4 thermal budget passed
    expect(result.diagnostics.filter((d) => d.gate === 4)).toHaveLength(0);

    // Verify Gate 5 mechanical compression load passed
    expect(result.diagnostics.filter((d) => d.gate === 5)).toHaveLength(0);
  });
});
