let refreshInterval: ReturnType<typeof setInterval> | null = null;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

export function startScheduler(broadcast: (channel: string, ...args: unknown[]) => void, intervalMs: number = DEFAULT_INTERVAL_MS): void {
  stopScheduler();
  refreshInterval = setInterval(() => {
    broadcast('trigger-refresh');
  }, intervalMs);
}

export function stopScheduler(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}
