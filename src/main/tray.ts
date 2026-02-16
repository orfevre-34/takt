import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import path from 'path';
import { getAttachState, detach as detachWindow } from './window-attach';

let tray: Tray | null = null;
let mainWindowRef: BrowserWindow | null = null;
let getAttachWindowRef: (() => BrowserWindow | null) | null = null;

function getIconPath(filename: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, filename);
  }
  return path.join(__dirname, '../../build', filename);
}

function isWindowAlive(win: BrowserWindow): boolean {
  return !win.isDestroyed() && !win.webContents.isDestroyed();
}

function showAndSend(win: BrowserWindow, channel: string, ...args: unknown[]): void {
  if (!isWindowAlive(win)) return;
  win.show();
  win.focus();
  win.webContents.send(channel, ...args);
}

function buildContextMenu(): Menu {
  const mainWindow = mainWindowRef!;
  return Menu.buildFromTemplate([
    {
      label: 'Show/Hide',
      click: () => {
        if (!isWindowAlive(mainWindow)) return;
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Refresh Now',
      click: () => {
        if (isWindowAlive(mainWindow)) {
          mainWindow.webContents.send('trigger-refresh');
        }
        const attachWin = getAttachWindowRef?.();
        if (attachWin && isWindowAlive(attachWin)) {
          attachWin.webContents.send('trigger-refresh');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: isWindowAlive(mainWindow) && mainWindow.isAlwaysOnTop(),
      click: (menuItem) => {
        if (!isWindowAlive(mainWindow)) return;
        mainWindow.setAlwaysOnTop(menuItem.checked, 'normal');
        mainWindow.webContents.send('always-on-top-changed', menuItem.checked);
      },
    },
    { type: 'separator' },
    (() => {
      const state = getAttachState();
      if (state.attached) {
        return {
          label: `Detach from ${state.target?.title ?? 'window'}`,
          click: () => detachWindow(),
        };
      }
      return {
        label: 'Attach to Window...',
        click: () => showAndSend(mainWindow, 'open-settings'),
      };
    })(),
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => showAndSend(mainWindow, 'open-settings'),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tray?.destroy();
        app.quit();
      },
    },
  ]);
}

export function createTray(mainWindow: BrowserWindow, getAttachWindow?: () => BrowserWindow | null): void {
  mainWindowRef = mainWindow;
  getAttachWindowRef = getAttachWindow ?? null;
  const iconPath = getIconPath('icon.ico');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createFromBuffer(createDefaultIcon()) : icon);
  tray.setToolTip('Takt - Usage Monitor');

  tray.setContextMenu(buildContextMenu());
  tray.on('click', () => {
    if (!isWindowAlive(mainWindow)) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/** UIから設定変更時にトレイメニューを再構築 */
export function rebuildTrayMenu(): void {
  if (tray && mainWindowRef && isWindowAlive(mainWindowRef)) {
    tray.setContextMenu(buildContextMenu());
  }
}

function createDefaultIcon(): Buffer {
  // 16x16 RGBA のシンプルなアイコン
  const size = 16;
  const channels = 4;
  const buf = Buffer.alloc(size * size * channels);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * channels;
      const cx = size / 2 - 0.5;
      const cy = size / 2 - 0.5;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist < size / 2 - 1) {
        buf[idx] = 34;     // R
        buf[idx + 1] = 197; // G
        buf[idx + 2] = 94;  // B
        buf[idx + 3] = 255; // A
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size }).toPNG();
}

export function updateTrayTooltip(text: string): void {
  tray?.setToolTip(text);
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
  mainWindowRef = null;
  getAttachWindowRef = null;
}
