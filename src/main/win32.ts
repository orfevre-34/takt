// src/main/win32.ts — Win32 API bindings via koffi
// DwmGetWindowAttribute で正確な bounds 取得
// SetWinEventHook でイベント駆動のウィンドウ追従
import koffi from 'koffi';

// ─── DLL ─────────────────────────────────────────────────
const user32 = koffi.load('user32.dll');
const dwmapi = koffi.load('dwmapi.dll');

// ─── Structs ─────────────────────────────────────────────
const RECT = koffi.struct('RECT', {
  left: 'int32',
  top: 'int32',
  right: 'int32',
  bottom: 'int32',
});

// ─── Callback proto ──────────────────────────────────────
const WinEventProcProto = koffi.proto(
  'void __stdcall WinEventProcCb(int64 hWinEventHook, uint32 event, int64 hwnd, int32 idObject, int32 idChild, uint32 dwEventThread, uint32 dwmsEventTime)',
);

// ─── Functions ───────────────────────────────────────────
const DwmGetWindowAttribute = dwmapi.func(
  'long __stdcall DwmGetWindowAttribute(int64 hwnd, uint32 dwAttribute, _Out_ RECT *pvAttribute, uint32 cbAttribute)',
);

const GetWindowRect_fn = user32.func(
  'bool __stdcall GetWindowRect(int64 hwnd, _Out_ RECT *lpRect)',
);

const SetWinEventHook = user32.func(
  'int64 __stdcall SetWinEventHook(uint32 eventMin, uint32 eventMax, int64 hmodWinEventProc, WinEventProcCb *pfnWinEventProc, uint32 idProcess, uint32 idThread, uint32 dwFlags)',
);

const UnhookWinEvent = user32.func(
  'bool __stdcall UnhookWinEvent(int64 hWinEventHook)',
);

const GetWindowThreadProcessId_fn = user32.func(
  'uint32 __stdcall GetWindowThreadProcessId(int64 hwnd, _Out_ uint32 *lpdwProcessId)',
);

const IsWindow_fn = user32.func(
  'bool __stdcall IsWindow(int64 hwnd)',
);

const IsIconic_fn = user32.func(
  'bool __stdcall IsIconic(int64 hwnd)',
);

const IsWindowVisible_fn = user32.func(
  'bool __stdcall IsWindowVisible(int64 hwnd)',
);

const GetWindowLongW_fn = user32.func(
  'int32 __stdcall GetWindowLongW(int64 hwnd, int32 nIndex)',
);

// ─── Constants ───────────────────────────────────────────
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const EVENT_OBJECT_LOCATIONCHANGE = 0x800b;
const EVENT_OBJECT_SHOW = 0x8002;
const EVENT_OBJECT_HIDE = 0x8003;
const WINEVENT_OUTOFCONTEXT = 0x0000;
const WINEVENT_SKIPOWNPROCESS = 0x0002;
const OBJID_WINDOW = 0;
const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_NOACTIVATE = 0x08000000;

// ─── Types ───────────────────────────────────────────────
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Public API ──────────────────────────────────────────

/**
 * DWMシャドウを除いた正確なウィンドウ bounds を取得
 */
export function getAccurateWindowBounds(hwnd: number): WindowBounds | null {
  if (!IsWindow_fn(hwnd)) return null;

  const rect = { left: 0, top: 0, right: 0, bottom: 0 };
  const hr = DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, rect, 16);

  if (hr !== 0) {
    // フォールバック: GetWindowRect（DWMシャドウ含む）
    const ok = GetWindowRect_fn(hwnd, rect);
    if (!ok) return null;
  }

  return {
    x: rect.left,
    y: rect.top,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
  };
}

/**
 * ウィンドウが最小化されているか
 */
export function isMinimized(hwnd: number): boolean {
  return IsIconic_fn(hwnd);
}

/**
 * ウィンドウが存在するか
 */
export function isValidWindow(hwnd: number): boolean {
  return IsWindow_fn(hwnd);
}

/**
 * ユーザー操作対象のアプリケーションウィンドウか判定
 */
export function isAppWindow(hwnd: number): boolean {
  if (!IsWindowVisible_fn(hwnd)) return false;
  const exStyle = GetWindowLongW_fn(hwnd, GWL_EXSTYLE);
  if (exStyle & WS_EX_TOOLWINDOW) return false;
  if (exStyle & WS_EX_NOACTIVATE) return false;
  return true;
}

/**
 * ウィンドウの位置/サイズ変更をイベント駆動で監視
 * 返り値: クリーンアップ関数
 */
export function watchWindowPosition(
  targetHwnd: number,
  onMove: (bounds: WindowBounds) => void,
  onMinimize?: () => void,
  onRestore?: () => void,
): () => void {
  const pidOut = [0];
  GetWindowThreadProcessId_fn(targetHwnd, pidOut);
  const targetPid = pidOut[0]!;

  const callback = koffi.register(
    (
      _hook: number,
      _event: number,
      hwnd: number,
      idObject: number,
    ) => {
      if (hwnd !== targetHwnd || idObject !== OBJID_WINDOW) return;

      // 最小化チェック
      if (IsIconic_fn(hwnd)) {
        onMinimize?.();
        return;
      }

      const bounds = getAccurateWindowBounds(hwnd);
      if (bounds) {
        // 幅・高さ0の場合も最小化扱い
        if (bounds.width <= 0 || bounds.height <= 0) {
          onMinimize?.();
          return;
        }
        onRestore?.();
        onMove(bounds);
      }
    },
    koffi.pointer(WinEventProcProto),
  );

  // LOCATIONCHANGE + SHOW/HIDE をフック
  const hook = SetWinEventHook(
    EVENT_OBJECT_LOCATIONCHANGE,
    EVENT_OBJECT_LOCATIONCHANGE,
    0,
    callback,
    targetPid,
    0,
    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
  );

  const hookShowHide = SetWinEventHook(
    EVENT_OBJECT_SHOW,
    EVENT_OBJECT_HIDE,
    0,
    callback,
    targetPid,
    0,
    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
  );

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    if (hook) UnhookWinEvent(hook);
    if (hookShowHide) UnhookWinEvent(hookShowHide);
    koffi.unregister(callback);
  };
}
