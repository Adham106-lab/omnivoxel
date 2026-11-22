import {
  FACE_DELTAS,
  parseDSL,
  type Coord3D,
  type Face,
  type VoxelCategory,
  type VoxelIR,
  type VoxelInstance,
  type VoxelRegistry,
} from '@omnivoxel/core';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrites `voxel <id> @ (x, y, z)` headers in-place so placement results
 * (snap-to-room / dock-to-furniture) are reflected in the editor while keeping
 * the user's comments, formatting and ordering intact.
 */
export function rewriteDslCoordinates(
  dsl: string,
  voxels: ReadonlyArray<Pick<VoxelInstance, 'id' | 'coord'>>
): string {
  let next = dsl;
  for (const v of voxels) {
    const pattern = new RegExp(`(voxel\\s+${escapeRegExp(v.id)}\\s+@\\s*)\\([^)]*\\)`);
    next = next.replace(pattern, `$1(${v.coord.x}, ${v.coord.y}, ${v.coord.z})`);
  }
  return next;
}

/** Moves a single voxel declaration to a new lattice cell, leaving the rest of the DSL untouched. */
export function moveVoxelInDsl(dsl: string, id: string, coord: Coord3D): string {
  return rewriteDslCoordinates(dsl, [{ id, coord }]);
}

/** True when no *other* voxel already occupies `coord`. */
export function isCellFree(ir: VoxelIR, id: string, coord: Coord3D): boolean {
  return !ir.voxels.some(
    (v) =>
      v.id !== id && v.coord.x === coord.x && v.coord.y === coord.y && v.coord.z === coord.z
  );
}

export type QuickInsertKey = 'gpu' | 'oled' | 'battery' | 'heatsink';

interface QuickInsertSpec {
  key: QuickInsertKey;
  label: string;
  title: string;
  manifestId: string;
  idBase: string;
  role: string;
  /** Faces of the anchor voxel to try first, in order. */
  preferredFaces: readonly Face[];
  /** Anchor voxel categories to prefer when searching for a free neighbour cell. */
  anchorCategories: readonly VoxelCategory[];
}

export const QUICK_INSERTS: readonly QuickInsertSpec[] = [
  {
    key: 'gpu',
    label: '+ GPU',
    title: 'Insert a GPU SoM compute voxel',
    manifestId: 'vox.compute.gpu-module',
    idBase: 'gpu',
    role: 'compute-node',
    preferredFaces: ['+x', '-x', '+z', '-z', '+y', '-y'],
    anchorCategories: ['structural', 'power', 'compute'],
  },
  {
    key: 'oled',
    label: '+ OLED',
    title: 'Insert a 6-inch OLED display voxel',
    manifestId: 'vox.display.oled-6in',
    idBase: 'oled',
    role: 'display',
    preferredFaces: ['+y', '-y', '+x', '-x', '+z', '-z'],
    anchorCategories: ['compute', 'structural'],
  },
  {
    key: 'battery',
    label: '+ Battery',
    title: 'Insert an isolated 100 W PD battery voxel',
    manifestId: 'vox.power.pd-100w',
    idBase: 'battery',
    role: 'power-supply',
    preferredFaces: ['-y', '+y', '-x', '+x', '-z', '+z'],
    anchorCategories: ['compute', 'structural'],
  },
  {
    key: 'heatsink',
    label: '+ Heatsink',
    title: 'Insert an aluminum structural heatsink voxel',
    manifestId: 'vox.struct.alu-150',
    idBase: 'heatsink',
    role: 'thermal-sink',
    preferredFaces: ['+z', '-z', '+x', '-x', '+y', '-y'],
    anchorCategories: ['compute', 'structural', 'power'],
  },
] as const;

const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

/**
 * Appends a new voxel declaration to the DSL, placing it in a free lattice cell
 * that is face-adjacent to an existing voxel (so it links into the assembly).
 */
export function insertQuickVoxel(
  dsl: string,
  key: QuickInsertKey,
  registry: VoxelRegistry
): string {
  const spec = QUICK_INSERTS.find((q) => q.key === key);
  if (!spec) return dsl;

  let coord = { x: 0, y: 0, z: 0 };
  const usedIds = new Set<string>();

  try {
    const ast = parseDSL(dsl);
    const occupied = new Set<string>();
    for (const node of ast.voxels) {
      occupied.add(cellKey(node.coord.x, node.coord.y, node.coord.z));
      usedIds.add(node.id);
    }

    if (ast.voxels.length > 0) {
      const rank = (type: string): number => {
        const category = registry.get(type)?.category;
        const idx = category ? spec.anchorCategories.indexOf(category) : -1;
        return idx === -1 ? spec.anchorCategories.length : idx;
      };
      // Stable sort: preferred anchor categories first, declaration order otherwise
      const anchors = ast.voxels
        .map((node, index) => ({ node, index, r: rank(node.voxelType) }))
        .sort((a, b) => a.r - b.r || a.index - b.index);

      let found = false;
      outer: for (const { node } of anchors) {
        for (const face of spec.preferredFaces) {
          const d = FACE_DELTAS[face];
          const x = node.coord.x + d.x;
          const y = node.coord.y + d.y;
          const z = node.coord.z + d.z;
          if (!occupied.has(cellKey(x, y, z))) {
            coord = { x, y, z };
            found = true;
            break outer;
          }
        }
      }
      if (!found) {
        const maxX = Math.max(...ast.voxels.map((n) => n.coord.x));
        coord = { x: maxX + 1, y: 0, z: 0 };
      }
    }
  } catch {
    // Unparseable source: fall back to counting declarations so cells stay distinct
    const declared = (dsl.match(/^\s*voxel\s+/gm) ?? []).length;
    coord = { x: declared, y: 0, z: 0 };
    for (const m of dsl.matchAll(/^\s*voxel\s+([A-Za-z_][\w]*)/gm)) usedIds.add(m[1]);
  }

  let id = spec.idBase;
  for (let n = 2; usedIds.has(id); n++) id = `${spec.idBase}_${n}`;

  const block = [
    `voxel ${id} @ (${coord.x}, ${coord.y}, ${coord.z}) {`,
    `  type: "${spec.manifestId}"`,
    `  role: "${spec.role}"`,
    `}`,
  ].join('\n');

  const base = dsl.replace(/\s+$/, '');
  return `${base}${base ? '\n\n' : ''}${block}\n`;
}
