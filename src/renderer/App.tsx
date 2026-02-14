import { useState } from 'react';
import { UsageCard } from './components/UsageCard';
import { TokenSummary } from './components/TokenSummary';
import { Heatmap } from './components/Heatmap';
import { SettingsPanel } from './components/SettingsPanel';
import { useSettings } from './hooks/useSettings';
import { useUsage } from './hooks/useUsage';
import { useTokenUsage } from './hooks/useTokenUsage';
import { useAppStore } from './store';
import { getStatusColor, getStatusLevel } from './utils/colors';
import { formatTimeRemaining } from './utils/format';

export function App() {
  const { settings, updateSettings } = useSettings();
  const { claudeUsage, codexUsage, refresh: refreshUsage } = useUsage();
  const { claudeTokenUsage, codexTokenUsage } = useTokenUsage();
  const { settingsOpen, setSettingsOpen, loading, error } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, [data-no-drag]')) return;
    setIsDragging(true);
    setDragOffset({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragOffset.x;
    const dy = e.clientY - dragOffset.y;
    window.moveTo(window.screenX + dx, window.screenY + dy);
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div
      className="min-h-screen bg-zinc-900 text-zinc-100 select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-wide">Takt</span>
          {loading && (
            <span className="text-[10px] text-zinc-500 animate-pulse">Refreshing...</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refreshUsage()}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors text-xs"
            title="Refresh"
          >
            &#x21bb;
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors text-xs"
            title="Settings"
          >
            &#x2699;
          </button>
          <button
            onClick={() => window.electronAPI?.appQuit()}
            className="p-1.5 rounded hover:bg-red-900/50 text-zinc-500 hover:text-red-400 transition-colors text-xs"
            title="Quit"
          >
            &#x2715;
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="p-3 space-y-3 overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 44px)' }}
        data-no-drag
      >
        {/* Error message */}
        {error && (
          <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Claude Usage */}
        {settings.providers.claude.enabled && (
          <UsageCard
            provider="claude"
            primaryWindow={claudeUsage?.primaryWindow ?? null}
            secondaryWindow={claudeUsage?.secondaryWindow ?? null}
            displayMode={settings.displayMode}
            getColor={(p) =>
              getStatusColor(
                p,
                settings.thresholds.claude.primary.warningPercent,
                settings.thresholds.claude.primary.dangerPercent,
                settings.colors,
              )
            }
            getLevel={(p) =>
              getStatusLevel(
                p,
                settings.thresholds.claude.primary.warningPercent,
                settings.thresholds.claude.primary.dangerPercent,
              )
            }
            formatTime={formatTimeRemaining}
            fetchedAt={claudeUsage?.fetchedAt}
          />
        )}

        {/* Codex Usage */}
        {settings.providers.codex.enabled && (
          <UsageCard
            provider="codex"
            primaryWindow={codexUsage?.primaryWindow ?? null}
            secondaryWindow={codexUsage?.secondaryWindow ?? null}
            displayMode={settings.displayMode}
            getColor={(p) =>
              getStatusColor(
                p,
                settings.thresholds.codex.primary.warningPercent,
                settings.thresholds.codex.primary.dangerPercent,
                settings.colors,
              )
            }
            getLevel={(p) =>
              getStatusLevel(
                p,
                settings.thresholds.codex.primary.warningPercent,
                settings.thresholds.codex.primary.dangerPercent,
              )
            }
            formatTime={formatTimeRemaining}
            fetchedAt={codexUsage?.fetchedAt}
          />
        )}

        {/* Claude Token Usage */}
        {settings.ccusage.claude.enabled && claudeTokenUsage && (
          <>
            <TokenSummary
              provider="claude"
              today={claudeTokenUsage.today}
              thisWeek={claudeTokenUsage.thisWeek}
              thisMonth={claudeTokenUsage.thisMonth}
              fetchedAt={claudeTokenUsage.fetchedAt}
            />
            {claudeTokenUsage.dailyUsage.length > 0 && (
              <div className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50">
                <Heatmap dailyUsage={claudeTokenUsage.dailyUsage} />
              </div>
            )}
          </>
        )}

        {/* Codex Token Usage */}
        {settings.ccusage.codex.enabled && codexTokenUsage && (
          <>
            <TokenSummary
              provider="codex"
              today={codexTokenUsage.today}
              thisWeek={codexTokenUsage.thisWeek}
              thisMonth={codexTokenUsage.thisMonth}
              fetchedAt={codexTokenUsage.fetchedAt}
            />
            {codexTokenUsage.dailyUsage.length > 0 && (
              <div className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50">
                <Heatmap dailyUsage={codexTokenUsage.dailyUsage} />
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!settings.providers.claude.enabled && !settings.providers.codex.enabled && (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-sm">No provider selected</p>
            <button
              onClick={() => setSettingsOpen(true)}
              className="mt-2 text-green-400 text-sm hover:underline"
            >
              Open Settings
            </button>
          </div>
        )}
      </div>

      {/* Settings panel */}
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onSave={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
