import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import type { UsageSnapshot, UsageFetchResult } from '../types';

function isErrorResult(r: UsageFetchResult | null): r is { ok: false; error: string } {
  return r != null && 'ok' in r && (r as { ok: boolean }).ok === false;
}

function isSnapshot(r: UsageFetchResult | null): r is UsageSnapshot {
  if (!r || isErrorResult(r)) return false;
  return 'primaryWindow' in r || 'secondaryWindow' in r;
}

export function useUsage() {
  const {
    claudeUsage, codexUsage, settings,
    setClaudeUsage, setCodexUsage, setLoading, setError,
  } = useAppStore();

  const claudeEnabled = settings?.providers.claude.enabled ?? false;
  const codexEnabled = settings?.providers.codex.enabled ?? false;

  const refresh = useCallback(async () => {
    if (!settings) return;
    setLoading(true);
    setError(null);
    const errors: string[] = [];
    try {
      if (claudeEnabled) {
        const cached = await window.electronAPI?.getUsageSnapshot('claude');
        if (cached) setClaudeUsage(cached);
        try {
          const result = await window.electronAPI?.fetchUsage('claude');
          if (isErrorResult(result)) {
            if (result.error === 'not_logged_in' || result.error === 'no_org_id') {
              if (!cached) errors.push('Claude: Login required. Please log in from Settings.');
            } else if (result.error !== 'already_fetching') {
              errors.push(`Claude: ${result.error}`);
            }
          } else if (isSnapshot(result)) {
            setClaudeUsage(result);
          }
        } catch (e: unknown) {
          errors.push(`Claude: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (codexEnabled) {
        const cached = await window.electronAPI?.getUsageSnapshot('codex');
        if (cached) setCodexUsage(cached);
        try {
          const result = await window.electronAPI?.fetchUsage('codex');
          if (isErrorResult(result)) {
            if (result.error === 'not_logged_in') {
              if (!cached) errors.push('Codex: Login required. Please log in from Settings.');
            } else if (result.error !== 'already_fetching') {
              errors.push(`Codex: ${result.error}`);
            }
          } else if (isSnapshot(result)) {
            setCodexUsage(result);
          }
        } catch (e: unknown) {
          errors.push(`Codex: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Failed to fetch usage');
    } finally {
      if (errors.length > 0) setError(errors.join(' / '));
      setLoading(false);
    }
  }, [claudeEnabled, codexEnabled, settings, setClaudeUsage, setCodexUsage, setLoading, setError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // メインプロセスからのプッシュ更新
  useEffect(() => {
    const cleanup = window.electronAPI?.onUsageUpdated((snapshot) => {
      if (snapshot.provider === 'claude') setClaudeUsage(snapshot);
      else setCodexUsage(snapshot);
    });
    return cleanup;
  }, [setClaudeUsage, setCodexUsage]);

  // trigger-refreshイベントをリッスン
  useEffect(() => {
    const handler = () => { refresh(); };
    const cleanup = window.electronAPI?.onTriggerRefresh(handler);
    return cleanup;
  }, [refresh]);

  return { claudeUsage, codexUsage, refresh };
}
