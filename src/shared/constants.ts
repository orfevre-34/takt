export const APP_NAME = 'Takt';

export const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5分
export const MIN_REFRESH_INTERVAL_MINUTES = 1;
export const MAX_REFRESH_INTERVAL_MINUTES = 10;

export const USAGE_THRESHOLDS = {
  warning: 70,
  danger: 90,
} as const;

export const USAGE_LIMIT_SECONDS = {
  fiveHours: 5 * 60 * 60,
  sevenDays: 7 * 24 * 60 * 60,
} as const;

export const API_URLS = {
  claude: 'https://claude.ai/api/organizations',
  codex: 'https://chatgpt.com/backend-api/wham/usage',
} as const;

export const API_TIMEOUT_MS = 15_000;

export const DEFAULT_SETTINGS = {
  providers: {
    claude: { enabled: true, orgId: '' },
    codex: { enabled: false },
  },
  refreshIntervalMinutes: 5,
  thresholds: {
    claude: {
      primary: { warningPercent: 70, dangerPercent: 90 },
      secondary: { warningPercent: 70, dangerPercent: 90 },
    },
    codex: {
      primary: { warningPercent: 70, dangerPercent: 90 },
      secondary: { warningPercent: 70, dangerPercent: 90 },
    },
  },
  displayMode: 'used' as const,
  layout: 'vertical' as const,
  alwaysOnTop: false,
  language: 'ja' as const,
  cliPaths: { npx: 'npx', claude: 'claude', codex: 'codex' },
  ccusage: {
    claude: { enabled: false, additionalArgs: '' },
    codex: { enabled: false, additionalArgs: '' },
  },
  colors: {
    normal: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
  launchAtLogin: false,
} as const;

export const SNAPSHOT_FILES = {
  settings: 'settings.json',
  usageClaude: 'usage_snapshot_claude.json',
  usageCodex: 'usage_snapshot.json',
  tokenClaude: 'token_usage_claude.json',
  tokenCodex: 'token_usage_codex.json',
} as const;

export const CCUSAGE_COMMANDS = {
  claude: (npxPath: string) => `${npxPath} -y ccusage@latest daily`,
  codex: (npxPath: string) => `${npxPath} -y @ccusage/codex@latest daily`,
} as const;
