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
 * Architectural storage / dock box + machined Launch Rail / Docking Bridge:
 *  - Floor plate with engraved slot outlines + open +X exit portal gate,
 *  - Three full translucent walls (-Y, +Y, -X) and a split +X wall framing the
 *    exit portal aligned directly to the lattice entry point,
 *  - Continuous machined aluminum Launch Rail / Docking Bridge spanning from
 *    `dock.rail.dockExitMm` to `dock.rail.latticeEntryMm` with dual guide tracks,
 *    structural cross-ties, low side guard rails, and cyan alignment strips.
 *
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

  const alu = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.28 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.72, roughness: 0.42 });
  const slate = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.55 });
  const cyanStrip = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.9,
    metalness: 0.2,
    roughness: 0.3,
  });
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

  // Engraved slot outlines (one per voxel)
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

  // Walls (translucent) — +X wall leaves a crisp open exit gate aligned with the Launch Rail
  const wallMid = floorZ + wallH / 2;
  const mkWall = (w: number, h: number, d: number, x: number, y: number) => {
    if (w <= 0.001 || d <= 0.001 || h <= 0.001) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), glass);
    m.position.set(x, y, wallMid);
    root.add(m);
  };
  mkWall(size.x, wallH, wall, center.x, min.y + wall / 2); // -Y
  mkWall(size.x, wallH, wall, center.x, max.y - wall / 2); // +Y
  mkWall(wall, wallH, size.y, min.x + wall / 2, center.y); // -X

  const gateYMin = Math.max(min.y + wall, dock.rail.gateYMinMm * MM);
  const gateYMax = Math.min(max.y - wall, dock.rail.gateYMaxMm * MM);
  const southSpan = gateYMin - min.y;
  const northSpan = max.y - gateYMax;
  if (southSpan > 0.004) {
    mkWall(wall, wallH, southSpan, max.x - wall / 2, min.y + southSpan / 2);
  }
  if (northSpan > 0.004) {
    mkWall(wall, wallH, northSpan, max.x - wall / 2, gateYMax + northSpan / 2);
  }

  // Exit portal frame posts + overhead lintel bar on the +X wall
  const postSize = wall * 1.45;
  for (const gy of [gateYMin, gateYMax]) {
    const gatePost = new THREE.Mesh(
      new THREE.BoxGeometry(postSize, postSize, wallH + floorT),
      alu
    );
    gatePost.position.set(max.x - wall / 2, gy, floorZ + (wallH - floorT) / 2);
    root.add(gatePost);

    const indicator = new THREE.Mesh(
      new THREE.BoxGeometry(postSize * 0.45, postSize * 0.45, wallH * 0.72),
      cyanStrip
    );
    indicator.position.set(max.x + postSize * 0.15, gy, floorZ + wallH * 0.48);
    root.add(indicator);
  }

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

  // Crisp outline of the container envelope
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
    new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.36 })
  );
  outline.position.copy(center);
  root.add(outline);

  // -------------------------------------------------------------------------
  // Machined Launch Rail / Docking Bridge (container +X gate → lattice entry)
  // -------------------------------------------------------------------------
  const railStartX = dock.rail.dockExitMm.x * MM;
  const railEndX = dock.rail.latticeEntryMm.x * MM;
  const railSpan = railEndX - railStartX;
  const railY = dock.rail.dockExitMm.y * MM;
  const railW = dock.rail.widthMm * MM;

  if (railSpan > 0.005) {
    const railMidX = (railStartX + railEndX) * 0.5;
    const deckT = floorT * 0.78;
    const deckZ = floorZ - deckT * 0.5;

    // 1. Central dark anodized structural bridge deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(railSpan, railW * 0.86, deckT), slate);
    deck.position.set(railMidX, railY, deckZ);
    root.add(deck);

    // 2. Dual precision machined aluminum guide rails + raised side bumper curbs
    const trackW = Math.max(0.01, railW * 0.1);
    const trackH = deckT * 1.25;
    const curbH = Math.max(0.008, wallH * 0.085);
    const halfTrackY = railW * 0.43;

    for (const side of [-1, 1] as const) {
      const ty = railY + side * halfTrackY;
      const track = new THREE.Mesh(new THREE.BoxGeometry(railSpan, trackW, trackH), alu);
      track.position.set(railMidX, ty, floorZ - deckT * 0.4);
      root.add(track);

      // Low-profile side guide bumper (keeps exiting modules centered without blocking lateral pivots)
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(railSpan, trackW * 0.42, curbH),
        darkMetal
      );
      curb.position.set(railMidX, ty + side * (trackW * 0.34), floorZ + curbH * 0.45);
      root.add(curb);

      // Subtle glowing cyan alignment strip embedded along each rail
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(railSpan * 0.94, trackW * 0.24, 0.0018),
        cyanStrip
      );
      glow.position.set(railMidX, ty - side * (trackW * 0.22), floorZ + 0.0009);
      root.add(glow);
    }

    // 3. Machined transverse cross-ties & guide chevrons along the bridge deck
    const tieCount = Math.max(3, Math.round(railSpan / (railW * 0.28)));
    for (let i = 0; i < tieCount; i++) {
      const frac = (i + 0.5) / tieCount;
      const tx = railStartX + frac * railSpan;
      const tie = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.006, railSpan * 0.045), railW * 0.72, 0.0022),
        darkMetal
      );
      tie.position.set(tx, railY, floorZ + 0.0005);
      root.add(tie);

      // Center guide tick pointing toward the lattice (+X)
      const tick = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.004, railSpan * 0.03), railW * 0.14, 0.0024),
        cyanStrip
      );
      tick.position.set(tx, railY, floorZ + 0.0009);
      root.add(tick);
    }

    // 4. Lattice docking interface flange right at `latticeEntryMm.x`
    const flange = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.008, wall * 1.1), railW * 1.04, deckT * 1.35),
      alu
    );
    flange.position.set(railEndX - Math.max(0.004, wall * 0.55), railY, floorZ - deckT * 0.32);
    root.add(flange);

    // 5. Internal floor guide stripes extending into the container to meet the Launch Rail
    const innerGuideLen = Math.min(size.x * 0.75, dock.slotPitchMm * MM * 1.2);
    for (const side of [-1, 1] as const) {
      const innerStrip = new THREE.Mesh(
        new THREE.BoxGeometry(innerGuideLen, trackW * 0.22, 0.0014),
        cyanStrip
      );
      innerStrip.position.set(
        max.x - wall - innerGuideLen * 0.5,
        railY + side * (railW * 0.36),
        floorZ + 0.0008
      );
      root.add(innerStrip);
    }
  }

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
