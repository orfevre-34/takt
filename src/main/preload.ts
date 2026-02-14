import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('save-settings', settings),
  getUsageSnapshot: (provider: string) => ipcRenderer.invoke('get-usage-snapshot', provider),
  saveUsageSnapshot: (snapshot: unknown) => ipcRenderer.invoke('save-usage-snapshot', snapshot),
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke('set-always-on-top', value),
  runCcusage: (provider: string) => ipcRenderer.invoke('run-ccusage', provider),
  openLogin: (provider: string) => ipcRenderer.invoke('open-login', provider),
  fetchUsage: (provider: string) => ipcRenderer.invoke('fetch-usage', provider),
  appQuit: () => ipcRenderer.send('app-quit'),
  refreshNow: () => ipcRenderer.send('refresh-now'),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  onUsageUpdated: (callback: (snapshot: unknown) => void) => {
    const handler = (_event: unknown, snapshot: unknown) => callback(snapshot);
    ipcRenderer.on('usage-updated', handler);
    return () => ipcRenderer.removeListener('usage-updated', handler);
  },
  onTokenUsageUpdated: (callback: (snapshot: unknown) => void) => {
    const handler = (_event: unknown, snapshot: unknown) => callback(snapshot);
    ipcRenderer.on('token-usage-updated', handler);
    return () => ipcRenderer.removeListener('token-usage-updated', handler);
  },
});
