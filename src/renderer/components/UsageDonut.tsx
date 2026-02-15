import { useState, useEffect } from 'react';
import type { DisplayMode } from '../types';

interface UsageDonutProps {
  usedPercent: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  label?: string;
  sublabel?: string;
  displayMode?: DisplayMode;
  /** ISO 8601 string — when the window resets */
  resetAt?: string | null;
  /** Total window duration in seconds (e.g. 18000 for 5h) */
  limitWindowSeconds?: number;
}

/** Calculate elapsed-time percentage for the inner ring. */
function calcTimePercent(
  resetAt: string | null | undefined,
  limitWindowSeconds: number | undefined,
): number | null {
  if (!resetAt || !limitWindowSeconds || limitWindowSeconds <= 0) return null;
  const remainingSec = (new Date(resetAt).getTime() - Date.now()) / 1000;
  const elapsedSec = limitWindowSeconds - remainingSec;
  return Math.max(0, Math.min(100, (elapsedSec / limitWindowSeconds) * 100));
}

/** Format seconds into "Xh Ym" or "Ym" */
function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  return `${m}m`;
}

export function UsageDonut({
  usedPercent,
  size = 120,
  strokeWidth = 10,
  color,
  label,
  sublabel,
  displayMode = 'used',
  resetAt,
  limitWindowSeconds,
}: UsageDonutProps) {
  // Outer ring — usage
  const outerRadius = (size - strokeWidth) / 2;
  const outerCirc = 2 * Math.PI * outerRadius;
  const displayPercent = displayMode === 'remaining' ? 100 - usedPercent : usedPercent;
  const clamped = Math.max(0, Math.min(100, displayPercent));
  const outerOffset = outerCirc - (clamped / 100) * outerCirc;

  // Inner ring — session time elapsed (updates every 30s)
  const innerGap = 3;
  const innerStroke = Math.max(3, strokeWidth - 2);
  const innerRadius = outerRadius - strokeWidth / 2 - innerGap - innerStroke / 2;
  const innerCirc = 2 * Math.PI * innerRadius;

  const [timePercent, setTimePercent] = useState<number | null>(() =>
    calcTimePercent(resetAt, limitWindowSeconds),
  );

  useEffect(() => {
    setTimePercent(calcTimePercent(resetAt, limitWindowSeconds));
    const id = setInterval(
      () => setTimePercent(calcTimePercent(resetAt, limitWindowSeconds)),
      30_000,
    );
    return () => clearInterval(id);
  }, [resetAt, limitWindowSeconds]);

  const showInner = innerRadius > 4 && timePercent !== null;
  const innerDisplayPercent = showInner
    ? displayMode === 'remaining' ? 100 - timePercent : timePercent
    : 0;
  const innerOffset = showInner
    ? innerCirc - (innerDisplayPercent / 100) * innerCirc
    : innerCirc;

  // Time label for inner ring — elapsed or remaining depending on displayMode
  const timeLabel =
    resetAt && limitWindowSeconds
      ? (() => {
          const remainSec = Math.max(
            0,
            (new Date(resetAt).getTime() - Date.now()) / 1000,
          );
          const elapsedSec = limitWindowSeconds - remainSec;
          return formatDuration(displayMode === 'remaining' ? remainSec : elapsedSec);
        })()
      : null;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Outer background */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={outerRadius}
          fill="none"
          stroke="#27272a"
          strokeWidth={strokeWidth}
        />
        {/* Outer progress (usage) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={outerRadius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={outerCirc}
          strokeDashoffset={outerOffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />

        {showInner && (
          <>
            {/* Inner background */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={innerRadius}
              fill="none"
              stroke="#27272a"
              strokeWidth={innerStroke}
            />
            {/* Inner progress (time elapsed) */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={innerRadius}
              fill="none"
              stroke="#60a5fa"
              strokeWidth={innerStroke}
              strokeDasharray={innerCirc}
              strokeDashoffset={innerOffset}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          </>
        )}

        {/* Center text — usage % */}
        <text
          x={size / 2}
          y={showInner ? size / 2 - size * 0.06 : size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="transform rotate-90 origin-center"
          fill="white"
          fontSize={size * 0.22}
          fontWeight="bold"
        >
          {Math.round(clamped)}%
        </text>

        {/* Center sub-text — remaining time */}
        {showInner && timeLabel && (
          <text
            x={size / 2}
            y={size / 2 + size * 0.12}
            textAnchor="middle"
            dominantBaseline="central"
            className="transform rotate-90 origin-center"
            fill="#a1a1aa"
            fontSize={size * (timeLabel.length > 6 ? 0.10 : 0.13)}
          >
            {timeLabel}
          </text>
        )}
      </svg>
      {label && <span className="text-xs text-zinc-400">{label}</span>}
      {sublabel && <span className="text-[10px] text-zinc-500">{sublabel}</span>}
    </div>
  );
}
