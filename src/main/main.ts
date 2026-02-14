import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { createTray } from './tray';
import { startScheduler, stopScheduler } from './scheduler';
import { openLoginWindow, fetchClaudeUsage, fetchCodexUsage } from './usage-fetcher';
import { clearLog, log, getLogPath } from './logger';

let mainWindow: BrowserWindow | null = null;

function getAppDataPath(): string {
  return path.join(app.getPath('appData'), 'Takt');
}

function ensureAppDataDir(): void {
  const dir = getAppDataPath();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadSettings(): Record<string, unknown> {
  const settingsPath = path.join(getAppDataPath(), 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return {};
}

function saveSettings(settings: Record<string, unknown>): void {
  const settingsPath = path.join(getAppDataPath(), 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

function loadSnapshot(filename: string): unknown {
  const filePath = path.join(getAppDataPath(), filename);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return null;
}

function saveSnapshot(filename: string, data: unknown): void {
  const filePath = path.join(getAppDataPath(), filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    minWidth: 380,
    minHeight: 300,
    frame: false,
    transparent: false,
    resizable: true,
    backgroundColor: '#18181b',
    icon: path.join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIPC(): void {
  ipcMain.handle('get-settings', () => loadSettings());
  ipcMain.handle('save-settings', (_event, settings: Record<string, unknown>) => {
    saveSettings(settings);
  });
  ipcMain.handle('get-usage-snapshot', (_event, provider: string) => {
    const filename = provider === 'claude' ? 'usage_snapshot_claude.json' : 'usage_snapshot.json';
    return loadSnapshot(filename);
  });
  ipcMain.handle('save-usage-snapshot', (_event, snapshot: { provider: string }) => {
    const filename = snapshot.provider === 'claude' ? 'usage_snapshot_claude.json' : 'usage_snapshot.json';
    saveSnapshot(filename, snapshot);
  });
  ipcMain.handle('set-always-on-top', (_event, value: boolean) => {
    mainWindow?.setAlwaysOnTop(value);
  });
  ipcMain.handle('run-ccusage', async (_event, provider: string) => {
    const settings = loadSettings() as any;
    const npxPath = settings?.cliPaths?.npx || 'npx';
    const ccSettings = provider === 'claude' ? settings?.ccusage?.claude : settings?.ccusage?.codex;
    const additionalArgs = ccSettings?.additionalArgs || '';

    const baseCmd = provider === 'claude'
      ? `${npxPath} -y ccusage@latest daily`
      : `${npxPath} -y @ccusage/codex@latest daily`;

    const now = new Date();
    const startOfMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}01`;
    let cmd = `${baseCmd} -s ${startOfMonth} -j`;
    if (additionalArgs) cmd += ` ${additionalArgs}`;

    log('run-ccusage:', cmd);
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec(cmd, { timeout: 60000, env: { ...process.env } }, (error: any, stdout: string, stderr: string) => {
        if (error) {
          log('ccusage error:', error.message, stderr);
          resolve(null);
          return;
        }
        try {
          const data = JSON.parse(stdout);
          const filename = provider === 'claude' ? 'token_usage_claude.json' : 'token_usage_codex.json';
          saveSnapshot(filename, { provider, fetchedAt: new Date().toISOString(), raw: data });
          log('ccusage success:', provider, 'daily entries:', data.daily?.length ?? 0);
          resolve(data);
        } catch {
          log('ccusage parse error:', stdout.substring(0, 500));
          resolve(null);
        }
      });
    });
  });
  ipcMain.handle('open-login', async (_event, provider: string) => {
    const closed = await openLoginWindow(provider);
    if (!closed) return { ok: false, error: 'window_already_open' };
    // ログインウィンドウが閉じたら自動的にフェッチ
    try {
      const result = provider === 'claude'
        ? await fetchClaudeUsage()
        : await fetchCodexUsage();
      const r = result as any;
      if (r.ok && r.snapshot) {
        const filename = provider === 'claude' ? 'usage_snapshot_claude.json' : 'usage_snapshot.json';
        saveSnapshot(filename, r.snapshot);
        mainWindow?.webContents.send('usage-updated', r.snapshot);
        return { ok: true, snapshot: r.snapshot };
      }
      return r;
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('fetch-usage', async (_event, provider: string) => {
    try {
      const result = provider === 'claude'
        ? await fetchClaudeUsage()
        : await fetchCodexUsage();
      const r = result as any;
      if (r.ok && r.snapshot) {
        const filename = provider === 'claude' ? 'usage_snapshot_claude.json' : 'usage_snapshot.json';
        saveSnapshot(filename, r.snapshot);
        mainWindow?.webContents.send('usage-updated', r.snapshot);
        return r.snapshot;
      }
      return r;
    } catch (err: any) {
      return { ok: false, error: err.message || String(err) };
    }
  });
  ipcMain.on('resize-to-content', (_event, height: unknown) => {
    if (!mainWindow || typeof height !== 'number') return;
    const width = mainWindow.getSize()[0] ?? 480;
    mainWindow.setSize(width, Math.max(300, Math.min(Math.ceil(height), 900)));
  });
  ipcMain.on('app-quit', () => app.quit());
  ipcMain.on('refresh-now', () => {
    mainWindow?.webContents.send('trigger-refresh');
  });
  ipcMain.on('open-external', (_event, url: string) => {
    shell.openExternal(url);
  });
}

app.whenReady().then(() => {
  ensureAppDataDir();
  clearLog();
  log('Takt started. Log file:', getLogPath());
  setupIPC();
  createWindow();
  createTray(mainWindow!);
  startScheduler(mainWindow!);
});

app.on('window-all-closed', () => {
  stopScheduler();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
