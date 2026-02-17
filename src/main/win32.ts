import koffi from 'koffi';
import { log } from './logger';

if (process.platform !== 'win32') {
  throw new Error('win32.ts is only supported on Windows');
}

const user32 = koffi.load('user32.dll');
const dwmapi = koffi.load('dwmapi.dll');

const RECT = koffi.struct('RECT', {
  left: 'int32',
  top: 'int32',
  right: 'int32',
  bottom: 'int32',
});

const WinEventProcProto = koffi.proto(
  'void __stdcall WinEventProcCb(int64 hWinEventHook, uint32 event, int64 hwnd, int32 idObject, int32 idChild, uint32 dwEventThread, uint32 dwmsEventTime)',
);

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

const GetForegroundWindow_fn = user32.func(
  'int64 __stdcall GetForegroundWindow()',
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

const SetWindowPos_fn = user32.func(
  'bool __stdcall SetWindowPos(int64 hwnd, int64 hWndInsertAfter, int32 X, int32 Y, int32 cx, int32 cy, uint32 uFlags)',
);

const GetWindow_fn = user32.func(
  'int64 __stdcall GetWindow(int64 hwnd, uint32 uCmd)',
);

const GetWindowLongPtrW_fn = user32.func(
  'int64 __stdcall GetWindowLongPtrW(int64 hwnd, int32 nIndex)',
);

const GW_HWNDPREV = 3;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const HWND_TOPMOST = -1;
const HWND_NOTOPMOST = -2;
const HWND_TOP = 0;
const WS_EX_TOPMOST = 0x00000008;

const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const EVENT_OBJECT_DESTROY = 0x8001;
const EVENT_OBJECT_LOCATIONCHANGE = 0x800b;
const EVENT_OBJECT_SHOW = 0x8002;
const EVENT_OBJECT_HIDE = 0x8003;
const EVENT_SYSTEM_FOREGROUND = 0x0003;
const WINEVENT_OUTOFCONTEXT = 0x0000;
const WINEVENT_SKIPOWNPROCESS = 0x0002;
const OBJID_WINDOW = 0;
const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_NOACTIVATE = 0x08000000;

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getAccurateWindowBounds(hwnd: number): WindowBounds | null {
  if (!IsWindow_fn(hwnd)) return null;

  const rect = { left: 0, top: 0, right: 0, bottom: 0 };
  const hr = DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, rect, 16);

  if (hr !== 0) {
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

export function getForegroundWindow(): number {
  return GetForegroundWindow_fn();
}

export function getWindowProcessId(hwnd: number): number {
  const pidOut = [0];
  GetWindowThreadProcessId_fn(hwnd, pidOut);
  return pidOut[0]!;
}

export function isMinimized(hwnd: number): boolean {
  return IsIconic_fn(hwnd);
}

export function isValidWindow(hwnd: number): boolean {
  return IsWindow_fn(hwnd);
}

export function isAppWindow(hwnd: number): boolean {
  if (!IsWindowVisible_fn(hwnd)) return false;
  const exStyle = GetWindowLongW_fn(hwnd, GWL_EXSTYLE);
  if (exStyle & WS_EX_TOOLWINDOW) return false;
  if (exStyle & WS_EX_NOACTIVATE) return false;
  return true;
}

export function setTopmost(hwnd: number): void {
  const ok = SetWindowPos_fn(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
  if (!ok) log('SetWindowPos(TOPMOST) failed for hwnd:', hwnd);
}

export function placeAboveTarget(hwnd: number, targetHwnd: number): void {
  const ok1 = SetWindowPos_fn(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
  if (!ok1) {
    log('SetWindowPos(NOTOPMOST) failed for hwnd:', hwnd);
    return;
  }

  const prev = GetWindow_fn(targetHwnd, GW_HWNDPREV);
  let insertAfter = HWND_TOP;
  if (prev && prev !== hwnd) {
    const exStyle = Number(GetWindowLongPtrW_fn(prev, GWL_EXSTYLE));
    if (!(exStyle & WS_EX_TOPMOST)) {
      insertAfter = prev;
    }
  }

  const ok2 = SetWindowPos_fn(hwnd, insertAfter, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
  if (!ok2) log('SetWindowPos(aboveTarget) failed for hwnd:', hwnd, 'insertAfter:', insertAfter);
}

export function watchForegroundChanges(onForegroundChanged: (fgHwnd: number) => void): () => void {
  const callback = koffi.register(
    (
      _hook: number,
      _event: number,
      hwnd: number,
    ) => {
      if (hwnd) onForegroundChanged(hwnd);
    },
    koffi.pointer(WinEventProcProto),
  );

  const hook = SetWinEventHook(
    EVENT_SYSTEM_FOREGROUND,
    EVENT_SYSTEM_FOREGROUND,
    0,
    callback,
    0,
    0,
    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
  );
  if (!hook) log('SetWinEventHook(FOREGROUND) failed');

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    if (hook) UnhookWinEvent(hook);
    koffi.unregister(callback);
  };
}

export function watchWindowPosition(
  targetHwnd: number,
  onMove: (bounds: WindowBounds) => void,
  onMinimize?: () => void,
  onRestore?: () => void,
  onDestroy?: () => void,
): () => void {
  const pidOut = [0];
  GetWindowThreadProcessId_fn(targetHwnd, pidOut);
  const targetPid = pidOut[0]!;
  if (!targetPid) return () => {};

  let cleaned = false;

  const callback = koffi.register(
    (
      _hook: number,
      event: number,
      hwnd: number,
      idObject: number,
      idChild: number,
    ) => {
      if (hwnd !== targetHwnd || idObject !== OBJID_WINDOW || idChild !== 0) return;

      if (event === EVENT_OBJECT_DESTROY) {
        if (!cleaned) onDestroy?.();
        return;
      }

      if (IsIconic_fn(hwnd)) {
        onMinimize?.();
        return;
      }

      const bounds = getAccurateWindowBounds(hwnd);
      if (bounds) {
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

  const hook = SetWinEventHook(
    EVENT_OBJECT_LOCATIONCHANGE,
    EVENT_OBJECT_LOCATIONCHANGE,
    0,
    callback,
    targetPid,
    0,
    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
  );
  if (!hook) log('SetWinEventHook(LOCATIONCHANGE) failed for pid:', targetPid);

  const hookShowHide = SetWinEventHook(
    EVENT_OBJECT_SHOW,
    EVENT_OBJECT_HIDE,
    0,
    callback,
    targetPid,
    0,
    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
  );
  if (!hookShowHide) log('SetWinEventHook(SHOW/HIDE) failed for pid:', targetPid);

  const hookDestroy = SetWinEventHook(
    EVENT_OBJECT_DESTROY,
    EVENT_OBJECT_DESTROY,
    0,
    callback,
    targetPid,
    0,
    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
  );
  if (!hookDestroy) log('SetWinEventHook(DESTROY) failed for pid:', targetPid);

  return () => {
    if (cleaned) return;
    cleaned = true;
    if (hook) UnhookWinEvent(hook);
    if (hookShowHide) UnhookWinEvent(hookShowHide);
    if (hookDestroy) UnhookWinEvent(hookDestroy);
    koffi.unregister(callback);
  };
}
