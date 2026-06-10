import { AgentAIConfig } from '../../ai/AgentAIConfig';

describe('AgentAIConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getConfig', () => {
    it('returns default config when no per-agent override', () => {
      process.env.SILICONFLOW_API_KEY = 'test-key';
      process.env.SILICONFLOW_BASE_URL = 'https://api.test.com/v1';
      process.env.AI_DEFAULT_MODEL = 'default-model';

      const config = new AgentAIConfig();
      const result = config.getConfig('narrative');

      expect(result.apiKey).toBe('test-key');
      expect(result.baseUrl).toBe('https://api.test.com/v1');
      expect(result.model).toBe('default-model');
    });

    it('returns per-agent model override when set', () => {
      process.env.SILICONFLOW_API_KEY = 'test-key';
      process.env.SILICONFLOW_BASE_URL = 'https://api.test.com/v1';
      process.env.AI_DEFAULT_MODEL = 'default-model';
      process.env.AI_NARRATIVE_MODEL = 'narrative-specific-model';

      const config = new AgentAIConfig();
      const result = config.getConfig('narrative');

      expect(result.model).toBe('narrative-specific-model');
    });

    it('converts camelCase agentType to SCREAMING_SNAKE_CASE', () => {
      process.env.SILICONFLOW_API_KEY = 'test-key';
      process.env.SILICONFLOW_BASE_URL = 'https://api.test.com/v1';
      process.env.AI_DEFAULT_MODEL = 'default-model';
      process.env.AI_IMAGE_DIRECTOR_MODEL = 'image-model';

      const config = new AgentAIConfig();
      const result = config.getConfig('imageDirector');

      expect(result.model).toBe('image-model');
    });

    it('handles memoryCompressor agentType', () => {
      process.env.SILICONFLOW_API_KEY = 'test-key';
      process.env.SILICONFLOW_BASE_URL = 'https://api.test.com/v1';
      process.env.AI_DEFAULT_MODEL = 'default-model';
      process.env.AI_MEMORY_COMPRESSOR_MODEL = 'memory-model';

      const config = new AgentAIConfig();
      const result = config.getConfig('memoryCompressor');

      expect(result.model).toBe('memory-model');
    });

    it('returns fallback values when no env vars set', () => {
      delete process.env.SILICONFLOW_API_KEY;
      delete process.env.SILICONFLOW_BASE_URL;
      delete process.env.AI_DEFAULT_MODEL;

      const config = new AgentAIConfig();
      const result = config.getConfig('narrative');

      expect(result.apiKey).toBe('');
      expect(result.baseUrl).toBe('https://api.siliconflow.cn/v1');
      expect(result.model).toBe('nex-agi/Nex-N2-Pro');
    });
  });

  describe('getSTTConfig', () => {
    it('returns STT config with model', () => {
      process.env.SILICONFLOW_API_KEY = 'test-key';
      process.env.SILICONFLOW_BASE_URL = 'https://api.test.com/v1';
      process.env.AI_STT_MODEL = 'TeleAI/TeleSpeechASR';

      const config = new AgentAIConfig();
      const result = config.getSTTConfig();

      expect(result.apiKey).toBe('test-key');
      expect(result.baseUrl).toBe('https://api.test.com/v1');
      expect(result.model).toBe('TeleAI/TeleSpeechASR');
    });

    it('returns default STT model when not set', () => {
      process.env.SILICONFLOW_API_KEY = 'test-key';
      process.env.SILICONFLOW_BASE_URL = 'https://api.test.com/v1';
      delete process.env.AI_STT_MODEL;

      const config = new AgentAIConfig();
      const result = config.getSTTConfig();

      expect(result.model).toBe('TeleAI/TeleSpeechASR');
    });
  });

  describe('getImageConfig', () => {
    it('returns image config with model', () => {
      process.env.SILICONFLOW_API_KEY = 'test-key';
      process.env.SILICONFLOW_BASE_URL = 'https://api.test.com/v1';
      process.env.AI_IMAGE_MODEL = 'Kwai-Kolors/Kolors';

      const config = new AgentAIConfig();
      const result = config.getImageConfig();

      expect(result.apiKey).toBe('test-key');
      expect(result.baseUrl).toBe('https://api.test.com/v1');
      expect(result.model).toBe('Kwai-Kolors/Kolors');
    });

    it('returns default image model when not set', () => {
      process.env.SILICONFLOW_API_KEY = 'test-key';
      process.env.SILICONFLOW_BASE_URL = 'https://api.test.com/v1';
      delete process.env.AI_IMAGE_MODEL;

      const config = new AgentAIConfig();
      const result = config.getImageConfig();

      expect(result.model).toBe('Kwai-Kolors/Kolors');
    });
  });

  describe('isConfigured', () => {
    it('returns true when API key is set', () => {
      process.env.SILICONFLOW_API_KEY = 'test-key';
      const config = new AgentAIConfig();
      expect(config.isConfigured()).toBe(true);
    });

    it('returns false when API key is not set', () => {
      delete process.env.SILICONFLOW_API_KEY;
      const config = new AgentAIConfig();
      expect(config.isConfigured()).toBe(false);
    });
  });

  describe('getAllConfigs', () => {
    it('returns config for all known agent types', () => {
      process.env.SILICONFLOW_API_KEY = 'test-key';
      process.env.SILICONFLOW_BASE_URL = 'https://api.test.com/v1';
      process.env.AI_DEFAULT_MODEL = 'default-model';

      const config = new AgentAIConfig();
      const all = config.getAllConfigs();

      expect(Object.keys(all)).toContain('narrative');
      expect(Object.keys(all)).toContain('npc');
      expect(Object.keys(all)).toContain('combat');
      expect(Object.keys(all)).toContain('rules');
      expect(Object.keys(all)).toContain('faction');
      expect(Object.keys(all)).toContain('imageDirector');
      expect(Object.keys(all)).toContain('novel');
      expect(Object.keys(all)).toContain('sceneDirector');
      expect(Object.keys(all)).toContain('memoryCompressor');
      expect(Object.keys(all)).toContain('intentParser');
    });
  });
});
