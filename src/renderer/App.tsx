import { useState, useRef, useEffect, useCallback } from 'react';
import { ProviderSection } from './components/ProviderSection';
import { SettingsPanel } from './components/SettingsPanel';
import { MiniView } from './components/MiniView';
import { useSettings } from './hooks/useSettings';
import { useUsage } from './hooks/useUsage';
import { useTokenUsage } from './hooks/useTokenUsage';
import { useAppStore } from './store';
import { getStatusColor } from './utils/colors';
import { formatTimeRemaining } from './utils/format';
import type { AttachState } from './types';

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { settings, updateSettings } = useSettings();
  const { claudeUsage, codexUsage, refresh: refreshUsage } = useUsage();
  const { claudeTokenUsage, codexTokenUsage } = useTokenUsage();
  const { settingsOpen, setSettingsOpen, loading, error } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ screenX: 0, screenY: 0, winX: 0, winY: 0 });
  const [attachState, setAttachState] = useState<AttachState>({ attached: false, target: null, anchor: 'top-right', targetProcessName: '' });

  // アタッチ状態の初期取得 + 購読
  useEffect(() => {
    window.electronAPI?.getAttachState?.().then(setAttachState).catch(() => {});
    const cleanup = window.electronAPI?.onAttachStateChanged?.((state: AttachState) => {
      setAttachState(state);
      if (state.attached) setSettingsOpen(false);
    });
    return cleanup;
  }, [setSettingsOpen]);

  // トレイメニューから設定を開く
  useEffect(() => {
    const cleanup = window.electronAPI?.onOpenSettings?.(() => {
      setSettingsOpen(true);
    });
    return cleanup;
  }, [setSettingsOpen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (attachState.attached) return;
    if ((e.target as HTMLElement).closest('button, input, [data-no-drag]')) return;
    setIsDragging(true);
    setDragStart({
      screenX: e.screenX,
      screenY: e.screenY,
      winX: window.screenX,
      winY: window.screenY,
    });
  };

  // ドラッグ中は document レベルでマウスを追跡（ウィンドウ外でも途切れない）
  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      window.moveTo(
        dragStart.winX + (e.screenX - dragStart.screenX),
        dragStart.winY + (e.screenY - dragStart.screenY),
      );
    };
    const handleUp = () => {
      setIsDragging(false);
      window.electronAPI?.saveWindowBounds();
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, dragStart]);

  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => setIsHovered(true);

  const handleMouseLeave = () => {
    if (isDragging) return;
    setIsHovered(false);
  };

  // 背景透過が有効かどうか
  const showBg = !settings.transparentWhenInactive || isHovered;

  const showClaude =
    settings.providers.claude.enabled ||
    (settings.ccusage.claude.enabled && !!claudeTokenUsage);
  const showCodex =
    settings.providers.codex.enabled ||
    (settings.ccusage.codex.enabled && !!codexTokenUsage);

  const isHorizontal = settings.layout === 'horizontal' && showClaude && showCodex;

  // コンテンツに合わせてウィンドウをリサイズ
  const resizeToFit = useCallback(() => {
    if (!containerRef.current) return;
    const height = containerRef.current.scrollHeight;
    // 横並び時: contentRef の自然幅 + padding(p-3 = 12px*2) で幅も自動調整
    const width = isHorizontal && contentRef.current
      ? contentRef.current.offsetWidth + 24
      : null;
    window.electronAPI?.resizeToContent(width, height, !isHorizontal);
  }, [isHorizontal]);

  useEffect(() => {
    if (attachState.attached) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => resizeToFit());
    observer.observe(el);
    resizeToFit();
    return () => observer.disconnect();
  }, [resizeToFit, attachState.attached]);

  // 横→縦切替時にウィンドウ幅をデフォルトにリセット
  const prevLayoutRef = useRef(settings.layout);
  useEffect(() => {
    if (prevLayoutRef.current === 'horizontal' && settings.layout !== 'horizontal') {
      const height = containerRef.current?.scrollHeight ?? 300;
      window.electronAPI?.resizeToContent(480, height, true);
    }
    prevLayoutRef.current = settings.layout;
  }, [settings.layout]);

  // アタッチモード: MiniView を表示
  if (attachState.attached) {
    return (
      <>
        <MiniView
          claudeUsage={claudeUsage}
          codexUsage={codexUsage}
          settings={settings}
          initialHeight={settings.windowAttach.miniHeight}
          onDetach={() => window.electronAPI?.detachWindow?.()}
          onOffsetChange={(ox, oy) => {
            updateSettings({ ...settings, windowAttach: { ...settings.windowAttach, offsetX: ox, offsetY: oy } });
          }}
        />
        {settingsOpen && (
          <SettingsPanel
            settings={settings}
            attachState={attachState}
            onSave={updateSettings}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`text-zinc-100 select-none transition-[background-color] duration-300 ${showBg ? 'bg-zinc-900' : 'bg-transparent'}`}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Title bar */}
      <div className={`flex items-center justify-between px-4 py-2 border-b transition-all duration-300 ${showBg ? 'border-zinc-800 opacity-100' : 'border-transparent opacity-0'}`}>
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
        className="p-3"
        data-no-drag
      >
        {/* Error message */}
        {error && (
          <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 text-xs text-red-300 mb-3">
            {error}
          </div>
        )}

        <div ref={contentRef} className={isHorizontal ? 'flex flex-row gap-3 w-max' : 'space-y-3'}>
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
            showBg={showBg}
            backgroundOpacity={settings.backgroundOpacity}
            onLogin={() => window.electronAPI?.openLogin?.('claude')}
            className={isHorizontal ? 'flex-shrink-0' : undefined}
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
            showBg={showBg}
            backgroundOpacity={settings.backgroundOpacity}
            onLogin={() => window.electronAPI?.openLogin?.('codex')}
            className={isHorizontal ? 'flex-shrink-0' : undefined}
          />
        )}

        </div>

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
          attachState={attachState}
          onSave={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
