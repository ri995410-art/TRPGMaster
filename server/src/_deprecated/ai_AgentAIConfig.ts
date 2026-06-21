export interface AgentAIConfigResult {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const KNOWN_AGENTS = [
  'narrative',
  'npc',
  'combat',
  'rules',
  'faction',
  'imageDirector',
  'novel',
  'sceneDirector',
  'memoryCompressor',
  'intentParser',
];

function camelToScreamingSnake(s: string): string {
  return s.replace(/[A-Z]/g, m => '_' + m).toUpperCase();
}

export class AgentAIConfig {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor() {
    this.apiKey = process.env.SILICONFLOW_API_KEY || '';
    this.baseUrl = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';
    this.defaultModel = process.env.AI_DEFAULT_MODEL || 'nex-agi/Nex-N2-Pro';
  }

  getConfig(agentType: string): AgentAIConfigResult {
    const envKey = `AI_${camelToScreamingSnake(agentType)}_MODEL`;
    const model = process.env[envKey] || this.defaultModel;

    return {
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      model,
    };
  }

  getSTTConfig(): AgentAIConfigResult {
    return {
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      model: process.env.AI_STT_MODEL || 'TeleAI/TeleSpeechASR',
    };
  }

  getImageConfig(): AgentAIConfigResult {
    return {
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      model: process.env.AI_IMAGE_MODEL || 'Kwai-Kolors/Kolors',
    };
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  getAllConfigs(): Record<string, AgentAIConfigResult> {
    const result: Record<string, AgentAIConfigResult> = {};
    for (const agentType of KNOWN_AGENTS) {
      result[agentType] = this.getConfig(agentType);
    }
    return result;
  }
}
