import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../renderer/types';

const api: ElectronAPI = {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getUsageSnapshot: (provider) => ipcRenderer.invoke('get-usage-snapshot', provider),
  saveUsageSnapshot: (snapshot) => ipcRenderer.invoke('save-usage-snapshot', snapshot),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('set-always-on-top', value),
  runCcusage: (provider) => ipcRenderer.invoke('run-ccusage', provider),
  openLogin: (provider) => ipcRenderer.invoke('open-login', provider),
  fetchUsage: (provider) => ipcRenderer.invoke('fetch-usage', provider),
  resizeToContent: (width, height, lockHeight) => ipcRenderer.send('resize-to-content', width, height, lockHeight),
  appQuit: () => ipcRenderer.send('app-quit'),
  refreshNow: () => ipcRenderer.send('refresh-now'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  setWindowOpacity: (opacity) => ipcRenderer.send('set-window-opacity', opacity),
  setMiniWidth: (width) => ipcRenderer.send('set-mini-width', width),
  saveWindowBounds: () => ipcRenderer.send('save-window-bounds'),
  onUsageUpdated: (callback) => {
    const handler = (_event: unknown, snapshot: unknown) => callback(snapshot as any);
    ipcRenderer.on('usage-updated', handler);
    return () => ipcRenderer.removeListener('usage-updated', handler);
  },
  onTokenUsageUpdated: (callback) => {
    const handler = (_event: unknown, snapshot: unknown) => callback(snapshot as any);
    ipcRenderer.on('token-usage-updated', handler);
    return () => ipcRenderer.removeListener('token-usage-updated', handler);
  },
  onAlwaysOnTopChanged: (callback) => {
    const handler = (_event: unknown, value: unknown) => callback(value as boolean);
    ipcRenderer.on('always-on-top-changed', handler);
    return () => ipcRenderer.removeListener('always-on-top-changed', handler);
  },
  onTriggerRefresh: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('trigger-refresh', handler);
    return () => ipcRenderer.removeListener('trigger-refresh', handler);
  },
  selectExecutable: () => ipcRenderer.invoke('select-executable'),
  setAttachTarget: (processName, anchor) => ipcRenderer.invoke('set-attach-target', processName, anchor),
  clearAttachTarget: () => ipcRenderer.invoke('clear-attach-target'),
  detachWindow: () => ipcRenderer.invoke('detach-window'),
  reattachWindow: () => ipcRenderer.invoke('reattach-window'),
  setAttachAnchor: (anchor) => ipcRenderer.invoke('set-attach-anchor', anchor),
  setAttachOffset: (ox, oy) => ipcRenderer.invoke('set-attach-offset', ox, oy),
  getAttachOffset: () => ipcRenderer.invoke('get-attach-offset'),
  getAttachState: () => ipcRenderer.invoke('get-attach-state'),
  resetAttachLayout: () => ipcRenderer.invoke('reset-attach-layout'),
  setAttachResponsiveness: (preset) => ipcRenderer.invoke('set-attach-responsiveness', preset),
  onAttachStateChanged: (callback) => {
    const handler = (_event: unknown, state: unknown) => callback(state as any);
    ipcRenderer.on('attach-state-changed', handler);
    return () => ipcRenderer.removeListener('attach-state-changed', handler);
  },
  onOpenAttachSettings: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('open-attach-settings', handler);
    return () => ipcRenderer.removeListener('open-attach-settings', handler);
  },
  onContentResized: (callback) => {
    const handler = (_event: unknown, w: number, h: number) => callback(w, h);
    ipcRenderer.on('content-resized', handler);
    return () => ipcRenderer.removeListener('content-resized', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
