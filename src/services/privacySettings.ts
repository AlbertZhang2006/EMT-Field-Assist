import type { DataMode } from '../types/index';

export type AutoDeletePeriod = 'never' | '24h' | '7d' | '30d' | '90d';

interface PrivacyConfig {
  aiEnabled: boolean;
  autoDeletePeriod: AutoDeletePeriod;
  appLockPin: string | null;
}

const STORAGE_KEY = 'emt-privacy-config';
const HISTORY_KEY = 'emt-call-history';
const CUSTOM_REGIONS_KEY = 'emt-custom-regions';

const DEFAULTS: PrivacyConfig = {
  aiEnabled: false,
  autoDeletePeriod: 'never',
  appLockPin: null,
};

function load(): PrivacyConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(config: PrivacyConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function isAIEnabled(): boolean {
  return load().aiEnabled;
}

export function setAIEnabled(enabled: boolean) {
  const config = load();
  config.aiEnabled = enabled;
  save(config);
}

export function getAutoDeletePeriod(): AutoDeletePeriod {
  return load().autoDeletePeriod;
}

export function setAutoDeletePeriod(period: AutoDeletePeriod) {
  const config = load();
  config.autoDeletePeriod = period;
  save(config);
}

export function getAppLockPinHash(): string | null {
  return load().appLockPin;
}

export function isAppLockEnabled(): boolean {
  return !!load().appLockPin;
}

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin + 'emt-field-assist');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function setAppLockPin(pin: string | null) {
  const config = load();
  config.appLockPin = pin ? await hashPin(pin) : null;
  save(config);
}

export async function verifyPin(entry: string): Promise<boolean> {
  const stored = load().appLockPin;
  if (!stored) return true;
  const hashed = await hashPin(entry);
  return hashed === stored;
}

export function getDataModeLabel(): DataMode {
  const config = load();
  if (config.aiEnabled) return 'ai_assisted';
  const regionId = localStorage.getItem('emt-protocol-region') ?? 'demo';
  if (regionId === 'none') return 'local_draft';
  return 'protocol_only';
}

export const DATA_MODE_LABELS: Record<DataMode, { label: string; description: string }> = {
  local_draft: { label: 'Local Draft', description: 'No protocol guidance. Documentation only.' },
  protocol_only: { label: 'Protocol Support', description: 'Local protocol guidance. No data sent externally.' },
  ai_assisted: { label: 'AI Assisted', description: 'Transcript sent to AI service for enhanced guidance.' },
};

export function deleteAllCallData() {
  localStorage.removeItem(HISTORY_KEY);
}

export function deleteAllAppData() {
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(CUSTOM_REGIONS_KEY);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('emt-protocol-region');
}

const PERIOD_MS: Record<AutoDeletePeriod, number> = {
  never: Infinity,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

export function filterExpiredCalls<T extends { endedAt?: number; startedAt: number }>(calls: T[]): T[] {
  const period = getAutoDeletePeriod();
  if (period === 'never') return calls;
  const cutoff = Date.now() - PERIOD_MS[period];
  return calls.filter((c) => (c.endedAt ?? c.startedAt) > cutoff);
}
