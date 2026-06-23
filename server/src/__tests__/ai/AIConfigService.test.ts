/**
 * AIConfigService - 单测（任务 3.2）
 * 验证：env key 优先、apiKey 不落盘、maskApiKey 格式
 */
import {
  maskApiKey,
  savePersistedConfig,
  resolveApiKey,
} from '../../ai/AIConfigService';
import { readFileSync, unlinkSync, existsSync } from 'fs';

const CONFIG_FILE = 'ai_config.json';

// Clean up config file between tests
afterEach(() => {
  try { unlinkSync(CONFIG_FILE); } catch { /* ok */ }
});

describe('maskApiKey', () => {
  test('masks key showing only last 4 chars', () => {
    expect(maskApiKey('sk-abcdef1234')).toBe('••••1234');
  });

  test('short key returns masked', () => {
    expect(maskApiKey('sk')).toBe('••••');
  });

  test('empty string returns empty', () => {
    expect(maskApiKey('')).toBe('');
  });

  test('exactly 4 chars returns masked', () => {
    expect(maskApiKey('1234')).toBe('••••');
  });
});

describe('savePersistedConfig', () => {
  test('does not write apiKey to file', () => {
    savePersistedConfig({
      apiKey: 'sk-secret-key-123',
      baseUrl: 'https://api.example.com',
      defaultModel: 'test-model',
      narratorModel: 'narrator',
      combatModel: 'combat',
      temperature: 0.8,
      maxTokens: 4096,
    });

    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.apiKey).toBe('');
    expect(parsed.baseUrl).toBe('https://api.example.com');
    expect(parsed.defaultModel).toBe('test-model');
  });
});

describe('resolveApiKey', () => {
  test('env key takes priority over file', () => {
    // Write a key to the file
    savePersistedConfig({
      apiKey: 'file-key-123',
      baseUrl: 'https://api.example.com',
      defaultModel: 'test-model',
      narratorModel: 'narrator',
      combatModel: 'combat',
      temperature: 0.8,
      maxTokens: 4096,
    });

    // Set env var
    const original = process.env.SILICONFLOW_API_KEY;
    process.env.SILICONFLOW_API_KEY = 'env-key-456';

    const key = resolveApiKey();
    expect(key).toBe('env-key-456');

    // Restore
    if (original) {
      process.env.SILICONFLOW_API_KEY = original;
    } else {
      delete process.env.SILICONFLOW_API_KEY;
    }
  });

  test('falls back to file key when no env', () => {
    // Write a key to the file with apiKey in it (direct write for test)
    const { writeFileSync } = require('fs');
    writeFileSync(CONFIG_FILE, JSON.stringify({
      apiKey: 'file-key-789',
      baseUrl: 'https://api.example.com',
      defaultModel: 'test-model',
      narratorModel: 'narrator',
      combatModel: 'combat',
      temperature: 0.8,
      maxTokens: 4096,
    }));

    // Ensure env is not set
    const original = process.env.SILICONFLOW_API_KEY;
    delete process.env.SILICONFLOW_API_KEY;

    const key = resolveApiKey();
    expect(key).toBe('file-key-789');

    // Restore
    if (original) {
      process.env.SILICONFLOW_API_KEY = original;
    }
  });
});
