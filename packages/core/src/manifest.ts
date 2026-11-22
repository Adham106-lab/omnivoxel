import {
  ALL_FACES,
  ControlPlaneProtocol,
  Face,
  HighSpeedPlaneProtocol,
  VoxelCategory,
} from './types.js';

/**
 * Mechanical specifications of a modular voxel.
 */
export interface MechanicalSpec {
  /** Dimensions in millimeters (x, y, z) */
  dimensionsMm: { x: number; y: number; z: number };
  /** Mass of the voxel module in kilograms */
  massKg: number;
  /** Maximum vertical compressive load before failure in Newtons */
  maxCompressionLoadN: number;
  /** Maximum tensile load in Newtons */
  maxTensileLoadN?: number;
  /** Connector mechanism style */
  connectorType?: 'snap-fit' | 'magnetic' | 'soldered-pad' | 'clip';
  /** Faces with mechanical interconnects */
  faces?: Face[] | 'all';
}

/**
 * Electrical power rail specification.
 */
export interface PowerRailSpec {
  /** Nominal voltage in Volts (e.g., 5.0, 12.0) */
  voltage: number;
  /** Whether the voxel consumes or provides power on this rail */
  type: 'consumer' | 'provider';
  /** Rated power capacity (if provider) or peak power consumption (if consumer) in Watts */
  maxPowerWatts: number;
  /** Whether this rail is galvanically isolated from other rails */
  isolated?: boolean;
}

/**
 * Electrical specification supporting dual-plane bus architecture (Control vs High-Speed).
 */
export interface ElectricalSpec {
  /**
   * Control Plane: low-speed telemetry, configuration, and sensing (e.g. I2C, CAN-FD).
   */
  controlPlane: {
    supported: boolean;
    protocol: ControlPlaneProtocol;
    faces: Face[] | 'all';
    /** Whether it passively passes through control plane traffic to neighboring faces */
    passThrough?: boolean;
  };

  /**
   * High-Speed Plane: high-bandwidth interconnects (USB4, PCIe, DisplayPort/eDP).
   */
  highSpeedPlane: {
    supported: boolean;
    protocol: HighSpeedPlaneProtocol;
    faces: Face[] | 'all';
    /** True if this module acts as a video/high-speed stream sink (e.g., display) */
    isSink?: boolean;
    /** True if this module acts as a video/high-speed stream source (e.g., GPU/SoM) */
    isSource?: boolean;
    /** Whether it routes/bridges high-speed signals across faces */
    passThrough?: boolean;
  };

  /**
   * Dual-rail power architecture (Compute rail vs. Actuator rail).
   */
  powerRails: {
    computeRail?: PowerRailSpec;
    actuatorRail?: PowerRailSpec;
  };

  /**
   * Indicates whether this component requires strict galvanic or LC filter isolation
   * between actuator motor/coil spikes and sensitive compute logic.
   */
  railIsolationRequired?: boolean;
}

/**
 * Thermal specification of the voxel.
 */
export interface ThermalSpec {
  /** Thermal Design Power (heat generated under load) in Watts */
  tdpWatts: number;
  /** Passive ambient thermal dissipation capacity in Watts */
  passiveDissipationWatts: number;
  /** Thermal conductivity rating (W/m*K) if acting as conductive heatsink */
  thermalConductivityWmK?: number;
  /** Flag indicating whether this voxel serves as an active heatsink structure */
  isHeatsink?: boolean;
}

/**
 * Storage specification for modules providing dedicated onboard or modular external storage.
 */
export interface StorageSpec {
  /** Storage capacity in gigabytes (GB) */
  capacityGb: number;
  /** Private onboard storage (standalone-ready) vs. hot-swappable modular lattice storage */
  scope: 'dedicated' | 'modular';
  /** Underlying storage interface */
  interface: 'ufs' | 'nvme-pcie' | 'usb4-nvme';
  /** True when the module requires a High-Speed Plane (PCIe/USB4) host link to mount */
  requiresHostHighSpeedLink?: boolean;
}

/**
 * Full Voxel Manifest schema representing a standardized modular hardware block.
 */
export interface VoxelManifest {
  /** Unique manifest identifier (e.g. 'vox.compute.gpu-module') */
  id: string;
  /** Human-readable component name */
  name: string;
  /** Semantic version of this voxel specification */
  version: string;
  /** Functional category */
  category: VoxelCategory;
  /** Detailed component summary */
  description?: string;
  /** Mechanical properties */
  mechanical: MechanicalSpec;
  /** Dual-plane electrical properties */
  electrical: ElectricalSpec;
  /** Thermal dissipation & generation properties */
  thermal: ThermalSpec;
  /** Optional dedicated onboard or modular external storage specification */
  storage?: StorageSpec;
  /** Functional capability tags */
  capabilities: string[];
  /** Optional extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Helper to determine if a specific face on a voxel supports a given electrical plane.
 */
export function faceSupportsControlPlane(
  electrical: ElectricalSpec,
  face: Face
): boolean {
  if (!electrical.controlPlane.supported) return false;
  if (electrical.controlPlane.faces === 'all') return true;
  return electrical.controlPlane.faces.includes(face);
}

export function faceSupportsHighSpeedPlane(
  electrical: ElectricalSpec,
  face: Face
): boolean {
  if (!electrical.highSpeedPlane.supported) return false;
  if (electrical.highSpeedPlane.faces === 'all') return true;
  return electrical.highSpeedPlane.faces.includes(face);
}

/**
 * Validates a manifest structure at runtime.
 */
export function validateManifest(manifest: VoxelManifest): void {
  if (!manifest.id || typeof manifest.id !== 'string') {
    throw new Error('Invalid manifest: missing or invalid "id".');
  }
  if (!manifest.category) {
    throw new Error(`Invalid manifest "${manifest.id}": missing "category".`);
  }
  if (!manifest.mechanical || typeof manifest.mechanical.maxCompressionLoadN !== 'number') {
    throw new Error(
      `Invalid manifest "${manifest.id}": missing mechanical.maxCompressionLoadN.`
    );
  }
  if (!manifest.electrical || !manifest.electrical.controlPlane || !manifest.electrical.highSpeedPlane) {
    throw new Error(
      `Invalid manifest "${manifest.id}": electrical spec must define controlPlane and highSpeedPlane.`
    );
  }
  if (!manifest.thermal || typeof manifest.thermal.tdpWatts !== 'number') {
    throw new Error(
      `Invalid manifest "${manifest.id}": missing thermal.tdpWatts.`
    );
  }
}
