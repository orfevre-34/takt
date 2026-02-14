import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import type { UsageProvider, TokenUsageSnapshot } from '../types';
import { getTodayISO, getStartOfWeek } from '../utils/format';

export function useTokenUsage() {
  const {
    claudeTokenUsage,
    codexTokenUsage,
    settings,
    setClaudeTokenUsage,
    setCodexTokenUsage,
  } = useAppStore();

  const fetchTokenUsage = useCallback(
    async (provider: UsageProvider) => {
      try {
        const raw = await window.electronAPI?.runCcusage(provider);
        if (!raw) return;

        // ccusage出力フォーマット:
        // { daily: [{ date, totalTokens, totalCost, ... }], totals: { totalTokens, totalCost } }
        const dailyEntries: Array<{ date: string; totalTokens: number; totalCost: number }> =
          (raw as any).daily ?? [];

        const todayStr = getTodayISO();
        const startOfWeek = getStartOfWeek();

        const todayEntry = dailyEntries.find((d) => d.date === todayStr);
        const weekEntries = dailyEntries.filter((d) => new Date(d.date) >= startOfWeek);
        const totals = (raw as any).totals ?? {};

        const snapshot: TokenUsageSnapshot = {
          provider,
          fetchedAt: new Date().toISOString(),
          today: {
            costUSD: todayEntry?.totalCost ?? 0,
            totalTokens: todayEntry?.totalTokens ?? 0,
          },
          thisWeek: {
            costUSD: weekEntries.reduce((s, e) => s + (e.totalCost ?? 0), 0),
            totalTokens: weekEntries.reduce((s, e) => s + (e.totalTokens ?? 0), 0),
          },
          thisMonth: {
            costUSD: totals.totalCost ?? 0,
            totalTokens: totals.totalTokens ?? 0,
          },
          dailyUsage: dailyEntries.map((d) => ({ date: d.date, totalTokens: d.totalTokens ?? 0 })),
        };

        if (provider === 'claude') setClaudeTokenUsage(snapshot);
        else setCodexTokenUsage(snapshot);
      } catch (err) {
        console.error(`ccusage ${provider} error:`, err);
      }
    },
    [setClaudeTokenUsage, setCodexTokenUsage],
  );

  const refresh = useCallback(async () => {
    if (!settings) return;
    if (settings.ccusage.claude.enabled) await fetchTokenUsage('claude');
    if (settings.ccusage.codex.enabled) await fetchTokenUsage('codex');
  }, [settings, fetchTokenUsage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const cleanup = window.electronAPI?.onTokenUsageUpdated((snapshot: any) => {
      if (snapshot.provider === 'claude') setClaudeTokenUsage(snapshot);
      else setCodexTokenUsage(snapshot);
    });
    return cleanup;
  }, [setClaudeTokenUsage, setCodexTokenUsage]);

  return { claudeTokenUsage, codexTokenUsage, refresh: fetchTokenUsage };
}
