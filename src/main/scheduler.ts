import type { BrowserWindow } from 'electron';

let refreshInterval: ReturnType<typeof setInterval> | null = null;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

export function startScheduler(mainWindow: BrowserWindow, intervalMs: number = DEFAULT_INTERVAL_MS): void {
  stopScheduler();
  refreshInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('trigger-refresh');
    }
  }, intervalMs);
}

export function stopScheduler(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

export function restartScheduler(mainWindow: BrowserWindow, intervalMs: number): void {
  startScheduler(mainWindow, intervalMs);
}
