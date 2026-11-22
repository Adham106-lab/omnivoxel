import * as THREE from 'three';
import type { DockSpec } from './assembly';

const MM = 0.001;

function labelTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(15,23,42,0.92)';
    ctx.fillRect(0, 0, 512, 96);
    ctx.strokeStyle = 'rgba(56,189,248,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, 506, 90);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 34px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 50);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Architectural storage / dock box: floor plate with engraved slot outlines, four
 * translucent walls, aluminium corner posts and rim, open on top so voxels lift out.
 * Origin is the world origin; geometry is placed in scene units (metres).
 */
export function buildDockModel(dock: DockSpec, voxelCount: number): THREE.Group {
  const root = new THREE.Group();

  const min = new THREE.Vector3(dock.minMm.x, dock.minMm.y, dock.minMm.z).multiplyScalar(MM);
  const max = new THREE.Vector3(dock.maxMm.x, dock.maxMm.y, dock.maxMm.z).multiplyScalar(MM);
  const size = new THREE.Vector3().subVectors(max, min);
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
  const wall = dock.wallThicknessMm * MM;
  const floorT = dock.floorThicknessMm * MM;
  const floorZ = dock.floorZMm * MM;
  const wallH = dock.wallHeightMm * MM;

  const alu = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.3 });
  const slate = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.09,
    roughness: 0.2,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Floor plate
  const floor = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, floorT), slate);
  floor.position.set(center.x, center.y, floorZ - floorT / 2);
  root.add(floor);

  // Engraved slot outlines (one per voxel, plus the numbering order via brightness)
  const slotSize = dock.slotPitchMm * MM * 0.9;
  const slotGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(slotSize, slotSize));
  for (let i = 0; i < Math.max(1, voxelCount); i++) {
    const s = dock.slots[i];
    if (!s) continue;
    const outline = new THREE.LineSegments(
      slotGeo,
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 })
    );
    outline.position.set(s.x * MM, s.y * MM, floorZ + 0.0006);
    root.add(outline);
  }

  // Walls (translucent) with solid rim bars
  const wallMid = floorZ + wallH / 2;
  const mkWall = (w: number, h: number, d: number, x: number, y: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), glass);
    m.position.set(x, y, wallMid);
    root.add(m);
  };
  mkWall(size.x, wallH, wall, center.x, min.y + wall / 2); // -Y
  mkWall(size.x, wallH, wall, center.x, max.y - wall / 2); // +Y
  mkWall(wall, wallH, size.y, min.x + wall / 2, center.y); // -X
  mkWall(wall, wallH, size.y, max.x - wall / 2, center.y); // +X

  // Corner posts
  for (const x of [min.x + wall / 2, max.x - wall / 2]) {
    for (const y of [min.y + wall / 2, max.y - wall / 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(wall * 1.5, wall * 1.5, wallH + floorT), alu);
      post.position.set(x, y, floorZ + (wallH - floorT) / 2);
      root.add(post);
    }
  }

  // Top rim
  const rimZ = floorZ + wallH - wall * 0.35;
  const rimT = wall * 0.7;
  const rim = (w: number, d: number, x: number, y: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, rimT), alu);
    m.position.set(x, y, rimZ);
    root.add(m);
  };
  rim(size.x, wall * 1.2, center.x, min.y + wall * 0.6);
  rim(size.x, wall * 1.2, center.x, max.y - wall * 0.6);
  rim(wall * 1.2, size.y, min.x + wall * 0.6, center.y);
  rim(wall * 1.2, size.y, max.x - wall * 0.6, center.y);

  // Crisp outline of the full envelope
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
    new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.4 })
  );
  outline.position.copy(center);
  root.add(outline);

  // Name plate on the -Y face (the face the default camera sees)
  const labelW = Math.min(size.x * 0.8, 0.34);
  const labelH = labelW * (96 / 512);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(labelW, labelH),
    new THREE.MeshBasicMaterial({ map: labelTexture('ASSEMBLY CONTAINER'), transparent: true })
  );
  label.rotation.x = Math.PI / 2; // normal → -Y
  label.position.set(center.x, min.y - 0.0008, floorZ + wallH * 0.38);
  root.add(label);

  return root;
}
