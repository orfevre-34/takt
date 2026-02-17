import { BrowserWindow } from 'electron';
import { log } from './logger';
import { getAccurateWindowBounds, isValidWindow, isAppWindow, isMinimized, watchWindowPosition, getForegroundWindow, getWindowProcessId, setTopmost, placeAboveTarget, watchForegroundChanges, type WindowBounds } from './win32';

const { windowManager } = require('node-window-manager');

interface WindowInfo {
  id: number;
  processId: number;
  path: string;
  getTitle(): string;
}

export type AnchorPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const VALID_ANCHORS: ReadonlySet<string> = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

function isValidAnchor(value: unknown): value is AnchorPosition {
  return typeof value === 'string' && VALID_ANCHORS.has(value);
}

function sanitizeFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return value;
}

export interface AttachTarget {
  processId: number;
  title: string;
  path: string;
}

export interface AttachState {
  attached: boolean;
  target: AttachTarget | null;
  anchor: AnchorPosition;
  targetProcessName: string;
  attachedCount: number;
}

export interface AttachCallbacks {
  onStateChanged: () => void;
  createAttachWindow: () => BrowserWindow;
  destroyAttachWindow: (win: BrowserWindow) => void;
  saveMiniSize: (width: number, height: number) => void;
}

interface AttachInstance {
  hwnd: number;
  processId: number;
  title: string;
  path: string;
  attachWin: BrowserWindow;
  nativeHwnd: number;
  unwatchPosition: () => void;
  wasHiddenByMinimize: boolean;
  resizeHandler: (() => void) | null;
  attachCreatedAt: number;
  miniWidthResizeSuppressUntil: number;
  userResizing: boolean;
  pendingMiniWidth: number | null;
  repositionTimer: ReturnType<typeof setTimeout> | null;
}

const MINI_MIN_HEIGHT = 20;
const MINI_MAX_HEIGHT = 150;
const MINI_DEFAULT_HEIGHT = 40;
const MARGIN_X = 12;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 16;
export type AttachResponsiveness = 'fast' | 'normal' | 'efficient';

const RESPONSIVENESS_PRESETS: Record<AttachResponsiveness, { autoScan: number }> = {
  fast:      { autoScan: 1000 },
  normal:    { autoScan: 2000 },
  efficient: { autoScan: 4000 },
};

const ALIVE_CHECK_FALLBACK_MS = 5000;
let currentPreset: AttachResponsiveness = 'normal';
let SCAN_INTERVAL_MS = 2000;

let mainWindowRef: BrowserWindow | null = null;
let callbacks: AttachCallbacks | null = null;
let scanTimer: ReturnType<typeof setInterval> | null = null;
let aliveCheckTimer: ReturnType<typeof setInterval> | null = null;
let unwatchForeground: (() => void) | null = null;
let currentAnchor: AnchorPosition = 'top-right';
let configuredTargetProcessName = '';
let userOffsetX = 0;
let userOffsetY = 0;

const instances = new Map<number, AttachInstance>();

const ALLOWED_RESIZE_EDGES: Record<AnchorPosition, Set<string>> = {
  'top-left': new Set(['bottom', 'right', 'bottom-right']),
  'top-right': new Set(['bottom', 'left', 'bottom-left']),
  'bottom-left': new Set(['top', 'right', 'top-right']),
  'bottom-right': new Set(['top', 'left', 'top-left']),
};

function getProcessName(exePath: string): string {
  if (!exePath) return '';
  const base = exePath.replace(/\\/g, '/').split('/').pop() || '';
  return base.replace(/\.exe$/i, '').toLowerCase();
}

export function setResponsiveness(preset: AttachResponsiveness): void {
  if (!RESPONSIVENESS_PRESETS[preset]) return;
  currentPreset = preset;
  const p = RESPONSIVENESS_PRESETS[preset];
  SCAN_INTERVAL_MS = p.autoScan;
  log('setResponsiveness:', preset, JSON.stringify(p));

  if (instances.size > 0 && configuredTargetProcessName) {
    const procName = configuredTargetProcessName;
    const anchor = currentAnchor;
    doDetachAll(false);
    startAutoAttach(procName, anchor);
  } else if (scanTimer && configuredTargetProcessName) {
    stopTimers();
    scanTimer = setInterval(() => tryAutoAttach(), SCAN_INTERVAL_MS);
    tryAutoAttach();
  }
}

export function initWindowAttach(mainWindow: BrowserWindow, cb: AttachCallbacks): void {
  mainWindowRef = mainWindow;
  callbacks = cb;
}

let savedMiniHeight = 0;
let savedMiniWidth = 0;

export function startAutoAttach(targetProcessName: string, anchor: AnchorPosition, miniHeight?: number, miniWidth?: number): void {
  if (typeof targetProcessName !== 'string') return;
  configuredTargetProcessName = targetProcessName.toLowerCase();
  currentAnchor = isValidAnchor(anchor) ? anchor : 'top-right';
  log('startAutoAttach: miniHeight arg=', miniHeight, 'miniWidth arg=', miniWidth, 'savedMiniHeight=', savedMiniHeight, 'savedMiniWidth=', savedMiniWidth);
  if (miniHeight && miniHeight > 0) savedMiniHeight = miniHeight;
  if (miniWidth && miniWidth > 0) savedMiniWidth = miniWidth;
  log('startAutoAttach: after merge → savedMiniHeight=', savedMiniHeight, 'savedMiniWidth=', savedMiniWidth);
  stopTimers();

  if (!configuredTargetProcessName) return;

  log('startAutoAttach: watching for', configuredTargetProcessName);
  scanTimer = setInterval(() => tryAutoAttach(), SCAN_INTERVAL_MS);
  tryAutoAttach();
}

export function setTargetProcess(processName: string, anchor: AnchorPosition): void {
  if (typeof processName !== 'string') return;
  if (instances.size > 0) doDetachAll(false);
  startAutoAttach(processName, isValidAnchor(anchor) ? anchor : 'top-right');
  notifyStateChanged();
}

export function clearTargetProcess(): void {
  if (instances.size > 0) doDetachAll(false);
  configuredTargetProcessName = '';
  stopTimers();
  notifyStateChanged();
}

export function detach(): void {
  if (instances.size === 0) {
    stopTimers();
    return;
  }

  saveCurrentMiniSize();
  doDetachAll(true);
  stopTimers();

  log('detach: manual detach, starting auto-reattach scan:', configuredTargetProcessName);
  if (configuredTargetProcessName) {
    scanTimer = setInterval(() => tryAutoAttach(), SCAN_INTERVAL_MS);
  }
}

export function reattach(): void {
  if (!configuredTargetProcessName) return;
  if (instances.size > 0) return;
  stopTimers();
  scanTimer = setInterval(() => tryAutoAttach(), SCAN_INTERVAL_MS);
  tryAutoAttach();
  notifyStateChanged();
}

export function setAnchor(anchor: AnchorPosition): void {
  if (!isValidAnchor(anchor)) return;
  currentAnchor = anchor;
  for (const inst of instances.values()) {
    const bounds = getAccurateWindowBounds(inst.hwnd);
    if (bounds) updatePosition(inst, bounds);
  }
  notifyStateChanged();
}

export function setUserOffset(ox: number, oy: number): void {
  userOffsetX = sanitizeFiniteNumber(ox, 0);
  userOffsetY = sanitizeFiniteNumber(oy, 0);
  for (const inst of instances.values()) {
    const bounds = getAccurateWindowBounds(inst.hwnd);
    if (bounds) updatePosition(inst, bounds);
  }
}

export function getUserOffset(): { x: number; y: number } {
  return { x: userOffsetX, y: userOffsetY };
}

export function resetLayout(): void {
  userOffsetX = 0;
  userOffsetY = 0;
  savedMiniHeight = MINI_DEFAULT_HEIGHT;
  savedMiniWidth = 0;

  for (const inst of instances.values()) {
    const aw = inst.attachWin;
    if (!aw.isDestroyed()) {
      aw.setMinimumSize(100, MINI_MIN_HEIGHT);
      aw.setMaximumSize(2000, MINI_MAX_HEIGHT);
      aw.setContentSize(200, MINI_DEFAULT_HEIGHT);
      const bounds = getAccurateWindowBounds(inst.hwnd);
      if (bounds) updatePosition(inst, bounds);
    }
  }
  log('resetLayout: offsets and mini size cleared');
}

export function setMiniWidthForWindow(win: BrowserWindow, width: number): void {
  const inst = findInstanceByWindow(win);
  if (!inst) return;
  setMiniWidthForInstance(inst, width);
}

export function setMiniWidthBroadcast(width: number): void {
  for (const inst of instances.values()) {
    setMiniWidthForInstance(inst, width);
  }
}

function setMiniWidthForInstance(inst: AttachInstance, width: number): void {
  const attachWin = inst.attachWin;
  if (attachWin.isDestroyed()) return;
  if (typeof width !== 'number' || !Number.isFinite(width)) return;
  if (inst.userResizing) {
    inst.pendingMiniWidth = width;
    return;
  }
  const w = Math.max(40, Math.ceil(width));

  const GRACE_MS = 2000;
  const elapsed = Date.now() - inst.attachCreatedAt;
  if (elapsed < GRACE_MS && savedMiniWidth > 0 && w < savedMiniWidth) {
    log('setMiniWidth: grace period, ignoring shrink w=', w, '< savedW=', savedMiniWidth);
    return;
  }
  const [curW, curH] = attachWin.getContentSize();

  const [minW, minH] = attachWin.getMinimumSize();
  if (minW !== w || minH !== MINI_MIN_HEIGHT) {
    attachWin.setMinimumSize(w, MINI_MIN_HEIGHT);
  }

  const [maxW, maxH] = attachWin.getMaximumSize();
  if (maxW !== w || maxH !== MINI_MAX_HEIGHT) {
    attachWin.setMaximumSize(w, MINI_MAX_HEIGHT);
  }

  if (curW !== w) {
    inst.miniWidthResizeSuppressUntil = Date.now() + 80;
    const outerSize = attachWin.getSize();
    const cw = curW ?? 0;
    const ch = curH ?? MINI_DEFAULT_HEIGHT;
    const frameW = (outerSize[0] ?? 0) - cw;
    const frameH = (outerSize[1] ?? 0) - ch;
    const bounds = computeAttachedBoundsForInstance(inst, w + frameW, ch + frameH);
    if (bounds) {
      attachWin.setBounds(bounds);
    } else {
      attachWin.setContentSize(w, curH ?? MINI_DEFAULT_HEIGHT);
    }
    savedMiniWidth = w;
  } else {
    repositionInstance(inst);
  }
}

export function isMiniWidthResizeSuppressedForWindow(win: BrowserWindow): boolean {
  const inst = findInstanceByWindow(win);
  if (!inst) return false;
  return Date.now() < inst.miniWidthResizeSuppressUntil;
}

export function isAllowedResizeEdge(edge: string): boolean {
  return ALLOWED_RESIZE_EDGES[currentAnchor]?.has(edge) ?? false;
}

export function isUserResizingWindow(win: BrowserWindow): boolean {
  const inst = findInstanceByWindow(win);
  return inst?.userResizing ?? false;
}

export function beginUserResizeForWindow(win: BrowserWindow): void {
  const inst = findInstanceByWindow(win);
  if (inst) inst.userResizing = true;
}

export function endUserResizeForWindow(win: BrowserWindow): void {
  const inst = findInstanceByWindow(win);
  if (!inst) return;
  inst.userResizing = false;
  if (inst.pendingMiniWidth !== null) {
    const w = inst.pendingMiniWidth;
    inst.pendingMiniWidth = null;
    setMiniWidthForInstance(inst, w);
  }
}

function repositionInstance(inst: AttachInstance): void {
  if (inst.attachWin.isDestroyed()) return;
  const bounds = getAccurateWindowBounds(inst.hwnd);
  if (bounds) updatePosition(inst, bounds);
}

function scheduleReposition(inst: AttachInstance): void {
  if (inst.repositionTimer) return;
  inst.repositionTimer = setTimeout(() => {
    inst.repositionTimer = null;
    repositionInstance(inst);
  }, 16);
}

export function getAttachState(): AttachState {
  const firstInst = instances.size > 0 ? instances.values().next().value as AttachInstance : null;
  return {
    attached: instances.size > 0,
    target: firstInst ? { processId: firstInst.processId, title: firstInst.title, path: firstInst.path } : null,
    anchor: currentAnchor,
    targetProcessName: configuredTargetProcessName,
    attachedCount: instances.size,
  };
}

export function isWindowAttached(): boolean {
  return instances.size > 0;
}

export function cleanupWindowAttach(): void {
  stopTimers();
  if (instances.size > 0) doDetachAll(false);
  mainWindowRef = null;
  callbacks = null;
}

function findInstanceByWindow(win: BrowserWindow): AttachInstance | null {
  for (const inst of instances.values()) {
    if (inst.attachWin === win) return inst;
  }
  return null;
}

function saveCurrentMiniSize(): void {
  const firstInst = instances.size > 0 ? instances.values().next().value as AttachInstance : null;
  if (firstInst && !firstInst.attachWin.isDestroyed()) {
    const cs = firstInst.attachWin.getContentSize();
    log('saveCurrentMiniSize: contentSize=', cs[0], cs[1]);
    if (cs[0] && cs[0] > 0) savedMiniWidth = cs[0];
    if (cs[1] && cs[1] > 0) savedMiniHeight = cs[1];
    log('saveCurrentMiniSize: saving → w=', savedMiniWidth, 'h=', savedMiniHeight);
    callbacks?.saveMiniSize(savedMiniWidth, savedMiniHeight);
  } else {
    log('saveCurrentMiniSize: no attach window, using cached → w=', savedMiniWidth, 'h=', savedMiniHeight);
  }
}

function stopTimers(): void {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  if (aliveCheckTimer) { clearInterval(aliveCheckTimer); aliveCheckTimer = null; }
  if (unwatchForeground) { unwatchForeground(); unwatchForeground = null; }
}

function findAllTargetHwnds(): { hwnd: number; info: WindowInfo }[] {
  const results: { hwnd: number; info: WindowInfo }[] = [];
  try {
    const windows: WindowInfo[] = windowManager.getWindows();
    for (const win of windows) {
      try {
        if (getProcessName(win.path) !== configuredTargetProcessName) continue;
        if (!isAppWindow(win.id)) continue;
        if (isMinimized(win.id)) continue;
        const bounds = getAccurateWindowBounds(win.id);
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue;
        results.push({ hwnd: win.id, info: win });
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return results;
}

function doAttach(hwnd: number, processId: number, title: string, path: string): void {
  if (!callbacks) return;
  if (instances.has(hwnd)) return;

  const bounds = getAccurateWindowBounds(hwnd);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

  const attachWin = callbacks.createAttachWindow();
  const attachCreatedAt = Date.now();

  const initH = savedMiniHeight > 0 ? Math.max(MINI_MIN_HEIGHT, Math.min(MINI_MAX_HEIGHT, savedMiniHeight)) : MINI_DEFAULT_HEIGHT;
  const initW = savedMiniWidth > 0 ? Math.max(40, savedMiniWidth) : 200;
  log('doAttach: restore size → initW=', initW, 'initH=', initH, '(savedW=', savedMiniWidth, 'savedH=', savedMiniHeight, ')');
  attachWin.setMinimumSize(100, MINI_MIN_HEIGHT);
  attachWin.setMaximumSize(2000, MINI_MAX_HEIGHT);
  attachWin.setContentSize(initW, initH);

  const inst: AttachInstance = {
    hwnd,
    processId,
    title,
    path,
    attachWin,
    nativeHwnd: 0,
    unwatchPosition: () => {},
    wasHiddenByMinimize: false,
    resizeHandler: null,
    attachCreatedAt,
    miniWidthResizeSuppressUntil: 0,
    userResizing: false,
    pendingMiniWidth: null,
    repositionTimer: null,
  };

  updatePosition(inst, bounds);
  attachWin.showInactive();

  const hwndBuf = attachWin.getNativeWindowHandle();
  inst.nativeHwnd = hwndBuf.byteLength >= 8
    ? Number(hwndBuf.readBigInt64LE(0))
    : hwndBuf.readInt32LE(0);
  setTopmost(inst.nativeHwnd);

  inst.resizeHandler = () => {
    if (Date.now() < inst.miniWidthResizeSuppressUntil) return;
    if (inst.userResizing) return;
    scheduleReposition(inst);
  };
  attachWin.on('resize', inst.resizeHandler);

  inst.unwatchPosition = watchWindowPosition(
    hwnd,
    (b) => updatePosition(inst, b),
    () => {
      if (!inst.attachWin.isDestroyed()) {
        const cs = inst.attachWin.getContentSize();
        if (cs[0] && cs[0] > 0) savedMiniWidth = cs[0];
        if (cs[1] && cs[1] > 0) savedMiniHeight = cs[1];
      }
      inst.wasHiddenByMinimize = true;
      if (!inst.attachWin.isDestroyed()) inst.attachWin.hide();
    },
    () => {
      if (inst.wasHiddenByMinimize && !inst.attachWin.isDestroyed()) {
        inst.attachWin.showInactive();
        inst.wasHiddenByMinimize = false;
        if (inst.nativeHwnd) setTopmost(inst.nativeHwnd);
      }
    },
    () => {
      setImmediate(() => {
        log('EVENT_OBJECT_DESTROY: target hwnd:', hwnd);
        if (!instances.has(hwnd)) return;
        doDetachOne(hwnd, false);
        notifyStateChanged();
        if (instances.size === 0 && configuredTargetProcessName) {
          scanTimer = setInterval(() => tryAutoAttach(), SCAN_INTERVAL_MS);
        }
      });
    },
  );

  instances.set(hwnd, inst);

  // Start shared foreground watcher if first instance
  if (instances.size === 1) {
    startSharedWatchers();
  }

  log('attached to', title, 'hwnd:', hwnd, 'total instances:', instances.size);
  notifyStateChanged();
}

function startSharedWatchers(): void {
  if (unwatchForeground) { unwatchForeground(); unwatchForeground = null; }
  if (aliveCheckTimer) { clearInterval(aliveCheckTimer); aliveCheckTimer = null; }
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }

  unwatchForeground = watchForegroundChanges((fgHwnd) => {
    if (instances.size === 0) return;

    const matchedInst = instances.get(fgHwnd);
    if (matchedInst) {
      setTopmost(matchedInst.nativeHwnd);
      return;
    }

    const fgPid = getWindowProcessId(fgHwnd);
    let pidMatch = false;
    for (const inst of instances.values()) {
      if (inst.processId === fgPid) {
        setTopmost(inst.nativeHwnd);
        pidMatch = true;
      }
    }

    if (!pidMatch) {
      for (const inst of instances.values()) {
        if (isValidWindow(inst.hwnd)) {
          placeAboveTarget(inst.nativeHwnd, inst.hwnd);
        }
      }
    }
  });

  aliveCheckTimer = setInterval(() => {
    const toRemove: number[] = [];
    for (const [hwnd, inst] of instances) {
      if (!isValidWindow(hwnd)) {
        toRemove.push(hwnd);
        continue;
      }
      const currentPid = getWindowProcessId(hwnd);
      if (currentPid !== inst.processId) {
        toRemove.push(hwnd);
      }
    }
    for (const hwnd of toRemove) {
      log('aliveCheck: target disappeared hwnd:', hwnd);
      doDetachOne(hwnd, false);
    }
    if (toRemove.length > 0) {
      notifyStateChanged();
      if (instances.size === 0 && configuredTargetProcessName) {
        scanTimer = setInterval(() => tryAutoAttach(), SCAN_INTERVAL_MS);
      }
    }
  }, ALIVE_CHECK_FALLBACK_MS);

  // Keep scanning for new windows of the same process
  scanTimer = setInterval(() => tryAutoAttach(), SCAN_INTERVAL_MS);
}

function tryAutoAttach(): void {
  if (!configuredTargetProcessName || !callbacks) return;

  const found = findAllTargetHwnds();
  const foundSet = new Set(found.map(f => f.hwnd));

  // Attach new windows
  for (const { hwnd, info } of found) {
    if (instances.has(hwnd)) continue;
    const bounds = getAccurateWindowBounds(hwnd);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue;
    let title: string;
    try { title = info.getTitle() || configuredTargetProcessName; } catch { title = configuredTargetProcessName; }
    doAttach(hwnd, info.processId, title, info.path || '');
  }

  // Detach windows that no longer exist (redundant with aliveCheck but handles edge cases)
  for (const hwnd of instances.keys()) {
    if (!foundSet.has(hwnd) && !isValidWindow(hwnd)) {
      doDetachOne(hwnd, false);
    }
  }
}

function doDetachOne(hwnd: number, notify: boolean): void {
  const inst = instances.get(hwnd);
  if (!inst) return;

  inst.unwatchPosition();
  if (inst.repositionTimer) { clearTimeout(inst.repositionTimer); inst.repositionTimer = null; }

  if (inst.resizeHandler && !inst.attachWin.isDestroyed()) {
    inst.attachWin.removeListener('resize', inst.resizeHandler);
  }

  if (!inst.attachWin.isDestroyed()) {
    const cs = inst.attachWin.getContentSize();
    if (cs[0] && cs[0] > 0) savedMiniWidth = cs[0];
    if (cs[1] && cs[1] > 0) savedMiniHeight = cs[1];
  }

  instances.delete(hwnd);
  callbacks?.destroyAttachWindow(inst.attachWin);

  if (instances.size === 0) {
    if (aliveCheckTimer) { clearInterval(aliveCheckTimer); aliveCheckTimer = null; }
    if (unwatchForeground) { unwatchForeground(); unwatchForeground = null; }
  }

  if (notify) notifyStateChanged();
}

function doDetachAll(notify: boolean): void {
  const hwnds = [...instances.keys()];
  for (const hwnd of hwnds) {
    doDetachOne(hwnd, false);
  }
  if (notify) notifyStateChanged();
}

export function detachOneByWindow(win: BrowserWindow): void {
  const inst = findInstanceByWindow(win);
  if (inst) {
    doDetachOne(inst.hwnd, true);
    if (instances.size === 0 && configuredTargetProcessName) {
      scanTimer = setInterval(() => tryAutoAttach(), SCAN_INTERVAL_MS);
    }
  }
}

function calcPosition(tb: WindowBounds, outerW: number, outerH: number): { x: number; y: number } {
  let x: number, y: number;
  switch (currentAnchor) {
    case 'top-left':
      x = tb.x + MARGIN_X;
      y = tb.y + MARGIN_TOP;
      break;
    case 'top-right':
      x = tb.x + tb.width - outerW - MARGIN_X;
      y = tb.y + MARGIN_TOP;
      break;
    case 'bottom-left':
      x = tb.x + MARGIN_X;
      y = tb.y + tb.height - outerH - MARGIN_BOTTOM;
      break;
    case 'bottom-right':
      x = tb.x + tb.width - outerW - MARGIN_X;
      y = tb.y + tb.height - outerH - MARGIN_BOTTOM;
      break;
  }
  return { x: Math.round(x + userOffsetX), y: Math.round(y + userOffsetY) };
}

function updatePosition(inst: AttachInstance, tb: WindowBounds): void {
  if (inst.attachWin.isDestroyed()) return;

  const sz = inst.attachWin.getSize();
  const curW = sz[0] ?? 200;
  const curH = sz[1] ?? MINI_DEFAULT_HEIGHT;
  const { x, y } = calcPosition(tb, curW, curH);
  inst.attachWin.setPosition(x, y);
}

function computeAttachedBoundsForInstance(inst: AttachInstance, outerW: number, outerH: number): Electron.Rectangle | null {
  if (inst.attachWin.isDestroyed()) return null;
  const tb = getAccurateWindowBounds(inst.hwnd);
  if (!tb) return null;
  const { x, y } = calcPosition(tb, outerW, outerH);
  return { x, y, width: outerW, height: outerH };
}

export function computeAttachedBounds(outerW: number, outerH: number): Electron.Rectangle | null {
  if (instances.size === 0) return null;
  const inst = instances.values().next().value as AttachInstance;
  return computeAttachedBoundsForInstance(inst, outerW, outerH);
}

function notifyStateChanged(): void {
  const state = getAttachState();
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('attach-state-changed', state);
  }
  for (const inst of instances.values()) {
    if (!inst.attachWin.isDestroyed()) {
      inst.attachWin.webContents.send('attach-state-changed', state);
    }
  }
  callbacks?.onStateChanged();
}
