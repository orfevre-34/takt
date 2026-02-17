import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import type { UsageProvider, TokenUsageSnapshot, CCUsageRawOutput } from '../types';
import { getTodayISO, getStartOfWeekISO, normalizeDateToISO } from '../utils/format';

export function useTokenUsage() {
  const {
    claudeTokenUsage,
    codexTokenUsage,
    settings,
    setClaudeTokenUsage,
    setCodexTokenUsage,
  } = useAppStore();

  const claudeEnabled = settings?.ccusage.claude.enabled ?? false;
  const codexEnabled = settings?.ccusage.codex.enabled ?? false;

  const fetchTokenUsage = useCallback(
    async (provider: UsageProvider) => {
      try {
        const raw: CCUsageRawOutput | null | undefined = await window.electronAPI?.runCcusage(provider);
        if (!raw) return;

        const rawEntries = raw.daily ?? [];
        const dailyEntries = rawEntries.map((d) => ({ ...d, date: normalizeDateToISO(d.date) }));
        const cost = (e: { totalCost?: number; costUSD?: number }) => e.totalCost ?? e.costUSD ?? 0;

        const todayStr = getTodayISO();
        const startOfWeekStr = getStartOfWeekISO();

        const todayEntry = dailyEntries.find((d) => d.date === todayStr);
        const weekEntries = dailyEntries.filter((d) => d.date >= startOfWeekStr);
        const totals = raw.totals ?? { totalTokens: 0 };

        const snapshot: TokenUsageSnapshot = {
          provider,
          fetchedAt: new Date().toISOString(),
          today: {
            costUSD: todayEntry ? cost(todayEntry) : 0,
            totalTokens: todayEntry?.totalTokens ?? 0,
          },
          thisWeek: {
            costUSD: weekEntries.reduce((s, e) => s + cost(e), 0),
            totalTokens: weekEntries.reduce((s, e) => s + (e.totalTokens ?? 0), 0),
          },
          thisMonth: {
            costUSD: cost(totals),
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
    if (claudeEnabled) await fetchTokenUsage('claude');
    if (codexEnabled) await fetchTokenUsage('codex');
  }, [claudeEnabled, codexEnabled, settings, fetchTokenUsage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => { refresh(); };
    const cleanup = window.electronAPI?.onTriggerRefresh(handler);
    return cleanup;
  }, [refresh]);

  useEffect(() => {
    const cleanup = window.electronAPI?.onTokenUsageUpdated((snapshot) => {
      const normalized = {
        ...snapshot,
        dailyUsage: snapshot.dailyUsage.map((d) => ({
          ...d,
          date: normalizeDateToISO(d.date),
        })),
      };
      if (normalized.provider === 'claude') setClaudeTokenUsage(normalized);
      else setCodexTokenUsage(normalized);
    });
    return cleanup;
  }, [setClaudeTokenUsage, setCodexTokenUsage]);

  return { claudeTokenUsage, codexTokenUsage, refresh: fetchTokenUsage };
}
