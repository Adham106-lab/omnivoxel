import { describe, expect, it } from 'vitest';
import {
  compileToIR,
  createDefaultRegistry,
  parseDSL,
  printDSL,
} from '../src/index.js';

describe('Voxel DSL & Unified IR Compiler', () => {
  it('parses declarative block DSL syntax into AST', () => {
    const dsl = `
      assembly "Mini Rig" {
        version: "1.0"
      }

      voxel gpu @ (0, 0, 0) {
        type: "vox.compute.gpu-module"
        role: "primary-compute"
      }

      voxel screen @ (1, 0, 0) {
        type: "vox.display.oled-6in"
        role: "main-display"
      }
    `;

    const ast = parseDSL(dsl);
    expect(ast.type).toBe('VoxelAssemblyAst');
    expect(ast.metadata.name).toBe('Mini Rig');
    expect(ast.metadata.properties.version).toBe('1.0');
    expect(ast.voxels).toHaveLength(2);

    expect(ast.voxels[0].id).toBe('gpu');
    expect(ast.voxels[0].coord).toEqual({ x: 0, y: 0, z: 0 });
    expect(ast.voxels[0].voxelType).toBe('vox.compute.gpu-module');
    expect(ast.voxels[0].role).toBe('primary-compute');

    expect(ast.voxels[1].id).toBe('screen');
    expect(ast.voxels[1].coord).toEqual({ x: 1, y: 0, z: 0 });
    expect(ast.voxels[1].voxelType).toBe('vox.display.oled-6in');
  });

  it('parses inline DSL syntax and comments', () => {
    const dsl = `
      # Power block
      voxel pwr @ (0, 0, 0) type="vox.power.pd-100w" role="power-source"
      // Compute block
      voxel cpu @ (0, 1, 0) type="vox.compute.gpu-module"
    `;

    const ast = parseDSL(dsl);
    expect(ast.voxels).toHaveLength(2);
    expect(ast.voxels[0].id).toBe('pwr');
    expect(ast.voxels[0].voxelType).toBe('vox.power.pd-100w');
    expect(ast.voxels[1].id).toBe('cpu');
    expect(ast.voxels[1].coord).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('throws descriptive error on missing type', () => {
    const dsl = `
      voxel broken @ (0, 0, 0) {
        role: "nothing"
      }
    `;
    expect(() => parseDSL(dsl)).toThrowError(/missing required "type"/);
  });

  it('compiles AST to IR and automatically infers face-to-face adjacency links', () => {
    const registry = createDefaultRegistry();
    const dsl = `
      voxel gpu @ (0, 0, 0) {
        type: "vox.compute.gpu-module"
      }
      voxel screen @ (1, 0, 0) {
        type: "vox.display.oled-6in"
      }
      voxel sink @ (0, 1, 0) {
        type: "vox.struct.alu-150"
      }
    `;

    const ast = parseDSL(dsl);
    const ir = compileToIR(ast, registry);

    expect(ir.voxels).toHaveLength(3);
    expect(ir.links).toHaveLength(2);

    // Link 1: gpu (0,0,0) and screen (1,0,0) along X axis
    const gpuScreenLink = ir.links.find(
      (l) =>
        (l.sourceId === 'gpu' && l.targetId === 'screen') ||
        (l.sourceId === 'screen' && l.targetId === 'gpu')
    );
    expect(gpuScreenLink).toBeDefined();
    expect(gpuScreenLink?.mechanical).toBe(true);
    expect(gpuScreenLink?.highSpeedPlane.connected).toBe(true);
    expect(gpuScreenLink?.highSpeedPlane.protocol).toBe('dp');
    expect(gpuScreenLink?.controlPlane.connected).toBe(true);
    expect(gpuScreenLink?.distanceMeters).toBe(0.15);

    // Link 2: gpu (0,0,0) and sink (0,1,0) along Y axis
    const gpuSinkLink = ir.links.find(
      (l) =>
        (l.sourceId === 'gpu' && l.targetId === 'sink') ||
        (l.sourceId === 'sink' && l.targetId === 'gpu')
    );
    expect(gpuSinkLink).toBeDefined();
    expect(gpuSinkLink?.mechanical).toBe(true);
    expect(gpuSinkLink?.thermalCoupled).toBe(true);
    // Sink has no high speed plane
    expect(gpuSinkLink?.highSpeedPlane.connected).toBe(false);
  });

  it('calculates metrics for compiled assembly', () => {
    const registry = createDefaultRegistry();
    const dsl = `
      voxel pwr @ (0, 0, 0) {
        type: "vox.power.pd-100w"
      }
      voxel gpu @ (1, 0, 0) {
        type: "vox.compute.gpu-module"
      }
    `;
    const ir = compileToIR(parseDSL(dsl), registry);

    expect(ir.metrics.totalMassKg).toBeCloseTo(0.45 + 0.18, 3);
    expect(ir.metrics.computePowerProvidedWatts).toBe(65);
    expect(ir.metrics.computePowerDemandedWatts).toBe(35);
    expect(ir.metrics.totalTdpWatts).toBe(38); // 3W + 35W
    expect(ir.metrics.boundingBox.size).toEqual({ x: 2, y: 1, z: 1 });
  });

  it('supports roundtrip serialization via printDSL', () => {
    const dsl = `assembly "TestAssembly" {\n  author: "Engineer"\n}\n\nvoxel v1 @ (0, 0, 0) {\n  type: "vox.power.pd-100w"\n}\n`;
    const ast = parseDSL(dsl);
    const printed = printDSL(ast);
    const astRoundtrip = parseDSL(printed);

    expect(astRoundtrip.metadata.name).toBe('TestAssembly');
    expect(astRoundtrip.voxels).toHaveLength(1);
    expect(astRoundtrip.voxels[0].id).toBe('v1');
  });
});
