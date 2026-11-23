import type { ObstacleType, VoxelCategory } from '@omnivoxel/core';

export interface CategoryStyle {
  label: string;
  /** Three.js hex color */
  hex: number;
  /** CSS color for legends / chips */
  css: string;
  metalness: number;
  roughness: number;
}

export const CATEGORY_STYLE: Record<VoxelCategory, CategoryStyle> = {
  structural: { label: 'Aluminum frame', hex: 0x94a3b8, css: '#94a3b8', metalness: 0.85, roughness: 0.32 },
  actuated: { label: 'Actuator pivot', hex: 0xf59e0b, css: '#f59e0b', metalness: 0.35, roughness: 0.45 },
  compute: { label: 'ARM / GPU', hex: 0x8b5cf6, css: '#8b5cf6', metalness: 0.3, roughness: 0.4 },
  display: { label: 'Display', hex: 0x1e293b, css: '#38bdf8', metalness: 0.2, roughness: 0.5 },
  power: { label: 'Battery', hex: 0x10b981, css: '#10b981', metalness: 0.25, roughness: 0.5 },
  io: { label: 'Controller', hex: 0xfb7185, css: '#fb7185', metalness: 0.2, roughness: 0.55 },
  storage: { label: 'NVMe storage', hex: 0x06b6d4, css: '#06b6d4', metalness: 0.4, roughness: 0.38 },
};

export const CATEGORY_ORDER: readonly VoxelCategory[] = [
  'structural',
  'actuated',
  'compute',
  'display',
  'power',
  'io',
  'storage',
] as const;

export const OBSTACLE_DEFAULT_COLOR: Record<ObstacleType, string> = {
  wall: '#334155',
  furniture: '#475569',
  appliance: '#6b7280',
};

/** Bus-mode link colors (Three.js hex + CSS). */
export const BUS_COLORS = {
  control: { hex: 0x22d3ee, css: '#22d3ee' },
  highSpeed: { hex: 0xe879f9, css: '#e879f9' },
  none: { hex: 0x475569, css: '#475569' },
} as const;
