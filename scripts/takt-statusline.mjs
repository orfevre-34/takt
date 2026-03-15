#!/usr/bin/env node
// Takt Status Line for Claude Code
// Segments: [repo] project | [robot] model | [ctx] session | [clock] 5h usage
//
// Usage in ~/.claude/settings.json:
//   "statusLine": {
//     "type": "command",
//     "command": "node /path/to/takt-statusline.mjs",
//     "padding": 0
//   }
//
// Environment variables:
//   TAKT_STYLE        - "powerline" (default, requires Nerd Font) or "simple"
//   TAKT_DATA_DIR     - Override data directory (default: %APPDATA%/Takt)
//   TAKT_BAR_WIDTH    - Bar width in characters (default: 10)
//   TAKT_SHOW_7D      - "1" to also show 7-day window
//   TAKT_SHOW_COST    - "0" to hide cost (default: "1")

import { readFileSync } from 'fs';
import { join, basename } from 'path';

// ── Config ──────────────────────────────────────────────────────────────
const STYLE = process.env.TAKT_STYLE || 'powerline';
const BAR_WIDTH = parseInt(process.env.TAKT_BAR_WIDTH || '10', 10);
const SHOW_7D = process.env.TAKT_SHOW_7D === '1';
const SHOW_COST = process.env.TAKT_SHOW_COST === '1';
const DATA_DIR = process.env.TAKT_DATA_DIR ||
  join(process.env.APPDATA || '', 'Takt');

// ── ANSI Colors ─────────────────────────────────────────────────────────
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const fgC = (n) => `\x1b[38;5;${n}m`;
const bgC = (n) => `\x1b[48;5;${n}m`;

// Segment themes
const THEME = {
  project: { bg: 141, fg: 15, fgDim: 189 },                              // purple
  model:   { bg: 239, fg: 252, fgDim: 245 },                              // dark gray
  normal:  { bg: 71,  fg: 15, barFill: 15, barDim: 22,  fgDim: 194 },    // green
  warning: { bg: 178, fg: 15, barFill: 15, barDim: 136, fgDim: 230 },    // yellow
  danger:  { bg: 196, fg: 15, barFill: 15, barDim: 160, fgDim: 224 },    // red
  ctx:     { bg: 69,  fg: 15, barFill: 15, barDim: 25,  fgDim: 189 },    // blue
  ctxHigh: { bg: 208, fg: 15, barFill: 15, barDim: 166, fgDim: 230 },    // orange
  cost:    { bg: 236, fg: 250, fgDim: 245 },                              // dim gray
};

// ── Glyphs ──────────────────────────────────────────────────────────────
const GLYPHS = {
  powerline: {
    sepLeft: '\ue0be',
    sepRight: '\ue0b8',
    barFull: '━',
    barEmpty: '━',
    barCap: '╸',
    iconProject: '\udb83\udccf ',
    iconModel: '\udb81\udea9 ',
    iconCtx: '\uf24d ',        //  (layers/session)
    icon5h: '\uf017 ',         //  (clock)
    icon7d: '\uf073 ',         //  (calendar)
    iconCost: '\uf155 ',       //  (dollar)
  },
  simple: {
    sepLeft: '',
    sepRight: '',
    barFull: '━',
    barEmpty: '━',
    barCap: '╸',
    iconProject: '',
    iconModel: '',
    iconCtx: 'Ctx ',
    icon5h: '5h ',
    icon7d: '7d ',
    iconCost: '$',
  },
};

const G = GLYPHS[STYLE] || GLYPHS.simple;

// ── Helpers ─────────────────────────────────────────────────────────────
function getUsageStatus(pct) {
  if (pct >= 80) return THEME.danger;
  if (pct >= 60) return THEME.warning;
  return THEME.normal;
}

function getCtxStatus(pct) {
  if (pct >= 80) return THEME.ctxHigh;
  return THEME.ctx;
}

function buildBar(pct, width, fillColor, dimColor, segBgColor) {
  const filled = Math.round(pct * width / 100);
  const hasCap = filled > 0 && filled < width;
  const filledStr = G.barFull.repeat(hasCap ? filled - 1 : filled);
  const cap = hasCap ? G.barCap : '';
  const emptyStr = G.barEmpty.repeat(width - filled);
  return `${fgC(fillColor)}${filledStr}${cap}${fgC(dimColor)}${emptyStr}${bgC(segBgColor)}`;
}

function formatPct(pct) {
  return `${Math.round(pct)}%`;
}

function formatCost(usd) {
  if (usd < 0.01) return '$0';
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(1)}`;
}

function formatResetTime(resetAt) {
  if (!resetAt) return '';
  const now = Date.now();
  const reset = new Date(resetAt).getTime();
  const diffMin = Math.max(0, Math.round((reset - now) / 60000));
  if (diffMin < 60) return `${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function readSnapshot(provider) {
  try {
    const file = join(DATA_DIR, `usage_snapshot_${provider}.json`);
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function getProjectName(session) {
  const dir = session?.workspace?.project_dir || session?.cwd || '';
  return dir ? basename(dir) : '';
}

// ── Powerline Renderer ──────────────────────────────────────────────────
function renderPowerline(projectName, model, ctxPct, usedPct5h, resetTime5h, usedPct7d, costUsd) {
  const segments = [];

  // 1. Project name
  if (projectName) {
    const t = THEME.project;
    segments.push({
      bg: t.bg,
      content: `${fgC(t.fg)}${G.iconProject}${projectName}`,
    });
  }

  // 2. Model name
  if (model) {
    const t = THEME.model;
    segments.push({
      bg: t.bg,
      content: `${fgC(t.fg)}${G.iconModel}${model}`,
    });
  }

  // 3. Context window (session usage)
  {
    const s = getCtxStatus(ctxPct);
    const bar = buildBar(ctxPct, BAR_WIDTH, s.barFill, s.barDim, s.bg);
    segments.push({
      bg: s.bg,
      content: `${fgC(s.fg)}${G.iconCtx}${bar} ${fgC(s.fg)}${BOLD}${formatPct(ctxPct)}${RESET}${bgC(s.bg)}`,
    });
  }

  // 4. 5h session usage
  if (usedPct5h !== null) {
    const s = getUsageStatus(usedPct5h);
    const bar = buildBar(usedPct5h, BAR_WIDTH, s.barFill, s.barDim, s.bg);
    const resetLabel = resetTime5h ? ` ${fgC(s.fgDim)}${resetTime5h}` : '';
    segments.push({
      bg: s.bg,
      content: `${fgC(s.fg)}${G.icon5h}${bar} ${fgC(s.fg)}${BOLD}${formatPct(usedPct5h)}${RESET}${bgC(s.bg)}${resetLabel}`,
    });
  }

  // 5. 7d window (optional)
  if (SHOW_7D && usedPct7d !== null) {
    const s = getUsageStatus(usedPct7d);
    const bar = buildBar(usedPct7d, BAR_WIDTH, s.barFill, s.barDim, s.bg);
    segments.push({
      bg: s.bg,
      content: `${fgC(s.fg)}${G.icon7d}${bar} ${fgC(s.fg)}${BOLD}${formatPct(usedPct7d)}${RESET}${bgC(s.bg)}`,
    });
  }

  // 6. Cost (optional)
  if (SHOW_COST && costUsd > 0) {
    const t = THEME.cost;
    segments.push({
      bg: t.bg,
      content: `${fgC(t.fg)}${G.iconCost}${formatCost(costUsd)}`,
    });
  }

  // Build output
  let out = '';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prevBg = i > 0 ? segments[i - 1].bg : null;

    if (prevBg !== null) {
      out += `${fgC(prevBg)}${bgC(seg.bg)}${G.sepRight}`;
    } else {
      out += `${fgC(seg.bg)}${G.sepLeft}`;
    }

    out += `${bgC(seg.bg)} ${seg.content} `;
  }

  if (segments.length > 0) {
    out += `${RESET}${fgC(segments[segments.length - 1].bg)}${G.sepRight}${RESET}`;
  }

  process.stdout.write(out + '\n');
}

// ── Simple Renderer ─────────────────────────────────────────────────────
function renderSimple(projectName, model, ctxPct, usedPct5h, resetTime5h, usedPct7d, costUsd) {
  const parts = [];

  if (projectName) {
    parts.push(`${BOLD}${projectName}${RESET}`);
  }

  if (model) {
    parts.push(`${DIM}${model}${RESET}`);
  }

  {
    const s = getCtxStatus(ctxPct);
    const bar = buildBar(ctxPct, BAR_WIDTH, s.barFill, s.barDim, 0);
    parts.push(`${G.iconCtx}${bar}${RESET} ${fgC(s.bg)}${BOLD}${formatPct(ctxPct)}${RESET}`);
  }

  if (usedPct5h !== null) {
    const s = getUsageStatus(usedPct5h);
    const bar = buildBar(usedPct5h, BAR_WIDTH, s.barFill, s.barDim, 0);
    const reset = resetTime5h ? ` ${DIM}~${resetTime5h}${RESET}` : '';
    parts.push(`${G.icon5h}${bar}${RESET} ${fgC(s.bg)}${BOLD}${formatPct(usedPct5h)}${RESET}${reset}`);
  }

  if (SHOW_7D && usedPct7d !== null) {
    const s = getUsageStatus(usedPct7d);
    const bar = buildBar(usedPct7d, BAR_WIDTH, s.barFill, s.barDim, 0);
    parts.push(`${G.icon7d}${bar}${RESET} ${fgC(s.bg)}${BOLD}${formatPct(usedPct7d)}${RESET}`);
  }

  if (SHOW_COST && costUsd > 0) {
    parts.push(`${DIM}${formatCost(costUsd)}${RESET}`);
  }

  process.stdout.write(parts.join(` ${DIM}│${RESET} `) + '\n');
}

// ── Main ────────────────────────────────────────────────────────────────
function main() {
  let input = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    let session = {};
    try { session = JSON.parse(input); } catch { /* empty */ }

    const projectName = getProjectName(session);
    const model = session?.model?.display_name || '';
    const ctxPct = Math.floor(session?.context_window?.used_percentage || 0);
    const costUsd = session?.cost?.total_cost_usd || 0;

    const claudeSnap = readSnapshot('claude');
    const codexSnap = readSnapshot('codex');
    const snap = claudeSnap || codexSnap;

    const primary = snap?.primaryWindow;
    const secondary = snap?.secondaryWindow;

    const usedPct5h = primary ? Math.round(primary.usedPercent) : null;
    const resetTime5h = primary ? formatResetTime(primary.resetAt) : '';
    const usedPct7d = secondary ? Math.round(secondary.usedPercent) : null;

    if (STYLE === 'powerline') {
      renderPowerline(projectName, model, ctxPct, usedPct5h, resetTime5h, usedPct7d, costUsd);
    } else {
      renderSimple(projectName, model, ctxPct, usedPct5h, resetTime5h, usedPct7d, costUsd);
    }
  });
}

main();
