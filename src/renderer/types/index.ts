// Usage Provider
export type UsageProvider = 'claude' | 'codex';

// Window Attach Anchor Position
export type AnchorPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

// Attach Target (window to attach to)
export interface AttachTarget {
  processId: number;
  title: string;
  path: string;
}

// Attach State
export interface AttachState {
  attached: boolean;
  target: AttachTarget | null;
  anchor: AnchorPosition;
  targetProcessName: string;
}

// Usage Window Kind
export type UsageWindowKind = 'primary' | 'secondary';

// Display Mode
export type DisplayMode = 'used' | 'remaining';

// Layout Orientation
export type LayoutOrientation = 'vertical' | 'horizontal';

// Status Level
export type StatusLevel = 'normal' | 'warning' | 'danger';

// Usage Window (5h or 7d window)
export interface UsageWindow {
  kind: UsageWindowKind;
  usedPercent: number; // 0-100
  resetAt: string | null; // ISO 8601 string
  limitWindowSeconds: number;
}

// Usage Snapshot (from API)
export interface UsageSnapshot {
  provider: UsageProvider;
  fetchedAt: string; // ISO 8601 string
  primaryWindow: UsageWindow | null; // 5h window
  secondaryWindow: UsageWindow | null; // 7d window
}

// Token Usage Period
export interface TokenUsagePeriod {
  costUSD: number;
  totalTokens: number;
}

// Daily Usage Entry (for heatmap)
export interface DailyUsageEntry {
  date: string; // YYYY-MM-DD
  totalTokens: number;
}

// Token Usage Snapshot (from ccusage CLI)
export interface TokenUsageSnapshot {
  provider: UsageProvider;
  fetchedAt: string;
  today: TokenUsagePeriod;
  thisWeek: TokenUsagePeriod;
  thisMonth: TokenUsagePeriod;
  dailyUsage: DailyUsageEntry[];
}

// Settings
export interface Settings {
  providers: {
    claude: { enabled: boolean; orgId: string };
    codex: { enabled: boolean };
  };
  refreshIntervalMinutes: number;
  thresholds: {
    claude: { primary: StatusThresholds; secondary: StatusThresholds };
    codex: { primary: StatusThresholds; secondary: StatusThresholds };
  };
  displayMode: DisplayMode;
  layout: LayoutOrientation;
  alwaysOnTop: boolean;
  language: 'ja' | 'en';
  cliPaths: {
    npx: string;
    claude: string;
    codex: string;
  };
  ccusage: {
    claude: { enabled: boolean; additionalArgs: string };
    codex: { enabled: boolean; additionalArgs: string };
  };
  colors: {
    normal: string;
    warning: string;
    danger: string;
  };
  transparentWhenInactive: boolean;
  backgroundOpacity: number; // 0-100
  launchAtLogin: boolean;
  windowAttach: {
    enabled: boolean;
    targetProcessName: string; // e.g. "wezterm-gui"
    targetPath: string; // e.g. "C:\Program Files\WezTerm\wezterm-gui.exe"
    anchor: AnchorPosition;
    offsetX: number;
    offsetY: number;
    miniHeight?: number;
  };
}

export interface StatusThresholds {
  warningPercent: number;
  dangerPercent: number;
}

// Electron IPC channels
export type IpcChannel =
  | 'get-settings'
  | 'save-settings'
  | 'fetch-usage'
  | 'fetch-token-usage'
  | 'run-ccusage'
  | 'set-always-on-top'
  | 'get-usage-snapshot'
  | 'save-usage-snapshot'
  | 'app-quit'
  | 'refresh-now'
  | 'open-external'
  | 'set-window-opacity'
  | 'select-executable'
  | 'set-attach-target'
  | 'clear-attach-target'
  | 'detach-window'
  | 'reattach-window'
  | 'set-attach-anchor'
  | 'set-attach-offset'
  | 'get-attach-offset'
  | 'get-attach-state'
  | 'reset-attach-layout'
  | 'set-mini-width'
  | 'content-resized'
  | 'save-window-bounds'
  | 'resize-to-content'
  | 'open-login'
  | 'usage-updated'
  | 'token-usage-updated'
  | 'always-on-top-changed'
  | 'trigger-refresh'
  | 'attach-state-changed'
  | 'open-attach-settings';

// Usage fetch result (success returns snapshot fields, failure returns ok+error)
export type UsageFetchResult =
  | UsageSnapshot
  | { ok: false; error: string };

// Raw ccusage CLI output (totalCost for claude, costUSD for older codex versions)
export interface CCUsageRawEntry {
  date: string;
  totalTokens: number;
  totalCost?: number;
  costUSD?: number;
}

export interface CCUsageRawOutput {
  daily: CCUsageRawEntry[];
  totals: { totalTokens: number; totalCost?: number; costUSD?: number };
}

// Electron API exposed to renderer
export interface ElectronAPI {
  platform: string;
  getSettings: () => Promise<Partial<Settings> | null>;
  saveSettings: (settings: Settings) => Promise<void>;
  fetchUsage: (provider: UsageProvider) => Promise<UsageFetchResult | null>;
  runCcusage: (provider: UsageProvider) => Promise<CCUsageRawOutput | null>;
  openLogin: (provider: UsageProvider) => Promise<{ ok: boolean; snapshot?: UsageSnapshot; error?: string }>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  resizeToContent: (width: number | null, height: number, lockHeight?: boolean) => void;
  getUsageSnapshot: (provider: UsageProvider) => Promise<UsageSnapshot | null>;
  saveUsageSnapshot: (snapshot: UsageSnapshot) => Promise<void>;
  appQuit: () => void;
  refreshNow: () => void;
  openExternal: (url: string) => void;
  setWindowOpacity: (opacity: number) => void;
  setMiniWidth: (width: number) => void;
  saveWindowBounds: () => void;
  onUsageUpdated: (callback: (snapshot: UsageSnapshot) => void) => () => void;
  onTokenUsageUpdated: (callback: (snapshot: TokenUsageSnapshot) => void) => () => void;
  onAlwaysOnTopChanged: (callback: (value: boolean) => void) => () => void;
  onTriggerRefresh: (callback: () => void) => () => void;
  selectExecutable: () => Promise<{ processName: string; path: string } | null>;
  setAttachTarget: (processName: string, anchor: AnchorPosition) => Promise<void>;
  clearAttachTarget: () => Promise<void>;
  detachWindow: () => Promise<void>;
  reattachWindow: () => Promise<void>;
  setAttachAnchor: (anchor: AnchorPosition) => Promise<void>;
  setAttachOffset: (ox: number, oy: number) => Promise<void>;
  getAttachOffset: () => Promise<{ x: number; y: number }>;
  getAttachState: () => Promise<AttachState>;
  resetAttachLayout: () => Promise<void>;
  onAttachStateChanged: (callback: (state: AttachState) => void) => () => void;
  onOpenAttachSettings: (callback: () => void) => () => void;
  onContentResized: (callback: (width: number, height: number) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
