import type { UsageWindow, UsageProvider, DisplayMode, StatusLevel } from '../types';
import { UsageDonut } from './UsageDonut';
import { StatusBadge } from './StatusBadge';

interface UsageCardProps {
  provider: UsageProvider;
  primaryWindow: UsageWindow | null;
  secondaryWindow: UsageWindow | null;
  displayMode: DisplayMode;
  getColor: (percent: number) => string;
  getLevel: (percent: number) => StatusLevel;
  formatTime: (resetAt: string | null) => string;
  fetchedAt?: string;
}

const PROVIDER_NAMES: Record<UsageProvider, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

const WINDOW_LABELS: Record<string, string> = {
  primary: '5h Window',
  secondary: '7d Window',
};

export function UsageCard({
  provider,
  primaryWindow,
  secondaryWindow,
  displayMode,
  getColor,
  getLevel,
  formatTime,
  fetchedAt,
}: UsageCardProps) {
  const windows = [primaryWindow, secondaryWindow].filter(Boolean) as UsageWindow[];

  if (windows.length === 0) {
    return (
      <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-200">{PROVIDER_NAMES[provider]}</h3>
          <StatusBadge level="normal" text="No Data" />
        </div>
        <p className="text-xs text-zinc-500 mb-2">No data available. Please log in.</p>
        <button
          onClick={() => (window.electronAPI as any)?.openLogin?.(provider)}
          className="w-full bg-orange-700/30 hover:bg-orange-700/50 text-orange-300 text-xs font-medium py-1.5 rounded border border-orange-700/40 transition-colors"
        >
          Log in to {provider === 'claude' ? 'Claude.ai' : 'ChatGPT'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-200">{PROVIDER_NAMES[provider]}</h3>
        {fetchedAt && (
          <span className="text-[10px] text-zinc-500">
            {new Date(fetchedAt).toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>
      <div className="flex justify-around items-center">
        {windows.map((w) => (
          <div key={w.kind} className="flex flex-col items-center">
            <UsageDonut
              usedPercent={w.usedPercent}
              size={100}
              strokeWidth={8}
              color={getColor(w.usedPercent)}
              displayMode={displayMode}
              sublabel={formatTime(w.resetAt)}
            />
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-400">{WINDOW_LABELS[w.kind]}</span>
              <StatusBadge level={getLevel(w.usedPercent)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
