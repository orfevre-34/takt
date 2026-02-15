import { BrowserWindow } from 'electron';
import { log } from './logger';
import { getAccurateWindowBounds, isValidWindow, isAppWindow, isMinimized, watchWindowPosition, type WindowBounds } from './win32';

const { windowManager } = require('node-window-manager');

interface WindowInfo {
  id: number;
  processId: number;
  path: string;
  getTitle(): string;
}

export type AnchorPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

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

const MINI_MIN_HEIGHT = 20;
const MINI_MAX_HEIGHT = 150;
const MINI_DEFAULT_HEIGHT = 40;
const MARGIN_X = 12;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 16;
const SCAN_INTERVAL_MS = 2000;
// ウィンドウ存在チェック用（イベント駆動では検知できない消失を補完）
const ALIVE_CHECK_INTERVAL_MS = 1000;

let mainWindowRef: BrowserWindow | null = null;
let scanTimer: ReturnType<typeof setInterval> | null = null;
let aliveCheckTimer: ReturnType<typeof setInterval> | null = null;
let unwatchPosition: (() => void) | null = null;
let targetHwnd: number | null = null;
let targetInfo: AttachTarget | null = null;
let currentAnchor: AnchorPosition = 'top-right';
let configuredTargetProcessName = '';
let previousBounds: WindowBounds | null = null;
let previousAlwaysOnTop = false;
let previousMinSize: [number, number] = [380, 150];
let previousMaxSize: [number, number] = [10000, 10000];
let isAttached = false;
let wasHiddenByMinimize = false;
let userOffsetX = 0;
let userOffsetY = 0;
let resizeHandler: (() => void) | null = null;
let miniWidthResizeSuppressUntil = 0;
let userResizing = false;
let pendingMiniWidth: number | null = null;
let repositionTimer: ReturnType<typeof setTimeout> | null = null;

// アンカー側を固定するため、反対側エッジからのリサイズのみ許可
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

export function initWindowAttach(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;
}

let savedMiniHeight = 0;
let savedMiniWidth = 0;

export function startAutoAttach(targetProcessName: string, anchor: AnchorPosition, miniHeight?: number, miniWidth?: number): void {
  configuredTargetProcessName = targetProcessName.toLowerCase();
  currentAnchor = anchor;
  if (miniHeight && miniHeight > 0) savedMiniHeight = miniHeight;
  if (miniWidth && miniWidth > 0) savedMiniWidth = miniWidth;
  stopAll();

  if (!configuredTargetProcessName) return;

  log('startAutoAttach: watching for', configuredTargetProcessName);
  scanTimer = setInterval(() => tryAutoAttach(), SCAN_INTERVAL_MS);
  tryAutoAttach();
}

export function setTargetProcess(processName: string, anchor: AnchorPosition): void {
  if (isAttached) doDetach(false);
  startAutoAttach(processName, anchor);
  notifyStateChanged();
}

export function clearTargetProcess(): void {
  if (isAttached) doDetach(false);
  configuredTargetProcessName = '';
  stopAll();
  notifyStateChanged();
}

export function detach(): void {
  if (isAttached) doDetach(true);
  stopAll();
  log('detach: manual detach, target config kept:', configuredTargetProcessName);
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
  currentAnchor = anchor;
  if (isAttached && targetHwnd) {
    const bounds = getAccurateWindowBounds(targetHwnd);
    if (bounds) updatePosition(bounds);
  }
  notifyStateChanged();
}

export function setUserOffset(ox: number, oy: number): void {
  userOffsetX = ox;
  userOffsetY = oy;
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

  if (isAttached && mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.setMinimumSize(100, MINI_MIN_HEIGHT);
    mainWindowRef.setMaximumSize(2000, MINI_MAX_HEIGHT);
    mainWindowRef.setContentSize(200, MINI_DEFAULT_HEIGHT);
    if (targetHwnd) {
      const bounds = getAccurateWindowBounds(targetHwnd);
      if (bounds) updatePosition(bounds);
    }
  }
  log('resetLayout: offsets and mini size cleared');
}

export function setMiniWidth(width: number): void {
  if (!isAttached || !mainWindowRef || mainWindowRef.isDestroyed()) return;
  // ユーザーリサイズ中はキューに入れて後で適用
  if (isUserResizing()) {
    pendingMiniWidth = width;
    return;
  }
  const w = Math.max(40, Math.ceil(width));
  const [curW, curH] = mainWindowRef.getContentSize();

  const [minW, minH] = mainWindowRef.getMinimumSize();
  if (minW !== w || minH !== MINI_MIN_HEIGHT) {
    mainWindowRef.setMinimumSize(w, MINI_MIN_HEIGHT);
  }

  const [maxW, maxH] = mainWindowRef.getMaximumSize();
  if (maxW !== w || maxH !== MINI_MAX_HEIGHT) {
    mainWindowRef.setMaximumSize(w, MINI_MAX_HEIGHT);
  }

  if (curW !== w) {
    miniWidthResizeSuppressUntil = Date.now() + 80;
    // setBounds で位置とサイズを同時に適用（右アンカー時のちらつき防止）
    const outerSize = mainWindowRef.getSize();
    const cw = curW ?? 0;
    const ch = curH ?? MINI_DEFAULT_HEIGHT;
    const frameW = (outerSize[0] ?? 0) - cw;
    const frameH = (outerSize[1] ?? 0) - ch;
    const bounds = computeAttachedBounds(w + frameW, ch + frameH);
    if (bounds) {
      mainWindowRef.setBounds(bounds);
    } else {
      mainWindowRef.setContentSize(w, curH ?? MINI_DEFAULT_HEIGHT);
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
  if (!isAttached || !targetHwnd || !mainWindowRef || mainWindowRef.isDestroyed()) return;
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
}

// --- 内部 ---

function stopAll(): void {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  if (aliveCheckTimer) { clearInterval(aliveCheckTimer); aliveCheckTimer = null; }
  if (unwatchPosition) { unwatchPosition(); unwatchPosition = null; }
  if (repositionTimer) { clearTimeout(repositionTimer); repositionTimer = null; }
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
    let best: { hwnd: number; info: WindowInfo; area: number } | null = null;

    for (const win of windows) {
      try {
        if (getProcessName(win.path) !== configuredTargetProcessName) continue;
        if (!isAppWindow(win.id)) continue;
        if (isMinimized(win.id)) continue;
        const bounds = getAccurateWindowBounds(win.id);
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue;
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

function tryAutoAttach(): void {
  if (!configuredTargetProcessName || !mainWindowRef || mainWindowRef.isDestroyed()) return;
  if (isAttached) return;

  const found = findTargetHwnd();
  if (!found) return;

  const { hwnd, info } = found;
  const bounds = getAccurateWindowBounds(hwnd);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

  let title: string;
  try { title = info.getTitle() || configuredTargetProcessName; } catch { title = configuredTargetProcessName; }

  log('tryAutoAttach: found', title, 'hwnd:', hwnd, 'bounds:', JSON.stringify(bounds));

  previousBounds = mainWindowRef.getBounds();
  previousAlwaysOnTop = mainWindowRef.isAlwaysOnTop();
  previousMinSize = mainWindowRef.getMinimumSize() as [number, number];
  previousMaxSize = mainWindowRef.getMaximumSize() as [number, number];

  targetHwnd = hwnd;
  targetInfo = { processId: info.processId, title, path: info.path || '' };
  isAttached = true;
  wasHiddenByMinimize = false;

  const initH = savedMiniHeight > 0 ? Math.max(MINI_MIN_HEIGHT, Math.min(MINI_MAX_HEIGHT, savedMiniHeight)) : MINI_DEFAULT_HEIGHT;
  const initW = savedMiniWidth > 0 ? Math.max(40, savedMiniWidth) : 200;
  log('tryAutoAttach: initSize content=', initW, initH, 'saved=', savedMiniWidth, savedMiniHeight);
  mainWindowRef.setMinimumSize(100, MINI_MIN_HEIGHT);
  mainWindowRef.setMaximumSize(2000, MINI_MAX_HEIGHT);
  mainWindowRef.setContentSize(initW, initH);
  mainWindowRef.setAlwaysOnTop(true, 'screen-saver');

  if (!mainWindowRef.isVisible()) mainWindowRef.show();

  log('tryAutoAttach: after setContentSize outer=', mainWindowRef.getSize(), 'content=', mainWindowRef.getContentSize());
  updatePosition(bounds);

  resizeHandler = () => {
    if (isMiniWidthResizeSuppressed()) return;
    if (isUserResizing()) return;
    scheduleReposition();
  };
  mainWindowRef.on('resize', resizeHandler);

  // スキャン停止 → イベント駆動追従 + 存在チェックポーリング
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }

  unwatchPosition = watchWindowPosition(
    hwnd,
    (b) => updatePosition(b),
    () => {
      // ターゲット最小化 → 通常ウィンドウに戻してスキャン再開
      // コールバック内から unwatchPosition を直接呼ぶと koffi が不安定になるため nextTick で遅延
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        const cs = mainWindowRef.getContentSize();
        if (cs[0] && cs[0] > 0) savedMiniWidth = cs[0];
        if (cs[1] && cs[1] > 0) savedMiniHeight = cs[1];
      }
      process.nextTick(() => {
        const procName = configuredTargetProcessName;
        const anchor = currentAnchor;
        doDetach(true);
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.show();
        }
        // 最小化アニメーション完了を待ってからスキャン開始
        setTimeout(() => startAutoAttach(procName, anchor), 500);
      });
    },
    () => {},
  );

  aliveCheckTimer = setInterval(() => {
    if (!targetHwnd || !isValidWindow(targetHwnd)) {
      log('aliveCheck: target disappeared');
      doDetach(true);
      startAutoAttach(configuredTargetProcessName, currentAnchor);
    }
  }, ALIVE_CHECK_INTERVAL_MS);

  log('attached to', title, 'hwnd:', hwnd);
  notifyStateChanged();
}

function doDetach(notify: boolean): void {
  if (aliveCheckTimer) { clearInterval(aliveCheckTimer); aliveCheckTimer = null; }
  if (unwatchPosition) { unwatchPosition(); unwatchPosition = null; }
  if (resizeHandler && mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.removeListener('resize', resizeHandler);
    resizeHandler = null;
  }
  if (repositionTimer) { clearTimeout(repositionTimer); repositionTimer = null; }

  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.setMinimumSize(previousMinSize[0], previousMinSize[1]);
    mainWindowRef.setMaximumSize(previousMaxSize[0], previousMaxSize[1]);
    mainWindowRef.setAlwaysOnTop(previousAlwaysOnTop, 'normal');

    if (previousBounds) {
      mainWindowRef.setBounds(previousBounds);
      previousBounds = null;
    }

    if (wasHiddenByMinimize) {
      mainWindowRef.show();
      wasHiddenByMinimize = false;
    }
  }

  targetHwnd = null;
  targetInfo = null;
  isAttached = false;

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
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;

  const sz = mainWindowRef.getSize();
  const curW = sz[0] ?? 200;
  const curH = sz[1] ?? MINI_DEFAULT_HEIGHT;
  log('updatePosition: target=', JSON.stringify(tb), 'mySize=', curW, curH, 'offset=', userOffsetX, userOffsetY);
  const { x, y } = calcPosition(tb, curW, curH);
  mainWindowRef.setPosition(x, y);
}

export function computeAttachedBounds(outerW: number, outerH: number): Electron.Rectangle | null {
  if (!isAttached || !targetHwnd || !mainWindowRef || mainWindowRef.isDestroyed()) return null;
  const tb = getAccurateWindowBounds(targetHwnd);
  if (!tb) return null;
  const { x, y } = calcPosition(tb, outerW, outerH);
  return { x, y, width: outerW, height: outerH };
}

function notifyStateChanged(): void {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('attach-state-changed', getAttachState());
  }
}
