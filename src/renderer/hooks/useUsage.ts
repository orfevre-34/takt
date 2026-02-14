import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store';

export function useUsage() {
  const {
    claudeUsage, codexUsage, settings,
    setClaudeUsage, setCodexUsage, setLoading, setError,
  } = useAppStore();

  const refresh = useCallback(async () => {
    if (!settings) return;
    setLoading(true);
    setError(null);
    const errors: string[] = [];
    try {
      if (settings.providers.claude.enabled) {
        // まずキャッシュされたスナップショットを読む
        const cached = await window.electronAPI?.getUsageSnapshot('claude');
        if (cached) setClaudeUsage(cached as any);
        // APIから最新データを取得
        try {
          const result = await (window.electronAPI as any)?.fetchUsage('claude');
          if (result?.ok === false) {
            if (result.error === 'not_logged_in' || result.error === 'no_org_id') {
              if (!cached) errors.push('Claude: ログインが必要です。設定からログインしてください。');
            } else if (result.error !== 'already_fetching') {
              errors.push(`Claude: ${result.error}`);
            }
          } else if (result?.primaryWindow || result?.secondaryWindow) {
            setClaudeUsage(result);
          }
        } catch (e: any) {
          errors.push(`Claude: ${e.message || String(e)}`);
        }
      }
      if (settings.providers.codex.enabled) {
        const cached = await window.electronAPI?.getUsageSnapshot('codex');
        if (cached) setCodexUsage(cached as any);
        try {
          const result = await (window.electronAPI as any)?.fetchUsage('codex');
          if (result?.ok === false) {
            if (result.error === 'not_logged_in') {
              if (!cached) errors.push('Codex: ログインが必要です。設定からログインしてください。');
            } else if (result.error !== 'already_fetching') {
              errors.push(`Codex: ${result.error}`);
            }
          } else if (result?.primaryWindow || result?.secondaryWindow) {
            setCodexUsage(result);
          }
        } catch (e: any) {
          errors.push(`Codex: ${e.message || String(e)}`);
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Failed to fetch usage');
    } finally {
      if (errors.length > 0) setError(errors.join(' / '));
      setLoading(false);
    }
  }, [settings, setClaudeUsage, setCodexUsage, setLoading, setError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // メインプロセスからのプッシュ更新
  useEffect(() => {
    const cleanup = window.electronAPI?.onUsageUpdated((snapshot: any) => {
      if (snapshot.provider === 'claude') setClaudeUsage(snapshot);
      else setCodexUsage(snapshot);
    });
    return cleanup;
  }, [setClaudeUsage, setCodexUsage]);

  // trigger-refreshイベントをリッスン
  useEffect(() => {
    const handler = () => { refresh(); };
    const cleanup = (window.electronAPI as any)?.onTriggerRefresh?.(handler);
    return cleanup;
  }, [refresh]);

  return { claudeUsage, codexUsage, refresh };
}
