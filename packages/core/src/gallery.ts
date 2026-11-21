import { parseDSL } from './dsl.js';
import { compileToIR, VoxelIR } from './ir.js';
import { createDefaultRegistry, VoxelRegistry } from './registry.js';
import { RoomEnvironment } from './room.js';

export interface GalleryItem {
  id: string;
  name: string;
  category: 'device' | 'setup';
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

export const GALLERY_ITEMS: readonly GalleryItem[] = [
  GALLERY_HANDHELD_CONSOLE,
  GALLERY_MODULAR_LAPTOP,
  GALLERY_DESK_WORKSTATION,
  GALLERY_LIVING_ROOM_UNIT,
] as const;

export function getGalleryItem(id: string): GalleryItem | undefined {
  return GALLERY_ITEMS.find((item) => item.id === id);
}
