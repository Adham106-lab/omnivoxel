import { parseDSL } from './dsl.js';
import { compileToIR, VoxelIR } from './ir.js';
import { createDefaultRegistry, VoxelRegistry } from './registry.js';
import { RoomEnvironment } from './room.js';

export interface GalleryItem {
  id: string;
  name: string;
  category: 'device' | 'setup' | 'structural';
  description: string;
  dsl: string;
  roomEnvironment: RoomEnvironment;
  tags?: string[];
  compile: (registry?: VoxelRegistry) => {
    ir: VoxelIR;
    roomEnvironment: RoomEnvironment;
  };
}

export const GALLERY_HANDHELD_CONSOLE: GalleryItem = {
  id: 'handheld-gaming-console',
  name: 'Handheld Gaming Console (OmniVoxel Deck)',
  category: 'device',
  description:
    'Ergonomic handheld gaming device featuring a high-performance GPU compute SoM, 6-inch OLED touchscreen, isolated 100W PD battery, gamepad controls, and triple aluminum PCB heatsinks.',
  tags: ['device', 'gaming', 'handheld', 'gpu', 'oled'],
  roomEnvironment: {
    id: 'room-gaming-lab',
    name: 'Hardware Prototyping Bench',
    dimensionsMm: { x: 2400, y: 2400, z: 2000 },
    boundsMinMm: { x: -600, y: -600, z: -600 },
    boundsMaxMm: { x: 1800, y: 1800, z: 1400 },
    obstacles: [
      {
        id: 'bench-top',
        name: 'ESD Worktable',
        type: 'furniture',
        boundsMinMm: { x: -500, y: -500, z: -500 },
        boundsMaxMm: { x: 1200, y: 1200, z: -200 },
        isFixed: true,
        color: '#475569',
      },
      {
        id: 'lab-backwall',
        name: 'Lab Partition Wall',
        type: 'wall',
        boundsMinMm: { x: -600, y: 1300, z: -600 },
        boundsMaxMm: { x: 1800, y: 1400, z: 1400 },
        isFixed: true,
        color: '#334155',
      },
    ],
  },
  dsl: `assembly "OmniVoxel-Deck" {
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
}`,
  compile(registry = createDefaultRegistry()) {
    const ast = parseDSL(this.dsl);
    const ir = compileToIR(ast, registry);
    return { ir, roomEnvironment: this.roomEnvironment };
  },
};

export const GALLERY_MODULAR_LAPTOP: GalleryItem = {
  id: 'modular-laptop',
  name: 'Modular Laptop Workstation',
  category: 'device',
  description:
    'Modular clamshell laptop with central compute SoM, OLED primary display, dual-rail PD battery, tactile input deck, and triple structural heatsink cooling chassis.',
  tags: ['device', 'laptop', 'clamshell', 'dual-plane'],
  roomEnvironment: {
    id: 'room-laptop-office',
    name: 'Executive Studio Office',
    dimensionsMm: { x: 2600, y: 2600, z: 2200 },
    boundsMinMm: { x: -600, y: -600, z: -600 },
    boundsMaxMm: { x: 2000, y: 2000, z: 1600 },
    obstacles: [
      {
        id: 'office-desk',
        name: 'Oak Standing Desk',
        type: 'furniture',
        boundsMinMm: { x: -400, y: -400, z: -500 },
        boundsMaxMm: { x: 1200, y: 1200, z: -200 },
        isFixed: true,
        color: '#64748b',
      },
    ],
  },
  dsl: `assembly "OmniVoxel-Book" {
  formFactor: "Modular Laptop"
  architecture: "Foldable VIK Lattice Interconnect"
}

// Compute Engine
voxel gpu @ (0, 0, 0) {
  type: "vox.compute.gpu-module"
  role: "soc-processor"
}

// Primary High-Speed OLED Display
voxel display @ (0, 1, 0) {
  type: "vox.display.oled-6in"
  role: "primary-screen"
}

// High-capacity Battery
voxel battery @ (0, -1, 0) {
  type: "vox.power.pd-100w"
  role: "system-battery"
}

// Keyboard / Trackpad Input Deck
voxel keyboard @ (-1, -1, 0) {
  type: "vox.io.gamepad-ctrl"
  role: "keyboard-controller"
}

// Structural Thermal Heatsink Frame
voxel heatsink_left @ (-1, 0, 0) {
  type: "vox.struct.alu-150"
  role: "chassis-left-sink"
}

voxel heatsink_right @ (1, 0, 0) {
  type: "vox.struct.alu-150"
  role: "chassis-right-sink"
}

voxel heatsink_top @ (0, 0, 1) {
  type: "vox.struct.alu-150"
  role: "dorsal-radiator"
}`,
  compile(registry = createDefaultRegistry()) {
    const ast = parseDSL(this.dsl);
    const ir = compileToIR(ast, registry);
    return { ir, roomEnvironment: this.roomEnvironment };
  },
};

export const GALLERY_DESK_WORKSTATION: GalleryItem = {
  id: 'desk-workstation',
  name: 'Desk Workstation Setup',
  category: 'setup',
  description:
    'Modular engineering workstation docked cleanly on an ergonomic office desk, including dual-monitor display array, compute hub, 4-stage thermal dissipation, and peripheral controls.',
  tags: ['setup', 'workstation', 'furniture', 'docked'],
  roomEnvironment: {
    id: 'room-open-office',
    name: 'Open Plan Engineering Bay',
    dimensionsMm: { x: 3000, y: 3000, z: 2500 },
    boundsMinMm: { x: 0, y: 0, z: 0 },
    boundsMaxMm: { x: 3000, y: 3000, z: 2500 },
    obstacles: [
      {
        id: 'workstation-desk',
        name: 'Heavy Duty Laboratory Bench',
        type: 'furniture',
        boundsMinMm: { x: 300, y: 300, z: 0 },
        boundsMaxMm: { x: 1900, y: 1300, z: 750 },
        isFixed: true,
        color: '#475569',
      },
      {
        id: 'back-drywall',
        name: 'Acoustic Perimeter Wall',
        type: 'wall',
        boundsMinMm: { x: 0, y: 0, z: 0 },
        boundsMaxMm: { x: 3000, y: 150, z: 2500 },
        isFixed: true,
        color: '#334155',
      },
    ],
  },
  dsl: `assembly "OmniVoxel-Station" {
  formFactor: "Desk Workstation"
  architecture: "Surface-Docked Lattice Rig"
}

// Host compute module docked at table height (z = 5 * 150mm = 750mm)
voxel compute @ (4, 4, 5) {
  type: "vox.compute.gpu-module"
  role: "workstation-node"
}

// Primary Monitor
voxel monitor_main @ (4, 5, 5) {
  type: "vox.display.oled-6in"
  role: "primary-monitor"
}

// Auxiliary Display
voxel monitor_aux @ (3, 5, 5) {
  type: "vox.display.oled-6in"
  role: "code-stream-monitor"
}

// Clean USB-PD Power Hub
voxel power @ (3, 4, 5) {
  type: "vox.power.pd-100w"
  role: "isolated-pd-delivery"
}

// Ergonomic Macro Controller
voxel input_deck @ (4, 3, 5) {
  type: "vox.io.gamepad-ctrl"
  role: "peripheral-deck"
}

// 4-Unit High Performance Thermal Heatsinks
voxel heatsink_top @ (4, 4, 6) {
  type: "vox.struct.alu-150"
  role: "chimney-exhaust"
}

voxel heatsink_right @ (5, 4, 5) {
  type: "vox.struct.alu-150"
  role: "lateral-exhaust-sink"
}

voxel heatsink_power @ (3, 4, 6) {
  type: "vox.struct.alu-150"
  role: "aux-power-cooling"
}

voxel heatsink_aux @ (5, 5, 5) {
  type: "vox.struct.alu-150"
  role: "display-bridge-radiator"
}`,
  compile(registry = createDefaultRegistry()) {
    const ast = parseDSL(this.dsl);
    const ir = compileToIR(ast, registry);
    return { ir, roomEnvironment: this.roomEnvironment };
  },
};

export const GALLERY_LIVING_ROOM_UNIT: GalleryItem = {
  id: 'living-room-unit',
  name: 'Living Room Entertainment Unit',
  category: 'setup',
  description:
    'Living room installation with fixed media console obstacle, wall clearance boundaries, multi-display video wall, and isolated electromagnetic actuator pivoting nodes.',
  tags: ['setup', 'living-room', 'furniture', 'actuator', 'appliance'],
  roomEnvironment: {
    id: 'room-living-space',
    name: 'Smart Living Room',
    dimensionsMm: { x: 3600, y: 3200, z: 2600 },
    boundsMinMm: { x: 0, y: 0, z: 0 },
    boundsMaxMm: { x: 3600, y: 3200, z: 2600 },
    obstacles: [
      {
        id: 'tv-console',
        name: 'Credenza Media Console',
        type: 'furniture',
        boundsMinMm: { x: 400, y: 300, z: 0 },
        boundsMaxMm: { x: 2600, y: 950, z: 600 },
        isFixed: true,
        color: '#57534e',
      },
      {
        id: 'north-wall',
        name: 'Structural Wall',
        type: 'wall',
        boundsMinMm: { x: 0, y: 0, z: 0 },
        boundsMaxMm: { x: 3600, y: 150, z: 2600 },
        isFixed: true,
        color: '#44403c',
      },
      {
        id: 'hvac-unit',
        name: 'Smart Climate Appliance',
        type: 'appliance',
        boundsMinMm: { x: 2800, y: 300, z: 0 },
        boundsMaxMm: { x: 3400, y: 800, z: 1100 },
        isFixed: true,
        color: '#6b7280',
      },
    ],
  },
  dsl: `assembly "OmniVoxel-Theater" {
  formFactor: "Living Room Unit"
  architecture: "Entertainment Media Rig"
}

// Media Compute Host (Docked at console surface height: z = 4 * 150mm = 600mm)
voxel media_core @ (6, 4, 4) {
  type: "vox.compute.gpu-module"
  role: "media-streamer"
}

// Main Video Screen
voxel tv_screen @ (6, 5, 4) {
  type: "vox.display.oled-6in"
  role: "central-screen"
}

// Isolated Dual-Rail Power Supply
voxel power_base @ (5, 4, 4) {
  type: "vox.power.pd-100w"
  role: "isolated-dual-rail"
}

// Electromagnetic Actuated Pivot Cube (MIT ElectroVoxel style)
voxel pivot_joint @ (5, 3, 4) {
  type: "vox.actuated.em-60"
  role: "dynamic-tilter"
}

// IR / Bluetooth Remote Sensor
voxel remote_sensor @ (6, 3, 4) {
  type: "vox.io.gamepad-ctrl"
  role: "ir-control-receiver"
}

// Aluminum Dissipation Structure
voxel heatsink_1 @ (7, 4, 4) {
  type: "vox.struct.alu-150"
  role: "lateral-sink-alpha"
}

voxel heatsink_2 @ (6, 4, 5) {
  type: "vox.struct.alu-150"
  role: "vertical-sink-beta"
}

voxel heatsink_3 @ (5, 4, 5) {
  type: "vox.struct.alu-150"
  role: "power-sink-gamma"
}

voxel heatsink_4 @ (7, 4, 5) {
  type: "vox.struct.alu-150"
  role: "aux-sink-delta"
}`,
  compile(registry = createDefaultRegistry()) {
    const ast = parseDSL(this.dsl);
    const ir = compileToIR(ast, registry);
    return { ir, roomEnvironment: this.roomEnvironment };
  },
};

export const GALLERY_ARM_PHONE: GalleryItem = {
  id: 'arm-modular-phone',
  name: 'Modular ARM Phone (Standalone + Docked Storage)',
  category: 'device',
  description:
    'Standalone-capable ARM64 Phone Core with 256 GB private onboard storage and integrated battery, shown with an optional hot-swappable 2 TB NVMe modular storage bay docked over USB4/PCIe.',
  tags: ['device', 'arm', 'phone', 'standalone', 'storage', 'nvme'],
  roomEnvironment: {
    id: 'room-mobile-desk',
    name: 'Compact Mobile Charging Pad',
    dimensionsMm: { x: 1800, y: 1800, z: 1500 },
    boundsMinMm: { x: -450, y: -450, z: -450 },
    boundsMaxMm: { x: 1350, y: 1350, z: 1050 },
    obstacles: [
      {
        id: 'mobile-desk-pad',
        name: 'Wireless Charging Mat',
        type: 'furniture',
        boundsMinMm: { x: -350, y: -350, z: -350 },
        boundsMaxMm: { x: 900, y: 900, z: -150 },
        isFixed: true,
        color: '#475569',
      },
    ],
  },
  dsl: `assembly "OmniVoxel-ARM-Phone" {
  formFactor: "Modular ARM Phone"
  architecture: "Unified ARM64 + Private Onboard Storage"
}

// Standalone ARM64 Phone Core (256 GB dedicated private storage + integrated battery)
voxel phone_core @ (0, 0, 0) {
  type: "vox.device.phone-core"
  role: "standalone-mobile-host"
}

// Optional hot-swappable 2 TB modular NVMe storage bay over USB4/PCIe
voxel nvme_dock @ (1, 0, 0) {
  type: "vox.storage.nvme-bay"
  role: "docked-external-storage"
}`,
  compile(registry = createDefaultRegistry()) {
    const ast = parseDSL(this.dsl);
    const ir = compileToIR(ast, registry);
    return { ir, roomEnvironment: this.roomEnvironment };
  },
};

export const GALLERY_ARM_LAPTOP: GalleryItem = {
  id: 'arm-modular-laptop',
  name: 'ARM Modular Laptop',
  category: 'device',
  description:
    'Unified ARM64 clamshell laptop pairing a dockable ARM Phone Core (private OS/data) and ARM SoC co-processor with an OLED display, isolated 100W PD battery, input deck, 2 TB modular NVMe bay, and passive aluminum cooling.',
  tags: ['device', 'arm', 'laptop', 'phone-core', 'storage', 'nvme'],
  roomEnvironment: {
    id: 'room-arm-studio',
    name: 'ARM Studio Desk',
    dimensionsMm: { x: 2600, y: 2600, z: 2200 },
    boundsMinMm: { x: -600, y: -600, z: -600 },
    boundsMaxMm: { x: 2000, y: 2000, z: 1600 },
    obstacles: [
      {
        id: 'studio-desk',
        name: 'Walnut Studio Desk',
        type: 'furniture',
        boundsMinMm: { x: -450, y: -450, z: -500 },
        boundsMaxMm: { x: 1200, y: 1200, z: -200 },
        isFixed: true,
        color: '#64748b',
      },
    ],
  },
  dsl: `assembly "OmniVoxel-ARM-Book" {
  formFactor: "ARM Modular Laptop"
  architecture: "Phone-Docked Unified ARM64 Lattice"
}

// Docked ARM Phone Core (carries private OS & 256 GB dedicated onboard storage)
voxel phone_core @ (0, 0, 0) {
  type: "vox.device.phone-core"
  role: "primary-arm-host"
}

// Scalable ARM64 Compute Co-Processor Tile
voxel arm_soc @ (1, 0, 0) {
  type: "vox.compute.arm-soc"
  role: "arm-compute-booster"
}

// Primary OLED Display over High-Speed Plane
voxel display @ (0, 1, 0) {
  type: "vox.display.oled-6in"
  role: "laptop-display"
}

// Hot-Swappable 2 TB Modular NVMe Storage Bay over PCIe/USB4
voxel nvme_storage @ (1, 1, 0) {
  type: "vox.storage.nvme-bay"
  role: "modular-nvme-drive"
}

// Extended Isolated Dual-Rail Battery Pack
voxel battery @ (0, -1, 0) {
  type: "vox.power.pd-100w"
  role: "laptop-battery"
}

// Keyboard & Trackpad Input Deck
voxel keyboard @ (-1, -1, 0) {
  type: "vox.io.gamepad-ctrl"
  role: "input-deck"
}

// Passive Aluminum Structural Heatsink Frame
voxel chassis_sink @ (-1, 0, 0) {
  type: "vox.struct.alu-150"
  role: "passive-thermal-chassis"
}`,
  compile(registry = createDefaultRegistry()) {
    const ast = parseDSL(this.dsl);
    const ir = compileToIR(ast, registry);
    return { ir, roomEnvironment: this.roomEnvironment };
  },
};

export const GALLERY_ARM_WORKSTATION: GalleryItem = {
  id: 'arm-pc-workstation',
  name: 'ARM Desktop / PC Workstation',
  category: 'setup',
  description:
    'Multi-ARM desktop workstation docked on an engineering bench with dual unified ARM64 compute nodes, dual 2 TB modular NVMe storage bays (4 TB total), dual OLED monitors, 100W PD power hub, and twin aluminum chimney heatsinks.',
  tags: ['setup', 'arm', 'workstation', 'pc', 'cluster', 'storage', 'nvme'],
  roomEnvironment: {
    id: 'room-arm-workstation-bay',
    name: 'ARM Compute Engineering Bay',
    dimensionsMm: { x: 3000, y: 3000, z: 2500 },
    boundsMinMm: { x: 0, y: 0, z: 0 },
    boundsMaxMm: { x: 3000, y: 3000, z: 2500 },
    obstacles: [
      {
        id: 'arm-workstation-bench',
        name: 'Modular Workstation Desk',
        type: 'furniture',
        boundsMinMm: { x: 300, y: 300, z: 0 },
        boundsMaxMm: { x: 1900, y: 1300, z: 750 },
        isFixed: true,
        color: '#475569',
      },
      {
        id: 'bay-back-wall',
        name: 'Acoustic Studio Wall',
        type: 'wall',
        boundsMinMm: { x: 0, y: 0, z: 0 },
        boundsMaxMm: { x: 3000, y: 150, z: 2500 },
        isFixed: true,
        color: '#334155',
      },
    ],
  },
  dsl: `assembly "OmniVoxel-ARM-Workstation" {
  formFactor: "ARM Desktop / PC Workstation"
  architecture: "Multi-ARM64 Cluster + Modular NVMe Array"
}

// Dual Unified ARM64 Compute Cluster (docked at bench height z = 5 * 150mm = 750mm)
voxel arm_primary @ (4, 4, 5) {
  type: "vox.compute.arm-soc"
  role: "arm-cluster-primary"
}

voxel arm_secondary @ (5, 4, 5) {
  type: "vox.compute.arm-soc"
  role: "arm-cluster-secondary"
}

// Dual 2 TB Hot-Swappable Modular NVMe Storage Array (4 TB total over PCIe)
voxel nvme_bay_a @ (4, 3, 5) {
  type: "vox.storage.nvme-bay"
  role: "nvme-array-slot-a"
}

voxel nvme_bay_b @ (5, 3, 5) {
  type: "vox.storage.nvme-bay"
  role: "nvme-array-slot-b"
}

// Dual OLED Monitors over High-Speed Plane
voxel monitor_left @ (4, 5, 5) {
  type: "vox.display.oled-6in"
  role: "primary-workstation-display"
}

voxel monitor_right @ (5, 5, 5) {
  type: "vox.display.oled-6in"
  role: "secondary-workstation-display"
}

// Isolated 100W USB-PD Power Hub
voxel power_hub @ (3, 4, 5) {
  type: "vox.power.pd-100w"
  role: "workstation-power-hub"
}

// Peripheral Macro & Input Deck
voxel input_deck @ (3, 3, 5) {
  type: "vox.io.gamepad-ctrl"
  role: "workstation-input-deck"
}

// Twin Dorsal Aluminum Heatsink Towers
voxel heatsink_primary @ (4, 4, 6) {
  type: "vox.struct.alu-150"
  role: "primary-thermal-chimney"
}

voxel heatsink_secondary @ (5, 4, 6) {
  type: "vox.struct.alu-150"
  role: "secondary-thermal-chimney"
}`,
  compile(registry = createDefaultRegistry()) {
    const ast = parseDSL(this.dsl);
    const ir = compileToIR(ast, registry);
    return { ir, roomEnvironment: this.roomEnvironment };
  },
};

export const GALLERY_VOXEL_CHAIR: GalleryItem = {
  id: 'voxel-chair',
  name: 'Modular Voxel Chair',
  category: 'structural',
  description:
    'Reconfigurable 12-voxel cuboctahedron lattice chair with four load-bearing legs, 2×2 seat deck, and full backrest. Supports live pivoting reconfiguration into Table or Couch.',
  tags: ['structural', 'furniture', 'chair', 'truss', 'reconfigurable'],
  roomEnvironment: {
    id: 'room-structural-bay',
    name: 'Modular Furniture Test Floor',
    dimensionsMm: { x: 2400, y: 2400, z: 2000 },
    boundsMinMm: { x: -600, y: -600, z: 0 },
    boundsMaxMm: { x: 1800, y: 1800, z: 2000 },
    obstacles: [
      {
        id: 'test-floor-pad',
        name: 'Load Cell Floor Pad',
        type: 'furniture',
        boundsMinMm: { x: -450, y: -450, z: -120 },
        boundsMaxMm: { x: 1200, y: 1200, z: 0 },
        isFixed: true,
        color: '#475569',
      },
    ],
  },
  dsl: `assembly "OmniVoxel-Chair" {
  formFactor: "Modular Voxel Chair"
  architecture: "Open Cuboctahedron Truss Lattice"
}

// Four Grounded Load-Bearing Legs (z = 0)
voxel v01 @ (0, 0, 0) {
  type: "vox.struct.alu-150"
  role: "leg-front-left"
}

voxel v02 @ (1, 0, 0) {
  type: "vox.struct.alu-150"
  role: "leg-front-right"
}

voxel v03 @ (0, 1, 0) {
  type: "vox.struct.alu-150"
  role: "leg-rear-left"
}

voxel v04 @ (1, 1, 0) {
  type: "vox.struct.alu-150"
  role: "leg-rear-right"
}

// 2x2 Structural Seat Deck (z = 1)
voxel v05 @ (0, 0, 1) {
  type: "vox.struct.alu-150"
  role: "seat-front-left"
}

voxel v06 @ (1, 0, 1) {
  type: "vox.struct.alu-150"
  role: "seat-front-right"
}

voxel v07 @ (0, 1, 1) {
  type: "vox.struct.alu-150"
  role: "seat-rear-left"
}

voxel v08 @ (1, 1, 1) {
  type: "vox.struct.alu-150"
  role: "seat-rear-right"
}

// Upright Backrest Truss (y = 1, z = 2..3)
voxel v09 @ (0, 1, 2) {
  type: "vox.struct.alu-150"
  role: "backrest-lower-left"
}

voxel v10 @ (1, 1, 2) {
  type: "vox.struct.alu-150"
  role: "backrest-lower-right"
}

voxel v11 @ (0, 1, 3) {
  type: "vox.struct.alu-150"
  role: "backrest-upper-left"
}

voxel v12 @ (1, 1, 3) {
  type: "vox.struct.alu-150"
  role: "backrest-upper-right"
}`,
  compile(registry = createDefaultRegistry()) {
    const ast = parseDSL(this.dsl);
    const ir = compileToIR(ast, registry);
    return { ir, roomEnvironment: this.roomEnvironment };
  },
};

export const GALLERY_VOXEL_TABLE: GalleryItem = {
  id: 'voxel-table',
  name: 'Modular Voxel Table',
  category: 'structural',
  description:
    'Reconfigurable 12-voxel cuboctahedron lattice table featuring four corner legs supporting an elevated 4×2 spanning tabletop. Morphs directly to/from Chair and Couch.',
  tags: ['structural', 'furniture', 'table', 'truss', 'reconfigurable'],
  roomEnvironment: {
    id: 'room-structural-bay',
    name: 'Modular Furniture Test Floor',
    dimensionsMm: { x: 2400, y: 2400, z: 2000 },
    boundsMinMm: { x: -600, y: -600, z: 0 },
    boundsMaxMm: { x: 1800, y: 1800, z: 2000 },
    obstacles: [
      {
        id: 'test-floor-pad',
        name: 'Load Cell Floor Pad',
        type: 'furniture',
        boundsMinMm: { x: -450, y: -450, z: -120 },
        boundsMaxMm: { x: 1200, y: 1200, z: 0 },
        isFixed: true,
        color: '#475569',
      },
    ],
  },
  dsl: `assembly "OmniVoxel-Table" {
  formFactor: "Modular Voxel Table"
  architecture: "Open Cuboctahedron Truss Lattice"
}

// Four Corner Support Legs (z = 0)
voxel v01 @ (0, 0, 0) {
  type: "vox.struct.alu-150"
  role: "leg-front-left"
}

voxel v02 @ (3, 0, 0) {
  type: "vox.struct.alu-150"
  role: "leg-front-right"
}

voxel v03 @ (0, 1, 0) {
  type: "vox.struct.alu-150"
  role: "leg-rear-left"
}

voxel v04 @ (3, 1, 0) {
  type: "vox.struct.alu-150"
  role: "leg-rear-right"
}

// 4x2 Elevated Spanning Tabletop (z = 1)
voxel v05 @ (0, 0, 1) {
  type: "vox.struct.alu-150"
  role: "top-front-1"
}

voxel v06 @ (1, 0, 1) {
  type: "vox.struct.alu-150"
  role: "top-front-2"
}

voxel v07 @ (2, 0, 1) {
  type: "vox.struct.alu-150"
  role: "top-front-3"
}

voxel v08 @ (3, 0, 1) {
  type: "vox.struct.alu-150"
  role: "top-front-4"
}

voxel v09 @ (0, 1, 1) {
  type: "vox.struct.alu-150"
  role: "top-rear-1"
}

voxel v10 @ (1, 1, 1) {
  type: "vox.struct.alu-150"
  role: "top-rear-2"
}

voxel v11 @ (2, 1, 1) {
  type: "vox.struct.alu-150"
  role: "top-rear-3"
}

voxel v12 @ (3, 1, 1) {
  type: "vox.struct.alu-150"
  role: "top-rear-4"
}`,
  compile(registry = createDefaultRegistry()) {
    const ast = parseDSL(this.dsl);
    const ir = compileToIR(ast, registry);
    return { ir, roomEnvironment: this.roomEnvironment };
  },
};

export const GALLERY_VOXEL_COUCH: GalleryItem = {
  id: 'voxel-couch',
  name: 'Modular Voxel Couch / Sofa',
  category: 'structural',
  description:
    'Reconfigurable 12-voxel modular sofa with four-wide seating base, twin raised armrests, rear support piers, and spanning lumbar backrest beam.',
  tags: ['structural', 'furniture', 'couch', 'sofa', 'truss', 'reconfigurable'],
  roomEnvironment: {
    id: 'room-structural-bay',
    name: 'Modular Furniture Test Floor',
    dimensionsMm: { x: 2400, y: 2400, z: 2000 },
    boundsMinMm: { x: -600, y: -600, z: 0 },
    boundsMaxMm: { x: 1800, y: 1800, z: 2000 },
    obstacles: [
      {
        id: 'test-floor-pad',
        name: 'Load Cell Floor Pad',
        type: 'furniture',
        boundsMinMm: { x: -450, y: -450, z: -120 },
        boundsMaxMm: { x: 1200, y: 1200, z: 0 },
        isFixed: true,
        color: '#475569',
      },
    ],
  },
  dsl: `assembly "OmniVoxel-Couch" {
  formFactor: "Modular Voxel Couch"
  architecture: "Open Cuboctahedron Truss Lattice"
}

// Four-Wide Grounded Seat Base (y = 0, z = 0)
voxel v01 @ (0, 0, 0) {
  type: "vox.struct.alu-150"
  role: "seat-base-1"
}

voxel v02 @ (1, 0, 0) {
  type: "vox.struct.alu-150"
  role: "seat-base-2"
}

voxel v03 @ (2, 0, 0) {
  type: "vox.struct.alu-150"
  role: "seat-base-3"
}

voxel v04 @ (3, 0, 0) {
  type: "vox.struct.alu-150"
  role: "seat-base-4"
}

// Twin Raised Side Armrests (y = 0, z = 1)
voxel v05 @ (0, 0, 1) {
  type: "vox.struct.alu-150"
  role: "armrest-left"
}

voxel v06 @ (3, 0, 1) {
  type: "vox.struct.alu-150"
  role: "armrest-right"
}

// Rear Support Piers (y = 1, z = 0)
voxel v07 @ (0, 1, 0) {
  type: "vox.struct.alu-150"
  role: "rear-pier-left"
}

voxel v08 @ (3, 1, 0) {
  type: "vox.struct.alu-150"
  role: "rear-pier-right"
}

// Spanning Upper Backrest Beam (y = 1, z = 1)
voxel v09 @ (0, 1, 1) {
  type: "vox.struct.alu-150"
  role: "backrest-1"
}

voxel v10 @ (1, 1, 1) {
  type: "vox.struct.alu-150"
  role: "backrest-2"
}

voxel v11 @ (2, 1, 1) {
  type: "vox.struct.alu-150"
  role: "backrest-3"
}

voxel v12 @ (3, 1, 1) {
  type: "vox.struct.alu-150"
  role: "backrest-4"
}`,
  compile(registry = createDefaultRegistry()) {
    const ast = parseDSL(this.dsl);
    const ir = compileToIR(ast, registry);
    return { ir, roomEnvironment: this.roomEnvironment };
  },
};

export const GALLERY_VOXEL_BRIDGE: GalleryItem = {
  id: 'voxel-bridge',
  name: 'Modular Voxel Bridge (Span / Truss)',
  category: 'structural',
  description:
    'Elevated 10-voxel Pratt/arch cuboctahedron truss bridge with twin grounded abutment piers, five-voxel clear-span deck, and upper compression arch chord for static FEA load inspection.',
  tags: ['structural', 'architecture', 'bridge', 'span', 'truss', 'physics'],
  roomEnvironment: {
    id: 'room-bridge-span',
    name: 'Structural Load Test Rig',
    dimensionsMm: { x: 2600, y: 2000, z: 2000 },
    boundsMinMm: { x: -500, y: -600, z: 0 },
    boundsMaxMm: { x: 2100, y: 1400, z: 2000 },
    obstacles: [
      {
        id: 'west-abutment',
        name: 'West Abutment Foundation',
        type: 'furniture',
        boundsMinMm: { x: -350, y: -300, z: -150 },
        boundsMaxMm: { x: 200, y: 450, z: 0 },
        isFixed: true,
        color: '#475569',
      },
      {
        id: 'east-abutment',
        name: 'East Abutment Foundation',
        type: 'furniture',
        boundsMinMm: { x: 550, y: -300, z: -150 },
        boundsMaxMm: { x: 1100, y: 450, z: 0 },
        isFixed: true,
        color: '#475569',
      },
    ],
  },
  dsl: `assembly "OmniVoxel-Bridge" {
  formFactor: "Modular Voxel Truss Bridge"
  architecture: "Cuboctahedron Clear-Span Arch Truss"
}

// Twin Grounded Abutment Piers (z = 0)
voxel pier_west @ (0, 0, 0) {
  type: "vox.struct.alu-150"
  role: "abutment-pier-west"
}

voxel pier_east @ (4, 0, 0) {
  type: "vox.struct.alu-150"
  role: "abutment-pier-east"
}

// Elevated Five-Voxel Clear-Span Deck (z = 1)
voxel deck_1 @ (0, 0, 1) {
  type: "vox.struct.alu-150"
  role: "deck-west-bearing"
}

voxel deck_2 @ (1, 0, 1) {
  type: "vox.struct.alu-150"
  role: "deck-quarter-west"
}

voxel deck_3 @ (2, 0, 1) {
  type: "vox.struct.alu-150"
  role: "deck-midspan"
}

voxel deck_4 @ (3, 0, 1) {
  type: "vox.struct.alu-150"
  role: "deck-quarter-east"
}

voxel deck_5 @ (4, 0, 1) {
  type: "vox.struct.alu-150"
  role: "deck-east-bearing"
}

// Upper Compression Truss Arch Chord (z = 2)
voxel arch_west @ (1, 0, 2) {
  type: "vox.struct.alu-150"
  role: "upper-chord-west"
}

voxel arch_crown @ (2, 0, 2) {
  type: "vox.struct.alu-150"
  role: "upper-chord-crown"
}

voxel arch_east @ (3, 0, 2) {
  type: "vox.struct.alu-150"
  role: "upper-chord-east"
}`,
  compile(registry = createDefaultRegistry()) {
    const ast = parseDSL(this.dsl);
    const ir = compileToIR(ast, registry);
    return { ir, roomEnvironment: this.roomEnvironment };
  },
};

export const GALLERY_ITEMS: readonly GalleryItem[] = [
  GALLERY_HANDHELD_CONSOLE,
  GALLERY_MODULAR_LAPTOP,
  GALLERY_DESK_WORKSTATION,
  GALLERY_LIVING_ROOM_UNIT,
  GALLERY_ARM_PHONE,
  GALLERY_ARM_LAPTOP,
  GALLERY_ARM_WORKSTATION,
  GALLERY_VOXEL_CHAIR,
  GALLERY_VOXEL_TABLE,
  GALLERY_VOXEL_COUCH,
  GALLERY_VOXEL_BRIDGE,
] as const;

export function getGalleryItem(id: string): GalleryItem | undefined {
  return GALLERY_ITEMS.find((item) => item.id === id);
}
