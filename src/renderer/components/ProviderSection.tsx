import type {
  UsageProvider,
  UsageWindow,
  DisplayMode,
  TokenUsagePeriod,
  DailyUsageEntry,
} from '../types';
import { UsageDonut } from './UsageDonut';
import { Heatmap } from './Heatmap';
import { formatTokens, formatCost } from '../utils/format';

interface ProviderSectionProps {
  provider: UsageProvider;
  primaryWindow: UsageWindow | null;
  secondaryWindow: UsageWindow | null;
  displayMode: DisplayMode;
  getColor: (percent: number) => string;
  formatTime: (resetAt: string | null) => string;
  usageFetchedAt?: string;
  tokenUsage?: {
    today: TokenUsagePeriod;
    thisWeek: TokenUsagePeriod;
    thisMonth: TokenUsagePeriod;
    dailyUsage: DailyUsageEntry[];
    fetchedAt?: string;
  } | null;
  showUsage: boolean;
  showToken: boolean;
  showBg?: boolean;
  backgroundOpacity?: number; // 0-100
  onLogin?: () => void;
  className?: string;
}

const PROVIDER_NAMES: Record<UsageProvider, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

const WINDOW_LABELS: Record<string, string> = {
  primary: '5h Window',
  secondary: '7d Window',
};

const TOKEN_PLACEHOLDER_LABELS = ['Today', 'Week', 'Month'];

export function ProviderSection({
  provider,
  primaryWindow,
  secondaryWindow,
  displayMode,
  getColor,
  formatTime,
  usageFetchedAt,
  tokenUsage,
  showUsage,
  showToken,
  showBg = true,
  backgroundOpacity = 80,
  onLogin,
  className,
}: ProviderSectionProps) {
  const windows: Array<{ window: UsageWindow | null; kind: 'primary' | 'secondary' }> = [
    { window: primaryWindow, kind: 'primary' },
    { window: secondaryWindow, kind: 'secondary' },
  ];
  const hasUsageData = primaryWindow !== null || secondaryWindow !== null;
  const hasTokenData = showToken && !!tokenUsage;
  const hasHeatmap = hasTokenData && tokenUsage!.dailyUsage.length > 0;
  // ccusage有効だがデータ未取得 → プレースホルダー表示
  const showTokenPlaceholder = showToken && !tokenUsage;

  const fetchedAt = usageFetchedAt || tokenUsage?.fetchedAt;

  const tokenPeriods = hasTokenData
    ? [
        { label: 'Today', data: tokenUsage!.today },
        { label: 'Week', data: tokenUsage!.thisWeek },
        { label: 'Month', data: tokenUsage!.thisMonth },
      ]
    : [];

  return (
    <div
      className={`rounded-xl p-3 transition-all duration-300 ${showBg ? 'bg-zinc-800/50 border border-zinc-700/50' : 'border border-transparent'} ${className ?? ''}`}
      style={!showBg ? { backgroundColor: `rgba(39, 39, 42, ${backgroundOpacity / 100})` } : undefined}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-zinc-200">
          {PROVIDER_NAMES[provider]}
        </h3>
        {fetchedAt && (
          <span className="text-[10px] text-zinc-500">
            {new Date(fetchedAt).toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>

      {/* ログインプロンプト（両方 null のときのみ） */}
      {showUsage && !hasUsageData && !hasTokenData && (
        <div>
          <p className="text-xs text-zinc-500 mb-2">
            No data available. Please log in.
          </p>
          <button
            onClick={onLogin}
            className="w-full bg-orange-700/30 hover:bg-orange-700/50 text-orange-300 text-xs font-medium py-1.5 rounded border border-orange-700/40 transition-colors"
          >
            Log in to {provider === 'claude' ? 'Claude.ai' : 'ChatGPT'}
          </button>
        </div>
      )}

      {/* ビジュアル行: ドーナツ + ヒートマップ横並び */}
      {showUsage && (
        <div
          className={`flex ${
            hasHeatmap || showTokenPlaceholder ? 'justify-between' : 'justify-around'
          } items-center gap-4`}
        >
          {/* ドーナツ群: 常に2つ表示 */}
          <div className="flex gap-3 flex-1 justify-center">
            {windows.map(({ window: w, kind }) => (
              <div key={kind} className="flex flex-col items-center">
                {w ? (
                  <UsageDonut
                    usedPercent={w.usedPercent}
                    size={76}
                    strokeWidth={6}
                    color={getColor(w.usedPercent)}
                    displayMode={displayMode}
                    resetAt={w.resetAt}
                    limitWindowSeconds={w.limitWindowSeconds}
                  />
                ) : (
                  <UsageDonut
                    usedPercent={0}
                    size={76}
                    strokeWidth={6}
                    color="#27272a"
                    displayMode="used"
                  />
                )}
                <span className="mt-1 text-[10px] text-zinc-400">
                  {WINDOW_LABELS[kind]}
                </span>
                {w?.resetAt ? (
                  <span className="text-[10px] text-zinc-500">
                    {new Date(w.resetAt).toLocaleString('ja-JP', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                ) : (
                  <span className="text-[10px] text-zinc-600">--</span>
                )}
              </div>
            ))}
          </div>

          {/* ヒートマップ or プレースホルダー（ドーナツと横並び） */}
          {(hasHeatmap || showTokenPlaceholder) && (
            <div className={`flex-shrink-0${showTokenPlaceholder ? ' animate-pulse opacity-40' : ''}`}>
              <Heatmap dailyUsage={hasHeatmap ? tokenUsage!.dailyUsage : []} />
            </div>
          )}
        </div>
      )}

      {/* トークン統計（テキスト情報を下に） */}
      {(hasTokenData || showTokenPlaceholder) && (
        <div
          className={
            showUsage
              ? `mt-2 pt-2 border-t transition-[border-color] duration-300 ${showBg ? 'border-zinc-700/30' : 'border-transparent'}`
              : ''
          }
        >
          <div className="grid grid-cols-3 gap-2">
            {hasTokenData
              ? tokenPeriods.map(({ label, data }) => (
                  <div key={label} className="text-center">
                    <div className="text-[10px] text-zinc-500 mb-0.5">
                      {label}
                    </div>
                    <div className="text-sm font-bold text-zinc-100">
                      {formatTokens(data.totalTokens)}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {formatCost(data.costUSD)}
                    </div>
                  </div>
                ))
              : TOKEN_PLACEHOLDER_LABELS.map((label) => (
                  <div key={label} className="text-center animate-pulse">
                    <div className="text-[10px] text-zinc-500 mb-0.5">
                      {label}
                    </div>
                    <div className="text-sm font-bold text-zinc-700">
                      —
                    </div>
                    <div className="text-[10px] text-zinc-700">
                      —
                    </div>
                  </div>
                ))}
          </div>

          {/* ヒートマップ（ドーナツなし時は下に配置） */}
          {!showUsage && (hasHeatmap || showTokenPlaceholder) && (
            <div className={`mt-2${showTokenPlaceholder ? ' animate-pulse opacity-40' : ''}`}>
              <Heatmap dailyUsage={hasHeatmap ? tokenUsage!.dailyUsage : []} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
