import { Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import path from 'path';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow): void {
  const iconPath = path.join(__dirname, '../../build/icon.ico');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createFromBuffer(createDefaultIcon()) : icon);
  tray.setToolTip('Takt - Usage Monitor');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide',
      click: () => {
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
        mainWindow.webContents.send('trigger-refresh');
      },
    },
    { type: 'separator' },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: mainWindow.isAlwaysOnTop(),
      click: (menuItem) => {
        mainWindow.setAlwaysOnTop(menuItem.checked);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tray?.destroy();
        const { app } = require('electron');
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
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
}
