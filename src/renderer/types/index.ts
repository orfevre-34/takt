// Usage Provider
export type UsageProvider = 'claude' | 'codex';

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

// Claude API Response
export interface ClaudeUsageResponse {
  five_hour?: { utilization?: number; resets_at?: string };
  seven_day?: { utilization?: number; resets_at?: string };
  seven_day_oauth_apps?: { utilization?: number; resets_at?: string };
  seven_day_opus?: { utilization?: number; resets_at?: string };
  seven_day_sonnet?: { utilization?: number; resets_at?: string };
  iguana_necktie?: { utilization?: number; resets_at?: string };
  extra_usage?: { utilization?: number; resets_at?: string };
}

// Codex API Response
export interface CodexUsageResponse {
  plan_type?: string;
  rate_limit?: {
    primary_window?: {
      used_percent?: number;
      limit_window_seconds?: number;
      reset_after_seconds?: number;
      reset_at?: number; // unix timestamp
    };
    secondary_window?: {
      used_percent?: number;
      limit_window_seconds?: number;
      reset_after_seconds?: number;
      reset_at?: number;
    };
  };
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

// ccusage Claude CLI Response
export interface CCUsageClaudeResponse {
  daily: Array<{ date: string; totalTokens: number; totalCost: number }>;
  totals: { totalTokens: number; totalCost: number };
}

// ccusage Codex CLI Response
export interface CCUsageCodexResponse {
  daily: Array<{ date: string; totalTokens: number; costUSD: number }>;
  totals: { totalTokens: number; costUSD: number };
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
  | 'set-window-opacity';

// Electron API exposed to renderer
export interface ElectronAPI {
  platform: string;
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<void>;
  fetchUsage: (provider: UsageProvider) => Promise<UsageSnapshot | null>;
  runCcusage: (provider: UsageProvider) => Promise<TokenUsageSnapshot | null>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  resizeToContent: (width: number | null, height: number, lockHeight?: boolean) => void;
  getUsageSnapshot: (provider: UsageProvider) => Promise<UsageSnapshot | null>;
  saveUsageSnapshot: (snapshot: UsageSnapshot) => Promise<void>;
  appQuit: () => void;
  refreshNow: () => void;
  openExternal: (url: string) => void;
  setWindowOpacity: (opacity: number) => void;
  saveWindowBounds: () => void;
  onUsageUpdated: (callback: (snapshot: UsageSnapshot) => void) => () => void;
  onTokenUsageUpdated: (callback: (snapshot: TokenUsageSnapshot) => void) => () => void;
  onAlwaysOnTopChanged: (callback: (value: boolean) => void) => () => void;
  onTriggerRefresh: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
