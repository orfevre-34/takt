import { useState, useEffect } from 'react';
import type { Settings, DisplayMode, LayoutOrientation, AttachState, AnchorPosition } from '../types';

interface SettingsPanelProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, onSave, onClose }: SettingsPanelProps) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onSave({ ...settings, [key]: value });
  };

  // Window Attach state
  const windowAttach = settings.windowAttach ?? {
    enabled: false,
    targetProcessName: '',
    targetPath: '',
    anchor: 'top-right' as const,
    offsetX: 0,
    offsetY: 0,
    miniHeight: 48,
  };
  const [attachState, setAttachState] = useState<AttachState>({ attached: false, target: null, anchor: windowAttach.anchor, targetProcessName: '' });

  useEffect(() => {
    window.electronAPI?.getAttachState?.().then(setAttachState).catch(() => {});
    const cleanup = window.electronAPI?.onAttachStateChanged?.((state: AttachState) => setAttachState(state));
    return cleanup;
  }, []);

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
          <label className="flex items-center gap-2 mt-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={settings.launchAtLogin}
              onChange={(e) => update('launchAtLogin', e.target.checked)}
              className="accent-green-500"
            />
            Launch at Login
          </label>
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

        {/* Window Attach */}
        <section className="mb-4">
          <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
            Window Attach
          </h3>

          {/* Target executable */}
          <div className="space-y-2">
            <label className="text-[10px] text-zinc-500 block">Target Application</label>
            <div className="flex gap-1 items-center">
              <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 truncate min-w-0">
                {windowAttach.targetProcessName
                  ? <span>{windowAttach.targetProcessName}<span className="text-zinc-500 ml-1">(.exe)</span></span>
                  : <span className="text-zinc-500">Not selected</span>
                }
              </div>
              <button
                onClick={async () => {
                  const result = await window.electronAPI?.selectExecutable?.();
                  if (result) {
                    const updated = { ...windowAttach, enabled: true, targetProcessName: result.processName, targetPath: result.path };
                    update('windowAttach', updated);
                    await window.electronAPI?.setAttachTarget?.(result.processName, updated.anchor);
                  }
                }}
                className="px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-400 hover:text-zinc-200 transition-colors whitespace-nowrap"
              >
                Browse...
              </button>
            </div>

            {/* Status */}
            {windowAttach.enabled && windowAttach.targetProcessName && (
              <div className="flex items-center gap-2 text-xs">
                <span className={`inline-block w-2 h-2 rounded-full ${attachState.attached ? 'bg-green-500' : 'bg-zinc-600'}`} />
                <span className="text-zinc-400">
                  {attachState.attached
                    ? `Attached to ${attachState.target?.title ?? windowAttach.targetProcessName}`
                    : 'Waiting for target...'}
                </span>
              </div>
            )}

            {/* Re-attach / Disable */}
            {windowAttach.enabled && windowAttach.targetProcessName && !attachState.attached && (
              <button
                onClick={() => window.electronAPI?.reattachWindow?.()}
                className="w-full bg-green-700/30 hover:bg-green-700/50 text-green-300 text-xs font-medium py-1.5 rounded border border-green-700/40 transition-colors"
              >
                Re-attach
              </button>
            )}
            {windowAttach.enabled && windowAttach.targetProcessName && (
              <button
                onClick={async () => {
                  update('windowAttach', { ...windowAttach, enabled: false, targetProcessName: '', targetPath: '' });
                  await window.electronAPI?.clearAttachTarget?.();
                }}
                className="w-full bg-red-700/30 hover:bg-red-700/50 text-red-300 text-xs font-medium py-1.5 rounded border border-red-700/40 transition-colors"
              >
                Disable
              </button>
            )}
          </div>

          {/* Anchor Position */}
          <div className="mt-3">
            <label className="text-[10px] text-zinc-500 mb-1 block">Anchor Position</label>
            <div className="grid grid-cols-2 gap-1">
              {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as AnchorPosition[]).map((pos) => (
                <button
                  key={pos}
                  onClick={() => {
                    update('windowAttach', { ...windowAttach, anchor: pos });
                    window.electronAPI?.setAttachAnchor?.(pos);
                  }}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    windowAttach.anchor === pos
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {pos.replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
