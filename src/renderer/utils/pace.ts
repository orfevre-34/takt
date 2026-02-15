export function calcProjectedPercent(usedPercent: number, timeElapsedPercent: number): number | null {
  if (timeElapsedPercent < 2) return null;
  return usedPercent / (timeElapsedPercent / 100);
}

export function getPaceBadgeClasses(
  projected: number,
  warningThreshold: number = 70,
  dangerThreshold: number = 90,
): string {
  if (projected >= dangerThreshold) return 'bg-red-900/50 text-red-400';
  if (projected >= warningThreshold) return 'bg-amber-900/50 text-amber-400';
  return 'bg-green-900/50 text-green-400';
}
