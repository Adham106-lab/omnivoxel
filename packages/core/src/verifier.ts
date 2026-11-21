import { VoxelIR, VoxelInstance } from './ir.js';
import {
  calculateBoxClearanceMm,
  calculateVoxelBoundsMm,
  doBoxesOverlap,
  getRoomBoundsMm,
  RoomEnvironment,
} from './room.js';
import { Coord3D, Diagnostic, VerifierResult } from './types.js';

const GRAVITY_M_S2 = 9.80665;
const I2C_MAX_DISTANCE_METERS = 1.0; // From MIT VIK paper Section 7.2

export interface VerifyOptions {
  room?: RoomEnvironment;
  roomPlacement?: {
    offsetMm?: Coord3D;
    voxelPitchMm?: number;
  };
  minClearanceMm?: number;
}

export class VoxelVerifier {
  /**
   * Run all 5 deterministic verification gates against the VoxelIR.
   */
  public verify(
    ir: VoxelIR,
    options?: VerifyOptions | RoomEnvironment
  ): VerifierResult {
    let room: RoomEnvironment | undefined;
    let placementOffset: Coord3D = { x: 0, y: 0, z: 0 };
    let defaultPitch = 150;
    let minClearanceMm = 15;

    if (options) {
      if ('obstacles' in options && 'dimensionsMm' in options) {
        room = options as RoomEnvironment;
      } else {
        const opts = options as VerifyOptions;
        room = opts.room;
        if (opts.roomPlacement?.offsetMm) placementOffset = opts.roomPlacement.offsetMm;
        if (opts.roomPlacement?.voxelPitchMm) defaultPitch = opts.roomPlacement.voxelPitchMm;
        if (opts.minClearanceMm !== undefined) minClearanceMm = opts.minClearanceMm;
      }
    }

    const diagnostics: Diagnostic[] = [];

    // Gate 1: Spatial overlap, single connected graph, room bounds & obstacle collision
    this.verifyGate1SpatialTopology(
      ir,
      diagnostics,
      room,
      placementOffset,
      defaultPitch,
      minClearanceMm
    );

    // Gate 2: Dual-Plane Bus check (High-Speed & Control Plane / I2C)
    this.verifyGate2DualPlaneBus(ir, diagnostics);

    // Gate 3: Power budget & rail isolation check (actuator vs. compute)
    this.verifyGate3PowerAndIsolation(ir, diagnostics);

    // Gate 4: Thermal budget check (heatsink dissipation >= compute TDP)
    this.verifyGate4ThermalBudget(ir, diagnostics);

    // Gate 5: Basic vertical static load check (stack weight vs compression limit)
    this.verifyGate5VerticalStaticLoad(ir, diagnostics);

    const errors = diagnostics.filter((d) => d.severity === 'error');
    const warnings = diagnostics.filter((d) => d.severity === 'warning');

    return {
      passed: errors.length === 0,
      diagnostics,
      errors,
      warnings,
    };
  }

  // --------------------------------------------------------------------------
  // Gate 1: Spatial Overlap, Connectivity, Room Bounds & Obstacle Collisions
  // --------------------------------------------------------------------------
  private verifyGate1SpatialTopology(
    ir: VoxelIR,
    diagnostics: Diagnostic[],
    room?: RoomEnvironment,
    placementOffset: Coord3D = { x: 0, y: 0, z: 0 },
    defaultPitch: number = 150,
    minClearanceMm: number = 15
  ): void {
    const gate = 1;
    const gateName = 'Spatial & Connectivity';

    // 1A. Check for spatial overlap
    const coordMap = new Map<string, VoxelInstance[]>();
    for (const v of ir.voxels) {
      const key = `${v.coord.x},${v.coord.y},${v.coord.z}`;
      const list = coordMap.get(key) || [];
      list.push(v);
      coordMap.set(key, list);
    }

    for (const [key, list] of coordMap.entries()) {
      if (list.length > 1) {
        const ids = list.map((v) => v.id);
        diagnostics.push({
          gate,
          gateName,
          severity: 'error',
          message: `Spatial overlap detected at coordinate (${key.replace(/,/g, ', ')}): voxels [${ids.join(
            ', '
          )}] occupy the exact same coordinate.`,
          voxelIds: ids,
          suggestedFix: `Relocate voxel "${ids[1]}" to an adjacent unoccupied coordinate.`,
        });
      }
    }

    // 1B. Check for single connected graph
    if (ir.voxels.length > 1) {
      const mechanicalAdjacency = new Map<string, string[]>();
      for (const v of ir.voxels) {
        mechanicalAdjacency.set(v.id, []);
      }
      for (const link of ir.links) {
        if (link.mechanical) {
          mechanicalAdjacency.get(link.sourceId)?.push(link.targetId);
          mechanicalAdjacency.get(link.targetId)?.push(link.sourceId);
        }
      }

      const visited = new Set<string>();
      const queue: string[] = [ir.voxels[0].id];
      visited.add(ir.voxels[0].id);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const neighbors = mechanicalAdjacency.get(curr) || [];
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }

      if (visited.size < ir.voxels.length) {
        const disconnectedIds = ir.voxels
          .filter((v) => !visited.has(v.id))
          .map((v) => v.id);

        diagnostics.push({
          gate,
          gateName,
          severity: 'error',
          message: `Disconnected assembly detected: voxel(s) [${disconnectedIds.join(
            ', '
          )}] are not mechanically linked to the main assembly lattice.`,
          voxelIds: disconnectedIds,
          suggestedFix:
            'Add structural voxels (e.g. vox.struct.alu-150) to bridge disconnected voxel clusters into a single connected lattice.',
        });
      }
    }

    // 1C, 1D, 1E: Scanned Room Environment checks (bounds, obstacle collisions & clearances)
    if (room) {
      const roomBounds = getRoomBoundsMm(room);

      // 1C. Room boundary checks
      for (const v of ir.voxels) {
        const vBounds = calculateVoxelBoundsMm(v, placementOffset, defaultPitch);
        const outsideX =
          vBounds.min.x < roomBounds.min.x || vBounds.max.x > roomBounds.max.x;
        const outsideY =
          vBounds.min.y < roomBounds.min.y || vBounds.max.y > roomBounds.max.y;
        const outsideZ =
          vBounds.min.z < roomBounds.min.z || vBounds.max.z > roomBounds.max.z;

        if (outsideX || outsideY || outsideZ) {
          diagnostics.push({
            gate,
            gateName,
            severity: 'error',
            message: `Room bounds violation: voxel "${v.id}" at [${vBounds.min.x}, ${vBounds.min.y}, ${vBounds.min.z}] to [${vBounds.max.x}, ${vBounds.max.y}, ${vBounds.max.z}] mm extends outside scanned room boundary ([${roomBounds.min.x}, ${roomBounds.min.y}, ${roomBounds.min.z}] to [${roomBounds.max.x}, ${roomBounds.max.y}, ${roomBounds.max.z}] mm).`,
            voxelIds: [v.id],
            suggestedFix:
              'Apply layout placement helper (snap-to-room) or translate assembly coordinates to remain within scanned room dimensions.',
            metadata: { voxelBounds: vBounds, roomBounds },
          });
        }
      }

      // 1D. Collisions against fixed obstacles (walls, fixed furniture, appliances)
      for (const obstacle of room.obstacles) {
        if (obstacle.isFixed !== false) {
          const obstBounds = {
            min: obstacle.boundsMinMm,
            max: obstacle.boundsMaxMm,
          };

          for (const v of ir.voxels) {
            const vBounds = calculateVoxelBoundsMm(v, placementOffset, defaultPitch);
            if (doBoxesOverlap(vBounds, obstBounds)) {
              diagnostics.push({
                gate,
                gateName,
                severity: 'error',
                message: `Spatial collision detected: voxel "${v.id}" collides with fixed ${obstacle.type} obstacle "${obstacle.name || obstacle.id}".`,
                voxelIds: [v.id],
                suggestedFix: `Use dock-to-furniture helper or translate assembly so voxel "${v.id}" mounts cleanly adjacent to "${obstacle.name || obstacle.id}" without penetrating it.`,
                metadata: {
                  obstacleId: obstacle.id,
                  obstacleType: obstacle.type,
                  voxelBounds: vBounds,
                  obstacleBounds: obstBounds,
                },
              });
            } else {
              // 1E. Basic clearance check
              const clearance = calculateBoxClearanceMm(vBounds, obstBounds);
              if (clearance > 0 && clearance < minClearanceMm) {
                diagnostics.push({
                  gate,
                  gateName,
                  severity: 'warning',
                  message: `Low clearance warning: voxel "${v.id}" has ${clearance.toFixed(
                    1
                  )} mm clearance to fixed ${obstacle.type} "${obstacle.name || obstacle.id}", below recommended clearance of ${minClearanceMm} mm.`,
                  voxelIds: [v.id],
                  suggestedFix: `Adjust assembly placement to maintain at least ${minClearanceMm} mm clearance from "${obstacle.name || obstacle.id}" for proper thermal airflow and servicing.`,
                  metadata: {
                    obstacleId: obstacle.id,
                    clearanceMm: clearance,
                    minClearanceMm,
                  },
                });
              }
            }
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Gate 2: Dual-Plane Bus Check
  // --------------------------------------------------------------------------
  private verifyGate2DualPlaneBus(ir: VoxelIR, diagnostics: Diagnostic[]): void {
    const gate = 2;
    const gateName = 'Dual-Plane Bus';

    // 2A. High-Speed Plane path between compute and display
    const displayVoxels = ir.voxels.filter(
      (v) =>
        v.manifest.category === 'display' ||
        v.manifest.electrical.highSpeedPlane.isSink
    );
    const computeVoxels = ir.voxels.filter(
      (v) =>
        v.manifest.category === 'compute' ||
        v.manifest.electrical.highSpeedPlane.isSource
    );

    if (displayVoxels.length > 0) {
      if (computeVoxels.length === 0) {
        for (const d of displayVoxels) {
          diagnostics.push({
            gate,
            gateName,
            severity: 'error',
            message: `Display voxel "${d.id}" requires a High-Speed Plane video stream, but no compute voxel exists in the assembly.`,
            voxelIds: [d.id],
            suggestedFix:
              'Add a compute voxel (such as vox.compute.gpu-module) to drive the display.',
          });
        }
      } else {
        // Build High-Speed graph
        const hsAdjacency = new Map<string, string[]>();
        for (const v of ir.voxels) {
          hsAdjacency.set(v.id, []);
        }
        for (const link of ir.links) {
          if (link.highSpeedPlane.connected) {
            hsAdjacency.get(link.sourceId)?.push(link.targetId);
            hsAdjacency.get(link.targetId)?.push(link.sourceId);
          }
        }

        const computeIds = new Set(computeVoxels.map((c) => c.id));

        for (const d of displayVoxels) {
          // BFS from display to see if any compute voxel is reachable
          const visited = new Set<string>();
          const queue: string[] = [d.id];
          visited.add(d.id);
          let reachableCompute = false;

          while (queue.length > 0) {
            const curr = queue.shift()!;
            if (computeIds.has(curr)) {
              reachableCompute = true;
              break;
            }
            const neighbors = hsAdjacency.get(curr) || [];
            for (const n of neighbors) {
              if (!visited.has(n)) {
                visited.add(n);
                queue.push(n);
              }
            }
          }

          if (!reachableCompute) {
            diagnostics.push({
              gate,
              gateName,
              severity: 'error',
              message: `Display voxel "${d.id}" requires a High-Speed Plane connection to a compute voxel, but no valid high-speed path was found.`,
              voxelIds: [d.id],
              suggestedFix:
                'Ensure all intermediate voxels support High-Speed Plane pass-through, or place the display adjacent to the compute module.',
            });
          }
        }
      }
    }

    // 2B. Control Plane (I2C) bus distance warning
    // Compute max shortest-path distance between communicating I2C nodes
    const i2cNodes = ir.voxels.filter(
      (v) =>
        v.manifest.electrical.controlPlane.supported &&
        v.manifest.electrical.controlPlane.protocol === 'i2c'
    );

    if (i2cNodes.length > 1) {
      const i2cAdjacency = new Map<string, { to: string; dist: number }[]>();
      for (const v of ir.voxels) {
        i2cAdjacency.set(v.id, []);
      }
      for (const link of ir.links) {
        if (
          link.controlPlane.connected &&
          link.controlPlane.protocol === 'i2c'
        ) {
          i2cAdjacency
            .get(link.sourceId)
            ?.push({ to: link.targetId, dist: link.distanceMeters });
          i2cAdjacency
            .get(link.targetId)
            ?.push({ to: link.sourceId, dist: link.distanceMeters });
        }
      }

      let maxI2CDistance = 0;

      for (const startNode of i2cNodes) {
        // Dijkstra / BFS for distances
        const dists = new Map<string, number>();
        dists.set(startNode.id, 0);
        const q: string[] = [startNode.id];

        while (q.length > 0) {
          const u = q.shift()!;
          const currentDist = dists.get(u)!;
          const neighbors = i2cAdjacency.get(u) || [];
          for (const edge of neighbors) {
            const nextDist = currentDist + edge.dist;
            if (!dists.has(edge.to) || nextDist < dists.get(edge.to)!) {
              dists.set(edge.to, nextDist);
              q.push(edge.to);
            }
          }
        }

        for (const targetNode of i2cNodes) {
          const d = dists.get(targetNode.id);
          if (d !== undefined && d > maxI2CDistance) {
            maxI2CDistance = d;
          }
        }
      }

      if (maxI2CDistance > I2C_MAX_DISTANCE_METERS) {
        diagnostics.push({
          gate,
          gateName,
          severity: 'warning',
          message: `I2C control plane bus length (${maxI2CDistance.toFixed(
            2
          )}m) exceeds reliable 1.0m signal integrity threshold without CAN-FD / active repeaters.`,
          suggestedFix:
            'Switch control plane to differential CAN-FD or add active I2C bus buffer/repeater voxels.',
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Gate 3: Power Budget & Rail Isolation Check
  // --------------------------------------------------------------------------
  private verifyGate3PowerAndIsolation(
    ir: VoxelIR,
    diagnostics: Diagnostic[]
  ): void {
    const gate = 3;
    const gateName = 'Power & Rail Isolation';

    const demandedCompute = ir.metrics.computePowerDemandedWatts;
    const providedCompute = ir.metrics.computePowerProvidedWatts;
    const demandedActuator = ir.metrics.actuatorPowerDemandedWatts;
    const providedActuator = ir.metrics.actuatorPowerProvidedWatts;

    // 3A. Compute Rail Power Budget
    if (demandedCompute > 0) {
      if (providedCompute === 0) {
        diagnostics.push({
          gate,
          gateName,
          severity: 'error',
          message: `No power provider found for compute rail: ${demandedCompute.toFixed(
            1
          )}W demanded by compute/display/IO components.`,
          suggestedFix:
            'Add a power supply voxel (such as vox.power.pd-100w) supplying the 5V compute rail.',
        });
      } else if (demandedCompute > providedCompute) {
        const deficit = demandedCompute - providedCompute;
        diagnostics.push({
          gate,
          gateName,
          severity: 'error',
          message: `Compute power budget exceeded: demanded ${demandedCompute.toFixed(
            1
          )}W exceeds total power supply capacity of ${providedCompute.toFixed(
            1
          )}W (deficit: ${deficit.toFixed(1)}W).`,
          suggestedFix:
            'Add an additional power supply voxel or reduce compute module workload.',
        });
      }
    }

    // 3B. Actuator Rail Power Budget
    if (demandedActuator > 0) {
      if (providedActuator === 0) {
        diagnostics.push({
          gate,
          gateName,
          severity: 'error',
          message: `No power provider found for actuator rail: ${demandedActuator.toFixed(
            1
          )}W demanded by actuated cubes.`,
          suggestedFix:
            'Add an actuator power provider voxel providing 12V high-discharge power (e.g. vox.power.pd-100w).',
        });
      } else if (demandedActuator > providedActuator) {
        const deficit = demandedActuator - providedActuator;
        diagnostics.push({
          gate,
          gateName,
          severity: 'error',
          message: `Actuator power budget exceeded: demanded ${demandedActuator.toFixed(
            1
          )}W exceeds available actuator power capacity of ${providedActuator.toFixed(
            1
          )}W (deficit: ${deficit.toFixed(1)}W).`,
          suggestedFix:
            'Add additional 12V power supply modules or reduce simultaneous actuator duty cycle.',
        });
      }
    }

    // 3C. Rail Isolation Check (actuator vs. compute)
    const actuatedVoxels = ir.voxels.filter(
      (v) =>
        v.manifest.category === 'actuated' ||
        v.manifest.electrical.railIsolationRequired
    );
    const computeVoxels = ir.voxels.filter(
      (v) =>
        v.manifest.category === 'compute' ||
        v.manifest.electrical.powerRails.computeRail
    );

    if (actuatedVoxels.length > 0 && computeVoxels.length > 0) {
      // Find power providers
      const powerProviders = ir.voxels.filter(
        (v) =>
          v.manifest.category === 'power' ||
          v.manifest.electrical.powerRails.computeRail?.type === 'provider' ||
          v.manifest.electrical.powerRails.actuatorRail?.type === 'provider'
      );

      for (const p of powerProviders) {
        const rails = p.manifest.electrical.powerRails;
        const computeRail = rails.computeRail;
        const actuatorRail = rails.actuatorRail;

        if (computeRail && actuatorRail) {
          // If both rails exist on the same unit, they must be isolated
          const computeIsolated = computeRail.isolated ?? false;
          const actuatorIsolated = actuatorRail.isolated ?? false;

          if (!computeIsolated || !actuatorIsolated) {
            diagnostics.push({
              gate,
              gateName,
              severity: 'error',
              message: `Rail isolation violation in power provider "${p.id}": actuator rail and compute rail share an unisolated power bus. High inductive flyback pulses risk resetting compute hardware.`,
              voxelIds: [p.id],
              suggestedFix:
                'Use an isolated dual-rail power supply (e.g. vox.power.pd-100w) or insert galvanic DC-DC isolation.',
            });
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Gate 4: Thermal Budget Check
  // --------------------------------------------------------------------------
  private verifyGate4ThermalBudget(
    ir: VoxelIR,
    diagnostics: Diagnostic[]
  ): void {
    const gate = 4;
    const gateName = 'Thermal Budget';

    // Thermal coupling happens across face-adjacent mechanically connected voxels
    const thermalAdjacency = new Map<string, string[]>();
    for (const v of ir.voxels) {
      thermalAdjacency.set(v.id, []);
    }
    for (const link of ir.links) {
      if (link.thermalCoupled) {
        thermalAdjacency.get(link.sourceId)?.push(link.targetId);
        thermalAdjacency.get(link.targetId)?.push(link.sourceId);
      }
    }

    const visited = new Set<string>();

    for (const startVoxel of ir.voxels) {
      if (visited.has(startVoxel.id)) continue;

      // Find thermal cluster
      const cluster: VoxelInstance[] = [];
      const queue: string[] = [startVoxel.id];
      visited.add(startVoxel.id);

      while (queue.length > 0) {
        const currId = queue.shift()!;
        const v = ir.getVoxel(currId);
        if (v) cluster.push(v);

        const neighbors = thermalAdjacency.get(currId) || [];
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }

      // Check cluster thermal balance
      let clusterTdp = 0;
      let clusterDissipation = 0;
      const computeVoxelIds: string[] = [];

      for (const v of cluster) {
        clusterTdp += v.manifest.thermal.tdpWatts;
        clusterDissipation += v.manifest.thermal.passiveDissipationWatts;
        if (v.manifest.category === 'compute') {
          computeVoxelIds.push(v.id);
        }
      }

      if (clusterTdp > clusterDissipation) {
        const deficit = clusterTdp - clusterDissipation;
        const heatsinksNeeded = Math.ceil(deficit / 12.0); // 12W per alu-150 frame
        diagnostics.push({
          gate,
          gateName,
          severity: 'error',
          message: `Thermal dissipation budget exceeded: cluster generates ${clusterTdp.toFixed(
            1
          )}W TDP, but connected heatsinks only dissipate ${clusterDissipation.toFixed(
            1
          )}W (thermal deficit: ${deficit.toFixed(
            1
          )}W). Overheating will cause thermal throttling or emergency shutdown.`,
          voxelIds: computeVoxelIds.length > 0 ? computeVoxelIds : cluster.map((v) => v.id),
          suggestedFix: `Attach at least ${heatsinksNeeded} additional aluminum structural heatsink voxel(s) (vox.struct.alu-150) in direct thermal contact with the compute module.`,
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Gate 5: Basic Vertical Static Load Check
  // --------------------------------------------------------------------------
  private verifyGate5VerticalStaticLoad(
    ir: VoxelIR,
    diagnostics: Diagnostic[]
  ): void {
    const gate = 5;
    const gateName = 'Static Mechanical Load';

    // For each voxel, calculate total compressive force exerted by voxels stacked directly above it (+Z)
    for (const baseVoxel of ir.voxels) {
      // Find all voxels in the same vertical column (same X, Y) with higher Z
      let supportedMassKg = 0;
      for (const other of ir.voxels) {
        if (
          other.id !== baseVoxel.id &&
          other.coord.x === baseVoxel.coord.x &&
          other.coord.y === baseVoxel.coord.y &&
          other.coord.z > baseVoxel.coord.z
        ) {
          supportedMassKg += other.manifest.mechanical.massKg;
        }
      }

      const compressiveForceN = supportedMassKg * GRAVITY_M_S2;
      const maxLimitN = baseVoxel.manifest.mechanical.maxCompressionLoadN;

      if (compressiveForceN > maxLimitN) {
        diagnostics.push({
          gate,
          gateName,
          severity: 'error',
          message: `Vertical compressive load limit exceeded on voxel "${
            baseVoxel.id
          }": supported column weight is ${compressiveForceN.toFixed(
            1
          )} N, exceeding maximum compressive limit of ${maxLimitN.toFixed(1)} N.`,
          voxelIds: [baseVoxel.id],
          suggestedFix:
            'Reinforce base with high-capacity structural voxels (e.g. vox.struct.alu-150 rated for 2243 N) or reduce the vertical stack height.',
        });
      }
    }
  }
}

/**
 * Convenient helper to verify an IR assembly directly.
 */
export function verifyAssembly(
  ir: VoxelIR,
  options?: VerifyOptions | RoomEnvironment
): VerifierResult {
  const verifier = new VoxelVerifier();
  return verifier.verify(ir, options);
}
