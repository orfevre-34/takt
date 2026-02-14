import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { createTray } from './tray';
import { startScheduler, stopScheduler } from './scheduler';
import { openLoginWindow, fetchClaudeUsage, fetchCodexUsage } from './usage-fetcher';
import { clearLog, log, getLogPath } from './logger';
import { getDataDir } from './paths';

let mainWindow: BrowserWindow | null = null;
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null;
let isQuitting = false;

function getAppDataPath(): string {
  return getDataDir();
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

interface WindowBounds { x: number; y: number; width: number; height: number }

function loadWindowBounds(): WindowBounds | null {
  const filePath = path.join(getAppDataPath(), 'window-bounds.json');
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (typeof data.x === 'number' && typeof data.y === 'number') {
        return data as WindowBounds;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function saveWindowBounds(bounds: WindowBounds): void {
  const filePath = path.join(getAppDataPath(), 'window-bounds.json');
  fs.writeFileSync(filePath, JSON.stringify(bounds), 'utf-8');
}

function isVisibleOnAnyDisplay(bounds: WindowBounds): boolean {
  const displays = screen.getAllDisplays();
  return displays.some((d) => {
    const { x, y, width, height } = d.workArea;
    // ウィンドウの少なくとも一部(100px)が画面内に収まっているか
    return (
      bounds.x + bounds.width > x + 100 &&
      bounds.x < x + width - 100 &&
      bounds.y < y + height - 100 &&
      bounds.y + bounds.height > y + 100
    );
  });
}

function createWindow(): void {
  const savedSettings = loadSettings() as any;
  const alwaysOnTop = savedSettings?.alwaysOnTop ?? false;
  const savedBounds = loadWindowBounds();
  const useSaved = savedBounds && isVisibleOnAnyDisplay(savedBounds);

  mainWindow = new BrowserWindow({
    width: useSaved ? savedBounds!.width : 480,
    height: useSaved ? savedBounds!.height : 640,
    x: useSaved ? savedBounds!.x : undefined,
    y: useSaved ? savedBounds!.y : undefined,
    minWidth: 380,
    minHeight: 300,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    resizable: true,
    alwaysOnTop,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 'normal' レベルで最前面に保つ（'floating' だとシステムトレイより上になる）
  if (alwaysOnTop) {
    mainWindow.setAlwaysOnTop(true, 'normal');
  }

  // ウィンドウ位置・サイズ変更時に保存（デバウンス付き）
  const debounceSaveBounds = () => {
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
        saveWindowBounds(mainWindow.getBounds());
      }
    }, 500);
  };
  mainWindow.on('moved', debounceSaveBounds);
  mainWindow.on('resized', debounceSaveBounds);

  // 閉じるボタンではトレイに最小化（終了しない）
  mainWindow.on('close', (e) => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
      saveWindowBounds(mainWindow.getBounds());
    }
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
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
    mainWindow?.setAlwaysOnTop(value, 'normal');
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
  ipcMain.on('resize-to-content', (_event, width: unknown, height: unknown) => {
    if (!mainWindow || typeof height !== 'number') return;
    const newWidth = typeof width === 'number' ? Math.max(380, Math.ceil(width)) : (mainWindow.getSize()[0] ?? 480);
    mainWindow.setSize(newWidth, Math.max(300, Math.min(Math.ceil(height), 900)));
  });
  ipcMain.on('app-quit', () => app.quit());
  ipcMain.on('refresh-now', () => {
    mainWindow?.webContents.send('trigger-refresh');
  });
  ipcMain.on('open-external', (_event, url: string) => {
    shell.openExternal(url);
  });
  ipcMain.on('set-window-opacity', (_event, opacity: unknown) => {
    if (!mainWindow || typeof opacity !== 'number') return;
    mainWindow.setOpacity(Math.max(0, Math.min(1, opacity)));
  });
  ipcMain.on('save-window-bounds', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
      saveWindowBounds(mainWindow.getBounds());
    }
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

// トレイ常駐のため window-all-closed ではアプリを終了しない
app.on('window-all-closed', () => {
  // no-op: トレイに常駐し続ける
});

app.on('before-quit', () => {
  isQuitting = true;
  stopScheduler();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
