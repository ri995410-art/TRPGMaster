import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import type { AIConfig } from './AIGateway';

const AI_CONFIG_FILE = 'ai_config.json';

export interface PersistedAIConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  narratorModel: string;
  combatModel: string;
  temperature: number;
  maxTokens: number;
}

export function maskApiKey(key: string): string {
  if (!key || key.length <= 4) return key ? '••••' : '';
  return '••••' + key.slice(-4);
}

export function loadPersistedConfig(): PersistedAIConfig | null {
  try {
    const raw = readFileSync(AI_CONFIG_FILE, 'utf-8');
    const cfg = JSON.parse(raw);
    if (cfg && cfg.apiKey) return cfg;
  } catch {
    // File doesn't exist or is invalid
  }
  return null;
}

export function savePersistedConfig(cfg: Omit<PersistedAIConfig, 'apiKey'> & { apiKey?: string }): void {
  try {
    writeFileSync(AI_CONFIG_FILE, JSON.stringify({ ...cfg, apiKey: '' }, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist AI config:', err);
  }
}

export function deletePersistedConfig(): void {
  try { unlinkSync(AI_CONFIG_FILE); } catch { /* ok */ }
}

// Env key takes priority; fall back to persisted file
export function resolveApiKey(): string | undefined {
  const envKey = process.env.SILICONFLOW_API_KEY;
  if (envKey) return envKey;

  const persisted = loadPersistedConfig();
  if (persisted?.apiKey) return persisted.apiKey;

  return undefined;
}

export function getAIConfig(): AIConfig | null {
  const apiKey = resolveApiKey();
  if (!apiKey) return null;

  const persisted = loadPersistedConfig();

  return {
    apiKey,
    baseUrl: persisted?.baseUrl || process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
    defaultModel: persisted?.defaultModel || process.env.AI_DEFAULT_MODEL || 'nex-agi/Nex-N2-Pro',
    maxRetries: 3,
    retryDelay: 1000,
    maxConcurrent: 5,
  };
}
