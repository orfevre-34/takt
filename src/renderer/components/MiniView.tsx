import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import type { UsageSnapshot, UsageWindow, Settings, DisplayMode } from '../types';
import { getStatusColor } from '../utils/colors';

interface MiniViewProps {
  claudeUsage: UsageSnapshot | null;
  codexUsage: UsageSnapshot | null;
  settings: Settings;
  initialHeight?: number;
  onDetach: () => void;
  onOffsetChange: (ox: number, oy: number) => void;
}

export function MiniView({ claudeUsage, codexUsage, settings, initialHeight, onDetach, onOffsetChange }: MiniViewProps) {
  const showClaude = settings.providers.claude.enabled && claudeUsage?.primaryWindow;
  const showCodex = settings.providers.codex.enabled && codexUsage?.primaryWindow;

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
    if (!e.ctrlKey) return;
    e.preventDefault();
    setDragging(true);
    setDragStart({
      screenX: e.screenX,
      screenY: e.screenY,
      baseOffsetX: wa?.offsetX ?? 0,
      baseOffsetY: wa?.offsetY ?? 0,
    });
  }, [wa?.offsetX, wa?.offsetY]);

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

  // main プロセスからコンテンツ高さを受信
  const [contentH, setContentH] = useState(initialHeight ?? 48);
  useEffect(() => {
    const cleanup = window.electronAPI?.onContentResized?.((_, h) => {
      setContentH(h);
    });
    return cleanup;
  }, []);

  // 高さからすべてのサイズを算出（クランプなし — ウィンドウ制約でバウンド）
  const donutSize = Math.round(contentH * 0.7);
  const labelSize = Math.max(5, Math.round(contentH * 0.14));
  const gapPx = Math.max(2, Math.round(contentH * 0.04));

  // レンダリング後にコンテンツ幅を測定してmainに報告（幅のみ→フィードバックループなし）
  const contentRef = useRef<HTMLDivElement>(null);
  const lastReportedWidth = useRef(0);
  useLayoutEffect(() => {
    if (!contentRef.current) return;
    const w = Math.ceil(contentRef.current.scrollWidth) + 8;
    if (w !== lastReportedWidth.current) {
      lastReportedWidth.current = w;
      window.electronAPI?.setMiniWidth?.(w);
    }
  }, [donutSize, showClaude, showCodex, contentH]);

  return (
    <div
      className={`w-full h-full flex items-center justify-center rounded-lg select-none ${dragging ? 'cursor-grabbing' : 'cursor-default'}`}
      style={{ background: 'rgba(24,24,27,0.88)' }}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDetach}
      title="Double-click to detach / Ctrl+drag to adjust / Ctrl+resize"
    >
      <div ref={contentRef} className="flex items-center" style={{ gap: gapPx }}>
        {showClaude && (
          <MiniProviderGroup
            label="Claude"
            pw={claudeUsage!.primaryWindow!}
            color={getColor('claude', claudeUsage!.primaryWindow!.usedPercent)}
            displayMode={settings.displayMode}
            donutSize={donutSize}
            labelSize={labelSize}
            gap={gapPx}
          />
        )}
        {showClaude && showCodex && (
          <div className="w-px bg-zinc-700 self-stretch" style={{ marginBlock: gapPx }} />
        )}
        {showCodex && (
          <MiniProviderGroup
            label="Codex"
            pw={codexUsage!.primaryWindow!}
            color={getColor('codex', codexUsage!.primaryWindow!.usedPercent)}
            displayMode={settings.displayMode}
            donutSize={donutSize}
            labelSize={labelSize}
            gap={gapPx}
          />
        )}
        {!showClaude && !showCodex && (
          <span className="text-zinc-500 text-[10px]">--</span>
        )}
      </div>
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
}: {
  label: string;
  pw: UsageWindow;
  color: string;
  displayMode: DisplayMode;
  donutSize: number;
  labelSize: number;
  gap: number;
}) {
  const usedPct = displayMode === 'remaining' ? 100 - pw.usedPercent : pw.usedPercent;
  const timeInfo = useTimeInfo(pw.resetAt, pw.limitWindowSeconds, displayMode);

  return (
    <div className="flex items-center" style={{ gap }}>
      <span className="font-semibold text-zinc-500 leading-none whitespace-nowrap" style={{ fontSize: labelSize }}>{label}</span>
      <MiniDonut size={donutSize} value={Math.round(Math.max(0, Math.min(100, usedPct)))} color={color} text={`${Math.round(usedPct)}%`} />
      <MiniDonut size={donutSize} value={timeInfo.percent} color="#60a5fa" text={timeInfo.label} />
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
      return { percent: 0, label: '--' };
    }
    const remainSec = Math.max(0, (new Date(resetAt).getTime() - Date.now()) / 1000);
    const elapsedSec = limitWindowSeconds - remainSec;

    const pct = displayMode === 'remaining'
      ? (remainSec / limitWindowSeconds) * 100
      : (elapsedSec / limitWindowSeconds) * 100;

    const displaySec = displayMode === 'remaining' ? remainSec : elapsedSec;
    const h = Math.floor(displaySec / 3600);
    const m = Math.floor((displaySec % 3600) / 60);
    const lbl = h > 0 ? `${h}h${m}m` : `${m}m`;

    return { percent: Math.max(0, Math.min(100, pct)), label: lbl };
  }, [resetAt, limitWindowSeconds, displayMode]);

  const [info, setInfo] = useState(calc);

  useEffect(() => {
    setInfo(calc());
    const id = setInterval(() => setInfo(calc()), 30_000);
    return () => clearInterval(id);
  }, [calc]);

  return info;
}
