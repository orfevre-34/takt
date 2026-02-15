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
  resizeToContent: (width: number | null, height: number, lockHeight?: boolean) => ipcRenderer.send('resize-to-content', width, height, lockHeight),
  appQuit: () => ipcRenderer.send('app-quit'),
  refreshNow: () => ipcRenderer.send('refresh-now'),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  setWindowOpacity: (opacity: number) => ipcRenderer.send('set-window-opacity', opacity),
  setMiniWidth: (width: number) => ipcRenderer.send('set-mini-width', width),
  saveWindowBounds: () => ipcRenderer.send('save-window-bounds'),
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
  onAlwaysOnTopChanged: (callback: (value: boolean) => void) => {
    const handler = (_event: unknown, value: boolean) => callback(value);
    ipcRenderer.on('always-on-top-changed', handler);
    return () => ipcRenderer.removeListener('always-on-top-changed', handler);
  },
  onTriggerRefresh: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('trigger-refresh', handler);
    return () => ipcRenderer.removeListener('trigger-refresh', handler);
  },
  selectExecutable: () => ipcRenderer.invoke('select-executable'),
  setAttachTarget: (processName: string, anchor: string) => ipcRenderer.invoke('set-attach-target', processName, anchor),
  clearAttachTarget: () => ipcRenderer.invoke('clear-attach-target'),
  detachWindow: () => ipcRenderer.invoke('detach-window'),
  reattachWindow: () => ipcRenderer.invoke('reattach-window'),
  setAttachAnchor: (anchor: string) => ipcRenderer.invoke('set-attach-anchor', anchor),
  setAttachOffset: (ox: number, oy: number) => ipcRenderer.invoke('set-attach-offset', ox, oy),
  getAttachOffset: () => ipcRenderer.invoke('get-attach-offset'),
  getAttachState: () => ipcRenderer.invoke('get-attach-state'),
  onAttachStateChanged: (callback: (state: unknown) => void) => {
    const handler = (_event: unknown, state: unknown) => callback(state);
    ipcRenderer.on('attach-state-changed', handler);
    return () => ipcRenderer.removeListener('attach-state-changed', handler);
  },
  onOpenAttachSettings: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('open-attach-settings', handler);
    return () => ipcRenderer.removeListener('open-attach-settings', handler);
  },
  onContentResized: (callback: (width: number, height: number) => void) => {
    const handler = (_event: unknown, w: number, h: number) => callback(w, h);
    ipcRenderer.on('content-resized', handler);
    return () => ipcRenderer.removeListener('content-resized', handler);
  },
});
