import { useMemo } from 'react';
import type { DailyUsageEntry } from '../types';
import { HEATMAP_COLORS, getHeatmapLevel, calculateQuartiles } from '../utils/colors';
import { getTodayISO } from '../utils/format';

interface HeatmapProps {
  dailyUsage: DailyUsageEntry[];
  weeks?: number;
}

interface HeatmapCell {
  date: string;
  tokens: number;
  dayOfWeek: number;
  weekIndex: number;
}

export function Heatmap({ dailyUsage, weeks = 6 }: HeatmapProps) {
  const todayISO = getTodayISO();

  const { grid, quartiles } = useMemo(() => {
    const tokensByDate = new Map(dailyUsage.map((d) => [d.date, d.totalTokens]));
    const today = new Date();
    const totalDays = weeks * 7;

    const cells: HeatmapCell[] = [];

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - totalDays + 1);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    for (let i = 0; i < totalDays + 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      if (d > today) break;
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayOfWeek = d.getDay();
      const weekIndex = Math.floor(i / 7);
      cells.push({
        date: dateStr,
        tokens: tokensByDate.get(dateStr) ?? 0,
        dayOfWeek,
        weekIndex,
      });
    }

    const q = calculateQuartiles(cells.map((c) => c.tokens));
    const maxWeek = Math.max(...cells.map((c) => c.weekIndex), 0);

    const g: Array<Array<HeatmapCell | null>> = [];
    for (let w = 0; w <= maxWeek; w++) {
      const weekCells: Array<HeatmapCell | null> = Array(7).fill(null);
      cells
        .filter((c) => c.weekIndex === w)
        .forEach((c) => {
          weekCells[c.dayOfWeek] = c;
        });
      g.push(weekCells);
    }

    return { grid: g, quartiles: q };
  }, [dailyUsage, weeks, todayISO]);

  const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  return (
    <div className="flex gap-0.5">
      <div className="flex flex-col gap-0.5 mr-1">
        {DAY_LABELS.map((label, i) => (
          <div
            key={i}
            className="w-4 h-3 text-[8px] text-zinc-500 flex items-center justify-end"
          >
            {label}
          </div>
        ))}
      </div>
      {grid.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-0.5">
          {week.map((cell, di) => (
            <div
              key={di}
              className="w-3 h-3 rounded-sm"
              style={{
                backgroundColor: cell
                  ? HEATMAP_COLORS[getHeatmapLevel(cell.tokens, quartiles)]
                  : HEATMAP_COLORS[0],
              }}
              title={
                cell
                  ? `${cell.date}: ${cell.tokens.toLocaleString()} tokens`
                  : ''
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}
