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
  alwaysOnTop: false,
  language: 'ja',
  cliPaths: { npx: 'npx', claude: 'claude', codex: 'codex' },
  ccusage: {
    claude: { enabled: false, additionalArgs: '' },
    codex: { enabled: false, additionalArgs: '' },
  },
  colors: { normal: '#22c55e', warning: '#f59e0b', danger: '#ef4444' },
  transparentWhenInactive: true,
};

export function useSettings() {
  const { settings, setSettings } = useAppStore();

  useEffect(() => {
    window.electronAPI
      ?.getSettings()
      .then((saved) => {
        setSettings({ ...DEFAULT_SETTINGS, ...saved });
      })
      .catch(() => {
        setSettings(DEFAULT_SETTINGS);
      });
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
