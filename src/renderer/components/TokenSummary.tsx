import type { UsageProvider, TokenUsagePeriod } from '../types';
import { formatTokens, formatCost } from '../utils/format';

interface TokenSummaryProps {
  provider: UsageProvider;
  today: TokenUsagePeriod;
  thisWeek: TokenUsagePeriod;
  thisMonth: TokenUsagePeriod;
  fetchedAt?: string;
}

const PROVIDER_NAMES: Record<UsageProvider, string> = {
  claude: 'ccusage (Claude)',
  codex: 'ccusage (Codex)',
};

export function TokenSummary({
  provider,
  today,
  thisWeek,
  thisMonth,
  fetchedAt,
}: TokenSummaryProps) {
  const periods = [
    { label: 'Today', data: today },
    { label: 'Week', data: thisWeek },
    { label: 'Month', data: thisMonth },
  ];

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
      <div className="grid grid-cols-3 gap-2">
        {periods.map(({ label, data }) => (
          <div key={label} className="text-center">
            <div className="text-[10px] text-zinc-500 mb-0.5">{label}</div>
            <div className="text-sm font-bold text-zinc-100">
              {formatTokens(data.totalTokens)}
            </div>
            <div className="text-[10px] text-zinc-400">{formatCost(data.costUSD)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
