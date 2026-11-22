import { describe, expect, it } from 'vitest';
import {
  compileToIR,
  createDefaultRegistry,
  GALLERY_ITEMS,
  parseDSL,
  verifyAssembly,
  type VoxelIR,
} from '@omnivoxel/core';
import {
  deriveJointAxis,
  easeInOutCubic,
  orderVoxels,
  pivotPositionAt,
  planAssembly,
  samplePath,
  sampleStepPose,
  segmentHitsBox,
} from './assembly';
import { isCellFree, moveVoxelInDsl } from './layout';

const registry = createDefaultRegistry();
const compile = (dsl: string): VoxelIR => compileToIR(parseDSL(dsl), registry);

const HANDHELD = GALLERY_ITEMS.find((g) => g.id === 'handheld-gaming-console')!;
const LIVING_ROOM = GALLERY_ITEMS.find((g) => g.id === 'living-room-unit')!;

describe('planAssembly', () => {
  for (const item of GALLERY_ITEMS) {
    describe(item.name, () => {
      const ir = compile(item.dsl);
      const plan = planAssembly(ir);

      it('plans every voxel exactly once', () => {
        expect(plan.steps).toHaveLength(ir.voxels.length);
        expect(new Set(plan.steps.map((s) => s.voxelId)).size).toBe(ir.voxels.length);
        plan.steps.forEach((s, i) => expect(s.index).toBe(i));
      });

      it('keeps the partial assembly connected (every step docks onto a placed voxel)', () => {
        plan.steps.slice(1).forEach((s) => {
          // Disconnected islands legitimately start a new keystone
          const hasAnyNeighbour = ir.getLinks(s.voxelId).length > 0;
          if (hasAnyNeighbour && s.anchorIds.length === 0) {
            const earlier = new Set(plan.steps.slice(0, s.index).map((x) => x.voxelId));
            const connectedToEarlier = ir.getNeighbors(s.voxelId).some((n) => earlier.has(n.id));
            expect(connectedToEarlier).toBe(false);
          }
        });
      });

      it('paths start in the container slot and end exactly on the lattice target', () => {
        for (const s of plan.steps) {
          expect(s.path[0]).toEqual(s.slot);
          expect(s.path[s.path.length - 1]).toEqual(s.target);
          expect(samplePath(s.path, 0)).toEqual(s.slot);
          expect(samplePath(s.path, 1)).toEqual(s.target);
          expect(s.pathLengthMm).toBeGreaterThan(0);
        }
      });

      it('finds an obstacle-free route for every voxel', () => {
        expect(plan.steps.filter((s) => !s.collisionFree)).toEqual([]);
      });

      it('keeps the container clear of the finished assembly', () => {
        const asmMinX = Math.min(...plan.steps.map((s) => s.target.x - s.size.x / 2));
        expect(plan.dock.maxMm.x).toBeLessThan(asmMinX);
        expect(plan.dock.slots).toHaveLength(Math.max(1, ir.voxels.length));
        for (const slot of plan.dock.slots) {
          expect(slot.x).toBeGreaterThan(plan.dock.innerMinMm.x);
          expect(slot.x).toBeLessThan(plan.dock.innerMaxMm.x);
          expect(slot.y).toBeGreaterThan(plan.dock.innerMinMm.y);
          expect(slot.y).toBeLessThan(plan.dock.innerMaxMm.y);
        }
      });
    });
  }

  it('is deterministic', () => {
    const ir = compile(HANDHELD.dsl);
    expect(planAssembly(ir)).toEqual(planAssembly(ir));
    expect(orderVoxels(ir).map((v) => v.id)).toEqual(orderVoxels(ir).map((v) => v.id));
  });

  it('starts from the best-connected compute voxel', () => {
    const ir = compile(HANDHELD.dsl);
    expect(orderVoxels(ir)[0].id).toBe('gpu');
  });

  it('handles an empty assembly', () => {
    const ir = compile('assembly "empty" {\n}\n');
    const plan = planAssembly(ir);
    expect(plan.steps).toEqual([]);
    expect(plan.dock.slots).toHaveLength(1);
  });
});

describe('path geometry helpers', () => {
  it('samples along arc length and eases monotonically', () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 100 },
      { x: 100, y: 0, z: 100 },
    ];
    expect(samplePath(path, 0.5)).toEqual({ x: 0, y: 0, z: 100 });
    expect(samplePath(path, 0.75)).toEqual({ x: 50, y: 0, z: 100 });
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const e = easeInOutCubic(t);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('segmentHitsBox treats face contact as clear but interior crossings as hits', () => {
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } };
    const half = { x: 50, y: 50, z: 50 };
    // sliding in from -x until the faces touch: allowed
    expect(segmentHitsBox({ x: -300, y: 50, z: 50 }, { x: -50, y: 50, z: 50 }, half, box)).toBe(false);
    // plunging through the middle: blocked
    expect(segmentHitsBox({ x: -300, y: 50, z: 50 }, { x: 50, y: 50, z: 50 }, half, box)).toBe(true);
  });
});

describe('deriveJointAxis', () => {
  const dsl = `assembly "pivot" {
}

voxel a @ (0, 0, 0) {
  type: "vox.struct.alu-150"
}

voxel hinge @ (1, 0, 0) {
  type: "vox.actuated.em-60"
}

voxel c @ (2, 0, 0) {
  type: "vox.struct.alu-150"
}`;

  it('uses the first lattice axis no mechanical link occupies', () => {
    const ir = compile(dsl);
    // links run along x, so the hinge axis is y
    expect(deriveJointAxis(ir, 'hinge')).toBe('y');
  });

  it('honours an explicit axis property', () => {
    const ir = compile(dsl.replace('type: "vox.actuated.em-60"', 'type: "vox.actuated.em-60"\n  axis: "z"'));
    expect(deriveJointAxis(ir, 'hinge')).toBe('z');
  });

  it('defaults to y for an unlinked voxel', () => {
    const ir = compile('voxel solo @ (0, 0, 0) {\n  type: "vox.actuated.em-60"\n}');
    expect(deriveJointAxis(ir, 'solo')).toBe('y');
  });
});

describe('moving a voxel keeps DSL, IR and gates in sync', () => {
  it('rewrites only the moved voxel header', () => {
    const next = moveVoxelInDsl(HANDHELD.dsl, 'controller', { x: -1, y: 0, z: 1 });
    expect(next).toContain('voxel controller @ (-1, 0, 1)');
    expect(next).toContain('voxel gpu @ (0, 0, 0)');
    expect(next.split('\n').length).toBe(HANDHELD.dsl.split('\n').length);
  });

  it('recompiles to the new coordinate and re-verifies', () => {
    const base = compile(HANDHELD.dsl);
    const before = verifyAssembly(base, HANDHELD.roomEnvironment);
    // Two cells away from everything: the controller loses its only lattice link
    const nextIr = compile(moveVoxelInDsl(HANDHELD.dsl, 'controller', { x: -2, y: 0, z: 0 }));
    expect(nextIr.getVoxel('controller')!.coord).toEqual({ x: -2, y: 0, z: 0 });
    expect(nextIr.links.length).toBe(base.links.length - 1);
    expect(nextIr.getLinks('controller')).toEqual([]);
    const after = verifyAssembly(nextIr, HANDHELD.roomEnvironment);
    expect(after.diagnostics).not.toEqual(before.diagnostics);
  });

  it('refuses occupied cells and allows free ones', () => {
    const ir = compile(HANDHELD.dsl);
    expect(isCellFree(ir, 'controller', { x: 0, y: 0, z: 0 })).toBe(false); // gpu is there
    expect(isCellFree(ir, 'controller', { x: -1, y: 0, z: 0 })).toBe(true); // its own cell
    expect(isCellFree(ir, 'controller', { x: -2, y: 0, z: 0 })).toBe(true);
  });
});

describe('articulated hinge/pivot & guided docking kinematics', () => {
  it('plans a collision-free articulated pivot-hinge with sampled arc for actuated voxels', () => {
    const ir = compile(LIVING_ROOM.dsl);
    const plan = planAssembly(ir);
    const pivotStep = plan.steps.find((s) => s.voxelId === 'pivot_joint')!;

    expect(pivotStep).toBeDefined();
    expect(pivotStep.collisionFree).toBe(true);
    expect(pivotStep.docking.mode).toBe('pivot-hinge');
    expect(pivotStep.docking.pivot).not.toBeNull();

    const pivot = pivotStep.docking.pivot!;
    expect(Math.abs(pivot.startAngleRad)).toBeGreaterThanOrEqual(Math.PI / 3 - 1e-4);
    expect(pivot.arcPoints.length).toBeGreaterThanOrEqual(10);

    // During the pivot sweep, the lever arm from the shared hinge edge stays rigid (constant radius)
    const leverRadius = Math.hypot(
      pivotStep.target.x - pivot.hingePoint.x,
      pivotStep.target.y - pivot.hingePoint.y,
      pivotStep.target.z - pivot.hingePoint.z
    );
    for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
      const p = pivotPositionAt(pivotStep.target, pivot, pivot.startAngleRad * (1 - frac));
      const r = Math.hypot(
        p.x - pivot.hingePoint.x,
        p.y - pivot.hingePoint.y,
        p.z - pivot.hingePoint.z
      );
      expect(r).toBeCloseTo(leverRadius, 4);
    }
  });

  it('uses corner-edge Pivoting for single-anchor voxels and Traversal guided-dock for multi-anchor pockets', () => {
    const ir = compile(HANDHELD.dsl);
    const plan = planAssembly(ir);

    const keystone = plan.steps[0];
    expect(keystone.docking.mode).toBe('keystone');

    // Single-anchor voxels on Handheld Console swing into place via corner-edge pivoting
    const screenStep = plan.steps.find((s) => s.voxelId === 'screen')!;
    expect(screenStep.docking.mode).toBe('pivot-hinge');
    expect(screenStep.docking.primaryAnchorId).toBe('gpu');

    const batteryStep = plan.steps.find((s) => s.voxelId === 'battery')!;
    expect(batteryStep.docking.mode).toBe('pivot-hinge');
    expect(batteryStep.docking.primaryAnchorId).toBe('gpu');

    // A multi-anchor corner voxel (touching 2 placed neighbors) uses coaxial Traversal (guided-dock)
    const pocketDsl = `assembly "pocket" {
}

voxel base @ (0, 0, 0) {
  type: "vox.compute.gpu-module"
}

voxel wing_x @ (1, 0, 0) {
  type: "vox.power.pd-100w"
}

voxel wing_y @ (0, 1, 0) {
  type: "vox.display.oled-6in"
}

voxel corner @ (1, 1, 0) {
  type: "vox.struct.alu-150"
}`;
    const pocketPlan = planAssembly(compile(pocketDsl));
    const cornerStep = pocketPlan.steps.find((s) => s.voxelId === 'corner')!;
    expect(cornerStep.anchorIds.length).toBe(2);
    expect(cornerStep.docking.mode).toBe('guided-dock');
    const stagingDist = Math.hypot(
      cornerStep.docking.stagingPoint.x - cornerStep.target.x,
      cornerStep.docking.stagingPoint.y - cornerStep.target.y,
      cornerStep.docking.stagingPoint.z - cornerStep.target.z
    );
    expect(stagingDist).toBeLessThan(cornerStep.size.x * 1.1);
  });

  it('sampleStepPose traverses Launch -> Travel -> Pivot -> Catch and monotonically latches/unlatches', () => {
    const ir = compile(LIVING_ROOM.dsl);
    const plan = planAssembly(ir);
    const pivotStep = plan.steps.find((s) => s.voxelId === 'pivot_joint')!;

    const startPose = sampleStepPose(pivotStep, 0);
    expect(startPose.position).toEqual(pivotStep.slot);
    expect(startPose.rotationAngleRad).toBe(0);
    expect(startPose.latchProgress).toBe(0);
    expect(startPose.phase).toBe('stowed');

    const endPose = sampleStepPose(pivotStep, 1);
    expect(endPose.position).toEqual(pivotStep.target);
    expect(endPose.rotationAngleRad).toBe(0);
    expect(endPose.latchProgress).toBe(1);
    expect(endPose.phase).toBe('seated');

    // Latch ramps monotonically from 0 → 1 on forward scrub (and reverses cleanly on Step Back)
    let prevLatch = 0;
    const seenPhases = new Set<string>();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const pose = sampleStepPose(pivotStep, t);
      expect(pose.latchProgress).toBeGreaterThanOrEqual(prevLatch - 1e-9);
      prevLatch = pose.latchProgress;
      seenPhases.add(pose.phase);
    }
    expect(seenPhases.has('launch')).toBe(true);
    expect(seenPhases.has('travel')).toBe(true);
    expect(seenPhases.has('pivot')).toBe(true);
    expect(seenPhases.has('catch')).toBe(true);

    // During Catch phase (and on Step Back before departing), voxel sits flush while latch toggles
    const midCatch = sampleStepPose(
      pivotStep,
      (pivotStep.docking.latchStartT + 1) / 2
    );
    expect(midCatch.position).toEqual(pivotStep.target);
    expect(midCatch.rotationAngleRad).toBe(0);
    expect(midCatch.phase).toBe('catch');
    expect(midCatch.latchProgress).toBeGreaterThan(0.15);
    expect(midCatch.latchProgress).toBeLessThan(0.95);
  });
});

