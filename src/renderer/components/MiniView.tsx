import { useState, useEffect, useCallback, useRef } from 'react';
import type { UsageSnapshot, UsageWindow, Settings, DisplayMode } from '../types';
import { getStatusColor } from '../utils/colors';
import { calcProjectedPercent, getPaceBadgeClasses } from '../utils/pace';

function useSystemDarkMode(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return dark;
}

interface MiniViewProps {
  claudeUsage: UsageSnapshot | null;
  codexUsage: UsageSnapshot | null;
  settings: Settings;
  initialHeight?: number;
  taskbarMode?: boolean;
  onDetach: () => void;
  onOffsetChange: (ox: number, oy: number) => void;
}

export function MiniView({ claudeUsage, codexUsage, settings, initialHeight, taskbarMode, onDetach, onOffsetChange }: MiniViewProps) {
  const showClaude = settings.providers.claude.enabled;
  const showCodex = settings.providers.codex.enabled;

  const getColor = (provider: 'claude' | 'codex', percent: number) =>
    getStatusColor(
      percent,
      settings.thresholds[provider].primary.warningPercent,
      settings.thresholds[provider].primary.dangerPercent,
      settings.colors,
    );

  // Ctrl+ドラッグでオフセット調整
  const wa = settings.windowAttach;
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ screenX: 0, screenY: 0, baseOffsetX: 0, baseOffsetY: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (taskbarMode) return;
    if (!e.ctrlKey) return;
    e.preventDefault();
    setDragging(true);
    setDragStart({
      screenX: e.screenX,
      screenY: e.screenY,
      baseOffsetX: wa?.offsetX ?? 0,
      baseOffsetY: wa?.offsetY ?? 0,
    });
  }, [taskbarMode, wa?.offsetX, wa?.offsetY]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const ox = dragStart.baseOffsetX + (e.screenX - dragStart.screenX);
      const oy = dragStart.baseOffsetY + (e.screenY - dragStart.screenY);
      window.electronAPI?.setAttachOffset?.(ox, oy);
    };
    const handleUp = (e: MouseEvent) => {
      setDragging(false);
      const ox = dragStart.baseOffsetX + (e.screenX - dragStart.screenX);
      const oy = dragStart.baseOffsetY + (e.screenY - dragStart.screenY);
      onOffsetChange(ox, oy);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, dragStart, onOffsetChange]);

  // ウィンドウ高さを追跡（初期値は実際のウィンドウ高さ）
  const [contentH, setContentH] = useState(() => window.innerHeight || initialHeight || 48);
  useEffect(() => {
    const handleResize = () => setContentH(window.innerHeight);
    window.addEventListener('resize', handleResize);
    const cleanup = window.electronAPI?.onContentResized?.((_, h) => {
      setContentH(h);
    });
    return () => {
      window.removeEventListener('resize', handleResize);
      cleanup?.();
    };
  }, []);

  // レンダリング後にコンテンツ幅を測定してmainに報告
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let lastW = 0;
    const report = () => {
      const w = Math.ceil(el.getBoundingClientRect().width) + 12;
      if (w !== lastW) {
        lastW = w;
        window.electronAPI?.setMiniWidth?.(w);
      }
    };
    const observer = new ResizeObserver(() => report());
    observer.observe(el);
    report();
    return () => observer.disconnect();
  }, []);

  // タスクバーモード: システムテーマ連動テキスト
  const isDark = useSystemDarkMode();
  if (taskbarMode) {
    const fontSize = Math.max(9, Math.round(contentH * 0.28));
    const gaugeWidth = Math.max(20, Math.round(contentH * 1.1));
    const textColor = isDark ? '#d4d4d4' : '#404040';
    const mutedColor = isDark ? '#a1a1aa' : '#71717a';
    const trackColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
    const separatorColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';

    return (
      <div
        className="w-full h-full flex items-center justify-center select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        onDoubleClick={onDetach}
        title="Double-click to close / Drag to move"
      >
        <div ref={contentRef} className="flex items-center w-max" style={{ gap: Math.round(fontSize * 0.6) }}>
          {showClaude && (
            <TaskbarLabel
              label="C"
              pw={claudeUsage?.primaryWindow ?? null}
              color={textColor}
              mutedColor={mutedColor}
              trackColor={trackColor}
              displayMode={settings.displayMode}
              fontSize={fontSize}
              gaugeWidth={gaugeWidth}
              warningThreshold={settings.thresholds.claude.primary.warningPercent}
              dangerThreshold={settings.thresholds.claude.primary.dangerPercent}
            />
          )}
          {showClaude && showCodex && (
            <span className="font-bold" style={{ fontSize, color: separatorColor }}>|</span>
          )}
          {showCodex && (
            <TaskbarLabel
              label="X"
              pw={codexUsage?.primaryWindow ?? null}
              color={textColor}
              mutedColor={mutedColor}
              trackColor={trackColor}
              displayMode={settings.displayMode}
              fontSize={fontSize}
              gaugeWidth={gaugeWidth}
              warningThreshold={settings.thresholds.codex.primary.warningPercent}
              dangerThreshold={settings.thresholds.codex.primary.dangerPercent}
            />
          )}
          {!showClaude && !showCodex && (
            <span style={{ fontSize, color: mutedColor }}>--</span>
          )}
        </div>
      </div>
    );
  }

  // アタッチモード: ドーナツデザイン
  const donutSize = Math.round(contentH * 0.7);
  const labelSize = Math.max(5, Math.round(contentH * 0.14));
  const gapPx = Math.max(2, Math.round(contentH * 0.04));

  return (
    <div
      className={`w-full h-full flex items-center justify-center rounded-lg select-none ${dragging ? 'cursor-grabbing' : 'cursor-default'}`}
      style={{ background: 'rgba(24,24,27,0.88)' }}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDetach}
      title="Double-click to detach / Ctrl+drag to adjust / Ctrl+resize"
    >
      <div ref={contentRef} className="flex items-center w-max" style={{ gap: gapPx }}>
        {showClaude && (
          <MiniProviderGroup
            label="Claude"
            pw={claudeUsage?.primaryWindow ?? null}
            color={claudeUsage?.primaryWindow ? getColor('claude', claudeUsage.primaryWindow.usedPercent) : '#27272a'}
            displayMode={settings.displayMode}
            donutSize={donutSize}
            labelSize={labelSize}
            gap={gapPx}
            warningThreshold={settings.thresholds.claude.primary.warningPercent}
            dangerThreshold={settings.thresholds.claude.primary.dangerPercent}
          />
        )}
        {showClaude && showCodex && (
          <div className="w-px bg-zinc-700 self-stretch" style={{ marginBlock: gapPx }} />
        )}
        {showCodex && (
          <MiniProviderGroup
            label="Codex"
            pw={codexUsage?.primaryWindow ?? null}
            color={codexUsage?.primaryWindow ? getColor('codex', codexUsage.primaryWindow.usedPercent) : '#27272a'}
            displayMode={settings.displayMode}
            donutSize={donutSize}
            labelSize={labelSize}
            gap={gapPx}
            warningThreshold={settings.thresholds.codex.primary.warningPercent}
            dangerThreshold={settings.thresholds.codex.primary.dangerPercent}
          />
        )}
        {!showClaude && !showCodex && (
          <span className="text-zinc-500 text-[10px]">--</span>
        )}
      </div>
    </div>
  );
}

function SemiGauge({ width, value, color, trackColor, text, textColor }: {
  width: number;
  value: number;
  color: string;
  trackColor: string;
  text: string;
  textColor: string;
}) {
  const stroke = Math.max(2.5, width * 0.12);
  const r = (width - stroke) / 2;
  const height = r + stroke / 2 + 1;
  const cx = width / 2;
  const cy = r + stroke / 2;
  const arcLen = Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = arcLen - (clamped / 100) * arcLen;
  const labelFontSize = Math.max(6, Math.round(width * 0.28));

  return (
    <svg width={width} height={height} className="shrink-0">
      {/* トラック（半円） */}
      <path
        d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${width - stroke / 2} ${cy}`}
        fill="none" stroke={trackColor} strokeWidth={stroke} strokeLinecap="butt"
      />
      {/* 値（半円） */}
      <path
        d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${width - stroke / 2} ${cy}`}
        fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="butt"
        strokeDasharray={arcLen} strokeDashoffset={offset}
      />
      {/* テキスト */}
      <text
        x={cx} y={cy}
        textAnchor="middle" dominantBaseline="auto"
        fill={textColor} fontSize={labelFontSize} fontWeight="bold"
      >
        {text}
      </text>
    </svg>
  );
}

function TaskbarLabel({
  label,
  pw,
  color,
  mutedColor,
  trackColor,
  displayMode,
  fontSize,
  gaugeWidth,
  warningThreshold = 70,
  dangerThreshold = 90,
}: {
  label: string;
  pw: UsageWindow | null;
  color: string;
  mutedColor: string;
  trackColor: string;
  displayMode: DisplayMode;
  fontSize: number;
  gaugeWidth: number;
  warningThreshold?: number;
  dangerThreshold?: number;
}) {
  const usedPct = pw ? (displayMode === 'remaining' ? 100 - pw.usedPercent : pw.usedPercent) : 0;
  const timeInfo = useTimeInfo(pw?.resetAt ?? null, pw?.limitWindowSeconds ?? 0, displayMode);

  const rawProjected = pw && timeInfo.rawTimePercent !== null
    ? calcProjectedPercent(pw.usedPercent, timeInfo.rawTimePercent)
    : null;
  const projectedDisplay = rawProjected !== null
    ? displayMode === 'remaining' ? Math.max(0, 100 - rawProjected) : rawProjected
    : null;

  const smallFont = Math.max(7, Math.round(fontSize * 0.8));
  const gap = Math.round(fontSize * 0.3);

  return (
    <div className="flex items-center whitespace-nowrap" style={{ gap }}>
      <span className="font-bold" style={{ fontSize: smallFont, color: mutedColor }}>{label}</span>
      <SemiGauge
        width={gaugeWidth}
        value={Math.round(Math.max(0, Math.min(100, usedPct)))}
        color={color}
        trackColor={trackColor}
        text={`${Math.round(usedPct)}%`}
        textColor={color}
      />
      {pw && (
        <span className="font-medium" style={{ fontSize: smallFont, color: mutedColor }}>{timeInfo.label}</span>
      )}
      {projectedDisplay !== null && (
        <span className="font-semibold" style={{ fontSize: smallFont, color: mutedColor }}>
          →{Math.round(projectedDisplay)}%
        </span>
      )}
    </div>
  );
}

function MiniProviderGroup({
  label,
  pw,
  color,
  displayMode,
  donutSize,
  labelSize,
  gap,
  warningThreshold = 70,
  dangerThreshold = 90,
}: {
  label: string;
  pw: UsageWindow | null;
  color: string;
  displayMode: DisplayMode;
  donutSize: number;
  labelSize: number;
  gap: number;
  warningThreshold?: number;
  dangerThreshold?: number;
}) {
  const usedPct = pw ? (displayMode === 'remaining' ? 100 - pw.usedPercent : pw.usedPercent) : 0;
  const timeInfo = useTimeInfo(pw?.resetAt ?? null, pw?.limitWindowSeconds ?? 0, displayMode);

  const rawProjected = pw && timeInfo.rawTimePercent !== null
    ? calcProjectedPercent(pw.usedPercent, timeInfo.rawTimePercent)
    : null;
  const projectedDisplay = rawProjected !== null
    ? displayMode === 'remaining' ? Math.max(0, 100 - rawProjected) : rawProjected
    : null;
  const badgeFontSize = Math.max(4, Math.round(donutSize * 0.2));

  return (
    <div className="flex items-center" style={{ gap }}>
      <span className="font-semibold text-zinc-500 leading-none whitespace-nowrap" style={{ fontSize: labelSize }}>{label}</span>
      {pw ? (
        <>
          <MiniDonut size={donutSize} value={Math.round(Math.max(0, Math.min(100, usedPct)))} color={color} text={`${Math.round(usedPct)}%`} />
          <MiniDonut size={donutSize} value={timeInfo.percent} color="#60a5fa" text={timeInfo.label} />
          {projectedDisplay !== null && (
            <span
              className={`rounded-full font-semibold whitespace-nowrap leading-none ${getPaceBadgeClasses(rawProjected!, warningThreshold, dangerThreshold)}`}
              style={{ fontSize: badgeFontSize, padding: `${Math.max(1, badgeFontSize * 0.2)}px ${Math.max(2, badgeFontSize * 0.4)}px` }}
            >
              →{Math.round(projectedDisplay)}%
            </span>
          )}
        </>
      ) : (
        <>
          <MiniDonut size={donutSize} value={0} color="#27272a" text="--" />
          <MiniDonut size={donutSize} value={0} color="#27272a" text="--" />
        </>
      )}
    </div>
  );
}

function MiniDonut({ size, value, color, text }: { size: number; value: number; color: string; text: string }) {
  const stroke = Math.max(1.5, size * 0.06);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circ - (clamped / 100) * circ;
  const fontSize = Math.max(4, Math.round(size * 0.24));

  return (
    <svg width={size} height={size} className="transform -rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#27272a" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="transform rotate-90 origin-center"
        fill="#d4d4d8"
        fontSize={fontSize}
        fontWeight="bold"
      >
        {text}
      </text>
    </svg>
  );
}

function useTimeInfo(resetAt: string | null, limitWindowSeconds: number, displayMode: DisplayMode) {
  const calc = useCallback(() => {
    if (!resetAt || !limitWindowSeconds || limitWindowSeconds <= 0) {
      return { percent: 0, label: '--', rawTimePercent: null as number | null };
    }
    const dateMs = new Date(resetAt).getTime();
    if (!Number.isFinite(dateMs)) {
      return { percent: 0, label: '--', rawTimePercent: null as number | null };
    }
    const remainSec = Math.max(0, (dateMs - Date.now()) / 1000);
    const elapsedSec = limitWindowSeconds - remainSec;

    const rawTimePct = Math.max(0, Math.min(100, (elapsedSec / limitWindowSeconds) * 100));
    const pct = displayMode === 'remaining'
      ? (remainSec / limitWindowSeconds) * 100
      : rawTimePct;

    const displaySec = displayMode === 'remaining' ? remainSec : elapsedSec;
    const h = Math.floor(displaySec / 3600);
    const m = Math.floor((displaySec % 3600) / 60);
    const lbl = h > 0 ? `${h}h${m}m` : `${m}m`;

    return { percent: Math.max(0, Math.min(100, pct)), label: lbl, rawTimePercent: rawTimePct };
  }, [resetAt, limitWindowSeconds, displayMode]);

  const [info, setInfo] = useState(calc);

  useEffect(() => {
    setInfo(calc());
    const id = setInterval(() => setInfo(calc()), 30_000);
    return () => clearInterval(id);
  }, [calc]);

  return info;
}
