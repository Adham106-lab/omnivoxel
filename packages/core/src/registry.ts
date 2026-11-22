import { VoxelManifest, validateManifest } from './manifest.js';
import { VoxelCategory } from './types.js';

/**
 * 1. vox.struct.alu-150
 * Aluminum PCB structural frame (150mm), high mechanical load capacity, 12W passive thermal dissipation.
 * Based on the MIT Voxel Invention Kit (VIK) architecture.
 */
export const MANIFEST_STRUCT_ALU_150: VoxelManifest = {
  id: 'vox.struct.alu-150',
  name: 'Aluminum PCB Structural Frame 150mm',
  version: '1.0.0',
  category: 'structural',
  description:
    'Cuboctahedron unit cell built from six 1.6mm aluminum PCB faces. Delivers 2243 N compressive strength and acts as a 12W passive thermal heatsink with passive I2C pass-through routing.',
  mechanical: {
    dimensionsMm: { x: 150, y: 150, z: 150 },
    massKg: 0.228,
    maxCompressionLoadN: 2243,
    maxTensileLoadN: 1198,
    connectorType: 'snap-fit',
    faces: 'all',
  },
  electrical: {
    controlPlane: {
      supported: true,
      protocol: 'i2c',
      faces: 'all',
      passThrough: true,
    },
    highSpeedPlane: {
      supported: false,
      protocol: 'none',
      faces: [],
      passThrough: false,
    },
    powerRails: {},
  },
  thermal: {
    tdpWatts: 0,
    passiveDissipationWatts: 12,
    thermalConductivityWmK: 167,
    isHeatsink: true,
  },
  capabilities: [
    'structural-frame',
    'high-load-capacity',
    'passive-heatsink',
    'i2c-passthrough',
  ],
};

/**
 * 2. vox.actuated.em-60
 * Electromagnetically pivoting cube (60mm, 12 edges, 12V actuator rail).
 * Based on MIT ElectroVoxel reconfigurable robotics framework.
 */
export const MANIFEST_ACTUATED_EM_60: VoxelManifest = {
  id: 'vox.actuated.em-60',
  name: 'ElectroVoxel 60mm Electromagnetic Actuator Cube',
  version: '1.0.0',
  category: 'actuated',
  description:
    '60mm cubic unit cell with 12 edge electromagnets for solid-state pivoting and traversal. Consumes 12V high-current pulse power requiring isolated actuator rail.',
  mechanical: {
    dimensionsMm: { x: 60, y: 60, z: 60 },
    massKg: 0.1031,
    maxCompressionLoadN: 250,
    maxTensileLoadN: 150,
    connectorType: 'magnetic',
    faces: 'all',
  },
  electrical: {
    controlPlane: {
      supported: true,
      protocol: 'i2c',
      faces: 'all',
      passThrough: true,
    },
    highSpeedPlane: {
      supported: false,
      protocol: 'none',
      faces: [],
    },
    powerRails: {
      actuatorRail: {
        voltage: 12.0,
        type: 'consumer',
        maxPowerWatts: 15.1,
      },
    },
    railIsolationRequired: true,
  },
  thermal: {
    tdpWatts: 3.0,
    passiveDissipationWatts: 1.5,
  },
  capabilities: [
    'electromagnetic-pivoting',
    '3d-traversal',
    'dynamic-hinging',
  ],
};

/**
 * 3. vox.compute.gpu-module
 * Standalone-capable CPU/GPU System-on-Module add-on, 35W TDP, USB4/PCIe high-speed faces.
 */
export const MANIFEST_COMPUTE_GPU_MODULE: VoxelManifest = {
  id: 'vox.compute.gpu-module',
  name: 'GPU SoM Compute Voxel Module',
  version: '1.0.0',
  category: 'compute',
  description:
    'High-performance heterogeneous compute voxel featuring high-throughput GPU/NPU acceleration. Generates 35W TDP and emits USB4 / PCIe high-speed plane video and data streams.',
  mechanical: {
    dimensionsMm: { x: 150, y: 150, z: 150 },
    massKg: 0.18,
    maxCompressionLoadN: 600,
    maxTensileLoadN: 350,
    connectorType: 'snap-fit',
    faces: 'all',
  },
  electrical: {
    controlPlane: {
      supported: true,
      protocol: 'i2c',
      faces: 'all',
      passThrough: true,
    },
    highSpeedPlane: {
      supported: true,
      protocol: 'usb4',
      faces: 'all',
      isSource: true,
      passThrough: true,
    },
    powerRails: {
      computeRail: {
        voltage: 5.0,
        type: 'consumer',
        maxPowerWatts: 35.0,
      },
    },
  },
  thermal: {
    tdpWatts: 35.0,
    passiveDissipationWatts: 2.0,
  },
  capabilities: [
    'graphics-rendering',
    'neural-acceleration',
    'high-speed-routing',
    'display-controller',
  ],
};

/**
 * 4. vox.display.oled-6in
 * 6-inch OLED display voxel requiring high-speed video link and 5V compute power.
 */
export const MANIFEST_DISPLAY_OLED_6IN: VoxelManifest = {
  id: 'vox.display.oled-6in',
  name: 'OLED Display Voxel 6-inch',
  version: '1.0.0',
  category: 'display',
  description:
    'High-resolution OLED display with capacitive multi-touch overlay. Demands continuous High-Speed Plane streaming from a compute voxel.',
  mechanical: {
    dimensionsMm: { x: 150, y: 150, z: 150 },
    massKg: 0.12,
    maxCompressionLoadN: 400,
    connectorType: 'snap-fit',
    faces: 'all',
  },
  electrical: {
    controlPlane: {
      supported: true,
      protocol: 'i2c',
      faces: 'all',
      passThrough: true,
    },
    highSpeedPlane: {
      supported: true,
      protocol: 'dp',
      faces: 'all',
      isSink: true,
      passThrough: false,
    },
    powerRails: {
      computeRail: {
        voltage: 5.0,
        type: 'consumer',
        maxPowerWatts: 6.0,
      },
    },
  },
  thermal: {
    tdpWatts: 6.0,
    passiveDissipationWatts: 2.0,
  },
  capabilities: ['display-output', 'capacitive-touch', 'video-sink'],
};

/**
 * 5. vox.power.pd-100w
 * Isolated dual-rail battery pack supplying USB-PD + actuator power.
 */
export const MANIFEST_POWER_PD_100W: VoxelManifest = {
  id: 'vox.power.pd-100w',
  name: 'Isolated Dual-Rail Power Delivery 100W Pack',
  version: '1.0.0',
  category: 'power',
  description:
    'Rechargeable LiFePO4 battery pack equipped with isolated dual-rail regulators: 65W USB-PD clean compute rail and 60W 12V high-discharge actuator rail.',
  mechanical: {
    dimensionsMm: { x: 150, y: 150, z: 150 },
    massKg: 0.45,
    maxCompressionLoadN: 1800,
    maxTensileLoadN: 900,
    connectorType: 'snap-fit',
    faces: 'all',
  },
  electrical: {
    controlPlane: {
      supported: true,
      protocol: 'i2c',
      faces: 'all',
      passThrough: true,
    },
    highSpeedPlane: {
      supported: true,
      protocol: 'usb4',
      faces: 'all',
      passThrough: true,
    },
    powerRails: {
      computeRail: {
        voltage: 5.0,
        type: 'provider',
        maxPowerWatts: 65.0,
        isolated: true,
      },
      actuatorRail: {
        voltage: 12.0,
        type: 'provider',
        maxPowerWatts: 60.0,
        isolated: true,
      },
    },
  },
  thermal: {
    tdpWatts: 3.0,
    passiveDissipationWatts: 4.0,
  },
  capabilities: [
    'power-provider',
    'isolated-dual-rail',
    'high-current-actuation',
    'battery-telemetry',
  ],
};

/**
 * 6. vox.io.gamepad-ctrl
 * I2C/CAN-FD input controller voxel with dual thumbsticks and tactile buttons.
 */
export const MANIFEST_IO_GAMEPAD_CTRL: VoxelManifest = {
  id: 'vox.io.gamepad-ctrl',
  name: 'Gamepad Input Controller Voxel',
  version: '1.0.0',
  category: 'io',
  description:
    'Ergonomic gaming input surface featuring analog thumbsticks, D-pad, and mechanical action buttons. Reports input vectors over I2C and CAN-FD control plane.',
  mechanical: {
    dimensionsMm: { x: 150, y: 150, z: 150 },
    massKg: 0.085,
    maxCompressionLoadN: 350,
    connectorType: 'snap-fit',
    faces: 'all',
  },
  electrical: {
    controlPlane: {
      supported: true,
      protocol: 'i2c',
      faces: 'all',
      passThrough: true,
    },
    highSpeedPlane: {
      supported: true,
      protocol: 'usb4',
      faces: 'all',
      passThrough: true,
    },
    powerRails: {
      computeRail: {
        voltage: 5.0,
        type: 'consumer',
        maxPowerWatts: 0.5,
      },
    },
  },
  thermal: {
    tdpWatts: 0.5,
    passiveDissipationWatts: 1.0,
  },
  capabilities: [
    'gamepad-input',
    'analog-joystick',
    'haptic-feedback',
    'can-fd-ready',
  ],
};

/**
 * 7. vox.compute.arm-soc
 * Unified low-TDP, high-efficiency ARM64 compute module scaling from Phone -> Laptop -> PC Workstation.
 */
export const MANIFEST_COMPUTE_ARM_SOC: VoxelManifest = {
  id: 'vox.compute.arm-soc',
  name: 'Unified ARM64 Compute SoC Module',
  version: '1.0.0',
  category: 'compute',
  description:
    'Low-TDP, high-efficiency ARM64 System-on-Chip voxel designed to scale seamlessly from passive mobile/laptop builds to multi-module desktop workstation clusters. Exposes dual Control Plane (I2C) and High-Speed Plane (PCIe/USB4) lanes on all mating faces.',
  mechanical: {
    dimensionsMm: { x: 150, y: 150, z: 150 },
    massKg: 0.125,
    maxCompressionLoadN: 750,
    maxTensileLoadN: 420,
    connectorType: 'snap-fit',
    faces: 'all',
  },
  electrical: {
    controlPlane: {
      supported: true,
      protocol: 'i2c',
      faces: 'all',
      passThrough: true,
    },
    highSpeedPlane: {
      supported: true,
      protocol: 'pcie',
      faces: 'all',
      isSource: true,
      passThrough: true,
    },
    powerRails: {
      computeRail: {
        voltage: 5.0,
        type: 'consumer',
        maxPowerWatts: 10.0,
      },
    },
  },
  thermal: {
    tdpWatts: 10.0,
    passiveDissipationWatts: 6.0,
  },
  capabilities: [
    'arm64-compute',
    'unified-architecture',
    'neural-acceleration',
    'high-speed-routing',
    'display-controller',
    'pcie-usb4-host',
  ],
  metadata: {
    architecture: 'ARM64',
    nominalTdpWatts: 10,
    scalableTiers: ['phone', 'laptop', 'workstation'],
    highSpeedLanes: 'PCIe Gen4 / USB4',
  },
};

/**
 * 8. vox.device.phone-core
 * Compact standalone-capable ARM Phone Core with dedicated/private onboard storage and internal battery.
 */
export const MANIFEST_DEVICE_PHONE_CORE: VoxelManifest = {
  id: 'vox.device.phone-core',
  name: 'Modular ARM Phone Core',
  version: '1.0.0',
  category: 'compute',
  description:
    'Standalone-capable modular ARM64 phone core integrating an efficient ARM SoC, internal mobile battery, and 256 GB dedicated private onboard UFS storage so it can undock from the lattice and run its own OS and personal data independently, or dock into Laptop/PC lattices with external NVMe storage.',
  mechanical: {
    dimensionsMm: { x: 150, y: 150, z: 150 },
    massKg: 0.195,
    maxCompressionLoadN: 700,
    maxTensileLoadN: 380,
    connectorType: 'snap-fit',
    faces: 'all',
  },
  electrical: {
    controlPlane: {
      supported: true,
      protocol: 'i2c',
      faces: 'all',
      passThrough: true,
    },
    highSpeedPlane: {
      supported: true,
      protocol: 'usb4',
      faces: 'all',
      isSource: true,
      passThrough: true,
    },
    powerRails: {
      computeRail: {
        voltage: 5.0,
        type: 'provider',
        maxPowerWatts: 15.0,
        isolated: true,
      },
    },
  },
  thermal: {
    tdpWatts: 5.0,
    passiveDissipationWatts: 6.0,
  },
  storage: {
    capacityGb: 256,
    scope: 'dedicated',
    interface: 'ufs',
    requiresHostHighSpeedLink: false,
  },
  capabilities: [
    'arm64-compute',
    'standalone-phone',
    'dedicated-private-storage',
    'integrated-mobile-battery',
    'high-speed-routing',
    'display-controller',
    'usb4-host',
  ],
  metadata: {
    architecture: 'ARM64',
    dedicatedStorageGb: 256,
    storageScope: 'dedicated',
    standaloneCapable: true,
    integratedBatteryWh: 18,
    integratedDisplay: true,
  },
};

/**
 * 9. vox.storage.nvme-bay
 * Hot-swappable modular secondary/external NVMe storage bay requiring a High-Speed Plane host link.
 */
export const MANIFEST_STORAGE_NVME_BAY: VoxelManifest = {
  id: 'vox.storage.nvme-bay',
  name: 'Modular NVMe Storage Bay 2TB',
  version: '1.0.0',
  category: 'storage',
  description:
    'Hot-swappable 2 TB modular NVMe storage bay enclosed in a passive aluminum thermal caddy. Provides expandable secondary storage for ARM Laptops, PC Workstations, and docked Phones over the High-Speed Plane (PCIe/USB4).',
  mechanical: {
    dimensionsMm: { x: 150, y: 150, z: 150 },
    massKg: 0.14,
    maxCompressionLoadN: 950,
    maxTensileLoadN: 500,
    connectorType: 'snap-fit',
    faces: 'all',
  },
  electrical: {
    controlPlane: {
      supported: true,
      protocol: 'i2c',
      faces: 'all',
      passThrough: true,
    },
    highSpeedPlane: {
      supported: true,
      protocol: 'pcie',
      faces: 'all',
      passThrough: true,
    },
    powerRails: {
      computeRail: {
        voltage: 5.0,
        type: 'consumer',
        maxPowerWatts: 4.0,
      },
    },
  },
  thermal: {
    tdpWatts: 4.0,
    passiveDissipationWatts: 4.5,
  },
  storage: {
    capacityGb: 2048,
    scope: 'modular',
    interface: 'nvme-pcie',
    requiresHostHighSpeedLink: true,
  },
  capabilities: [
    'nvme-storage',
    'hot-swappable',
    'secondary-storage',
    'pcie-usb4-endpoint',
    'high-speed-routing',
  ],
  metadata: {
    capacityGb: 2048,
    storageScope: 'modular',
    hotSwappable: true,
    interface: 'PCIe Gen4 x4 / USB4',
  },
};

/**
 * Standard starter manifest catalog array.
 */
export const STARTER_MANIFESTS: readonly VoxelManifest[] = [
  MANIFEST_STRUCT_ALU_150,
  MANIFEST_ACTUATED_EM_60,
  MANIFEST_COMPUTE_GPU_MODULE,
  MANIFEST_DISPLAY_OLED_6IN,
  MANIFEST_POWER_PD_100W,
  MANIFEST_IO_GAMEPAD_CTRL,
  MANIFEST_COMPUTE_ARM_SOC,
  MANIFEST_DEVICE_PHONE_CORE,
  MANIFEST_STORAGE_NVME_BAY,
] as const;

/**
 * Extensible manifest registry for managing known voxel specifications.
 */
export class VoxelRegistry {
  private readonly manifests = new Map<string, VoxelManifest>();

  public constructor(initialManifests?: readonly VoxelManifest[]) {
    if (initialManifests) {
      for (const manifest of initialManifests) {
        this.register(manifest);
      }
    }
  }

  /**
   * Register a new voxel manifest. Throws if invalid or already registered with different definition.
   */
  public register(manifest: VoxelManifest): void {
    validateManifest(manifest);
    this.manifests.set(manifest.id, Object.freeze({ ...manifest }));
  }

  /**
   * Retrieve a manifest by its unique id.
   */
  public get(id: string): VoxelManifest | undefined {
    return this.manifests.get(id);
  }

  /**
   * Verify if a manifest id exists in the registry.
   */
  public has(id: string): boolean {
    return this.manifests.has(id);
  }

  /**
   * Return all registered manifests.
   */
  public list(): VoxelManifest[] {
    return Array.from(this.manifests.values());
  }

  /**
   * Filter registered manifests by category.
   */
  public filterByCategory(category: VoxelCategory): VoxelManifest[] {
    return this.list().filter((m) => m.category === category);
  }

  /**
   * Returns total number of registered manifests.
   */
  public get size(): number {
    return this.manifests.size;
  }
}

/**
 * Factory creating a new registry populated with the 9 built-in hardware manifests.
 */
export function createDefaultRegistry(): VoxelRegistry {
  return new VoxelRegistry(STARTER_MANIFESTS);
}
