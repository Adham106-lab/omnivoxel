import * as THREE from 'three';
import type { Face, VoxelCategory, VoxelLink } from '@omnivoxel/core';
import { BUS_COLORS } from './theme';
import type { Axis } from './assembly';

/**
 * Engineering sub-geometry for every voxel category.
 *
 * Rules that keep the lattice crisp:
 *  - Every detail lives *on* a face plane and protrudes at most `lip` (1.2 % of the
 *    voxel edge). Two touching voxels therefore never intersect each other's details.
 *  - Details are built in a per-face local frame (x/y in the face, +z outward) and
 *    then rotated onto the face, so every category reuses the same alignment logic.
 *  - Nothing here is pickable; the voxel's body box remains the single pick target.
 */

type MatExtra = THREE.MeshStandardMaterialParameters;

const std = (color: number, extra: MatExtra = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.55, ...extra });

const ALU: MatExtra = { metalness: 0.92, roughness: 0.24 };

// ---------------------------------------------------------------------------
// Face frames
// ---------------------------------------------------------------------------

/** A group whose local +z points out of `face`, origin on the face plane. */
function faceFrame(face: Face, hx: number, hy: number, hz: number): THREE.Group {
  const g = new THREE.Group();
  orient(g, face);
  switch (face) {
    case '+x': g.position.set(hx, 0, 0); break;
    case '-x': g.position.set(-hx, 0, 0); break;
    case '+y': g.position.set(0, hy, 0); break;
    case '-y': g.position.set(0, -hy, 0); break;
    case '+z': g.position.set(0, 0, hz); break;
    case '-z': g.position.set(0, 0, -hz); break;
  }
  return g;
}

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

/** Flat box sitting on the face plane at height `z0`, protruding `t`. */
function plate(
  parent: THREE.Object3D,
  w: number,
  h: number,
  t: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z0 = 0
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), mat);
  m.position.set(x, y, z0 + t / 2);
  parent.add(m);
  return m;
}

/** Cylinder standing on the face plane (axis along local z). */
function post(
  parent: THREE.Object3D,
  r: number,
  t: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z0 = 0,
  segments = 20
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, segments), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z0 + t / 2);
  parent.add(m);
  return m;
}

function ring(
  parent: THREE.Object3D,
  radius: number,
  tube: number,
  mat: THREE.Material,
  z0 = 0,
  x = 0,
  y = 0
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 44), mat);
  m.position.set(x, y, z0 + tube);
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// Category builders
// ---------------------------------------------------------------------------

interface Dims {
  sx: number;
  sy: number;
  sz: number;
  hx: number;
  hy: number;
  hz: number;
  /** Smallest edge: all feature sizes are fractions of this. */
  u: number;
  /** Maximum protrusion off any face. */
  lip: number;
}

function dimsOf(sx: number, sy: number, sz: number): Dims {
  const u = Math.min(sx, sy, sz);
  return { sx, sy, sz, hx: sx / 2, hy: sy / 2, hz: sz / 2, u, lip: u * 0.012 };
}

/** Fin bank on a face: dark base panel + raised machined fins. */
function finPanel(parent: THREE.Object3D, d: Dims, count: number, span = 0.74): void {
  const { u, lip } = d;
  const base = std(0x1e293b, { metalness: 0.5, roughness: 0.5 });
  const fin = std(0xe2e8f0, ALU);
  plate(parent, u * span, u * span, lip * 0.4, base);
  const pitch = (u * (span - 0.06)) / (count - 1);
  for (let i = 0; i < count; i++) {
    plate(
      parent,
      u * 0.028,
      u * (span - 0.08),
      lip * 0.6,
      fin,
      -u * (span - 0.06) / 2 + i * pitch,
      0,
      lip * 0.4
    );
  }
}

/** 4 counter-sunk fastener heads on a face. */
function boltPattern(parent: THREE.Object3D, d: Dims, inset: number, mat: THREE.Material): void {
  const { u, lip } = d;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      post(parent, u * 0.028, lip * 0.6, mat, sx * u * inset, sy * u * inset, 0, 14);
    }
  }
}

function structuralDetails(g: THREE.Group, d: Dims): void {
  const { sx, sy, sz, hx, hy, hz, u, lip } = d;
  const rail = std(0xcbd5e1, ALU);
  const steel = std(0x1e293b, { metalness: 0.8, roughness: 0.35 });

  // Machined frame: 12 edge rails, flush with the cube extents, proud by `lip`
  const w = u * 0.055;
  const ex = hx - w / 2 + lip;
  const ey = hy - w / 2 + lip;
  const ez = hz - w / 2 + lip;
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      const alongZ = new THREE.Mesh(new THREE.BoxGeometry(w, w, sz), rail);
      alongZ.position.set(a * ex, b * ey, 0);
      const alongX = new THREE.Mesh(new THREE.BoxGeometry(sx, w, w), rail);
      alongX.position.set(0, a * ey, b * ez);
      const alongY = new THREE.Mesh(new THREE.BoxGeometry(w, sy, w), rail);
      alongY.position.set(a * ex, 0, b * ez);
      g.add(alongZ, alongX, alongY);
    }
  }

  // Heat-sink fins on four faces, fastener bosses on the two remaining faces
  for (const face of ['+z', '-z', '+x', '-x'] as const) {
    const f = faceFrame(face, hx, hy, hz);
    finPanel(f, d, 7);
    g.add(f);
  }
  for (const face of ['+y', '-y'] as const) {
    const f = faceFrame(face, hx, hy, hz);
    plate(f, u * 0.62, u * 0.62, lip * 0.35, std(0x7c8aa0, { metalness: 0.85, roughness: 0.38 }));
    ring(f, u * 0.2, lip * 0.35, rail, lip * 0.3);
    boltPattern(f, d, 0.3, steel);
    g.add(f);
  }
}

function actuatedDetails(g: THREE.Group, d: Dims, axis: Axis): void {
  const { hx, hy, hz, u, lip } = d;
  const coil = std(0xb45309, { metalness: 0.65, roughness: 0.38 });
  const coilCore = std(0x451a03, { metalness: 0.3, roughness: 0.6 });
  const collar = std(0xfde68a, { metalness: 0.7, roughness: 0.28 });
  const housing = std(0x78350f, { metalness: 0.5, roughness: 0.45 });
  const hub = std(0xfef3c7, { metalness: 0.6, roughness: 0.3 });

  // 12 edge electromagnets (the ElectroVoxel pivots about its edges)
  const r = u * 0.045;
  const len = u * 0.58;
  const ox = hx - r + lip;
  const oy = hy - r + lip;
  const oz = hz - r + lip;
  const addCoil = (rot: THREE.Euler, px: number, py: number, pz: number) => {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), coil);
    body.rotation.copy(rot);
    body.position.set(px, py, pz);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, len * 1.06, 10), coilCore);
    core.rotation.copy(rot);
    core.position.set(px, py, pz);
    g.add(core, body);
  };
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      addCoil(new THREE.Euler(Math.PI / 2, 0, 0), a * ox, b * oy, 0); // along z
      addCoil(new THREE.Euler(0, 0, Math.PI / 2), 0, a * oy, b * oz); // along x
      addCoil(new THREE.Euler(0, 0, 0), a * ox, 0, b * oz); // along y
    }
  }

  // Visible pivot collar on both faces perpendicular to the hinge axis
  const faces: Record<Axis, readonly [Face, Face]> = {
    x: ['+x', '-x'],
    y: ['+y', '-y'],
    z: ['+z', '-z'],
  };
  for (const face of faces[axis]) {
    const f = faceFrame(face, hx, hy, hz);
    post(f, u * 0.34, lip * 0.45, housing, 0, 0, 0, 36);
    ring(f, u * 0.29, lip * 0.45, collar, lip * 0.1);
    post(f, u * 0.13, lip * 0.95, hub, 0, 0, 0, 24);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      post(f, u * 0.022, lip * 0.7, std(0x1c1917, { metalness: 0.7 }), Math.cos(a) * u * 0.2, Math.sin(a) * u * 0.2, 0, 10);
    }
    g.add(f);
  }
}

function computeDetails(g: THREE.Group, d: Dims): void {
  const { hx, hy, hz, u, lip } = d;
  const pcb = std(0x14122e, { roughness: 0.5 });
  const alu = std(0xc4b5fd, { metalness: 0.88, roughness: 0.28 });
  const ihs = std(0xe2e8f0, { metalness: 0.9, roughness: 0.22 });
  const die = std(0x0f172a, { metalness: 0.4, roughness: 0.35 });
  const gold = std(0xfbbf24, { metalness: 0.95, roughness: 0.25 });
  const slot = std(0x0b1020, { roughness: 0.7 });

  // Top: PCB pad, two heat-sink banks, and the chip package (IHS + die window)
  const top = faceFrame('+z', hx, hy, hz);
  plate(top, u * 0.8, u * 0.8, lip * 0.3, pcb);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      plate(top, u * 0.026, u * 0.58, lip * 0.7, alu, side * u * 0.3 + (i - 1.5) * u * 0.055, 0, lip * 0.3);
    }
  }
  plate(top, u * 0.27, u * 0.27, lip * 0.75, ihs, 0, 0, lip * 0.3);
  plate(top, u * 0.15, u * 0.15, lip * 0.2, die, 0, 0, lip * 1.05);
  g.add(top);

  // +X: vent slots; -X: gold edge-connector pads
  const vent = faceFrame('+x', hx, hy, hz);
  plate(vent, u * 0.62, u * 0.62, lip * 0.3, std(0x1e1b4b, { roughness: 0.5 }));
  for (let i = 0; i < 6; i++) {
    plate(vent, u * 0.5, u * 0.022, lip * 0.35, slot, 0, (i - 2.5) * u * 0.085, lip * 0.3);
  }
  g.add(vent);

  const pads = faceFrame('-x', hx, hy, hz);
  plate(pads, u * 0.62, u * 0.3, lip * 0.3, pcb);
  for (let i = 0; i < 8; i++) {
    plate(pads, u * 0.04, u * 0.18, lip * 0.5, gold, (i - 3.5) * u * 0.068, 0, lip * 0.3);
  }
  g.add(pads);
}

let screenTexture: THREE.CanvasTexture | null = null;

/** Tiny procedural "UI" so the panel reads as a lit display, not a flat colour. */
function getScreenTexture(): THREE.CanvasTexture {
  if (screenTexture) return screenTexture;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, '#0c4a6e');
    grad.addColorStop(1, '#172554');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(186,230,253,0.85)';
    ctx.fillRect(10, 10, 108, 8); // status bar
    ctx.fillStyle = 'rgba(56,189,248,0.55)';
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < 3; k++) ctx.fillRect(10 + k * 37, 30 + r * 40, 33, 34);
    }
    ctx.fillStyle = 'rgba(224,242,254,0.8)';
    ctx.fillRect(36, 112, 56, 6); // home indicator
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  screenTexture = tex;
  return tex;
}

function displayDetails(g: THREE.Group, d: Dims): void {
  const { hx, hy, hz, u, lip } = d;
  const bezelMat = std(0x020617, { roughness: 0.32, metalness: 0.5 });
  const trim = std(0x94a3b8, ALU);

  const f = faceFrame('+y', hx, hy, hz);
  // Bezel frame stands proud; the glass sits below it, so the screen reads as recessed
  const outer = u * 0.94;
  const bar = u * 0.06;
  const inner = outer - 2 * bar;
  plate(f, outer, bar, lip, bezelMat, 0, (outer - bar) / 2);
  plate(f, outer, bar, lip, bezelMat, 0, -(outer - bar) / 2);
  plate(f, bar, inner, lip, bezelMat, (outer - bar) / 2, 0);
  plate(f, bar, inner, lip, bezelMat, -(outer - bar) / 2, 0);
  plate(f, inner + 0.001, inner + 0.001, lip * 0.12, std(0x000000, { roughness: 0.4 }));

  const tex = getScreenTexture();
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(inner * 0.985, inner * 0.985),
    new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.75,
      roughness: 0.18,
      metalness: 0,
    })
  );
  glass.position.z = lip * 0.3;
  f.add(glass);

  // Front camera + status LED in the top bezel
  post(f, u * 0.013, lip * 0.4, std(0x0f172a, { roughness: 0.2, metalness: 0.7 }), -u * 0.04, (outer - bar) / 2, lip, 16);
  post(f, u * 0.008, lip * 0.3, std(0x16a34a, { emissive: 0x22c55e, emissiveIntensity: 1.2 }), u * 0.05, (outer - bar) / 2, lip, 12);
  g.add(f);

  // Brushed-metal edge trim on the two lateral faces
  for (const face of ['+x', '-x'] as const) {
    const side = faceFrame(face, hx, hy, hz);
    plate(side, u * 0.7, u * 0.1, lip * 0.5, trim);
    g.add(side);
  }
}

function powerDetails(g: THREE.Group, d: Dims): void {
  const { sx, sy, sz, hx, hy, hz, u, lip } = d;
  const strap = std(0x064e3b, { roughness: 0.55 });
  const tray = std(0x052e1f, { roughness: 0.6 });
  const cap = std(0x6ee7b7, { metalness: 0.85, roughness: 0.25 });
  const nub = std(0xd1fae5, { metalness: 0.9, roughness: 0.2 });
  const label = std(0xe2e8f0, { roughness: 0.6 });

  // Shrink-wrap straps
  for (const z of [-sz * 0.3, sz * 0.3]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(sx + 2 * lip, sy + 2 * lip, sz * 0.07), strap);
    band.position.set(0, 0, z);
    g.add(band);
  }

  // Top: 3×3 cell-pack end caps in a tray
  const top = faceFrame('+z', hx, hy, hz);
  plate(top, u * 0.8, u * 0.8, lip * 0.3, tray);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      post(top, u * 0.1, lip * 0.5, cap, i * u * 0.25, j * u * 0.25, lip * 0.3, 24);
      post(top, u * 0.035, lip * 0.2, nub, i * u * 0.25, j * u * 0.25, lip * 0.8, 14);
    }
  }
  g.add(top);

  // +X: label plate with 4-segment charge gauge
  const lab = faceFrame('+x', hx, hy, hz);
  plate(lab, u * 0.56, u * 0.34, lip * 0.4, label);
  for (let i = 0; i < 4; i++) {
    plate(
      lab,
      u * 0.075,
      u * 0.07,
      lip * 0.3,
      std(i < 3 ? 0x22c55e : 0x14532d, { emissive: i < 3 ? 0x22c55e : 0x000000, emissiveIntensity: 0.9 }),
      (i - 1.5) * u * 0.11,
      -u * 0.06,
      lip * 0.4
    );
  }
  plate(lab, u * 0.4, u * 0.03, lip * 0.3, std(0x0f172a), 0, u * 0.1, lip * 0.4);
  g.add(lab);

  // -X: heavy-gauge +/- terminals
  const term = faceFrame('-x', hx, hy, hz);
  plate(term, u * 0.5, u * 0.26, lip * 0.35, std(0x0f172a, { roughness: 0.6 }));
  post(term, u * 0.065, lip * 0.9, std(0xdc2626, { metalness: 0.5, roughness: 0.4 }), -u * 0.1, 0, lip * 0.3, 20);
  post(term, u * 0.065, lip * 0.9, std(0x1f2937, { metalness: 0.5, roughness: 0.4 }), u * 0.1, 0, lip * 0.3, 20);
  ring(term, u * 0.04, lip * 0.15, nub, lip * 0.9, -u * 0.1, 0);
  ring(term, u * 0.04, lip * 0.15, nub, lip * 0.9, u * 0.1, 0);
  g.add(term);
}

function ioDetails(g: THREE.Group, d: Dims): void {
  const { hx, hy, hz, u, lip } = d;
  const body = std(0xfecdd3, { roughness: 0.42 });
  const dark = std(0x1f2937, { roughness: 0.5, metalness: 0.4 });
  const stick = std(0xe5e7eb, { roughness: 0.4, metalness: 0.3 });
  const port = std(0x111827, { roughness: 0.55, metalness: 0.6 });
  const tongue = std(0x9ca3af, { metalness: 0.9, roughness: 0.25 });

  const top = faceFrame('+z', hx, hy, hz);
  plate(top, u * 0.84, u * 0.84, lip * 0.2, std(0x881337, { roughness: 0.55 })); // deck

  // Two thumbsticks (base ring → shaft → cap)
  for (const [x, y] of [
    [-0.2, 0.16],
    [0.2, -0.2],
  ] as const) {
    post(top, u * 0.095, lip * 0.35, dark, x * u, y * u, lip * 0.2, 28);
    post(top, u * 0.045, lip * 0.25, stick, x * u, y * u, lip * 0.55, 20);
    post(top, u * 0.062, lip * 0.2, stick, x * u, y * u, lip * 0.8, 24);
  }

  // D-pad
  plate(top, u * 0.2, u * 0.065, lip * 0.7, body, -0.2 * u, -0.2 * u, lip * 0.2);
  plate(top, u * 0.065, u * 0.2, lip * 0.7, body, -0.2 * u, -0.2 * u, lip * 0.2);

  // Four diamond-layout action buttons
  const colors = [0xef4444, 0xfacc15, 0x22c55e, 0x3b82f6];
  const offs = [
    [0.075, 0],
    [0, 0.075],
    [-0.075, 0],
    [0, -0.075],
  ] as const;
  offs.forEach(([ox, oy], i) => {
    post(top, u * 0.034, lip * 0.75, std(colors[i], { roughness: 0.4 }), 0.2 * u + ox * u, 0.16 * u + oy * u, lip * 0.2, 18);
  });
  g.add(top);

  // +X: USB-C receptacle + 3.5 mm jack
  const px = faceFrame('+x', hx, hy, hz);
  plate(px, u * 0.26, u * 0.09, lip * 0.5, port, -u * 0.12, 0);
  plate(px, u * 0.18, u * 0.02, lip * 0.2, tongue, -u * 0.12, 0, lip * 0.5);
  post(px, u * 0.04, lip * 0.6, port, u * 0.2, 0, 0, 20);
  ring(px, u * 0.04, lip * 0.12, tongue, lip * 0.5, u * 0.2, 0);
  g.add(px);

  // -X: second USB-C + status LED
  const nx = faceFrame('-x', hx, hy, hz);
  plate(nx, u * 0.26, u * 0.09, lip * 0.5, port, u * 0.05, 0);
  plate(nx, u * 0.18, u * 0.02, lip * 0.2, tongue, u * 0.05, 0, lip * 0.5);
  post(nx, u * 0.014, lip * 0.5, std(0x38bdf8, { emissive: 0x38bdf8, emissiveIntensity: 1.2 }), -u * 0.2, 0, 0, 12);
  g.add(nx);
}

/** Modular NVMe storage bay: finned aluminum thermal spreader, dual M.2 caddy latch & PCIe bus bar. */
function storageDetails(g: THREE.Group, { hx, hy, hz, u, lip }: Dims): void {
  const fin = std(0xcbd5e1, ALU);
  const caddy = std(0x0f172a, { roughness: 0.45, metalness: 0.3 });
  const latch = std(0x38bdf8, { roughness: 0.35, metalness: 0.5 });
  const ledCyan = std(0x22d3ee, { emissive: 0x22d3ee, emissiveIntensity: 1.4 });
  const ledGreen = std(0x34d399, { emissive: 0x34d399, emissiveIntensity: 1.1 });

  // +Z: machined aluminum NVMe heat-spreader ribs
  const top = faceFrame('+z', hx, hy, hz);
  plate(top, u * 0.84, u * 0.84, lip * 0.25, caddy);
  const ribs = 6;
  for (let i = 0; i < ribs; i++) {
    const y = -u * 0.32 + (i * u * 0.64) / (ribs - 1);
    plate(top, u * 0.76, u * 0.055, lip * 0.68, fin, 0, y, lip * 0.25);
  }
  g.add(top);

  // +Y: hot-swap NVMe sled bezel, release bar, and dual activity/ready LEDs
  const front = faceFrame('+y', hx, hy, hz);
  plate(front, u * 0.82, u * 0.52, lip * 0.3, caddy, 0, 0);
  plate(front, u * 0.68, u * 0.08, lip * 0.65, latch, 0, -u * 0.14, lip * 0.3);
  plate(front, u * 0.42, u * 0.04, lip * 0.5, fin, -u * 0.08, u * 0.12, lip * 0.3);
  post(front, u * 0.022, lip * 0.55, ledCyan, u * 0.24, u * 0.12, lip * 0.3, 14);
  post(front, u * 0.022, lip * 0.55, ledGreen, u * 0.32, u * 0.12, lip * 0.3, 14);
  g.add(front);

  // -Y: PCIe/USB4 high-speed backplane slot bar
  const back = faceFrame('-y', hx, hy, hz);
  plate(back, u * 0.54, u * 0.12, lip * 0.45, caddy);
  plate(back, u * 0.46, u * 0.035, lip * 0.25, std(0xf59e0b, { metalness: 0.9, roughness: 0.25 }), 0, 0, lip * 0.45);
  g.add(back);
}

/**
 * Builds the surface engineering details for one voxel (origin at the voxel centre).
 * `axis` is only used by actuated voxels (hinge axis of the pivot collar).
 */
export function buildVoxelDetails(
  category: VoxelCategory,
  sx: number,
  sy: number,
  sz: number,
  axis: Axis = 'y'
): THREE.Group {
  const g = new THREE.Group();
  const d = dimsOf(sx, sy, sz);
  switch (category) {
    case 'structural': structuralDetails(g, d); break;
    case 'actuated': actuatedDetails(g, d, axis); break;
    case 'compute': computeDetails(g, d); break;
    case 'display': displayDetails(g, d); break;
    case 'power': powerDetails(g, d); break;
    case 'io': ioDetails(g, d); break;
    case 'storage': storageDetails(g, d); break;
  }
  return g;
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
  const halfBridge = halfGap + u * 0.015;

  const pinMat = link.mechanical
    ? std(0xcbd5e1, { metalness: 0.92, roughness: 0.24 })
    : std(0x475569, { metalness: 0.4, roughness: 0.6, transparent: true, opacity: 0.5 });
  const collarMat = std(0x94a3b8, { metalness: 0.88, roughness: 0.3 });

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
    const geoA = new THREE.CylinderGeometry(r * 0.9, r, halfBridge, 12);
    geoA.rotateX(Math.PI / 2);
    geoA.translate(0, 0, halfBridge * 0.5);
    const mA = new THREE.Mesh(geoA, matA);
    mA.position.set(x, y, 0);
    sourcePins.add(mA);

    const geoB = new THREE.CylinderGeometry(r * 1.15, r * 1.15, halfBridge, 12);
    geoB.rotateX(Math.PI / 2);
    geoB.translate(0, 0, -halfBridge * 0.5);
    const mB = new THREE.Mesh(geoB, matB);
    mB.position.set(x, y, 0);
    targetPins.add(mB);
  };

  if (link.mechanical) {
    const s = u * 0.21;
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        addTelescopingPair(a * s, b * s, u * 0.025, pinMat, collarMat);
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
      emissiveIntensity: 0.9,
      metalness: 0.35,
      roughness: 0.3,
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
    addBusPin(-u * 0.085, 0, u * 0.022, BUS_COLORS.control.hex);
  }
  if (link.highSpeedPlane.connected) {
    addBusPin(u * 0.085, u * 0.04, u * 0.025, BUS_COLORS.highSpeed.hex);
    addBusPin(u * 0.085, -u * 0.04, u * 0.025, BUS_COLORS.highSpeed.hex);
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

  const jawOpenR = u * 0.49;
  const jawClosedR = u * 0.415;
  const cornerOpenPos = u * 0.495;
  const cornerClosedPos = u * 0.442;
  const coilOpenPos = u * 0.485;
  const coilClosedPos = u * 0.448;

  if (link.mechanical) {
    // Central rotating bayonet ring + 4 radial jaw dogs
    latchRingGroup = new THREE.Group();
    ringMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.14,
      metalness: 0.75,
      roughness: 0.28,
    });

    const tubeR = Math.min(Math.max(gap * 0.28, u * 0.009), u * 0.016);
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(u * 0.34, tubeR, 10, 40), ringMat);
    latchRingGroup.add(ringMesh);

    const jawDepth = Math.max(gap * 0.78, u * 0.026);
    const jawGeo = new THREE.BoxGeometry(u * 0.11, u * 0.054, jawDepth);
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

    // Outer-seam corner connector clamps & copper edge coils (unmistakably visible from outside)
    perimeterGroup = new THREE.Group();
    clampMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      emissive: 0x38bdf8,
      emissiveIntensity: 0,
      metalness: 0.9,
      roughness: 0.25,
    });
    coilMatCyan = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.1,
      metalness: 0.72,
      roughness: 0.3,
    });
    coilMatMagenta = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0xe879f9,
      emissiveIntensity: 0.1,
      metalness: 0.72,
      roughness: 0.3,
    });

    const clampSize = u * 0.11;
    const clampSpanZ = gap + u * 0.055; // visibly straddles both mating cube corners
    const clampGeo = new THREE.BoxGeometry(clampSize, clampSize, clampSpanZ);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const c = new THREE.Mesh(clampGeo, clampMat);
        c.position.set(sx * cornerClosedPos, sy * cornerClosedPos, 0);
        perimeterGroup.add(c);
        cornerClamps.push({ mesh: c, sx, sy });
      }
    }

    // Four copper-wound electromagnet edge bars bridging the 4 edges of the seam
    const coilLen = u * 0.44;
    const coilThick = Math.max(gap * 0.76, u * 0.036);
    const coilDepth = gap + u * 0.028;
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
        direction === 1 ? Math.sin(smoothstep(0.65, 1.0, e) * Math.PI) * 0.9 : 0;
      const intensity = smoothstep(0.45, 0.92, e) * 0.95 + contactPulse;
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
        ringMat.emissiveIntensity = 1.05 * releasePulse;
      } else if (direction === 1 && e < 0.995) {
        const catchFlash = Math.sin(smoothstep(0.58, 0.995, e) * Math.PI);
        _scratchCol
          .copy(COL_RING_OPEN)
          .lerp(COL_RING_ENGAGE, smoothstep(0.15, 0.65, e))
          .lerp(COL_CATCH_CYAN, catchFlash * 0.85);
        ringMat.color.copy(_scratchCol);
        ringMat.emissive.copy(COL_RING_ENGAGE).lerp(COL_CATCH_CYAN, catchFlash);
        ringMat.emissiveIntensity = 0.25 * pinT + 1.45 * catchFlash;
      } else {
        _scratchCol.copy(COL_RING_OPEN).lerp(COL_RING_ENGAGE, smoothstep(0.2, 0.85, e));
        ringMat.color.copy(_scratchCol);
        ringMat.emissive.copy(COL_RING_ENGAGE);
        ringMat.emissiveIntensity = e >= 0.98 ? 0.14 : 0.22 * pinT;
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
        // Release / Step Back / Move Away: warm amber-orange coil repulsion glow
        const pulse = Math.sin(smoothstep(0.05, 0.96, e) * Math.PI);
        _scratchCol.copy(COL_COPPER).lerp(COL_RELEASE_AMBER, pulse);
        coilMatCyan.color.copy(_scratchCol);
        coilMatMagenta.color.copy(_scratchCol);
        coilMatCyan.emissive.copy(COL_RELEASE_AMBER);
        coilMatMagenta.emissive.copy(COL_EMISSIVE_RELEASE);
        coilMatCyan.emissiveIntensity = 1.35 * pulse;
        coilMatMagenta.emissiveIntensity = 1.15 * pulse;

        clampMat.color.copy(COL_CLAMP_OPEN).lerp(COL_RELEASE_AMBER, 0.4 * pulse);
        clampMat.emissive.copy(COL_RELEASE_AMBER);
        clampMat.emissiveIntensity = 0.65 * pulse;
      } else if (direction === 1 && e < 0.995) {
        // Catch / Lock: signature dual-polarity cyan & magenta magnetic catch flare
        const catchFlare = Math.sin(smoothstep(0.55, 0.995, e) * Math.PI);
        _scratchCol.copy(COL_COPPER).lerp(COL_CATCH_CYAN, catchFlare * 0.85);
        _scratchColB.copy(COL_COPPER).lerp(COL_CATCH_MAGENTA, catchFlare * 0.85);
        coilMatCyan.color.copy(_scratchCol);
        coilMatMagenta.color.copy(_scratchColB);
        coilMatCyan.emissive.copy(COL_CATCH_CYAN);
        coilMatMagenta.emissive.copy(COL_CATCH_MAGENTA);
        coilMatCyan.emissiveIntensity = 0.12 + 1.8 * catchFlare;
        coilMatMagenta.emissiveIntensity = 0.12 + 1.8 * catchFlare;

        clampMat.color.copy(COL_CLAMP_OPEN).lerp(COL_CLAMP_IDLE, lockT);
        clampMat.emissive.copy(COL_CATCH_CYAN);
        clampMat.emissiveIntensity = 0.95 * catchFlare;
      } else {
        // Resting locked: clean machined steel corner clamps + warm copper edge coils
        coilMatCyan.color.copy(COL_COPPER);
        coilMatMagenta.color.copy(COL_COPPER);
        coilMatCyan.emissive.copy(COL_COPPER);
        coilMatMagenta.emissive.copy(COL_COPPER);
        coilMatCyan.emissiveIntensity = e >= 0.98 ? 0.1 : 0.05;
        coilMatMagenta.emissiveIntensity = e >= 0.98 ? 0.1 : 0.05;

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
 * Subtle glowing fulcrum rod rendered along the active shared hinge edge during
 * `pivot-hinge` docking so the articulated rotation axis reads immediately.
 */
export function buildHingeFulcrumGuide(axis: Axis, edgeLength: number, u: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: JOINT_COLOR,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  const len = edgeLength * 1.15;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(u * 0.018, u * 0.018, len, 10), mat);
  rod.renderOrder = 22;
  const capGeo = new THREE.SphereGeometry(u * 0.036, 10, 10);
  const capA = new THREE.Mesh(capGeo, mat);
  const capB = new THREE.Mesh(capGeo, mat);
  capA.position.y = len * 0.5;
  capB.position.y = -len * 0.5;
  capA.renderOrder = 22;
  capB.renderOrder = 22;

  const aligned = new THREE.Group();
  aligned.add(rod, capA, capB);
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

  // Place directional arrowhead cone along the second half of the arc toward target
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

  // 3/4 arc with an arrowhead, in the plane perpendicular to the axis
  const R = u * 0.4;
  const sweep = Math.PI * 1.5;
  const arc = new THREE.Mesh(new THREE.TorusGeometry(R, u * 0.011, 8, 40, sweep), mat);
  arc.rotation.x = Math.PI / 2; // torus normal → Y (the rod axis)
  arc.position.y = along / 2 + ext * 0.55;
  const tipAngle = sweep;
  const head = new THREE.Mesh(new THREE.ConeGeometry(u * 0.035, u * 0.09, 12), mat);
  // Torus is generated in XY; after rotation.x = π/2 a point at angle θ is (R cosθ, 0, R sinθ)
  head.position.set(Math.cos(tipAngle) * R, along / 2 + ext * 0.55, Math.sin(tipAngle) * R);
  // Cone points +Y by default; aim it along the arc tangent (-sin θ, 0, cos θ)
  head.quaternion.setFromUnitVectors(
    AXIS_VEC.y,
    new THREE.Vector3(-Math.sin(tipAngle), 0, Math.cos(tipAngle))
  );

  const pivot = new THREE.Group();
  pivot.add(rod, cone(1), cone(-1), arc, head);
  pivot.children.forEach((c) => {
    c.renderOrder = 20;
  });

  // Built along local Y; rotate onto the requested axis
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
      // Fat invisible hit target so the arrow is easy to grab
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
