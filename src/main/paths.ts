import { app } from 'electron';
import path from 'path';

/**
 * ポータブル版: exe と同じディレクトリの takt-data/ を使用
 * インストール版: %APPDATA%/Takt/ を使用
 */
export function getDataDir(): string {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) {
    return path.join(portableDir, 'takt-data');
  }
  return path.join(app.getPath('appData'), 'Takt');
}

export function isPortable(): boolean {
  return !!process.env.PORTABLE_EXECUTABLE_DIR;
}
