import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { createTray, rebuildTrayMenu } from './tray';
import { startScheduler, stopScheduler } from './scheduler';
import { openLoginWindow, fetchClaudeUsage, fetchCodexUsage } from './usage-fetcher';
import { clearLog, log, getLogPath } from './logger';
import { getDataDir } from './paths';
import {
  initWindowAttach,
  startAutoAttach,
  setTargetProcess,
  clearTargetProcess,
  detach as detachWindow,
  reattach as reattachWindow,
  setAnchor,
  setUserOffset,
  getUserOffset,
  setMiniWidth,
  isMiniWidthResizeSuppressed,
  getAttachState,
  isWindowAttached,
  cleanupWindowAttach,
  computeAttachedBounds,
  isAllowedResizeEdge,
  beginUserResize,
  endUserResize,
  resetLayout,
  type AnchorPosition,
} from './window-attach';

function parseCliArgs(str: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuote = false;
  for (const ch of str) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (/\s/.test(ch) && !inQuote) {
      if (current) args.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

let mainWindow: BrowserWindow | null = null;
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null;
let isQuitting = false;

function ensureAppDataDir(): void {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadSettings(): Record<string, unknown> {
  const settingsPath = path.join(getDataDir(), 'settings.json');
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
  const settingsPath = path.join(getDataDir(), 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

function loadSnapshot(filename: string): unknown {
  const filePath = path.join(getDataDir(), filename);
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
  const filePath = path.join(getDataDir(), filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

interface WindowBounds { x: number; y: number; width: number; height: number }

function loadWindowBounds(): WindowBounds | null {
  const filePath = path.join(getDataDir(), 'window-bounds.json');
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
  const filePath = path.join(getDataDir(), 'window-bounds.json');
  fs.writeFileSync(filePath, JSON.stringify(bounds), 'utf-8');
}

function saveMiniSizeToSettings(width: number, height: number): void {
  const current = loadSettings();
  const currentWindowAttach = (current.windowAttach && typeof current.windowAttach === 'object')
    ? current.windowAttach as Record<string, unknown>
    : {};
  const patch: Record<string, unknown> = {};
  if (Number.isFinite(height) && height > 0) patch.miniHeight = Math.ceil(height);
  if (Number.isFinite(width) && width > 0) patch.miniWidth = Math.ceil(width);
  if (Object.keys(patch).length === 0) return;
  saveSettings({
    ...current,
    windowAttach: {
      ...currentWindowAttach,
      ...patch,
    },
  });
}

function mergeSettings(current: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const currentWindowAttach = (current.windowAttach && typeof current.windowAttach === 'object')
    ? current.windowAttach as Record<string, unknown>
    : {};
  const incomingWindowAttach = (incoming.windowAttach && typeof incoming.windowAttach === 'object')
    ? incoming.windowAttach as Record<string, unknown>
    : {};

  return {
    ...current,
    ...incoming,
    windowAttach: {
      ...currentWindowAttach,
      ...incomingWindowAttach,
      miniHeight: currentWindowAttach.miniHeight ?? incomingWindowAttach.miniHeight,
      miniWidth: currentWindowAttach.miniWidth ?? incomingWindowAttach.miniWidth,
    },
  };
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
    minHeight: 150,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: true,
    resizable: true,
    alwaysOnTop,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.join(__dirname, '../../build/icon.ico'),
    useContentSize: true,
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

  let isCtrlPressed = false;
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Control') {
      isCtrlPressed = input.type === 'keyDown';
      return;
    }
    isCtrlPressed = !!input.control;
  });
  mainWindow.on('blur', () => {
    isCtrlPressed = false;
  });
  mainWindow.on('will-resize', (event, _newBounds, details) => {
    if (!isWindowAttached()) return;
    if (!isCtrlPressed) {
      event.preventDefault();
      return;
    }
    if (!isAllowedResizeEdge((details as any).edge)) {
      event.preventDefault();
      return;
    }
    beginUserResize();
  });

  let saveMiniTimer: ReturnType<typeof setTimeout> | undefined;
  const debounceSaveMiniSize = () => {
    clearTimeout(saveMiniTimer);
    saveMiniTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const cs = mainWindow.getContentSize();
      saveMiniSizeToSettings(cs[0] ?? 0, cs[1] ?? 0);
    }, 350);
  };

  let lastSentH = 0;
  mainWindow.on('resize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const h = mainWindow.getContentSize()[1] ?? 0;
    if (isWindowAttached()) {
      debounceSaveMiniSize();
    }
    if (isMiniWidthResizeSuppressed()) return;
    if (h !== lastSentH) {
      lastSentH = h;
      mainWindow.webContents.send('content-resized', 0, h);
    }
  });

  // ウィンドウ位置・サイズ変更時に保存（デバウンス付き）
  const debounceSaveBounds = () => {
    if (isWindowAttached()) return;
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
        saveWindowBounds(mainWindow.getBounds());
      }
    }, 500);
  };
  mainWindow.on('moved', debounceSaveBounds);
  mainWindow.on('resized', () => {
    debounceSaveBounds();
    endUserResize();
  });

  // 閉じるボタンではトレイに最小化（終了しない）
  mainWindow.on('close', (e) => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
      if (isWindowAttached()) {
        const cs = mainWindow.getContentSize();
        saveMiniSizeToSettings(cs[0] ?? 0, cs[1] ?? 0);
      } else {
        saveWindowBounds(mainWindow.getBounds());
      }
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
    const merged = mergeSettings(loadSettings(), settings);
    saveSettings(merged);
    // Windows起動時の自動起動を設定
    app.setLoginItemSettings({ openAtLogin: !!merged.launchAtLogin });
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
    rebuildTrayMenu();
  });
  ipcMain.handle('run-ccusage', async (_event, provider: string) => {
    const settings = loadSettings() as any;
    const npxPath = settings?.cliPaths?.npx || 'npx';
    const ccSettings = provider === 'claude' ? settings?.ccusage?.claude : settings?.ccusage?.codex;
    const additionalArgs: string = ccSettings?.additionalArgs || '';

    const pkg = provider === 'claude' ? 'ccusage@latest' : '@ccusage/codex@latest';
    const now = new Date();
    const startOfMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}01`;

    const args = ['-y', pkg, 'daily', '-s', startOfMonth, '-j'];
    if (additionalArgs) {
      args.push(...parseCliArgs(additionalArgs));
    }

    log('run-ccusage:', npxPath, args.join(' '));
    const { execFile } = require('child_process');
    return new Promise((resolve) => {
      execFile(npxPath, args, { timeout: 60000, shell: process.platform === 'win32', env: { ...process.env } }, (error: any, stdout: string, stderr: string) => {
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
  ipcMain.on('resize-to-content', (_event, width: unknown, height: unknown, lockHeight: unknown) => {
    if (!mainWindow || typeof height !== 'number') return;
    if (isWindowAttached()) return;
    const newWidth = typeof width === 'number' ? Math.max(380, Math.ceil(width)) : (mainWindow.getSize()[0] ?? 480);
    const newHeight = Math.max(150, Math.min(Math.ceil(height), 900));
    mainWindow.setContentSize(newWidth, newHeight);
    if (lockHeight) {
      mainWindow.setMinimumSize(mainWindow.getMinimumSize()[0] ?? 380, newHeight);
      mainWindow.setMaximumSize(10000, newHeight);
    } else {
      mainWindow.setMinimumSize(380, 150);
      mainWindow.setMaximumSize(10000, 10000);
    }
  });
  ipcMain.on('app-quit', () => app.quit());
  ipcMain.on('refresh-now', () => {
    mainWindow?.webContents.send('trigger-refresh');
  });
  ipcMain.on('open-external', (_event, url: string) => {
    try {
      const parsed = new URL(typeof url === 'string' ? url : '');
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(parsed.href);
      }
    } catch { /* invalid URL, ignore */ }
  });
  ipcMain.on('set-window-opacity', (_event, opacity: unknown) => {
    if (!mainWindow || typeof opacity !== 'number') return;
    mainWindow.setOpacity(Math.max(0, Math.min(1, opacity)));
  });
  ipcMain.on('set-mini-width', (_event, width: number) => {
    setMiniWidth(width);
  });
  ipcMain.on('save-window-bounds', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
      saveWindowBounds(mainWindow.getBounds());
    }
  });

  ipcMain.handle('select-executable', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      title: 'Select target application',
      filters: [{ name: 'Executable', extensions: ['exe'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0]!;
    const base = filePath.replace(/\\/g, '/').split('/').pop() || '';
    const processName = base.replace(/\.exe$/i, '').toLowerCase();
    return { processName, path: filePath };
  });
  ipcMain.handle('set-attach-target', (_event, processName: string, anchor: string) => {
    setTargetProcess(processName, anchor as AnchorPosition);
  });
  ipcMain.handle('clear-attach-target', () => clearTargetProcess());
  ipcMain.handle('detach-window', () => detachWindow());
  ipcMain.handle('set-attach-anchor', (_event, anchor: string) => {
    setAnchor(anchor as AnchorPosition);
  });
  ipcMain.handle('reattach-window', () => reattachWindow());
  ipcMain.handle('set-attach-offset', (_event, ox: number, oy: number) => setUserOffset(ox, oy));
  ipcMain.handle('get-attach-offset', () => getUserOffset());
  ipcMain.handle('get-attach-state', () => getAttachState());
  ipcMain.handle('reset-attach-layout', () => {
    resetLayout();
    saveMiniSizeToSettings(200, 40);
  });
}

app.whenReady().then(() => {
  ensureAppDataDir();
  clearLog();
  log('Takt started. Log file:', getLogPath());
  setupIPC();
  createWindow();
  initWindowAttach(mainWindow!, () => rebuildTrayMenu());
  // 設定からウィンドウアタッチを復元
  const savedSettings = loadSettings() as any;
  const wa = savedSettings?.windowAttach;
  if (wa?.enabled && wa?.targetProcessName) {
    if (typeof wa.offsetX === 'number' || typeof wa.offsetY === 'number') {
      setUserOffset(wa.offsetX || 0, wa.offsetY || 0);
    }
    startAutoAttach(wa.targetProcessName, wa.anchor || 'top-right', wa.miniHeight, wa.miniWidth);
  }
  createTray(mainWindow!);
  startScheduler(mainWindow!);
});

// トレイ常駐のため window-all-closed ではアプリを終了しない
app.on('window-all-closed', () => {
  // no-op: トレイに常駐し続ける
});

app.on('before-quit', () => {
  isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed() && isWindowAttached()) {
    const cs = mainWindow.getContentSize();
    saveMiniSizeToSettings(cs[0] ?? 0, cs[1] ?? 0);
  }
  cleanupWindowAttach();
  stopScheduler();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
