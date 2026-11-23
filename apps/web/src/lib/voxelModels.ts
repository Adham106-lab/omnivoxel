import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Face, VoxelCategory, VoxelLink } from '@omnivoxel/core';
import { BUS_COLORS } from './theme';
import type { Axis } from './assembly';

/**
 * Distinct, realistic per-module 3D engineering silhouettes + articulated
 * electromechanical link connector rigs.
 *
 * Strict spatial invariant:
 *  - Every module silhouette stays strictly inside its cell bounds
 *    `[-sx/2..sx/2] × [-sy/2..sy/2] × [-sz/2..sz/2]`, so grid alignment stays
 *    crisp and adjacent modules never clip into one another.
 *  - Nothing inside a module rig is pickable; `SceneCanvas` keeps an invisible
 *    full-cell proxy box for fast, reliable raycasting.
 */

type MatExtra = THREE.MeshStandardMaterialParameters;

const std = (color: number, extra: MatExtra = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.28, roughness: 0.52, ...extra });

const ALU: MatExtra = { metalness: 0.88, roughness: 0.24 };
const DARK_ALU: MatExtra = { metalness: 0.72, roughness: 0.36 };
const TITANIUM: MatExtra = { metalness: 0.82, roughness: 0.28 };
const COPPER: MatExtra = { metalness: 0.78, roughness: 0.32 };

export interface VoxelModelRig {
  group: THREE.Group;
  /** Primary chassis materials tinted in-place on selection, hover, or active playback phase. */
  chassisMaterials: THREE.MeshStandardMaterial[];
  /** Optional High-Speed Bus mount LED material (used on modular NVMe storage bays). */
  statusLedMaterial?: THREE.MeshStandardMaterial;
}

// ---------------------------------------------------------------------------
// Face frames & primitives
// ---------------------------------------------------------------------------

/** Rotates an object so its local +z points along `face`. */
function orient(g: THREE.Object3D, face: Face): void {
  switch (face) {
    case '+x': g.rotation.y = Math.PI / 2; break;
    case '-x': g.rotation.y = -Math.PI / 2; break;
    case '+y': g.rotation.x = -Math.PI / 2; break;
    case '-y': g.rotation.x = Math.PI / 2; break;
    case '+z': break;
    case '-z': g.rotation.x = Math.PI; break;
  }
}

function boxMesh(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function cylMesh(
  parent: THREE.Object3D,
  rTop: number,
  rBot: number,
  len: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  axis: Axis = 'z',
  segments = 16
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, segments), mat);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  else if (axis === 'x') m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// Procedural OLED screen textures (distinct UI for Phone Core vs Monitor)
// ---------------------------------------------------------------------------

let monitorScreenTexture: THREE.CanvasTexture | null = null;
let phoneScreenTexture: THREE.CanvasTexture | null = null;

function getMonitorScreenTexture(): THREE.CanvasTexture {
  if (monitorScreenTexture) return monitorScreenTexture;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#082f49');
    grad.addColorStop(0.55, '#0f172a');
    grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Top workstation bar
    ctx.fillStyle = 'rgba(186,230,253,0.9)';
    ctx.fillRect(14, 14, 228, 12);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(18, 17, 46, 6);

    // Dual engineering dashboard panes
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.fillRect(14, 38, 144, 152);
    ctx.fillRect(168, 38, 74, 152);
    ctx.strokeStyle = 'rgba(56,189,248,0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 38, 144, 152);
    ctx.strokeRect(168, 38, 74, 152);

    // Waveform / CAD lines in main pane
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(26, 134);
    ctx.lineTo(54, 96);
    ctx.lineTo(86, 118);
    ctx.lineTo(118, 74);
    ctx.lineTo(146, 88);
    ctx.stroke();

    // Right-pane metric bars
    const barColors = ['#22d3ee', '#a78bfa', '#34d399', '#38bdf8'];
    barColors.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(178, 54 + i * 30, 32 + ((i * 17) % 24), 12);
    });

    // Bottom dock bar
    ctx.fillStyle = 'rgba(56,189,248,0.28)';
    ctx.fillRect(46, 210, 164, 24);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i === 2 ? '#38bdf8' : 'rgba(224,242,254,0.85)';
      ctx.fillRect(60 + i * 28, 216, 16, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  monitorScreenTexture = tex;
  return tex;
}

function getPhoneScreenTexture(): THREE.CanvasTexture {
  if (phoneScreenTexture) return phoneScreenTexture;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 192);
    grad.addColorStop(0, '#0c4a6e');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 192);

    // Dynamic notch pill space at top-center
    ctx.fillStyle = '#020617';
    ctx.fillRect(92, 8, 72, 16);

    // Status pills (ARM64 + 256GB private badge)
    ctx.fillStyle = 'rgba(56,189,248,0.25)';
    ctx.fillRect(18, 36, 104, 42);
    ctx.strokeStyle = 'rgba(56,189,248,0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 36, 104, 42);
    ctx.fillStyle = '#e0f2fe';
    ctx.font = '700 18px ui-monospace, monospace';
    ctx.fillText('ARM64', 32, 63);

    ctx.fillStyle = 'rgba(16,185,129,0.24)';
    ctx.fillRect(134, 36, 104, 42);
    ctx.strokeStyle = 'rgba(52,211,153,0.75)';
    ctx.strokeRect(134, 36, 104, 42);
    ctx.fillStyle = '#d1fae5';
    ctx.fillText('256 GB', 146, 63);

    // Clean mobile icon tiles
    const tileColors = ['#38bdf8', '#a78bfa', '#34d399', '#fb7185', '#f59e0b', '#22d3ee'];
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = tileColors[i];
      ctx.fillRect(20 + i * 37, 98, 28, 28);
    }

    // Bottom storage & dock indicator
    ctx.fillStyle = 'rgba(226,232,240,0.85)';
    ctx.fillRect(86, 166, 84, 7);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  phoneScreenTexture = tex;
  return tex;
}

// ---------------------------------------------------------------------------
// Per-Module Realistic Silhouette Builders (strictly within [-sx/2..sx/2] etc.)
// ---------------------------------------------------------------------------

/**
 * Modular ARM Phone Core (`vox.device.phone-core`):
 * Slim ~30%-depth chamfered titanium smartphone slab with recessed OLED screen,
 * camera/sensor notch, side buttons, and a machined rear magnetic docking plate
 * that bridges cleanly to its lattice connectors.
 */
function buildPhoneCoreModel(sx: number, sy: number, sz: number): VoxelModelRig {
  const g = new THREE.Group();
  const u = Math.min(sx, sy, sz);

  const frameMat = std(0x475569, TITANIUM);
  const trimMat = std(0x94a3b8, ALU);
  const bezelMat = std(0x090d16, { metalness: 0.45, roughness: 0.25 });
  const dockPlateMat = std(0x334155, DARK_ALU);
  const goldMat = std(0xfbbf24, { metalness: 0.92, roughness: 0.22 });
  const lensMat = std(0x0f172a, { metalness: 0.85, roughness: 0.12 });
  const accentMat = std(0x38bdf8, { emissive: 0x38bdf8, emissiveIntensity: 0.9, roughness: 0.3 });

  const slabW = sx * 0.92;
  const slabD = sy * 0.68;
  const slabH = sz * 0.28;
  const dockH = sz * 0.14;
  const slabZ = -sz * 0.5 + dockH + slabH * 0.5; // slim slab seated right atop its magnetic docking puck

  // Chamfered main titanium slab (core + slightly inset upper/lower bevel tiers)
  boxMesh(g, slabW, slabD, slabH * 0.72, frameMat, 0, 0, slabZ);
  boxMesh(g, slabW * 0.96, slabD * 0.95, slabH, trimMat, 0, 0, slabZ);

  // Recessed glossy OLED front face (+Z) with dark perimeter bezel
  const topZ = slabZ + slabH * 0.5;
  boxMesh(g, slabW * 0.92, slabD * 0.89, u * 0.012, bezelMat, 0, 0, topZ + u * 0.004);

  const tex = getPhoneScreenTexture();
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(slabW * 0.85, slabD * 0.79),
    new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.85,
      roughness: 0.14,
      metalness: 0.05,
    })
  );
  screen.position.set(0, 0, topZ + u * 0.0115);
  g.add(screen);

  // Camera / sensor pill notch + dual micro-lenses on the upper bezel edge (+Y)
  const notchY = slabD * 0.34;
  boxMesh(g, slabW * 0.28, slabD * 0.085, u * 0.016, bezelMat, 0, notchY, topZ + u * 0.009);
  cylMesh(g, u * 0.02, u * 0.02, u * 0.018, lensMat, -slabW * 0.06, notchY, topZ + u * 0.011, 'z', 14);
  cylMesh(g, u * 0.014, u * 0.014, u * 0.018, accentMat, slabW * 0.06, notchY, topZ + u * 0.011, 'z', 12);

  // Tactile side power & volume buttons (+X and -X sides)
  boxMesh(g, u * 0.018, slabD * 0.14, slabH * 0.28, trimMat, slabW * 0.502, slabD * 0.12, slabZ);
  boxMesh(g, u * 0.018, slabD * 0.22, slabH * 0.28, trimMat, -slabW * 0.502, slabD * 0.06, slabZ);
  // Bottom USB-C port bezel on -Y edge
  boxMesh(g, slabW * 0.16, u * 0.016, slabH * 0.32, bezelMat, 0, -slabD * 0.501, slabZ);

  // Sleek stepped machined magnetic docking plate (-Z underside) sitting flush on cell floor (-sz/2)
  // Bridges cleanly to neighboring module faces without floating legs or clipping cell bounds
  const dockBaseZ = -sz * 0.5 + dockH * 0.5;
  boxMesh(g, slabW * 0.68, slabD * 0.66, dockH * 0.78, dockPlateMat, 0, 0, dockBaseZ);
  boxMesh(g, sx * 0.96, u * 0.11, dockH * 0.55, dockPlateMat, 0, 0, -sz * 0.5 + dockH * 0.275);
  boxMesh(g, u * 0.11, sy * 0.94, dockH * 0.55, dockPlateMat, 0, 0, -sz * 0.5 + dockH * 0.275);
  const magRing = new THREE.Mesh(new THREE.TorusGeometry(u * 0.17, u * 0.016, 10, 32), trimMat);
  magRing.position.set(0, 0, -sz * 0.5 + dockH * 0.85);
  g.add(magRing);
  // Gold spring contact pads along the rear docking collar
  for (let i = -2; i <= 2; i++) {
    cylMesh(g, u * 0.014, u * 0.014, u * 0.018, goldMat, i * u * 0.05, -slabD * 0.36, dockBaseZ, 'y', 10);
  }

  return { group: g, chassisMaterials: [frameMat, dockPlateMat] };
}

/**
 * OLED Display (`display` / `vox.display.oled-6in`):
 * Slim upright ~28%-depth frameless OLED panel facing -Y (toward the default
 * camera) with chamfered aluminum outer bezel, recessed glowing glass screen,
 * rear magnetic docking plate, and slim structural stanchion arms.
 */
function buildDisplayModel(sx: number, sy: number, sz: number): VoxelModelRig {
  const g = new THREE.Group();
  const u = Math.min(sx, sy, sz);

  const frameMat = std(0x334155, TITANIUM);
  const aluMat = std(0xcbd5e1, ALU);
  const bezelMat = std(0x020617, { metalness: 0.4, roughness: 0.28 });
  const hubMat = std(0x1e293b, DARK_ALU);
  const ledMat = std(0x22c55e, { emissive: 0x22c55e, emissiveIntensity: 1.3 });

  const panelW = sx * 0.96;
  const panelD = sy * 0.27;
  const panelH = sz * 0.92;
  const panelY = -sy * 0.14; // forward toward viewer (-Y) leaving space behind for rear docking hub

  // Stepped chamfered aluminum outer housing
  boxMesh(g, panelW, panelD, panelH * 0.96, frameMat, 0, panelY, 0);
  boxMesh(g, panelW * 0.97, panelD * 0.84, panelH, aluMat, 0, panelY, 0);

  // Recessed front bezel & glossy OLED glass facing -Y (default camera view)
  const frontY = panelY - panelD * 0.5;
  boxMesh(g, panelW * 0.92, u * 0.012, panelH * 0.9, bezelMat, 0, frontY - u * 0.002, 0);

  const tex = getMonitorScreenTexture();
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(panelW * 0.86, panelH * 0.82),
    new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.82,
      roughness: 0.16,
      metalness: 0.05,
    })
  );
  glass.rotation.x = Math.PI / 2; // normal points along -Y
  glass.position.set(0, frontY - u * 0.01, -u * 0.01);
  g.add(glass);

  // Top bezel camera sensor + green power indicator
  cylMesh(g, u * 0.016, u * 0.016, u * 0.014, bezelMat, -u * 0.05, frontY - u * 0.006, panelH * 0.435, 'y', 14);
  cylMesh(g, u * 0.01, u * 0.01, u * 0.014, ledMat, u * 0.05, frontY - u * 0.006, panelH * 0.435, 'y', 10);

  // Rear magnetic VESA / lattice docking plate (+Y side) + slim bridge yoke
  const backY = panelY + panelD * 0.5;
  const hubDepth = Math.min(sy * 0.32, sy * 0.5 - backY);
  boxMesh(g, panelW * 0.52, hubDepth * 0.72, panelH * 0.48, hubMat, 0, backY + hubDepth * 0.36, -sz * 0.04);
  // Magnetic circular coupling flange
  const flange = new THREE.Mesh(new THREE.TorusGeometry(u * 0.16, u * 0.018, 10, 28), aluMat);
  flange.rotation.x = Math.PI / 2;
  flange.position.set(0, backY + hubDepth * 0.72, -sz * 0.04);
  g.add(flange);

  // Low-profile horizontal & vertical docking bridge spine (reaches ±X and -Z cleanly)
  boxMesh(g, sx * 0.96, u * 0.08, u * 0.08, hubMat, 0, backY + hubDepth * 0.32, -sz * 0.04);
  boxMesh(g, u * 0.14, sy * 0.82, u * 0.06, hubMat, 0, 0, -sz * 0.47);
  // Sleek aluminum foot base flush with cell floor (-sz/2)
  boxMesh(g, sx * 0.62, sy * 0.46, u * 0.045, aluMat, 0, 0, -sz * 0.477);

  return { group: g, chassisMaterials: [frameMat, hubMat] };
}

/**
 * Modular NVMe Storage Bay (`storage` / `vox.storage.nvme-bay`):
 * Distinct hot-swappable NVMe drive-bay cartridge with recessed machined side
 * guide rails, sculpted top aluminum heat-spreader fins, front pull-tab latch,
 * rear gold PCIe/USB4 connector blade, and emissive mounted High-Speed LED.
 */
function buildStorageModel(sx: number, sy: number, sz: number, hsMounted: boolean): VoxelModelRig {
  const g = new THREE.Group();
  const u = Math.min(sx, sy, sz);

  const shellMat = std(0x0e7490, { metalness: 0.48, roughness: 0.36 });
  const darkMat = std(0x0f172a, { metalness: 0.42, roughness: 0.48 });
  const finMat = std(0xcbd5e1, ALU);
  const railMat = std(0x94a3b8, ALU);
  const latchMat = std(0x22d3ee, { metalness: 0.5, roughness: 0.28 });
  const goldMat = std(0xf59e0b, { metalness: 0.92, roughness: 0.24 });
  const statusHex = hsMounted ? 0x34d399 : 0xf59e0b;
  const statusLedMat = std(statusHex, {
    emissive: statusHex,
    emissiveIntensity: hsMounted ? 1.85 : 0.7,
    metalness: 0.15,
    roughness: 0.25,
  });

  const bodyW = sx * 0.8;
  const bodyD = sy * 0.88;
  const bodyH = sz * 0.56;
  const bodyZ = -sz * 0.06;

  // Main anodized NVMe drive cartridge body
  boxMesh(g, bodyW, bodyD, bodyH, shellMat, 0, 0, bodyZ);
  // Lower base sled touching cell floor (-sz/2) cleanly
  const sledH = sz * 0.12;
  boxMesh(g, sx * 0.92, bodyD * 0.96, sledH, darkMat, 0, 0, -sz * 0.5 + sledH * 0.5);

  // Recessed precision side guide rails along ±X (distinct cartridge profile)
  const railW = sx * 0.075;
  for (const side of [-1, 1] as const) {
    const rx = side * (bodyW * 0.5 + railW * 0.38);
    // Upper and lower rail flanges leaving a recessed center guide channel
    boxMesh(g, railW, bodyD * 0.94, bodyH * 0.24, railMat, rx, 0, bodyZ + bodyH * 0.34);
    boxMesh(g, railW, bodyD * 0.94, bodyH * 0.24, railMat, rx, 0, bodyZ - bodyH * 0.34);
    boxMesh(g, railW * 0.5, bodyD * 0.92, bodyH * 0.36, darkMat, side * (bodyW * 0.5 + railW * 0.12), 0, bodyZ);
  }

  // Deep sculpted aluminum heat-spreader fin stack on top (+Z)
  const finBaseZ = bodyZ + bodyH * 0.5;
  const finH = Math.min(sz * 0.24, sz * 0.5 - finBaseZ - u * 0.02);
  boxMesh(g, bodyW * 0.94, bodyD * 0.9, u * 0.035, darkMat, 0, 0, finBaseZ + u * 0.016);
  const finCount = 7;
  for (let i = 0; i < finCount; i++) {
    const fx = -bodyW * 0.4 + (i * bodyW * 0.8) / (finCount - 1);
    boxMesh(g, u * 0.034, bodyD * 0.84, finH, finMat, fx, 0, finBaseZ + u * 0.03 + finH * 0.5);
  }

  // Front hot-swap bezel (-Y facing viewer) with sculpted pull-tab latch & High-Speed status LED
  const frontY = -bodyD * 0.5;
  boxMesh(g, bodyW * 0.92, u * 0.04, bodyH * 0.88, darkMat, 0, frontY - u * 0.015, bodyZ);
  // Pull-tab ejection handle (two side arms + cyan grip crossbar)
  const handleY = frontY - u * 0.05;
  boxMesh(g, bodyW * 0.64, u * 0.036, u * 0.055, latchMat, 0, handleY, bodyZ - bodyH * 0.22);
  for (const side of [-1, 1] as const) {
    boxMesh(g, u * 0.04, u * 0.055, u * 0.055, railMat, side * bodyW * 0.3, frontY - u * 0.028, bodyZ - bodyH * 0.22);
  }
  // Prominent High-Speed Bus mount status LED lightbar + secondary cyan activity dot
  boxMesh(g, bodyW * 0.42, u * 0.024, u * 0.045, statusLedMat, -bodyW * 0.12, frontY - u * 0.032, bodyZ + bodyH * 0.22);
  cylMesh(
    g,
    u * 0.024,
    u * 0.024,
    u * 0.028,
    std(0x22d3ee, { emissive: 0x22d3ee, emissiveIntensity: hsMounted ? 1.5 : 0.4 }),
    bodyW * 0.28,
    frontY - u * 0.032,
    bodyZ + bodyH * 0.22,
    'y',
    12
  );

  // Rear PCIe / USB4 gold edge connector blade (+Y)
  const backY = bodyD * 0.5;
  boxMesh(g, bodyW * 0.58, u * 0.05, bodyH * 0.34, darkMat, 0, backY + u * 0.02, bodyZ);
  boxMesh(g, bodyW * 0.48, u * 0.035, bodyH * 0.14, goldMat, 0, backY + u * 0.042, bodyZ);

  return { group: g, chassisMaterials: [shellMat, darkMat], statusLedMaterial: statusLedMat };
}

/**
 * Compute Modules (`vox.compute.arm-soc` & `vox.compute.gpu-module`):
 * Open-sided machined aluminum exoskeleton frame housing a visible multi-layer
 * PCB substrate, brushed-nickel ARM SoC / GPU IHS die block, and real recessed
 * aluminum heatsink fin stacks visible from every angle.
 */
function buildComputeModel(manifestId: string, sx: number, sy: number, sz: number): VoxelModelRig {
  const g = new THREE.Group();
  const u = Math.min(sx, sy, sz);
  const isArmSoc = manifestId === 'vox.compute.arm-soc';

  const frameMat = std(isArmSoc ? 0xcbd5e1 : 0xa78bfa, isArmSoc ? ALU : { metalness: 0.78, roughness: 0.28 });
  const accentMat = std(isArmSoc ? 0x7c3aed : 0x6d28d9, { metalness: 0.52, roughness: 0.35 });
  const pcbMat = std(isArmSoc ? 0x064e3b : 0x1e1b4b, { metalness: 0.25, roughness: 0.52 });
  const finMat = std(0xe2e8f0, ALU);
  const copperMat = std(0xd97706, COPPER);
  const ihsMat = std(0xf1f5f9, { metalness: 0.94, roughness: 0.18 });
  const dieMat = std(0x0f172a, { metalness: 0.5, roughness: 0.25 });
  const goldMat = std(0xfbbf24, { metalness: 0.92, roughness: 0.22 });

  // 1. Open-sided machined aluminum exoskeleton frame (4 vertical corner pillars + top/bottom rims)
  const beam = u * 0.075;
  const ex = sx * 0.5 - beam * 0.5;
  const ey = sy * 0.5 - beam * 0.5;
  const ez = sz * 0.5 - beam * 0.5;

  for (const ax of [-1, 1]) {
    for (const ay of [-1, 1]) {
      boxMesh(g, beam, beam, sz, frameMat, ax * ex, ay * ey, 0);
    }
  }
  for (const az of [-1, 1]) {
    for (const ay of [-1, 1]) {
      boxMesh(g, sx, beam, beam, frameMat, 0, ay * ey, az * ez);
    }
    for (const ax of [-1, 1]) {
      boxMesh(g, beam, sy, beam, frameMat, ax * ex, 0, az * ez);
    }
  }

  // Lower anodized carrier deck + horizontal PCB substrate inside the open frame
  const pcbZ = -sz * 0.2;
  boxMesh(g, sx * 0.88, sy * 0.88, u * 0.055, accentMat, 0, 0, -sz * 0.38);
  boxMesh(g, sx * 0.84, sy * 0.84, u * 0.045, pcbMat, 0, 0, pcbZ);

  // Gold edge-connector contact fingers along -X and +Y edges of the PCB
  for (let i = -3; i <= 3; i++) {
    boxMesh(g, u * 0.055, u * 0.032, u * 0.018, goldMat, -sx * 0.4, i * u * 0.095, pcbZ + u * 0.028);
  }

  // 2. Prominent ARM SoC / GPU IHS chip package right in the visible center
  const ihsSize = isArmSoc ? u * 0.34 : u * 0.38;
  const ihsH = u * 0.09;
  const ihsZ = pcbZ + u * 0.022 + ihsH * 0.5;
  // Substrate interposer
  boxMesh(g, ihsSize * 1.18, ihsSize * 1.18, u * 0.03, accentMat, 0, 0, pcbZ + u * 0.035);
  // Nickel-plated IHS lid + exposed silicon die centerpiece
  boxMesh(g, ihsSize, ihsSize, ihsH, ihsMat, 0, 0, ihsZ);
  boxMesh(g, ihsSize * 0.56, ihsSize * 0.56, u * 0.022, dieMat, 0, 0, ihsZ + ihsH * 0.5 + u * 0.008);

  // Copper thermal heatpipes spanning from IHS out into the side fin stacks
  for (const py of [-u * 0.1, u * 0.1]) {
    cylMesh(g, u * 0.022, u * 0.022, sx * 0.72, copperMat, 0, py, ihsZ + u * 0.02, 'x', 10);
  }

  // 3. Real sculpted heatsink fin stacks visible through the open sides
  const finH = isArmSoc ? sz * 0.46 : sz * 0.56;
  const finCenterZ = pcbZ + u * 0.05 + finH * 0.5;
  const finsPerSide = isArmSoc ? 5 : 6;
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < finsPerSide; i++) {
      const fx = side * (sx * 0.24 + (i / (finsPerSide - 1)) * sx * 0.16);
      boxMesh(g, u * 0.022, sy * 0.72, finH, finMat, fx, 0, finCenterZ);
    }
  }

  // On GPU modules add an upper rear shroud fin bank for extra visual heft
  if (!isArmSoc) {
    for (let i = -2; i <= 2; i++) {
      boxMesh(g, sx * 0.36, u * 0.024, finH * 0.58, finMat, 0, sy * 0.22 + i * u * 0.048, finCenterZ + finH * 0.22);
    }
  }

  return { group: g, chassisMaterials: [accentMat, frameMat] };
}

/**
 * Actuated / Joint Cube (`actuated` / `vox.actuated.em-60`):
 * True open-frame skeletal ElectroVoxel cube matching the reference robotics
 * paper: 8 white/silver corner connector blocks, 12 prominent copper-wound
 * electromagnetic edge coils, open hollow interior showing the internal PCB
 * & capacitor bank, and a clearly visible amber/gold internal pivot collar.
 */
function buildActuatedModel(sx: number, sy: number, sz: number, axis: Axis): VoxelModelRig {
  const g = new THREE.Group();
  const u = Math.min(sx, sy, sz);

  const cornerMat = std(0xe2e8f0, { metalness: 0.35, roughness: 0.32 });
  const coilMat = std(0xd97706, { metalness: 0.72, roughness: 0.3 });
  const coreMat = std(0x451a03, { metalness: 0.45, roughness: 0.55 });
  const pcbMat = std(0x334155, { metalness: 0.3, roughness: 0.55 });
  const capMat = std(0x94a3b8, ALU);
  const collarMat = std(0xfbbf24, { metalness: 0.78, roughness: 0.24 });
  const axleMat = std(0xfef3c7, { metalness: 0.85, roughness: 0.22 });

  // 1. 8 machined corner connector blocks at cube vertices
  const cSize = u * 0.15;
  const cx = sx * 0.5 - cSize * 0.5;
  const cy = sy * 0.5 - cSize * 0.5;
  const cz = sz * 0.5 - cSize * 0.5;
  for (const ax of [-1, 1]) {
    for (const ay of [-1, 1]) {
      for (const az of [-1, 1]) {
        boxMesh(g, cSize, cSize, cSize, cornerMat, ax * cx, ay * cy, az * cz);
      }
    }
  }

  // 2. 12 cylindrical copper electromagnetic edge coils along every cube edge
  const coilR = u * 0.052;
  const ox = sx * 0.5 - coilR;
  const oy = sy * 0.5 - coilR;
  const oz = sz * 0.5 - coilR;
  const lenX = Math.max(0.005, sx - cSize * 1.9);
  const lenY = Math.max(0.005, sy - cSize * 1.9);
  const lenZ = Math.max(0.005, sz - cSize * 1.9);

  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      // Along Z
      cylMesh(g, coilR, coilR, lenZ * 0.86, coilMat, a * ox, b * oy, 0, 'z', 14);
      cylMesh(g, coilR * 0.56, coilR * 0.56, lenZ, coreMat, a * ox, b * oy, 0, 'z', 10);
      // Along X
      cylMesh(g, coilR, coilR, lenX * 0.86, coilMat, 0, a * oy, b * oz, 'x', 14);
      cylMesh(g, coilR * 0.56, coilR * 0.56, lenX, coreMat, 0, a * oy, b * oz, 'x', 10);
      // Along Y
      cylMesh(g, coilR, coilR, lenY * 0.86, coilMat, a * ox, 0, b * oz, 'y', 14);
      cylMesh(g, coilR * 0.56, coilR * 0.56, lenY, coreMat, a * ox, 0, b * oz, 'y', 10);
    }
  }

  // 3. Visible internal ElectroVoxel electronics deck + capacitor bank
  boxMesh(g, sx * 0.54, sy * 0.54, u * 0.032, pcbMat, 0, 0, -sz * 0.14);
  for (const px of [-u * 0.13, 0, u * 0.13]) {
    cylMesh(g, u * 0.048, u * 0.048, u * 0.16, capMat, px, u * 0.08, -sz * 0.04, 'z', 14);
  }

  // 4. Internal articulated pivot collar + axle rod spanning along `axis`
  const along = axis === 'x' ? sx : axis === 'y' ? sy : sz;
  cylMesh(g, u * 0.045, u * 0.045, along * 0.84, axleMat, 0, 0, 0, axis, 16);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(u * 0.22, u * 0.032, 10, 32), collarMat);
  if (axis === 'x') ring.rotation.y = Math.PI / 2;
  else if (axis === 'y') ring.rotation.x = Math.PI / 2;
  g.add(ring);

  return { group: g, chassisMaterials: [coilMat, collarMat, cornerMat] };
}

/**
 * Power / Battery Module (`power` / `vox.power.pd-100w`):
 * Chamfered battery pack enclosure with recessed LiFePO4 cylindrical cell window,
 * 4-segment illuminated charge bar, galvanic isolation stripe, and heavy +/- terminals.
 */
function buildPowerModel(sx: number, sy: number, sz: number): VoxelModelRig {
  const g = new THREE.Group();
  const u = Math.min(sx, sy, sz);

  const packMat = std(0x059669, { metalness: 0.32, roughness: 0.44 });
  const armorMat = std(0x1e293b, DARK_ALU);
  const isoBandMat = std(0xf59e0b, { metalness: 0.45, roughness: 0.35 });
  const cellMat = std(0xa7f3d0, ALU);
  const nubMat = std(0xf1f5f9, ALU);
  const posMat = std(0xdc2626, { metalness: 0.65, roughness: 0.3 });
  const negMat = std(0x334155, { metalness: 0.65, roughness: 0.3 });

  // Chamfered battery pack housing (stepped top/bottom shoulders inside cell bounds)
  const w = sx * 0.88;
  const d = sy * 0.86;
  const h = sz * 0.78;
  boxMesh(g, w, d, h * 0.72, packMat, 0, 0, -sz * 0.02);
  boxMesh(g, w * 0.9, d * 0.9, h, armorMat, 0, 0, -sz * 0.02);
  // Wide dark base feet flush to cell floor (-sz/2)
  boxMesh(g, sx * 0.92, sy * 0.84, sz * 0.09, armorMat, 0, 0, -sz * 0.455);

  // Galvanic isolation warning band wrapping waist
  boxMesh(g, w * 1.02, d * 1.02, sz * 0.065, isoBandMat, 0, 0, -sz * 0.06);

  // Recessed top cylindrical cell array (+Z)
  const cellTopZ = -sz * 0.02 + h * 0.5;
  const cellH = Math.min(sz * 0.12, sz * 0.5 - cellTopZ - u * 0.02);
  for (const ix of [-1, 0, 1]) {
    for (const iy of [-0.6, 0.6]) {
      cylMesh(g, u * 0.095, u * 0.095, cellH, cellMat, ix * u * 0.24, iy * u * 0.26, cellTopZ + cellH * 0.42, 'z', 18);
      cylMesh(g, u * 0.038, u * 0.038, cellH * 0.35, nubMat, ix * u * 0.24, iy * u * 0.26, cellTopZ + cellH * 0.95, 'z', 12);
    }
  }

  // Front (-Y) telemetry window + 4-segment illuminated emerald charge bar
  const frontY = -d * 0.5;
  boxMesh(g, w * 0.68, u * 0.035, h * 0.36, armorMat, 0, frontY - u * 0.012, sz * 0.14);
  for (let i = 0; i < 4; i++) {
    const lit = i < 3;
    const segMat = std(lit ? 0x34d399 : 0x064e3b, {
      emissive: lit ? 0x22c55e : 0x000000,
      emissiveIntensity: lit ? 1.35 : 0,
      roughness: 0.3,
    });
    boxMesh(g, u * 0.085, u * 0.022, u * 0.075, segMat, (i - 1.5) * u * 0.125, frontY - u * 0.026, sz * 0.14);
  }

  // Heavy high-current +/- bus terminals on +X face
  const rightX = w * 0.5;
  cylMesh(g, u * 0.065, u * 0.065, u * 0.07, posMat, rightX + u * 0.022, -u * 0.14, sz * 0.14, 'x', 16);
  cylMesh(g, u * 0.065, u * 0.065, u * 0.07, negMat, rightX + u * 0.022, u * 0.14, sz * 0.14, 'x', 16);

  return { group: g, chassisMaterials: [packMat, armorMat] };
}

/**
 * Builds a single merged BufferGeometry for an authentic open cuboctahedron /
 * octahedral cellular metamaterial truss strictly inside `[-sx/2..sx/2]` etc.
 *
 * Comprises:
 *  - 12 outer frame edge struts between the 8 corners,
 *  - 12 inner inscribed-octahedron struts connecting the 6 face centers,
 *  - 24 diagonal face cross-braces connecting each face center to its 4 corners,
 *  - 14 compact node hubs (8 corners + 6 face centers).
 *
 * Returns ONE merged geometry (1 draw call per voxel) for fast in-place FEA
 * stress coloring in Physics mode and crisp architectural rendering in Assembly mode.
 */
export function buildTrussLatticeGeometry(
  sx: number,
  sy: number,
  sz: number,
  strutScale = 1
): THREE.BufferGeometry {
  const u = Math.min(sx, sy, sz);
  const rOuter = u * 0.029 * strutScale;
  const rDiag = u * 0.022 * strutScale;
  const rOct = u * 0.025 * strutScale;
  const hx = sx * 0.5 - rOuter * 1.15;
  const hy = sy * 0.5 - rOuter * 1.15;
  const hz = sz * 0.5 - rOuter * 1.15;

  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const mat = new THREE.Matrix4();
  const scaleOne = new THREE.Vector3(1, 1, 1);

  const pushStrut = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
    dir.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-5) return;
    mid.addVectors(a, b).multiplyScalar(0.5);
    quat.setFromUnitVectors(up, dir.normalize());
    mat.compose(mid, quat, scaleOne);
    const geo = new THREE.CylinderGeometry(radius, radius, len, 6, 1, false).toNonIndexed();
    geo.applyMatrix4(mat);
    parts.push(geo);
  };

  const pushHub = (p: THREE.Vector3, size: number) => {
    const geo = new THREE.BoxGeometry(size, size, size).toNonIndexed();
    geo.translate(p.x, p.y, p.z);
    parts.push(geo);
  };

  // 8 corner vertices
  const c = (ix: -1 | 1, iy: -1 | 1, iz: -1 | 1) => new THREE.Vector3(ix * hx, iy * hy, iz * hz);
  const corners: THREE.Vector3[] = [];
  for (const ix of [-1, 1] as const) {
    for (const iy of [-1, 1] as const) {
      for (const iz of [-1, 1] as const) {
        const pt = c(ix, iy, iz);
        corners.push(pt);
        pushHub(pt, rOuter * 2.55);
      }
    }
  }

  // 12 outer cube frame struts
  for (const a of [-1, 1] as const) {
    for (const b of [-1, 1] as const) {
      pushStrut(c(-1, a, b), c(1, a, b), rOuter);
      pushStrut(c(a, -1, b), c(a, 1, b), rOuter);
      pushStrut(c(a, b, -1), c(a, b, 1), rOuter);
    }
  }

  // 6 face-center vertices
  const facePx = new THREE.Vector3(hx, 0, 0);
  const faceNx = new THREE.Vector3(-hx, 0, 0);
  const facePy = new THREE.Vector3(0, hy, 0);
  const faceNy = new THREE.Vector3(0, -hy, 0);
  const facePz = new THREE.Vector3(0, 0, hz);
  const faceNz = new THREE.Vector3(0, 0, -hz);
  const faces = [facePx, faceNx, facePy, faceNy, facePz, faceNz];
  for (const fp of faces) pushHub(fp, rOct * 2.5);

  // 12 inner inscribed-octahedron struts (cuboctahedron cellular core)
  const octPairs: ReadonlyArray<[THREE.Vector3, THREE.Vector3]> = [
    [facePz, facePx],
    [facePz, faceNx],
    [facePz, facePy],
    [facePz, faceNy],
    [faceNz, facePx],
    [faceNz, faceNx],
    [faceNz, facePy],
    [faceNz, faceNy],
    [facePx, facePy],
    [facePy, faceNx],
    [faceNx, faceNy],
    [faceNy, facePx],
  ];
  for (const [a, b] of octPairs) pushStrut(a, b, rOct);

  // 24 face-diagonal struts connecting each face center to its 4 surrounding corners
  for (const a of [-1, 1] as const) {
    for (const b of [-1, 1] as const) {
      pushStrut(facePx, c(1, a, b), rDiag);
      pushStrut(faceNx, c(-1, a, b), rDiag);
      pushStrut(facePy, c(a, 1, b), rDiag);
      pushStrut(faceNy, c(a, -1, b), rDiag);
      pushStrut(facePz, c(a, b, 1), rDiag);
      pushStrut(faceNz, c(a, b, -1), rDiag);
    }
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) {
    return new THREE.BoxGeometry(sx, sy, sz);
  }
  merged.computeVertexNormals();
  return merged;
}

/**
 * Structural Lattice / Heatsink Voxel (`structural` / `vox.struct.alu-150`):
 * Authentic open cuboctahedron / octahedral machined-aluminum space-frame truss
 * (MIT VIK / NASA cellular metamaterial voxel) with dark anodized corner gusset
 * accents and compact central thermal core ring so structural furniture and
 * architectural spans read as crisp open lattice frames.
 */
function buildStructuralModel(sx: number, sy: number, sz: number): VoxelModelRig {
  const g = new THREE.Group();
  const u = Math.min(sx, sy, sz);

  const aluMat = std(0xdbe4ef, { metalness: 0.84, roughness: 0.24 });
  const nodeMat = std(0x475569, DARK_ALU);

  // Primary open cuboctahedron space-frame truss (1 merged draw call)
  const trussGeo = buildTrussLatticeGeometry(sx, sy, sz, 1.0);
  const trussMesh = new THREE.Mesh(trussGeo, aluMat);
  g.add(trussMesh);

  // Crisp anodized face-center mating rings on all 6 faces (visualizes modular bolt/latch ports)
  const hx = sx * 0.5 - u * 0.022;
  const hy = sy * 0.5 - u * 0.022;
  const hz = sz * 0.5 - u * 0.022;
  const ringGeo = new THREE.TorusGeometry(u * 0.105, u * 0.015, 8, 20);
  const ringConfigs: ReadonlyArray<{ pos: [number, number, number]; rot: [number, number, number] }> = [
    { pos: [hx, 0, 0], rot: [0, Math.PI / 2, 0] },
    { pos: [-hx, 0, 0], rot: [0, Math.PI / 2, 0] },
    { pos: [0, hy, 0], rot: [Math.PI / 2, 0, 0] },
    { pos: [0, -hy, 0], rot: [Math.PI / 2, 0, 0] },
    { pos: [0, 0, hz], rot: [0, 0, 0] },
    { pos: [0, 0, -hz], rot: [0, 0, 0] },
  ];
  for (const rc of ringConfigs) {
    const ring = new THREE.Mesh(ringGeo, nodeMat);
    ring.position.set(rc.pos[0], rc.pos[1], rc.pos[2]);
    ring.rotation.set(rc.rot[0], rc.rot[1], rc.rot[2]);
    g.add(ring);
  }

  return { group: g, chassisMaterials: [aluMat, nodeMat] };
}

/**
 * IO / Ergonomic Control & Port Deck (`io` / `vox.io.gamepad-ctrl`):
 * Slim contoured ~44%-height ergonomic deck with dual 3D concave thumbsticks,
 * sculpted D-pad, diamond action buttons, recessed dual USB-C & audio ports,
 * and a low-profile lattice docking cradle.
 */
function buildIoModel(sx: number, sy: number, sz: number): VoxelModelRig {
  const g = new THREE.Group();
  const u = Math.min(sx, sy, sz);

  const shellMat = std(0xe11d48, { metalness: 0.28, roughness: 0.42 });
  const deckMat = std(0x1e293b, { metalness: 0.35, roughness: 0.5 });
  const trimMat = std(0xfda4af, { metalness: 0.5, roughness: 0.35 });
  const stickMat = std(0xe2e8f0, { metalness: 0.3, roughness: 0.38 });
  const portMat = std(0x090d16, { metalness: 0.65, roughness: 0.4 });
  const metalMat = std(0x94a3b8, ALU);

  const deckW = sx * 0.94;
  const deckD = sy * 0.82;
  const deckH = sz * 0.38;
  const deckZ = -sz * 0.14;

  // Contoured stepped ergonomic deck + lower docking cradle touching cell floor (-sz/2)
  boxMesh(g, deckW, deckD, deckH * 0.68, shellMat, 0, 0, deckZ);
  boxMesh(g, deckW * 0.92, deckD * 0.9, deckH, deckMat, 0, 0, deckZ);
  const baseH = Math.max(u * 0.04, deckZ - deckH * 0.5 - (-sz * 0.5));
  if (baseH > 0.001) {
    boxMesh(g, sx * 0.76, sy * 0.66, baseH, deckMat, 0, 0, -sz * 0.5 + baseH * 0.5);
  }

  // Ergonomic side palm bolsters
  for (const side of [-1, 1] as const) {
    cylMesh(g, deckH * 0.48, deckH * 0.48, deckD * 0.78, shellMat, side * deckW * 0.45, 0, deckZ, 'y', 14);
  }

  const topZ = deckZ + deckH * 0.5;
  // Recessed dark control faceplate
  boxMesh(g, deckW * 0.78, deckD * 0.76, u * 0.022, deckMat, 0, 0, topZ + u * 0.008);

  // Dual 3D thumbsticks (well → shaft → concave cap)
  for (const [tx, ty] of [
    [-0.22, 0.14],
    [0.2, -0.16],
  ] as const) {
    cylMesh(g, u * 0.095, u * 0.1, u * 0.03, portMat, tx * u, ty * u, topZ + u * 0.02, 'z', 18);
    cylMesh(g, u * 0.038, u * 0.045, u * 0.065, metalMat, tx * u, ty * u, topZ + u * 0.055, 'z', 14);
    cylMesh(g, u * 0.072, u * 0.058, u * 0.028, stickMat, tx * u, ty * u, topZ + u * 0.092, 'z', 18);
  }

  // Sculpted 3D D-pad cross
  boxMesh(g, u * 0.2, u * 0.062, u * 0.045, trimMat, -0.22 * u, -0.16 * u, topZ + u * 0.03);
  boxMesh(g, u * 0.062, u * 0.2, u * 0.045, trimMat, -0.22 * u, -0.16 * u, topZ + u * 0.03);

  // 4 diamond-layout tactile action buttons
  const btnColors = [0xef4444, 0xfacc15, 0x22c55e, 0x3b82f6];
  const btnOffsets = [
    [0.08, 0],
    [0, 0.08],
    [-0.08, 0],
    [0, -0.08],
  ] as const;
  btnOffsets.forEach(([ox, oy], i) => {
    cylMesh(
      g,
      u * 0.036,
      u * 0.036,
      u * 0.042,
      std(btnColors[i], { roughness: 0.35 }),
      0.22 * u + ox * u,
      0.14 * u + oy * u,
      topZ + u * 0.03,
      'z',
      14
    );
  });

  // Front (-Y) recessed dual USB-C ports + 3.5 mm jack
  const frontY = -deckD * 0.5;
  for (const px of [-u * 0.18, u * 0.04]) {
    boxMesh(g, u * 0.16, u * 0.03, u * 0.062, metalMat, px, frontY - u * 0.008, deckZ);
    boxMesh(g, u * 0.12, u * 0.034, u * 0.036, portMat, px, frontY - u * 0.011, deckZ);
  }
  cylMesh(g, u * 0.036, u * 0.036, u * 0.034, metalMat, u * 0.24, frontY - u * 0.008, deckZ, 'y', 14);
  cylMesh(g, u * 0.022, u * 0.022, u * 0.038, portMat, u * 0.24, frontY - u * 0.012, deckZ, 'y', 12);

  return { group: g, chassisMaterials: [shellMat, deckMat] };
}

/**
 * Builds the realistic, distinct 3D engineering silhouette for a voxel strictly
 * inside its `(sx, sy, sz)` cell bounds.
 */
export function buildVoxelModel(
  manifestId: string,
  category: VoxelCategory,
  sx: number,
  sy: number,
  sz: number,
  axis: Axis = 'y',
  hsMounted = false
): VoxelModelRig {
  if (manifestId === 'vox.device.phone-core') {
    return buildPhoneCoreModel(sx, sy, sz);
  }
  switch (category) {
    case 'display':
      return buildDisplayModel(sx, sy, sz);
    case 'storage':
      return buildStorageModel(sx, sy, sz, hsMounted);
    case 'compute':
      return buildComputeModel(manifestId, sx, sy, sz);
    case 'actuated':
      return buildActuatedModel(sx, sy, sz, axis);
    case 'power':
      return buildPowerModel(sx, sy, sz);
    case 'structural':
      return buildStructuralModel(sx, sy, sz);
    case 'io':
      return buildIoModel(sx, sy, sz);
  }
}

/** Backwards-compatible convenience wrapper returning only the Three.js group. */
export function buildVoxelDetails(
  category: VoxelCategory,
  sx: number,
  sy: number,
  sz: number,
  axis: Axis = 'y'
): THREE.Group {
  return buildVoxelModel('', category, sx, sy, sz, axis, false).group;
}

// ---------------------------------------------------------------------------
// Joint / link connectors (corner clamps + perimeter edge coils + bayonet pins)
// ---------------------------------------------------------------------------

const AXIS_VEC: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

export const JOINT_COLOR = 0xfbbf24;

export type LatchDirection = 1 | -1 | 0;

export interface LinkConnectorRig {
  group: THREE.Group;
  /**
   * Drives corner clamp engagement, perimeter edge-coil Catch/Release glow,
   * telescoping mechanical/bus pins, and bayonet ring twist-lock in place
   * (zero allocations per frame).
   *
   * @param engagement 0 = fully released/retracted, 1 = fully seated and locked.
   * @param direction +1 while latching (Catch), -1 while releasing (Step Back / detach), 0 static.
   */
  setEngagement: (engagement: number, direction?: LatchDirection) => void;
}

// Module-scoped colour helpers (zero GC pressure inside per-frame animations)
const COL_RING_OPEN = new THREE.Color(0x64748b);
const COL_COPPER = new THREE.Color(0xd97706);
const COL_RING_ENGAGE = new THREE.Color(0xf59e0b);
const COL_CATCH_CYAN = new THREE.Color(0x38bdf8);
const COL_CATCH_MAGENTA = new THREE.Color(0xe879f9);
const COL_RELEASE_AMBER = new THREE.Color(0xf97316);
const COL_EMISSIVE_RELEASE = new THREE.Color(0xfb7185);
const COL_CLAMP_IDLE = new THREE.Color(0xcbd5e1);
const COL_CLAMP_OPEN = new THREE.Color(0x64748b);
const _scratchCol = new THREE.Color();
const _scratchColB = new THREE.Color();

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/**
 * Builds an articulated ElectroVoxel-style connector rig for one VoxelLink,
 * authored in a frame whose local +z runs from the source voxel face (-gap/2)
 * to the target voxel face (+gap/2), with its origin at the interface midpoint.
 *
 *  - four corner clamp clasps right at the outer seam corners (visibly clamp/release),
 *  - four copper perimeter edge coils that flare electric cyan/magenta on Catch
 *    and warm amber-orange repulsion on Release/Unlatch,
 *  - four telescoping steel dowel pins + receiving collars,
 *  - rotating central bayonet latch ring + four radial jaw dogs,
 *  - extending cyan (control) & magenta (high-speed) bus pogo pins.
 */
export function buildLinkConnectorRig(link: VoxelLink, gap: number, u: number): LinkConnectorRig {
  const group = new THREE.Group();
  const halfGap = gap * 0.5;
  const halfBridge = halfGap + u * 0.022;

  const pinMat = link.mechanical
    ? std(0xe2e8f0, { metalness: 0.92, roughness: 0.22 })
    : std(0x475569, { metalness: 0.4, roughness: 0.6, transparent: true, opacity: 0.5 });
  const collarMat = std(0x94a3b8, { metalness: 0.88, roughness: 0.28 });

  // Two symmetric halves anchored at -halfGap (source face) and +halfGap (target face)
  // so scaling along local Z telescopes pins smoothly out of both faces toward z = 0.
  const sourcePins = new THREE.Group();
  sourcePins.position.z = -halfGap;
  const targetPins = new THREE.Group();
  targetPins.position.z = halfGap;
  group.add(sourcePins, targetPins);

  const addTelescopingPair = (
    x: number,
    y: number,
    r: number,
    matA: THREE.Material,
    matB: THREE.Material = matA
  ) => {
    const geoA = new THREE.CylinderGeometry(r * 0.92, r, halfBridge, 12);
    geoA.rotateX(Math.PI / 2);
    geoA.translate(0, 0, halfBridge * 0.5);
    const mA = new THREE.Mesh(geoA, matA);
    mA.position.set(x, y, 0);
    sourcePins.add(mA);

    const geoB = new THREE.CylinderGeometry(r * 1.18, r * 1.18, halfBridge, 12);
    geoB.rotateX(Math.PI / 2);
    geoB.translate(0, 0, -halfBridge * 0.5);
    const mB = new THREE.Mesh(geoB, matB);
    mB.position.set(x, y, 0);
    targetPins.add(mB);
  };

  if (link.mechanical) {
    const s = u * 0.22;
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        addTelescopingPair(a * s, b * s, u * 0.028, pinMat, collarMat);
      }
    }
  }

  // Spring-loaded bus pogo pins
  const busSource = new THREE.Group();
  busSource.position.z = -halfGap;
  const busTarget = new THREE.Group();
  busTarget.position.z = halfGap;
  group.add(busSource, busTarget);

  const busMats: THREE.MeshStandardMaterial[] = [];

  const addBusPin = (x: number, y: number, r: number, hex: number) => {
    const mat = new THREE.MeshStandardMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: 1.0,
      metalness: 0.35,
      roughness: 0.28,
    });
    busMats.push(mat);

    const geoA = new THREE.CylinderGeometry(r, r, halfBridge, 10);
    geoA.rotateX(Math.PI / 2);
    geoA.translate(0, 0, halfBridge * 0.5);
    const mA = new THREE.Mesh(geoA, mat);
    mA.position.set(x, y, 0);
    busSource.add(mA);

    const geoB = new THREE.CylinderGeometry(r, r, halfBridge, 10);
    geoB.rotateX(Math.PI / 2);
    geoB.translate(0, 0, -halfBridge * 0.5);
    const mB = new THREE.Mesh(geoB, mat);
    mB.position.set(x, y, 0);
    busTarget.add(mB);
  };

  if (link.controlPlane.connected) {
    addBusPin(-u * 0.09, 0, u * 0.025, BUS_COLORS.control.hex);
  }
  if (link.highSpeedPlane.connected) {
    addBusPin(u * 0.09, u * 0.045, u * 0.028, BUS_COLORS.highSpeed.hex);
    addBusPin(u * 0.09, -u * 0.045, u * 0.028, BUS_COLORS.highSpeed.hex);
  }

  // Visible outer-seam corner clamps + perimeter copper edge coils + bayonet ring
  let latchRingGroup: THREE.Group | null = null;
  let ringMat: THREE.MeshStandardMaterial | null = null;
  let coilMatCyan: THREE.MeshStandardMaterial | null = null;
  let coilMatMagenta: THREE.MeshStandardMaterial | null = null;
  let clampMat: THREE.MeshStandardMaterial | null = null;
  let perimeterGroup: THREE.Group | null = null;

  const jaws: Array<{ mesh: THREE.Mesh; dirX: number; dirY: number }> = [];
  const cornerClamps: Array<{ mesh: THREE.Mesh; sx: number; sy: number }> = [];
  const edgeCoils: Array<{ mesh: THREE.Mesh; axis: 'x' | 'y'; sign: 1 | -1 }> = [];

  const jawOpenR = u * 0.495;
  const jawClosedR = u * 0.415;
  const cornerOpenPos = u * 0.505;
  const cornerClosedPos = u * 0.445;
  const coilOpenPos = u * 0.49;
  const coilClosedPos = u * 0.45;

  if (link.mechanical) {
    // Central rotating bayonet ring + 4 radial jaw dogs
    latchRingGroup = new THREE.Group();
    ringMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.18,
      metalness: 0.78,
      roughness: 0.25,
    });

    const tubeR = Math.min(Math.max(gap * 0.34, u * 0.012), u * 0.02);
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(u * 0.34, tubeR, 10, 40), ringMat);
    latchRingGroup.add(ringMesh);

    const jawDepth = Math.max(gap * 0.9, u * 0.032);
    const jawGeo = new THREE.BoxGeometry(u * 0.12, u * 0.06, jawDepth);
    for (let k = 0; k < 4; k++) {
      const theta = (k * Math.PI) / 2;
      const dx = Math.cos(theta);
      const dy = Math.sin(theta);
      const jaw = new THREE.Mesh(jawGeo, ringMat);
      jaw.rotation.z = theta;
      jaw.position.set(dx * jawClosedR, dy * jawClosedR, 0);
      latchRingGroup.add(jaw);
      jaws.push({ mesh: jaw, dirX: dx, dirY: dy });
    }
    group.add(latchRingGroup);

    // Outer-seam corner connector clamps & copper edge coils (unmistakably visible at normal zoom)
    perimeterGroup = new THREE.Group();
    clampMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      emissive: 0x38bdf8,
      emissiveIntensity: 0,
      metalness: 0.9,
      roughness: 0.24,
    });
    coilMatCyan = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.12,
      metalness: 0.72,
      roughness: 0.28,
    });
    coilMatMagenta = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0xe879f9,
      emissiveIntensity: 0.12,
      metalness: 0.72,
      roughness: 0.28,
    });

    const clampSize = u * 0.115;
    const clampSpanZ = gap + u * 0.068;
    const clampGeo = new THREE.BoxGeometry(clampSize, clampSize, clampSpanZ);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const c = new THREE.Mesh(clampGeo, clampMat);
        c.position.set(sx * cornerClosedPos, sy * cornerClosedPos, 0);
        perimeterGroup.add(c);
        cornerClamps.push({ mesh: c, sx, sy });
      }
    }

    const coilLen = u * 0.44;
    const coilThick = Math.max(gap * 0.84, u * 0.042);
    const coilDepth = gap + u * 0.036;
    const coilGeoX = new THREE.BoxGeometry(coilLen, coilThick, coilDepth);
    const coilGeoY = new THREE.BoxGeometry(coilThick, coilLen, coilDepth);

    for (const sign of [-1, 1] as const) {
      const cx = new THREE.Mesh(coilGeoX, sign > 0 ? coilMatCyan : coilMatMagenta);
      cx.position.set(0, sign * coilClosedPos, 0);
      perimeterGroup.add(cx);
      edgeCoils.push({ mesh: cx, axis: 'y', sign });

      const cy = new THREE.Mesh(coilGeoY, sign > 0 ? coilMatMagenta : coilMatCyan);
      cy.position.set(sign * coilClosedPos, 0, 0);
      perimeterGroup.add(cy);
      edgeCoils.push({ mesh: cy, axis: 'x', sign });
    }

    group.add(perimeterGroup);
  }

  const setEngagement = (rawEngagement: number, direction: LatchDirection = 0) => {
    const e = clamp01(rawEngagement);
    const pinT = smoothstep(0.05, 0.65, e);
    const busT = smoothstep(0.22, 0.76, e);
    const lockT = smoothstep(0.56, 0.98, e);

    // 1. Telescope mechanical dowel pins + receiving collars out of both faces
    const pinScale = 0.04 + 0.96 * pinT;
    sourcePins.scale.set(1, 1, pinScale);
    targetPins.scale.set(1, 1, pinScale);
    sourcePins.visible = e > 0.01;
    targetPins.visible = e > 0.01;

    // 2. Extend & energize electrical pogo pins once mechanical alignment holds
    const busScale = 0.04 + 0.96 * busT;
    busSource.scale.set(1, 1, busScale);
    busTarget.scale.set(1, 1, busScale);
    const busVisible = busMats.length > 0 && e > 0.14;
    busSource.visible = busVisible;
    busTarget.visible = busVisible;

    if (busMats.length > 0) {
      const contactPulse =
        direction === 1 ? Math.sin(smoothstep(0.65, 1.0, e) * Math.PI) * 1.05 : 0;
      const intensity = smoothstep(0.45, 0.92, e) * 1.05 + contactPulse;
      for (const m of busMats) m.emissiveIntensity = intensity;
    }

    // 3. Twist-lock bayonet ring (0° → 45°) & clamp radial jaws
    if (latchRingGroup && ringMat) {
      latchRingGroup.visible = e > 0.02;
      latchRingGroup.rotation.z = lockT * (Math.PI / 4);
      const ringScale = 0.88 + 0.12 * smoothstep(0.05, 0.45, e);
      latchRingGroup.scale.set(ringScale, ringScale, 0.55 + 0.45 * pinT);

      const r = jawOpenR + (jawClosedR - jawOpenR) * lockT;
      for (const j of jaws) {
        j.mesh.position.set(j.dirX * r, j.dirY * r, 0);
      }

      if (direction === -1 && e < 0.99 && e > 0.04) {
        const releasePulse = Math.sin(smoothstep(0.06, 0.96, e) * Math.PI);
        _scratchCol.copy(COL_RING_OPEN).lerp(COL_RELEASE_AMBER, 0.35 + 0.65 * releasePulse);
        ringMat.color.copy(_scratchCol);
        ringMat.emissive.copy(COL_EMISSIVE_RELEASE);
        ringMat.emissiveIntensity = 1.2 * releasePulse;
      } else if (direction === 1 && e < 0.995) {
        const catchFlash = Math.sin(smoothstep(0.58, 0.995, e) * Math.PI);
        _scratchCol
          .copy(COL_RING_OPEN)
          .lerp(COL_RING_ENGAGE, smoothstep(0.15, 0.65, e))
          .lerp(COL_CATCH_CYAN, catchFlash * 0.88);
        ringMat.color.copy(_scratchCol);
        ringMat.emissive.copy(COL_RING_ENGAGE).lerp(COL_CATCH_CYAN, catchFlash);
        ringMat.emissiveIntensity = 0.28 * pinT + 1.65 * catchFlash;
      } else {
        _scratchCol.copy(COL_RING_OPEN).lerp(COL_CLAMP_IDLE, smoothstep(0.2, 0.85, e));
        ringMat.color.copy(_scratchCol);
        ringMat.emissive.copy(COL_RING_OPEN);
        ringMat.emissiveIntensity = e >= 0.98 ? 0.04 : 0.1 * pinT;
      }
    }

    // 4. Outer-seam corner clamps & dual-polarity copper edge coils
    if (perimeterGroup && clampMat && coilMatCyan && coilMatMagenta) {
      perimeterGroup.visible = e > 0.02;
      const clampZScale = 0.18 + 0.82 * pinT;
      const cPos = cornerOpenPos + (cornerClosedPos - cornerOpenPos) * lockT;
      for (const c of cornerClamps) {
        c.mesh.position.set(c.sx * cPos, c.sy * cPos, 0);
        c.mesh.scale.set(0.82 + 0.18 * lockT, 0.82 + 0.18 * lockT, clampZScale);
      }

      const coilPos = coilOpenPos + (coilClosedPos - coilOpenPos) * lockT;
      for (const coil of edgeCoils) {
        if (coil.axis === 'y') coil.mesh.position.set(0, coil.sign * coilPos, 0);
        else coil.mesh.position.set(coil.sign * coilPos, 0, 0);
        coil.mesh.scale.set(1, 1, 0.25 + 0.75 * pinT);
      }

      if (direction === -1 && e < 0.99 && e > 0.04) {
        const pulse = Math.sin(smoothstep(0.05, 0.96, e) * Math.PI);
        _scratchCol.copy(COL_COPPER).lerp(COL_RELEASE_AMBER, pulse);
        coilMatCyan.color.copy(_scratchCol);
        coilMatMagenta.color.copy(_scratchCol);
        coilMatCyan.emissive.copy(COL_RELEASE_AMBER);
        coilMatMagenta.emissive.copy(COL_EMISSIVE_RELEASE);
        coilMatCyan.emissiveIntensity = 1.55 * pulse;
        coilMatMagenta.emissiveIntensity = 1.3 * pulse;

        clampMat.color.copy(COL_CLAMP_OPEN).lerp(COL_RELEASE_AMBER, 0.45 * pulse);
        clampMat.emissive.copy(COL_RELEASE_AMBER);
        clampMat.emissiveIntensity = 0.8 * pulse;
      } else if (direction === 1 && e < 0.995) {
        const catchFlare = Math.sin(smoothstep(0.55, 0.995, e) * Math.PI);
        _scratchCol.copy(COL_COPPER).lerp(COL_CATCH_CYAN, catchFlare * 0.88);
        _scratchColB.copy(COL_COPPER).lerp(COL_CATCH_MAGENTA, catchFlare * 0.88);
        coilMatCyan.color.copy(_scratchCol);
        coilMatMagenta.color.copy(_scratchColB);
        coilMatCyan.emissive.copy(COL_CATCH_CYAN);
        coilMatMagenta.emissive.copy(COL_CATCH_MAGENTA);
        coilMatCyan.emissiveIntensity = 0.16 + 2.0 * catchFlare;
        coilMatMagenta.emissiveIntensity = 0.16 + 2.0 * catchFlare;

        clampMat.color.copy(COL_CLAMP_OPEN).lerp(COL_CLAMP_IDLE, lockT);
        clampMat.emissive.copy(COL_CATCH_CYAN);
        clampMat.emissiveIntensity = 1.1 * catchFlare;
      } else {
        _scratchCol.copy(COL_COPPER).lerp(COL_RING_OPEN, 0.45);
        coilMatCyan.color.copy(_scratchCol);
        coilMatMagenta.color.copy(_scratchCol);
        coilMatCyan.emissive.copy(_scratchCol);
        coilMatMagenta.emissive.copy(_scratchCol);
        coilMatCyan.emissiveIntensity = e >= 0.98 ? 0.04 : 0.02;
        coilMatMagenta.emissiveIntensity = e >= 0.98 ? 0.04 : 0.02;

        clampMat.color.copy(COL_CLAMP_OPEN).lerp(COL_CLAMP_IDLE, lockT);
        clampMat.emissive.copy(COL_CATCH_CYAN);
        clampMat.emissiveIntensity = 0;
      }
    }
  };

  setEngagement(1, 0);
  return { group, setEngagement };
}

/**
 * Convenience wrapper returning the connector `THREE.Group` at fully engaged state.
 */
export function buildLinkConnector(link: VoxelLink, gap: number, u: number): THREE.Group {
  return buildLinkConnectorRig(link, gap, u).group;
}

/** Orients a connector group (built along +z) onto the link direction of `face`. */
export function orientConnector(g: THREE.Object3D, face: Face): void {
  orient(g, face);
}

/**
 * Glowing fulcrum rod + dual-polarity electromagnetic edge bars (cyan / rose-magenta)
 * rendered along the active shared hinge edge during `pivot-hinge` docking so the
 * ElectroVoxel attract/repel polarity and articulated rotation axis read immediately.
 */
export function buildHingeFulcrumGuide(axis: Axis, edgeLength: number, u: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: JOINT_COLOR,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  const northMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
  });
  const southMat = new THREE.MeshBasicMaterial({
    color: 0xf43f5e,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
  });

  const len = edgeLength * 1.16;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(u * 0.018, u * 0.018, len, 10), mat);
  rod.renderOrder = 22;
  const capGeo = new THREE.SphereGeometry(u * 0.036, 10, 10);
  const capA = new THREE.Mesh(capGeo, mat);
  const capB = new THREE.Mesh(capGeo, mat);
  capA.position.y = len * 0.5;
  capB.position.y = -len * 0.5;
  capA.renderOrder = 22;
  capB.renderOrder = 22;

  // Dual-polarity electromagnetic coil bars flanking the active hinge seam
  const barLen = edgeLength * 0.76;
  const barOffset = u * 0.052;
  const barGeo = new THREE.CylinderGeometry(u * 0.015, u * 0.015, barLen, 8);
  const northBar = new THREE.Mesh(barGeo, northMat);
  northBar.position.set(barOffset, 0, 0);
  northBar.renderOrder = 22;
  const southBar = new THREE.Mesh(barGeo, southMat);
  southBar.position.set(-barOffset, 0, 0);
  southBar.renderOrder = 22;

  const aligned = new THREE.Group();
  aligned.add(rod, capA, capB, northBar, southBar);
  aligned.quaternion.setFromUnitVectors(AXIS_VEC.y, AXIS_VEC[axis]);
  g.add(aligned);
  return g;
}

/**
 * Curved dashed cyan trajectory arc with a directional arrowhead showing the
 * exact `Pivoting` or `Traversal` motion path into the target cell.
 */
export function buildPivotArcGuide(pointsM: THREE.Vector3[], u: number, color = 0x38bdf8): THREE.Group {
  const g = new THREE.Group();
  if (pointsM.length < 2) return g;

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pointsM),
    new THREE.LineDashedMaterial({
      color,
      dashSize: u * 0.12,
      gapSize: u * 0.07,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    })
  );
  line.computeLineDistances();
  line.renderOrder = 21;
  g.add(line);

  const tipIdx = Math.max(1, Math.min(pointsM.length - 1, Math.floor(pointsM.length * 0.72)));
  const prevPt = pointsM[tipIdx - 1];
  const tipPt = pointsM[tipIdx];
  const tangent = new THREE.Vector3().subVectors(tipPt, prevPt);
  if (tangent.lengthSq() > 1e-8) {
    tangent.normalize();
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(u * 0.055, u * 0.14, 14),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      })
    );
    arrow.position.copy(tipPt);
    arrow.quaternion.setFromUnitVectors(AXIS_VEC.y, tangent);
    arrow.renderOrder = 23;
    g.add(arrow);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Pivot (joint-axis) marker for actuated voxels
// ---------------------------------------------------------------------------

/**
 * X-ray overlay for an actuated voxel's hinge: axis rod with arrowheads and a
 * rotation arc. Drawn without depth testing so it stays legible when the voxel is
 * embedded in the lattice.
 */
export function buildPivotMarker(axis: Axis, sx: number, sy: number, sz: number): THREE.Group {
  const g = new THREE.Group();
  const u = Math.min(sx, sy, sz);
  const along = axis === 'x' ? sx : axis === 'y' ? sy : sz;
  const ext = u * 0.2;

  const mat = new THREE.MeshBasicMaterial({
    color: JOINT_COLOR,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });

  const total = along + 2 * ext;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(u * 0.014, u * 0.014, total, 10), mat);
  const cone = (dir: 1 | -1) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(u * 0.045, u * 0.1, 14), mat);
    c.position.y = dir * (total / 2 + u * 0.02);
    if (dir === -1) c.rotation.z = Math.PI;
    return c;
  };

  const R = u * 0.4;
  const sweep = Math.PI * 1.5;
  const arc = new THREE.Mesh(new THREE.TorusGeometry(R, u * 0.011, 8, 40, sweep), mat);
  arc.rotation.x = Math.PI / 2;
  arc.position.y = along / 2 + ext * 0.55;
  const tipAngle = sweep;
  const head = new THREE.Mesh(new THREE.ConeGeometry(u * 0.035, u * 0.09, 12), mat);
  head.position.set(Math.cos(tipAngle) * R, along / 2 + ext * 0.55, Math.sin(tipAngle) * R);
  head.quaternion.setFromUnitVectors(
    AXIS_VEC.y,
    new THREE.Vector3(-Math.sin(tipAngle), 0, Math.cos(tipAngle))
  );

  const pivot = new THREE.Group();
  pivot.add(rod, cone(1), cone(-1), arc, head);
  pivot.children.forEach((c) => {
    c.renderOrder = 20;
  });

  const q = new THREE.Quaternion().setFromUnitVectors(AXIS_VEC.y, AXIS_VEC[axis]);
  pivot.quaternion.copy(q);
  g.add(pivot);
  return g;
}

// ---------------------------------------------------------------------------
// Move handles (axis arrows)
// ---------------------------------------------------------------------------

export const HANDLE_COLOR: Record<Axis, number> = { x: 0xef4444, y: 0x22c55e, z: 0x3b82f6 };

export interface HandlePick {
  axis: Axis;
  sign: 1 | -1;
}

/**
 * Six always-on-top arrows (±X, ±Y, ±Z) around a selected voxel. Dragging one moves
 * the voxel along that lattice axis in whole cells.
 */
export function buildMoveHandles(sx: number, sy: number, sz: number): THREE.Group {
  const g = new THREE.Group();
  const u = Math.min(sx, sy, sz);
  const half = { x: sx / 2, y: sy / 2, z: sz / 2 };

  (['x', 'y', 'z'] as const).forEach((axis) => {
    ([1, -1] as const).forEach((sign) => {
      const color = HANDLE_COLOR[axis];
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      });
      const arrow = new THREE.Group();
      const start = half[axis] + u * 0.1;
      const shaftLen = u * 0.4;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(u * 0.032, u * 0.032, shaftLen, 10), mat);
      shaft.position.y = start + shaftLen / 2;
      const head = new THREE.Mesh(new THREE.ConeGeometry(u * 0.1, u * 0.22, 16), mat);
      head.position.y = start + shaftLen + u * 0.11;
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(u * 0.15, u * 0.15, shaftLen + u * 0.26, 8),
        new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false })
      );
      hit.position.y = start + (shaftLen + u * 0.26) / 2;
      [shaft, head, hit].forEach((m) => {
        m.renderOrder = 30;
        m.userData.handle = { axis, sign } satisfies HandlePick;
      });
      arrow.add(shaft, head, hit);
      const q = new THREE.Quaternion().setFromUnitVectors(
        AXIS_VEC.y,
        AXIS_VEC[axis].clone().multiplyScalar(sign)
      );
      arrow.quaternion.copy(q);
      g.add(arrow);
    });
  });
  g.userData.isHandles = true;
  return g;
}
