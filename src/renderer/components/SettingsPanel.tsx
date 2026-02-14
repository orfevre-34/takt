import type { Settings, DisplayMode, LayoutOrientation } from '../types';

interface SettingsPanelProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, onSave, onClose }: SettingsPanelProps) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onSave({ ...settings, [key]: value });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 rounded-xl border border-zinc-700 w-[360px] max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-zinc-100">Settings</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Providers */}
        <section className="mb-4">
          <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
            Providers
          </h3>
          <label className="flex items-center gap-2 mb-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={settings.providers.claude.enabled}
              onChange={(e) =>
                update('providers', {
                  ...settings.providers,
                  claude: { ...settings.providers.claude, enabled: e.target.checked },
                })
              }
              className="accent-green-500"
            />
            Claude Code
          </label>
          {settings.providers.claude.enabled && (
            <div className="ml-6 mb-2 space-y-1.5">
              <button
                onClick={() => (window.electronAPI as any)?.openLogin?.('claude')}
                className="w-full bg-orange-700/30 hover:bg-orange-700/50 text-orange-300 text-xs font-medium py-1.5 rounded border border-orange-700/40 transition-colors"
              >
                Log in to Claude.ai
              </button>
              <input
                type="text"
                value={settings.providers.claude.orgId}
                onChange={(e) =>
                  update('providers', {
                    ...settings.providers,
                    claude: { ...settings.providers.claude, orgId: e.target.value },
                  })
                }
                placeholder="Organization ID (auto-detected)"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={settings.providers.codex.enabled}
              onChange={(e) =>
                update('providers', {
                  ...settings.providers,
                  codex: { enabled: e.target.checked },
                })
              }
              className="accent-green-500"
            />
            Codex
          </label>
          {settings.providers.codex.enabled && (
            <div className="ml-6 mt-1.5">
              <button
                onClick={() => (window.electronAPI as any)?.openLogin?.('codex')}
                className="w-full bg-orange-700/30 hover:bg-orange-700/50 text-orange-300 text-xs font-medium py-1.5 rounded border border-orange-700/40 transition-colors"
              >
                Log in to ChatGPT
              </button>
            </div>
          )}
        </section>

        {/* Display */}
        <section className="mb-4">
          <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
            Display
          </h3>
          <div className="flex gap-2 mb-2">
            {(['used', 'remaining'] as const).map((mode: DisplayMode) => (
              <button
                key={mode}
                onClick={() => update('displayMode', mode)}
                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  settings.displayMode === mode
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {mode === 'used' ? 'Used' : 'Remaining'}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mb-2">
            {(['vertical', 'horizontal'] as const).map((mode: LayoutOrientation) => (
              <button
                key={mode}
                onClick={() => update('layout', mode)}
                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  settings.layout === mode
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {mode === 'vertical' ? 'Vertical' : 'Horizontal'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={settings.alwaysOnTop}
              onChange={(e) => update('alwaysOnTop', e.target.checked)}
              className="accent-green-500"
            />
            Always on Top
          </label>
          <label className="flex items-center gap-2 mt-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={settings.transparentWhenInactive}
              onChange={(e) => update('transparentWhenInactive', e.target.checked)}
              className="accent-green-500"
            />
            Transparent When Inactive
          </label>
          <div className={`mt-2 ${settings.transparentWhenInactive ? '' : 'opacity-40 pointer-events-none'}`}>
            <label className="text-xs text-zinc-400 mb-1 block">
              Background Opacity
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={settings.backgroundOpacity}
                onChange={(e) => update('backgroundOpacity', Number(e.target.value))}
                className="flex-1 accent-green-500"
                disabled={!settings.transparentWhenInactive}
              />
              <span className="text-xs text-zinc-400 w-8 text-right">
                {settings.backgroundOpacity}%
              </span>
            </div>
          </div>
        </section>

        {/* Refresh */}
        <section className="mb-4">
          <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
            Refresh Interval
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={10}
              value={settings.refreshIntervalMinutes}
              onChange={(e) => update('refreshIntervalMinutes', Number(e.target.value))}
              className="flex-1 accent-green-500"
            />
            <span className="text-xs text-zinc-400 w-8 text-right">
              {settings.refreshIntervalMinutes}m
            </span>
          </div>
        </section>

        {/* ccusage */}
        <section className="mb-4">
          <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
            ccusage (Token Usage)
          </h3>
          <label className="flex items-center gap-2 mb-1 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={settings.ccusage.claude.enabled}
              onChange={(e) =>
                update('ccusage', {
                  ...settings.ccusage,
                  claude: { ...settings.ccusage.claude, enabled: e.target.checked },
                })
              }
              className="accent-green-500"
            />
            Claude (ccusage)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={settings.ccusage.codex.enabled}
              onChange={(e) =>
                update('ccusage', {
                  ...settings.ccusage,
                  codex: { ...settings.ccusage.codex, enabled: e.target.checked },
                })
              }
              className="accent-green-500"
            />
            Codex (@ccusage/codex)
          </label>
        </section>

        {/* CLI Paths */}
        <section className="mb-4">
          <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
            CLI Paths
          </h3>
          {(['npx', 'claude', 'codex'] as const).map((key) => (
            <div key={key} className="mb-2">
              <label className="text-[10px] text-zinc-500 mb-0.5 block">{key}</label>
              <input
                type="text"
                value={settings.cliPaths[key]}
                onChange={(e) =>
                  update('cliPaths', { ...settings.cliPaths, [key]: e.target.value })
                }
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
              />
            </div>
          ))}
        </section>

      </div>
    </div>
  );
}
