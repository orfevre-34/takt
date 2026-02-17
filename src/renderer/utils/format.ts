export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

export function formatCost(costUSD: number): string {
  if (costUSD >= 0.01) return `$${costUSD.toFixed(2)}`;
  if (costUSD > 0) return `$${costUSD.toFixed(4)}`;
  return '$0.00';
}

export function formatTimeRemaining(resetAt: Date | string | null): string {
  if (!resetAt) return '--';
  const date = typeof resetAt === 'string' ? new Date(resetAt) : resetAt;
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  if (diff <= 0 || isNaN(diff)) return 'Now';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function getStartOfMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}${month}01`;
}

export function getTodayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeDateToISO(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return dateStr;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getStartOfWeekISO(): string {
  const now = new Date();
  const diff = now.getDate() - now.getDay();
  const start = new Date(now);
  start.setDate(diff);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const d = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
