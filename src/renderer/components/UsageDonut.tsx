import type { DisplayMode } from '../types';

interface UsageDonutProps {
  usedPercent: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  label?: string;
  sublabel?: string;
  displayMode?: DisplayMode;
}

export function UsageDonut({
  usedPercent,
  size = 120,
  strokeWidth = 10,
  color,
  label,
  sublabel,
  displayMode = 'used',
}: UsageDonutProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const displayPercent = displayMode === 'remaining' ? 100 - usedPercent : usedPercent;
  const clamped = Math.max(0, Math.min(100, displayPercent));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#27272a"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
        {/* Center text */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="transform rotate-90 origin-center"
          fill="white"
          fontSize={size * 0.22}
          fontWeight="bold"
        >
          {Math.round(clamped)}%
        </text>
      </svg>
      {label && <span className="text-xs text-zinc-400">{label}</span>}
      {sublabel && <span className="text-[10px] text-zinc-500">{sublabel}</span>}
    </div>
  );
}
