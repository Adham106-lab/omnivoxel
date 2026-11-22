import { VoxelAst, VoxelAstNode } from './dsl.js';
import {
  VoxelManifest,
  faceSupportsControlPlane,
  faceSupportsHighSpeedPlane,
} from './manifest.js';
import { VoxelRegistry } from './registry.js';
import {
  ALL_FACES,
  Coord3D,
  ControlPlaneProtocol,
  Face,
  HighSpeedPlaneProtocol,
  OPPOSITE_FACE,
} from './types.js';

export interface VoxelInstance {
  id: string;
  coord: Coord3D;
  manifest: VoxelManifest;
  role?: string;
  properties: Record<string, unknown>;
}

export interface VoxelLink {
  sourceId: string;
  targetId: string;
  sourceFace: Face;
  targetFace: Face;
  mechanical: boolean;
  controlPlane: {
    connected: boolean;
    protocol?: ControlPlaneProtocol;
  };
  highSpeedPlane: {
    connected: boolean;
    protocol?: HighSpeedPlaneProtocol;
  };
  thermalCoupled: boolean;
  distanceMeters: number;
}

export interface AssemblyMetrics {
  totalMassKg: number;
  totalTdpWatts: number;
  totalPassiveDissipationWatts: number;
  computePowerDemandedWatts: number;
  computePowerProvidedWatts: number;
  actuatorPowerDemandedWatts: number;
  actuatorPowerProvidedWatts: number;
  dedicatedStorageGb: number;
  modularStorageGb: number;
  totalStorageGb: number;
  boundingBox: {
    min: Coord3D;
    max: Coord3D;
    size: Coord3D;
  };
}

export class VoxelIR {
  public readonly voxels: VoxelInstance[] = [];
  public readonly voxelMap = new Map<string, VoxelInstance>();
  public readonly links: VoxelLink[] = [];
  public readonly adjacency = new Map<string, VoxelLink[]>();
  public metrics!: AssemblyMetrics;

  public constructor(
    voxels: VoxelInstance[],
    links: VoxelLink[],
    metrics: AssemblyMetrics
  ) {
    this.voxels = voxels;
    this.links = links;
    this.metrics = metrics;

    for (const v of voxels) {
      this.voxelMap.set(v.id, v);
      this.adjacency.set(v.id, []);
    }

    for (const link of links) {
      this.adjacency.get(link.sourceId)?.push(link);
      this.adjacency.get(link.targetId)?.push(link);
    }
  }

  public getVoxel(id: string): VoxelInstance | undefined {
    return this.voxelMap.get(id);
  }

  public getLinks(id: string): VoxelLink[] {
    return this.adjacency.get(id) || [];
  }

  public getNeighbors(id: string): VoxelInstance[] {
    const links = this.getLinks(id);
    const neighbors: VoxelInstance[] = [];
    for (const link of links) {
      const neighborId = link.sourceId === id ? link.targetId : link.sourceId;
      const neighbor = this.voxelMap.get(neighborId);
      if (neighbor) neighbors.push(neighbor);
    }
    return neighbors;
  }
}

/**
 * Maps coordinate delta to the corresponding face on voxel A.
 */
function getFaceFromDelta(dx: number, dy: number, dz: number): Face | null {
  if (dx === 1 && dy === 0 && dz === 0) return '+x';
  if (dx === -1 && dy === 0 && dz === 0) return '-x';
  if (dx === 0 && dy === 1 && dz === 0) return '+y';
  if (dx === 0 && dy === -1 && dz === 0) return '-y';
  if (dx === 0 && dy === 0 && dz === 1) return '+z';
  if (dx === 0 && dy === 0 && dz === -1) return '-z';
  return null;
}

/**
 * Compiles a Voxel AST and Registry into a Unified Voxel IR with automated adjacency inference.
 */
export function compileToIR(ast: VoxelAst, registry: VoxelRegistry): VoxelIR {
  const instances: VoxelInstance[] = [];

  for (const node of ast.voxels) {
    const manifest = registry.get(node.voxelType);
    if (!manifest) {
      throw new Error(
        `Unknown voxel manifest "${node.voxelType}" for voxel "${node.id}". Ensure it is registered in the VoxelRegistry.`
      );
    }
    instances.push({
      id: node.id,
      coord: node.coord,
      manifest,
      role: node.role,
      properties: node.properties,
    });
  }

  // Infer links between all adjacent pairs
  const links: VoxelLink[] = [];
  const n = instances.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const vA = instances[i];
      const vB = instances[j];

      const dx = vB.coord.x - vA.coord.x;
      const dy = vB.coord.y - vA.coord.y;
      const dz = vB.coord.z - vA.coord.z;

      const faceA = getFaceFromDelta(dx, dy, dz);
      if (faceA !== null) {
        // They share a face!
        const faceB = OPPOSITE_FACE[faceA];

        // 1. Mechanical bond
        const mechA =
          !vA.manifest.mechanical.faces ||
          vA.manifest.mechanical.faces === 'all' ||
          vA.manifest.mechanical.faces.includes(faceA);
        const mechB =
          !vB.manifest.mechanical.faces ||
          vB.manifest.mechanical.faces === 'all' ||
          vB.manifest.mechanical.faces.includes(faceB);
        const mechanical = mechA && mechB;

        // 2. Control plane
        const cpA = faceSupportsControlPlane(vA.manifest.electrical, faceA);
        const cpB = faceSupportsControlPlane(vB.manifest.electrical, faceB);
        const cpConnected = cpA && cpB;
        let cpProtocol: ControlPlaneProtocol = 'none';
        if (cpConnected) {
          // Inherit protocol (preference: can-fd, then i2c)
          const pA = vA.manifest.electrical.controlPlane.protocol;
          const pB = vB.manifest.electrical.controlPlane.protocol;
          if (pA === 'can-fd' || pB === 'can-fd') cpProtocol = 'can-fd';
          else if (pA === 'i2c' && pB === 'i2c') cpProtocol = 'i2c';
          else cpProtocol = pA !== 'none' ? pA : pB;
        }

        // 3. High-speed plane
        const hsA = faceSupportsHighSpeedPlane(vA.manifest.electrical, faceA);
        const hsB = faceSupportsHighSpeedPlane(vB.manifest.electrical, faceB);
        const hsConnected = hsA && hsB;
        let hsProtocol: HighSpeedPlaneProtocol = 'none';
        if (hsConnected) {
          const pA = vA.manifest.electrical.highSpeedPlane.protocol;
          const pB = vB.manifest.electrical.highSpeedPlane.protocol;
          if (pA === 'dp' || pB === 'dp') {
            hsProtocol = 'dp';
          } else {
            hsProtocol = pA !== 'none' ? pA : pB;
          }
        }

        // 4. Thermal coupling
        // Direct physical face contact conducts heat
        const thermalCoupled = mechanical;

        // 5. Distance pitch in meters
        const pitchA = vA.manifest.mechanical.dimensionsMm.x / 1000;
        const pitchB = vB.manifest.mechanical.dimensionsMm.x / 1000;
        const distanceMeters = (pitchA + pitchB) / 2;

        links.push({
          sourceId: vA.id,
          targetId: vB.id,
          sourceFace: faceA,
          targetFace: faceB,
          mechanical,
          controlPlane: {
            connected: cpConnected,
            protocol: cpProtocol,
          },
          highSpeedPlane: {
            connected: hsConnected,
            protocol: hsProtocol,
          },
          thermalCoupled,
          distanceMeters,
        });
      }
    }
  }

  // Calculate metrics
  const metrics = calculateMetrics(instances);

  return new VoxelIR(instances, links, metrics);
}

function calculateMetrics(instances: VoxelInstance[]): AssemblyMetrics {
  let totalMassKg = 0;
  let totalTdpWatts = 0;
  let totalPassiveDissipationWatts = 0;
  let computePowerDemandedWatts = 0;
  let computePowerProvidedWatts = 0;
  let actuatorPowerDemandedWatts = 0;
  let actuatorPowerProvidedWatts = 0;
  let dedicatedStorageGb = 0;
  let modularStorageGb = 0;

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (const v of instances) {
    totalMassKg += v.manifest.mechanical.massKg;
    totalTdpWatts += v.manifest.thermal.tdpWatts;
    totalPassiveDissipationWatts += v.manifest.thermal.passiveDissipationWatts;

    // Power rails
    const computeRail = v.manifest.electrical.powerRails.computeRail;
    if (computeRail) {
      if (computeRail.type === 'consumer') {
        computePowerDemandedWatts += computeRail.maxPowerWatts;
      } else if (computeRail.type === 'provider') {
        computePowerProvidedWatts += computeRail.maxPowerWatts;
      }
    }

    const actuatorRail = v.manifest.electrical.powerRails.actuatorRail;
    if (actuatorRail) {
      if (actuatorRail.type === 'consumer') {
        actuatorPowerDemandedWatts += actuatorRail.maxPowerWatts;
      } else if (actuatorRail.type === 'provider') {
        actuatorPowerProvidedWatts += actuatorRail.maxPowerWatts;
      }
    }

    // Dedicated vs. modular storage capacity
    const storageSpec = v.manifest.storage;
    if (storageSpec && storageSpec.capacityGb > 0) {
      if (storageSpec.scope === 'dedicated') {
        dedicatedStorageGb += storageSpec.capacityGb;
      } else {
        modularStorageGb += storageSpec.capacityGb;
      }
    } else if (typeof v.manifest.metadata?.dedicatedStorageGb === 'number') {
      dedicatedStorageGb += v.manifest.metadata.dedicatedStorageGb;
    }

    // Bounds
    minX = Math.min(minX, v.coord.x);
    minY = Math.min(minY, v.coord.y);
    minZ = Math.min(minZ, v.coord.z);
    maxX = Math.max(maxX, v.coord.x);
    maxY = Math.max(maxY, v.coord.y);
    maxZ = Math.max(maxZ, v.coord.z);
  }

  const boundingBox =
    instances.length === 0
      ? {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 0, y: 0, z: 0 },
          size: { x: 0, y: 0, z: 0 },
        }
      : {
          min: { x: minX, y: minY, z: minZ },
          max: { x: maxX, y: maxY, z: maxZ },
          size: {
            x: maxX - minX + 1,
            y: maxY - minY + 1,
            z: maxZ - minZ + 1,
          },
        };

  return {
    totalMassKg,
    totalTdpWatts,
    totalPassiveDissipationWatts,
    computePowerDemandedWatts,
    computePowerProvidedWatts,
    actuatorPowerDemandedWatts,
    actuatorPowerProvidedWatts,
    dedicatedStorageGb,
    modularStorageGb,
    totalStorageGb: dedicatedStorageGb + modularStorageGb,
    boundingBox,
  };
}
