import { create } from 'zustand';
import type {
  UsageSnapshot,
  TokenUsageSnapshot,
  Settings,
} from './types';

interface AppState {
  // Usage data
  claudeUsage: UsageSnapshot | null;
  codexUsage: UsageSnapshot | null;
  claudeTokenUsage: TokenUsageSnapshot | null;
  codexTokenUsage: TokenUsageSnapshot | null;

  // Settings
  settings: Settings | null;
  settingsOpen: boolean;

  // Loading states
  loading: boolean;
  error: string | null;

  // Actions
  setClaudeUsage: (snapshot: UsageSnapshot | null) => void;
  setCodexUsage: (snapshot: UsageSnapshot | null) => void;
  setClaudeTokenUsage: (snapshot: TokenUsageSnapshot | null) => void;
  setCodexTokenUsage: (snapshot: TokenUsageSnapshot | null) => void;
  setSettings: (settings: Settings) => void;
  setSettingsOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  claudeUsage: null,
  codexUsage: null,
  claudeTokenUsage: null,
  codexTokenUsage: null,
  settings: null,
  settingsOpen: false,
  loading: false,
  error: null,
  setClaudeUsage: (snapshot) => set({ claudeUsage: snapshot }),
  setCodexUsage: (snapshot) => set({ codexUsage: snapshot }),
  setClaudeTokenUsage: (snapshot) => set({ claudeTokenUsage: snapshot }),
  setCodexTokenUsage: (snapshot) => set({ codexTokenUsage: snapshot }),
  setSettings: (settings) => set({ settings }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
