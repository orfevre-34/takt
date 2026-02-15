import type { StatusLevel } from '../types';

export const STATUS_COLORS = {
  normal: '#22c55e',   // green-500
  warning: '#f59e0b',  // amber-500
  danger: '#ef4444',   // red-500
} as const;

export function getStatusLevel(
  usedPercent: number,
  warningThreshold: number = 70,
  dangerThreshold: number = 90,
): StatusLevel {
  const clamped = Math.max(0, Math.min(100, usedPercent));
  if (clamped >= dangerThreshold) return 'danger';
  if (clamped >= warningThreshold) return 'warning';
  return 'normal';
}

export function getStatusColor(
  usedPercent: number,
  warningThreshold: number = 70,
  dangerThreshold: number = 90,
  customColors?: { normal?: string; warning?: string; danger?: string },
): string {
  const level = getStatusLevel(usedPercent, warningThreshold, dangerThreshold);
  const colors = { ...STATUS_COLORS, ...customColors };
  return colors[level];
}

// Heatmap 5-level colors (GitHub contributions style)
export const HEATMAP_COLORS = [
  '#161b22', // level 0: no activity
  '#0e4429', // level 1
  '#006d32', // level 2
  '#26a641', // level 3
  '#39d353', // level 4: high activity
] as const;

export function getHeatmapLevel(tokens: number, quartiles: number[]): number {
  if (tokens === 0) return 0;
  if (quartiles.length < 3) return tokens > 0 ? 4 : 0;
  if (tokens <= quartiles[0]!) return 1;
  if (tokens <= quartiles[1]!) return 2;
  if (tokens <= quartiles[2]!) return 3;
  return 4;
}

export function calculateQuartiles(values: number[]): number[] {
  const nonZero = values.filter(v => v > 0).sort((a, b) => a - b);
  if (nonZero.length === 0) return [];
  const q1 = nonZero[Math.floor(nonZero.length * 0.25)] ?? 0;
  const q2 = nonZero[Math.floor(nonZero.length * 0.5)] ?? 0;
  const q3 = nonZero[Math.floor(nonZero.length * 0.75)] ?? 0;
  return [q1, q2, q3];
}
