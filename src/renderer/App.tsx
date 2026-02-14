import { useState, useRef, useEffect, useCallback } from 'react';
import { ProviderSection } from './components/ProviderSection';
import { SettingsPanel } from './components/SettingsPanel';
import { useSettings } from './hooks/useSettings';
import { useUsage } from './hooks/useUsage';
import { useTokenUsage } from './hooks/useTokenUsage';
import { useAppStore } from './store';
import { getStatusColor, getStatusLevel } from './utils/colors';
import { formatTimeRemaining } from './utils/format';

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  const resizeToFit = useCallback(() => {
    if (!containerRef.current) return;
    const height = containerRef.current.scrollHeight;
    window.electronAPI?.resizeToContent(height);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => resizeToFit());
    observer.observe(el);
    resizeToFit();
    return () => observer.disconnect();
  }, [resizeToFit]);
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

  const showClaude =
    settings.providers.claude.enabled ||
    (settings.ccusage.claude.enabled && !!claudeTokenUsage);
  const showCodex =
    settings.providers.codex.enabled ||
    (settings.ccusage.codex.enabled && !!codexTokenUsage);

  return (
    <div
      ref={containerRef}
      className="bg-zinc-900 text-zinc-100 select-none"
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors text-xs"
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button
            onClick={() => window.electronAPI?.appQuit()}
            className="p-1.5 rounded hover:bg-red-900/50 text-zinc-500 hover:text-red-400 transition-colors text-xs"
            title="Quit"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="p-3 space-y-3"
        data-no-drag
      >
        {/* Error message */}
        {error && (
          <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Claude Code セクション */}
        {showClaude && (
          <ProviderSection
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
            usageFetchedAt={claudeUsage?.fetchedAt}
            tokenUsage={
              claudeTokenUsage
                ? {
                    today: claudeTokenUsage.today,
                    thisWeek: claudeTokenUsage.thisWeek,
                    thisMonth: claudeTokenUsage.thisMonth,
                    dailyUsage: claudeTokenUsage.dailyUsage,
                    fetchedAt: claudeTokenUsage.fetchedAt,
                  }
                : null
            }
            showUsage={settings.providers.claude.enabled}
            showToken={settings.ccusage.claude.enabled}
            onLogin={() => (window.electronAPI as any)?.openLogin?.('claude')}
          />
        )}

        {/* Codex セクション */}
        {showCodex && (
          <ProviderSection
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
            usageFetchedAt={codexUsage?.fetchedAt}
            tokenUsage={
              codexTokenUsage
                ? {
                    today: codexTokenUsage.today,
                    thisWeek: codexTokenUsage.thisWeek,
                    thisMonth: codexTokenUsage.thisMonth,
                    dailyUsage: codexTokenUsage.dailyUsage,
                    fetchedAt: codexTokenUsage.fetchedAt,
                  }
                : null
            }
            showUsage={settings.providers.codex.enabled}
            showToken={settings.ccusage.codex.enabled}
            onLogin={() => (window.electronAPI as any)?.openLogin?.('codex')}
          />
        )}

        {/* Empty state */}
        {!showClaude && !showCodex && (
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
