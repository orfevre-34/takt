import path from 'path';
import fs from 'fs';
import { getDataDir } from './paths';

const LOG_FILE = path.join(getDataDir(), 'debug.log');

export function log(...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const message = args.map(a =>
    typeof a === 'string' ? a : JSON.stringify(a, null, 2)
  ).join(' ');
  const line = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf-8');
  } catch {
    // ignore
  }
}

export function clearLog(): void {
  try {
    fs.writeFileSync(LOG_FILE, '', 'utf-8');
  } catch {
    // ignore
  }
}

export function getLogPath(): string {
  return LOG_FILE;
}
