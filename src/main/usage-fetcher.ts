import { BrowserWindow, session, net } from 'electron';
import { log } from './logger';

// セッションを永続化するためのパーティション名
const CLAUDE_PARTITION = 'persist:claude';
const CODEX_PARTITION = 'persist:codex';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ログイン用ウィンドウ管理
let loginWindow: BrowserWindow | null = null;

// 同時フェッチを防ぐフラグ
let isFetchingClaude = false;
let isFetchingCodex = false;

function getPartition(provider: string): string {
  return provider === 'claude' ? CLAUDE_PARTITION : CODEX_PARTITION;
}

function getLoginUrl(provider: string): string {
  return provider === 'claude' ? 'https://claude.ai' : 'https://chatgpt.com';
}

/**
 * ログイン用ウィンドウを開く。閉じたらtrueを返す。
 */
export function openLoginWindow(provider: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.focus();
      resolve(false);
      return;
    }

    const partition = getPartition(provider);
    const url = getLoginUrl(provider);
    const providerName = provider === 'claude' ? 'Claude' : 'ChatGPT';

    loginWindow = new BrowserWindow({
      width: 900,
      height: 700,
      title: `${providerName} Login - Takt`,
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    loginWindow.loadURL(url);

    loginWindow.on('closed', () => {
      loginWindow = null;
      resolve(true);
    });
  });
}

/**
 * Promiseにタイムアウトを付ける
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timeout (${ms}ms)`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * セッションからCookieを取得してCookieヘッダ文字列を構築
 */
async function buildCookieHeader(ses: Electron.Session, url: string): Promise<string> {
  const cookies = await ses.cookies.get({ url });
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

/**
 * net.requestでJSON APIを叩く（Cookieヘッダを手動設定）
 * BrowserWindowを作らないのでメインウィンドウの描画に影響しない
 */
function fetchJson(url: string, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url });
    request.setHeader('Accept', 'application/json');
    request.setHeader('User-Agent', BROWSER_UA);
    for (const [key, value] of Object.entries(headers)) {
      request.setHeader(key, value);
    }

    let body = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => { body += chunk.toString(); });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          log(`HTTP ${response.statusCode} for ${url}:`, body.substring(0, 500));
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          log('JSON parse error for', url, ':', body.substring(0, 500));
          reject(new Error('Invalid JSON response'));
        }
      });
    });
    request.on('error', (err) => reject(err));
    request.end();
  });
}

/**
 * Claude使用量をフェッチ
 */
export async function fetchClaudeUsage(): Promise<unknown> {
  if (isFetchingClaude) return { ok: false, error: 'already_fetching' };
  isFetchingClaude = true;

  try {
    const ses = session.fromPartition(CLAUDE_PARTITION);

    // セッションCookieを確認
    const cookies = await ses.cookies.get({ url: 'https://claude.ai' });
    log('Claude cookies:', cookies.map(c => c.name).join(', '));

    const sessionCookie = cookies.find(c => c.name === 'sessionKey');
    if (!sessionCookie) {
      return { ok: false, error: 'not_logged_in' };
    }

    // orgIdをCookieから取得
    const orgCookie = cookies.find(c => c.name === 'lastActiveOrg');
    if (!orgCookie) {
      return { ok: false, error: 'no_org_id', message: 'Organization IDが見つかりません。claude.aiにログインし直してください。' };
    }
    const orgId = orgCookie.value;

    // Cookieヘッダを手動構築してnet.requestで叩く
    const cookieHeader = await buildCookieHeader(ses, 'https://claude.ai');
    const url = `https://claude.ai/api/organizations/${orgId}/usage`;

    const data = await withTimeout(
      fetchJson(url, {
        'Cookie': cookieHeader,
        'Referer': 'https://claude.ai/',
        'Origin': 'https://claude.ai',
      }),
      15000,
      'Claude API',
    );

    log('Claude API: 5h=', data.five_hour?.utilization, '% 7d=', data.seven_day?.utilization, '%');

    const snapshot = convertClaudeResponse(data);
    return { ok: true, snapshot };
  } catch (err: any) {
    log('fetchClaudeUsage error:', err.message);
    return { ok: false, error: err.message || String(err) };
  } finally {
    isFetchingClaude = false;
  }
}

/**
 * Codex使用量をフェッチ
 */
export async function fetchCodexUsage(): Promise<unknown> {
  if (isFetchingCodex) return { ok: false, error: 'already_fetching' };
  isFetchingCodex = true;

  try {
    const ses = session.fromPartition(CODEX_PARTITION);

    const cookies = await ses.cookies.get({ url: 'https://chatgpt.com' });
    log('Codex cookies:', cookies.map(c => c.name).join(', '));
    if (cookies.length === 0) {
      return { ok: false, error: 'not_logged_in' };
    }

    // まずaccess tokenを取得
    const cookieHeader = await buildCookieHeader(ses, 'https://chatgpt.com');
    const tokenData = await withTimeout(
      fetchJson('https://chatgpt.com/api/auth/session', {
        'Cookie': cookieHeader,
        'Referer': 'https://chatgpt.com/',
        'Origin': 'https://chatgpt.com',
      }),
      15000,
      'Codex session',
    ).catch(() => null);

    const accessToken = tokenData?.accessToken || tokenData?.access_token;
    if (!accessToken) {
      return { ok: false, error: 'not_logged_in' };
    }

    // Bearer tokenでusage APIを叩く
    const data = await withTimeout(
      fetchJson('https://chatgpt.com/backend-api/wham/usage', {
        'Authorization': `Bearer ${accessToken}`,
        'Cookie': cookieHeader,
        'Referer': 'https://chatgpt.com/',
        'Origin': 'https://chatgpt.com',
      }),
      15000,
      'Codex API',
    );

    log('Codex API: primary=', data.rate_limit?.primary_window?.used_percent, '% secondary=', data.rate_limit?.secondary_window?.used_percent, '%');

    const snapshot = convertCodexResponse(data);
    return { ok: true, snapshot };
  } catch (err: any) {
    log('fetchCodexUsage error:', err.message);
    return { ok: false, error: err.message || String(err) };
  } finally {
    isFetchingCodex = false;
  }
}

// Claude APIレスポンスをスナップショットに変換
function convertClaudeResponse(data: any) {
  return {
    provider: 'claude',
    fetchedAt: new Date().toISOString(),
    primaryWindow: convertClaudeWindow('primary', data.five_hour, 5 * 3600),
    secondaryWindow: convertClaudeWindow('secondary', data.seven_day, 7 * 86400),
  };
}

function convertClaudeWindow(kind: string, w: any, limitSeconds: number) {
  if (!w || w.utilization == null) return null;
  if (w.resets_at == null) return null;
  return {
    kind,
    usedPercent: w.utilization, // APIが既にパーセンテージ（0-100）を返す
    resetAt: w.resets_at,
    limitWindowSeconds: limitSeconds,
  };
}

// Codex APIレスポンスをスナップショットに変換
function convertCodexResponse(data: any) {
  const rl = data.rate_limit;
  return {
    provider: 'codex',
    fetchedAt: new Date().toISOString(),
    primaryWindow: convertCodexWindow('primary', rl?.primary_window),
    secondaryWindow: convertCodexWindow('secondary', rl?.secondary_window),
  };
}

function convertCodexWindow(kind: string, w: any) {
  if (!w || w.used_percent == null || w.limit_window_seconds == null) return null;
  if (w.used_percent === 0 && w.reset_after_seconds != null
    && Math.abs(w.limit_window_seconds - w.reset_after_seconds) < 0.001) {
    return null;
  }
  return {
    kind,
    usedPercent: w.used_percent, // APIが既にパーセンテージ（0-100）を返す
    resetAt: w.reset_at ? new Date(w.reset_at * 1000).toISOString() : null,
    limitWindowSeconds: w.limit_window_seconds,
  };
}
