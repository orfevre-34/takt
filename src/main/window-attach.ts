import { BrowserWindow } from 'electron';
import { log } from './logger';
import { getAccurateWindowBounds, isValidWindow, isAppWindow, isMinimized, watchWindowPosition, getForegroundWindow, getWindowProcessId, setTopmost, clearTopmostBelow, watchForegroundChanges, type WindowBounds } from './win32';

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
}

export interface AttachCallbacks {
  onStateChanged: () => void;
  createAttachWindow: () => BrowserWindow;
  destroyAttachWindow: () => void;
  getAttachWindow: () => BrowserWindow | null;
  saveMiniSize: (width: number, height: number) => void;
}

const MINI_MIN_HEIGHT = 20;
const MINI_MAX_HEIGHT = 150;
const MINI_DEFAULT_HEIGHT = 40;
const MARGIN_X = 12;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 16;
export type AttachResponsiveness = 'fast' | 'normal' | 'efficient';

const RESPONSIVENESS_PRESETS: Record<AttachResponsiveness, { aliveCheck: number; autoScan: number }> = {
  fast:      { aliveCheck: 1000,  autoScan: 1000 },
  normal:    { aliveCheck: 2000,  autoScan: 2000 },
  efficient: { aliveCheck: 4000,  autoScan: 4000 },
};

let currentPreset: AttachResponsiveness = 'normal';
let SCAN_INTERVAL_MS = 2000;
let ALIVE_CHECK_INTERVAL_MS = 2000;

let mainWindowRef: BrowserWindow | null = null;
let callbacks: AttachCallbacks | null = null;
let scanTimer: ReturnType<typeof setInterval> | null = null;
let aliveCheckTimer: ReturnType<typeof setInterval> | null = null;
let unwatchPosition: (() => void) | null = null;
let unwatchForeground: (() => void) | null = null;
let targetHwnd: number | null = null;
let targetInfo: AttachTarget | null = null;
let currentAnchor: AnchorPosition = 'top-right';
let configuredTargetProcessName = '';
let isAttached = false;
let wasHiddenByMinimize = false;
let userOffsetX = 0;
let userOffsetY = 0;
let resizeHandler: (() => void) | null = null;
let miniWidthResizeSuppressUntil = 0;
let userResizing = false;
let pendingMiniWidth: number | null = null;
let repositionTimer: ReturnType<typeof setTimeout> | null = null;
let reattachTimer: ReturnType<typeof setTimeout> | null = null;
let attachNativeHwnd: number | null = null;
let attachCreatedAt = 0;

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
  ALIVE_CHECK_INTERVAL_MS = p.aliveCheck;
  log('setResponsiveness:', preset, JSON.stringify(p));

  if (isAttached && configuredTargetProcessName) {
    const procName = configuredTargetProcessName;
    const anchor = currentAnchor;
    doDetach(false);
    startAutoAttach(procName, anchor);
  } else if (scanTimer && configuredTargetProcessName) {
    stopAll();
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
  stopAll();

  if (!configuredTargetProcessName) return;

  log('startAutoAttach: watching for', configuredTargetProcessName);
  scanTimer = setInterval(() => tryAutoAttach(), SCAN_INTERVAL_MS);
  tryAutoAttach();
}

export function setTargetProcess(processName: string, anchor: AnchorPosition): void {
  if (typeof processName !== 'string') return;
  if (isAttached) doDetach(false);
  startAutoAttach(processName, isValidAnchor(anchor) ? anchor : 'top-right');
  notifyStateChanged();
}

export function clearTargetProcess(): void {
  if (isAttached) doDetach(false);
  configuredTargetProcessName = '';
  stopAll();
  notifyStateChanged();
}

export function detach(): void {
  if (!isAttached || !targetHwnd || !targetInfo) {
    stopAll();
    return;
  }

  saveCurrentMiniSize();
  doDetach(true);
  stopAll();

  log('detach: manual detach, starting auto-reattach scan:', configuredTargetProcessName);
  if (configuredTargetProcessName) {
    scanTimer = setInterval(() => tryAutoAttach(), SCAN_INTERVAL_MS);
  }
}

export function reattach(): void {
  if (!configuredTargetProcessName) return;
  if (isAttached) return;
  stopAll();
  scanTimer = setInterval(() => tryAutoAttach(), SCAN_INTERVAL_MS);
  tryAutoAttach();
  notifyStateChanged();
}

export function setAnchor(anchor: AnchorPosition): void {
  if (!isValidAnchor(anchor)) return;
  currentAnchor = anchor;
  if (isAttached && targetHwnd) {
    const bounds = getAccurateWindowBounds(targetHwnd);
    if (bounds) updatePosition(bounds);
  }
  notifyStateChanged();
}

export function setUserOffset(ox: number, oy: number): void {
  userOffsetX = sanitizeFiniteNumber(ox, 0);
  userOffsetY = sanitizeFiniteNumber(oy, 0);
  if (isAttached && targetHwnd) {
    const bounds = getAccurateWindowBounds(targetHwnd);
    if (bounds) updatePosition(bounds);
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

  const attachWin = callbacks?.getAttachWindow();
  if (isAttached && attachWin && !attachWin.isDestroyed()) {
    attachWin.setMinimumSize(100, MINI_MIN_HEIGHT);
    attachWin.setMaximumSize(2000, MINI_MAX_HEIGHT);
    attachWin.setContentSize(200, MINI_DEFAULT_HEIGHT);
    if (targetHwnd) {
      const bounds = getAccurateWindowBounds(targetHwnd);
      if (bounds) updatePosition(bounds);
    }
  }
  log('resetLayout: offsets and mini size cleared');
}

export function setMiniWidth(width: number): void {
  const attachWin = callbacks?.getAttachWindow();
  if (!isAttached || !attachWin || attachWin.isDestroyed()) return;
  if (typeof width !== 'number' || !Number.isFinite(width)) return;
  if (isUserResizing()) {
    pendingMiniWidth = width;
    return;
  }
  const w = Math.max(40, Math.ceil(width));

  // Grace period: don't shrink below saved width right after creation
  const GRACE_MS = 2000;
  if (Date.now() - attachCreatedAt < GRACE_MS && savedMiniWidth > 0 && w < savedMiniWidth) {
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
    miniWidthResizeSuppressUntil = Date.now() + 80;
    const outerSize = attachWin.getSize();
    const cw = curW ?? 0;
    const ch = curH ?? MINI_DEFAULT_HEIGHT;
    const frameW = (outerSize[0] ?? 0) - cw;
    const frameH = (outerSize[1] ?? 0) - ch;
    const bounds = computeAttachedBounds(w + frameW, ch + frameH);
    if (bounds) {
      attachWin.setBounds(bounds);
    } else {
      attachWin.setContentSize(w, curH ?? MINI_DEFAULT_HEIGHT);
    }
    savedMiniWidth = w;
  } else {
    repositionToAnchor();
  }
}

export function isMiniWidthResizeSuppressed(): boolean {
  return Date.now() < miniWidthResizeSuppressUntil;
}

export function isAllowedResizeEdge(edge: string): boolean {
  return ALLOWED_RESIZE_EDGES[currentAnchor]?.has(edge) ?? false;
}

export function isUserResizing(): boolean {
  return userResizing;
}

export function beginUserResize(): void {
  userResizing = true;
}

export function endUserResize(): void {
  userResizing = false;
  if (pendingMiniWidth !== null) {
    const w = pendingMiniWidth;
    pendingMiniWidth = null;
    setMiniWidth(w);
  }
}

function repositionToAnchor(): void {
  const attachWin = callbacks?.getAttachWindow();
  if (!isAttached || !targetHwnd || !attachWin || attachWin.isDestroyed()) return;
  const bounds = getAccurateWindowBounds(targetHwnd);
  if (bounds) updatePosition(bounds);
}

export function getAttachState(): AttachState {
  return {
    attached: isAttached,
    target: targetInfo,
    anchor: currentAnchor,
    targetProcessName: configuredTargetProcessName,
  };
}

export function isWindowAttached(): boolean {
  return isAttached;
}

export function cleanupWindowAttach(): void {
  stopAll();
  if (isAttached) doDetach(false);
  mainWindowRef = null;
  callbacks = null;
}

function saveCurrentMiniSize(): void {
  const attachWin = callbacks?.getAttachWindow();
  if (attachWin && !attachWin.isDestroyed()) {
    const cs = attachWin.getContentSize();
    log('saveCurrentMiniSize: contentSize=', cs[0], cs[1]);
    if (cs[0] && cs[0] > 0) savedMiniWidth = cs[0];
    if (cs[1] && cs[1] > 0) savedMiniHeight = cs[1];
    log('saveCurrentMiniSize: saving → w=', savedMiniWidth, 'h=', savedMiniHeight);
    callbacks?.saveMiniSize(savedMiniWidth, savedMiniHeight);
  } else {
    log('saveCurrentMiniSize: no attach window, using cached → w=', savedMiniWidth, 'h=', savedMiniHeight);
  }
}

function stopAll(): void {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  if (aliveCheckTimer) { clearInterval(aliveCheckTimer); aliveCheckTimer = null; }
  if (unwatchPosition) { unwatchPosition(); unwatchPosition = null; }
  if (unwatchForeground) { unwatchForeground(); unwatchForeground = null; }
  if (repositionTimer) { clearTimeout(repositionTimer); repositionTimer = null; }
  if (reattachTimer) { clearTimeout(reattachTimer); reattachTimer = null; }
  userResizing = false;
  pendingMiniWidth = null;
}

function scheduleReposition(): void {
  if (repositionTimer) return;
  repositionTimer = setTimeout(() => {
    repositionTimer = null;
    repositionToAnchor();
  }, 16);
}

function findTargetHwnd(): { hwnd: number; info: WindowInfo } | null {
  try {
    const windows: WindowInfo[] = windowManager.getWindows();
    const fgHwnd = getForegroundWindow();
    let best: { hwnd: number; info: WindowInfo; area: number } | null = null;

    for (const win of windows) {
      try {
        if (getProcessName(win.path) !== configuredTargetProcessName) continue;
        if (!isAppWindow(win.id)) continue;
        if (isMinimized(win.id)) continue;
        const bounds = getAccurateWindowBounds(win.id);
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue;

        if (win.id === fgHwnd) return { hwnd: win.id, info: win };

        const area = bounds.width * bounds.height;
        if (!best || area > best.area) {
          best = { hwnd: win.id, info: win, area };
        }
      } catch { /* ignore */ }
    }
    return best;
  } catch { /* ignore */ }
  return null;
}

function doAttach(hwnd: number, processId: number, title: string, path: string): void {
  if (!callbacks) return;

  targetHwnd = hwnd;
  targetInfo = { processId, title, path };
  isAttached = true;
  wasHiddenByMinimize = false;

  const bounds = getAccurateWindowBounds(hwnd);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

  const attachWin = callbacks.createAttachWindow();
  attachCreatedAt = Date.now();

  const initH = savedMiniHeight > 0 ? Math.max(MINI_MIN_HEIGHT, Math.min(MINI_MAX_HEIGHT, savedMiniHeight)) : MINI_DEFAULT_HEIGHT;
  const initW = savedMiniWidth > 0 ? Math.max(40, savedMiniWidth) : 200;
  log('doAttach: restore size → initW=', initW, 'initH=', initH, '(savedW=', savedMiniWidth, 'savedH=', savedMiniHeight, ')');
  attachWin.setMinimumSize(100, MINI_MIN_HEIGHT);
  attachWin.setMaximumSize(2000, MINI_MAX_HEIGHT);
  attachWin.setContentSize(initW, initH);

  updatePosition(bounds);
  attachWin.showInactive();

  // Get native HWND for Z-order management
  attachNativeHwnd = attachWin.getNativeWindowHandle().readInt32LE(0);
  setTopmost(attachNativeHwnd);

  resizeHandler = () => {
    if (isMiniWidthResizeSuppressed()) return;
    if (isUserResizing()) return;
    scheduleReposition();
  };
  attachWin.on('resize', resizeHandler);

  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }

  unwatchPosition = watchWindowPosition(
    hwnd,
    (b) => updatePosition(b),
    () => {
      const aw = callbacks?.getAttachWindow();
      if (aw && !aw.isDestroyed()) {
        const cs = aw.getContentSize();
        if (cs[0] && cs[0] > 0) savedMiniWidth = cs[0];
        if (cs[1] && cs[1] > 0) savedMiniHeight = cs[1];
      }
      wasHiddenByMinimize = true;
      aw?.hide();
    },
    () => {
      const aw = callbacks?.getAttachWindow();
      if (wasHiddenByMinimize && aw && !aw.isDestroyed()) {
        aw.showInactive();
        wasHiddenByMinimize = false;
        if (attachNativeHwnd) setTopmost(attachNativeHwnd);
      }
    },
  );

  // Event-driven foreground detection
  unwatchForeground = watchForegroundChanges((fgHwnd) => {
    if (!isAttached || !targetHwnd || !attachNativeHwnd) return;

    const fgPid = getWindowProcessId(fgHwnd);
    const targetPid = targetInfo?.processId ?? 0;

    if (fgHwnd === targetHwnd || fgPid === targetPid) {
      setTopmost(attachNativeHwnd);

      // Check if it's a different window of the same process
      if (fgHwnd !== targetHwnd && fgPid === targetPid) {
        const fgMatch = findHwndByProcessName(configuredTargetProcessName);
        if (fgMatch && fgMatch.hwnd !== targetHwnd) {
          switchAttachTarget(fgMatch.hwnd, fgMatch.processId, fgMatch.title, fgMatch.path);
        }
      }
    } else {
      clearTopmostBelow(attachNativeHwnd, fgHwnd);
    }
  });

  aliveCheckTimer = setInterval(() => {
    if (!targetHwnd || !isValidWindow(targetHwnd)) {
      log('aliveCheck: target disappeared');
      saveCurrentMiniSize();
      doDetach(true);
      startAutoAttach(configuredTargetProcessName, currentAnchor);
      return;
    }
  }, ALIVE_CHECK_INTERVAL_MS);

  log('attached to', title, 'hwnd:', hwnd);
  notifyStateChanged();
}

function tryAutoAttach(): void {
  if (!configuredTargetProcessName || !callbacks) return;
  if (isAttached) return;

  const found = findTargetHwnd();
  if (!found) return;

  const { hwnd, info } = found;
  const bounds = getAccurateWindowBounds(hwnd);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

  let title: string;
  try { title = info.getTitle() || configuredTargetProcessName; } catch { title = configuredTargetProcessName; }

  doAttach(hwnd, info.processId, title, info.path || '');
}

function findHwndByProcessName(processName: string): { hwnd: number; processId: number; title: string; path: string } | null {
  try {
    const windows: WindowInfo[] = windowManager.getWindows();
    const fgHwnd = getForegroundWindow();
    for (const win of windows) {
      try {
        if (win.id !== fgHwnd) continue;
        if (getProcessName(win.path) !== processName) continue;
        if (!isAppWindow(win.id)) continue;
        if (isMinimized(win.id)) continue;
        const bounds = getAccurateWindowBounds(win.id);
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue;
        let title: string;
        try { title = win.getTitle() || processName; } catch { title = processName; }
        return { hwnd: win.id, processId: win.processId, title, path: win.path || '' };
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return null;
}

function switchAttachTarget(newHwnd: number, newProcessId: number, newTitle: string, newPath: string): void {
  const attachWin = callbacks?.getAttachWindow();
  if (!attachWin || attachWin.isDestroyed()) return;
  if (unwatchPosition) { unwatchPosition(); unwatchPosition = null; }

  targetHwnd = newHwnd;
  targetInfo = { processId: newProcessId, title: newTitle, path: newPath };

  const bounds = getAccurateWindowBounds(newHwnd);
  if (bounds) updatePosition(bounds);

  unwatchPosition = watchWindowPosition(
    newHwnd,
    (b) => updatePosition(b),
    () => {
      const aw = callbacks?.getAttachWindow();
      if (aw && !aw.isDestroyed()) {
        const cs = aw.getContentSize();
        if (cs[0] && cs[0] > 0) savedMiniWidth = cs[0];
        if (cs[1] && cs[1] > 0) savedMiniHeight = cs[1];
      }
      wasHiddenByMinimize = true;
      aw?.hide();
    },
    () => {
      const aw = callbacks?.getAttachWindow();
      if (wasHiddenByMinimize && aw && !aw.isDestroyed()) {
        aw.showInactive();
        wasHiddenByMinimize = false;
        if (attachNativeHwnd) setTopmost(attachNativeHwnd);
      }
    },
  );

  log('switched attach target to', newTitle, 'hwnd:', newHwnd);
  notifyStateChanged();
}

function doDetach(notify: boolean): void {
  if (aliveCheckTimer) { clearInterval(aliveCheckTimer); aliveCheckTimer = null; }
  if (unwatchPosition) { unwatchPosition(); unwatchPosition = null; }
  if (unwatchForeground) { unwatchForeground(); unwatchForeground = null; }
  if (repositionTimer) { clearTimeout(repositionTimer); repositionTimer = null; }

  const attachWin = callbacks?.getAttachWindow();
  if (resizeHandler && attachWin && !attachWin.isDestroyed()) {
    attachWin.removeListener('resize', resizeHandler);
    resizeHandler = null;
  }

  // Save size before destroying (if not already saved by caller)
  if (attachWin && !attachWin.isDestroyed()) {
    const cs = attachWin.getContentSize();
    if (cs[0] && cs[0] > 0) savedMiniWidth = cs[0];
    if (cs[1] && cs[1] > 0) savedMiniHeight = cs[1];
  }

  isAttached = false;
  targetHwnd = null;
  targetInfo = null;
  attachNativeHwnd = null;

  callbacks?.destroyAttachWindow();

  if (notify) notifyStateChanged();
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

function updatePosition(tb: WindowBounds): void {
  const attachWin = callbacks?.getAttachWindow();
  if (!attachWin || attachWin.isDestroyed()) return;

  const sz = attachWin.getSize();
  const curW = sz[0] ?? 200;
  const curH = sz[1] ?? MINI_DEFAULT_HEIGHT;
  const { x, y } = calcPosition(tb, curW, curH);
  attachWin.setPosition(x, y);
}

export function computeAttachedBounds(outerW: number, outerH: number): Electron.Rectangle | null {
  if (!isAttached || !targetHwnd) return null;
  const attachWin = callbacks?.getAttachWindow();
  if (!attachWin || attachWin.isDestroyed()) return null;
  const tb = getAccurateWindowBounds(targetHwnd);
  if (!tb) return null;
  const { x, y } = calcPosition(tb, outerW, outerH);
  return { x, y, width: outerW, height: outerH };
}

function notifyStateChanged(): void {
  const state = getAttachState();
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('attach-state-changed', state);
  }
  const attachWin = callbacks?.getAttachWindow();
  if (attachWin && !attachWin.isDestroyed()) {
    attachWin.webContents.send('attach-state-changed', state);
  }
  callbacks?.onStateChanged();
}
