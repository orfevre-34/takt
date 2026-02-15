import { useEffect } from 'react';
import { useAppStore } from '../store';
import type { Settings } from '../types';

const DEFAULT_SETTINGS: Settings = {
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
  displayMode: 'used',
  layout: 'vertical',
  alwaysOnTop: false,
  launchAtLogin: false,
  language: 'ja',
  cliPaths: { npx: 'npx', claude: 'claude', codex: 'codex' },
  ccusage: {
    claude: { enabled: false, additionalArgs: '' },
    codex: { enabled: false, additionalArgs: '' },
  },
  colors: { normal: '#22c55e', warning: '#f59e0b', danger: '#ef4444' },
  transparentWhenInactive: true,
  backgroundOpacity: 80,
  windowAttach: {
    enabled: false,
    targetProcessName: '',
    targetPath: '',
    anchor: 'top-right' as const,
    offsetX: 0,
    offsetY: 0,
    miniHeight: 48,
    responsiveness: 'normal',
  },
};

function deepMergeSettings(saved: Partial<Settings>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    providers: {
      claude: { ...DEFAULT_SETTINGS.providers.claude, ...saved.providers?.claude },
      codex: { ...DEFAULT_SETTINGS.providers.codex, ...saved.providers?.codex },
    },
    thresholds: {
      claude: {
        primary: { ...DEFAULT_SETTINGS.thresholds.claude.primary, ...saved.thresholds?.claude?.primary },
        secondary: { ...DEFAULT_SETTINGS.thresholds.claude.secondary, ...saved.thresholds?.claude?.secondary },
      },
      codex: {
        primary: { ...DEFAULT_SETTINGS.thresholds.codex.primary, ...saved.thresholds?.codex?.primary },
        secondary: { ...DEFAULT_SETTINGS.thresholds.codex.secondary, ...saved.thresholds?.codex?.secondary },
      },
    },
    cliPaths: { ...DEFAULT_SETTINGS.cliPaths, ...saved.cliPaths },
    ccusage: {
      claude: { ...DEFAULT_SETTINGS.ccusage.claude, ...saved.ccusage?.claude },
      codex: { ...DEFAULT_SETTINGS.ccusage.codex, ...saved.ccusage?.codex },
    },
    colors: { ...DEFAULT_SETTINGS.colors, ...saved.colors },
    windowAttach: { ...DEFAULT_SETTINGS.windowAttach, ...saved.windowAttach },
  };
}

export function useSettings() {
  const { settings, setSettings } = useAppStore();

  useEffect(() => {
    window.electronAPI
      ?.getSettings()
      .then((saved) => {
        setSettings(deepMergeSettings(saved ?? {}));
      })
      .catch(() => {
        setSettings(DEFAULT_SETTINGS);
      });
  }, [setSettings]);

  // トレイメニューからの alwaysOnTop 変更を受け取る
  useEffect(() => {
    const cleanup = window.electronAPI?.onAlwaysOnTopChanged((value: boolean) => {
      const current = useAppStore.getState().settings;
      if (current) {
        const updated = { ...current, alwaysOnTop: value };
        setSettings(updated);
        window.electronAPI?.saveSettings(updated);
      }
    });
    return cleanup;
  }, [setSettings]);

  const updateSettings = async (newSettings: Settings) => {
    setSettings(newSettings);
    await window.electronAPI?.saveSettings(newSettings);
    if (newSettings.alwaysOnTop !== settings?.alwaysOnTop) {
      await window.electronAPI?.setAlwaysOnTop(newSettings.alwaysOnTop);
    }
  };

  return { settings: settings ?? DEFAULT_SETTINGS, updateSettings };
}
