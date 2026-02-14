import type { StatusLevel } from '../types';

interface StatusBadgeProps {
  level: StatusLevel;
  text?: string;
}

const BADGE_COLORS: Record<StatusLevel, string> = {
  normal: 'bg-green-500/20 text-green-400 border-green-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  danger: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const DOT_COLORS: Record<StatusLevel, string> = {
  normal: 'bg-green-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
};

export function StatusBadge({ level, text }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${BADGE_COLORS[level]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${DOT_COLORS[level]}`} />
      {text ?? level}
    </span>
  );
}
