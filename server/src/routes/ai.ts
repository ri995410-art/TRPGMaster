import { Router } from 'express';
import type { AIGateway } from '../ai/AIGateway';
import type { AIConfig } from '../ai/AIGateway';
import { maskApiKey } from '../ai/AIConfigService';

export interface AIRouterState {
  aiConfig: AIConfig | null;
  aiGateway: AIGateway | undefined;
  narratorModel: string;
  combatModel: string;
  temperature: number;
  maxTokens: number;
}

export function createAiRouter(
  getState: () => AIRouterState,
  reinitializeAI: (updates: {
    apiKey?: string;
    baseUrl?: string;
    defaultModel?: string;
    narratorModel?: string;
    combatModel?: string;
    temperature?: number;
    maxTokens?: number;
  }) => { success: boolean; errors?: string[] },
): Router {
  const router = Router();

  router.get('/api/ai/stats', (_req, res) => {
    const { aiGateway } = getState();
    if (aiGateway) {
      res.json(aiGateway.getStats());
    } else {
      res.json({ error: 'AI Gateway not configured' });
    }
  });

  router.get('/api/ai/config', (_req, res) => {
    const { aiConfig, narratorModel, combatModel, temperature, maxTokens, aiGateway } = getState();
    res.json({
      apiKey: aiConfig ? maskApiKey(aiConfig.apiKey) : '',
      baseUrl: aiConfig?.baseUrl || '',
      defaultModel: aiConfig?.defaultModel || '',
      narratorModel: narratorModel || aiConfig?.defaultModel || '',
      combatModel: combatModel || aiConfig?.defaultModel || '',
      temperature,
      maxTokens,
      aiConnected: !!aiGateway,
    });
  });

  router.put('/api/ai/config', (req, res) => {
    const { apiKey, baseUrl, defaultModel, narratorModel, temperature, maxTokens } = req.body as {
      apiKey?: string;
      baseUrl?: string;
      defaultModel?: string;
      narratorModel?: string;
      temperature?: number;
      maxTokens?: number;
    };

    const cleanApiKey = apiKey && apiKey.includes('••••') ? undefined : apiKey;

    const result = reinitializeAI({
      apiKey: cleanApiKey,
      baseUrl,
      defaultModel,
      narratorModel,
      temperature,
      maxTokens,
    });

    if (!result.success) {
      res.status(400).json({ success: false, errors: result.errors });
      return;
    }

    const state = getState();
    res.json({
      success: true,
      config: {
        apiKey: state.aiConfig ? maskApiKey(state.aiConfig.apiKey) : '',
        baseUrl: state.aiConfig?.baseUrl || '',
        defaultModel: state.aiConfig?.defaultModel || '',
        narratorModel: state.narratorModel || '',
        temperature: state.temperature,
        maxTokens: state.maxTokens,
        aiConnected: !!state.aiGateway,
      },
    });
  });

  router.post('/api/ai/test', async (_req, res) => {
    const { aiGateway, aiConfig } = getState();
    if (!aiGateway || !aiConfig) {
      res.json({ success: false, error: 'AI未配置，请先设置API Key和模型' });
      return;
    }

    try {
      const startTime = Date.now();
      const response = await aiGateway.sendRequest({
        model: aiConfig.defaultModel,
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Respond with exactly: OK' },
          { role: 'user', content: 'Hello' },
        ],
        temperature: 0.1,
        maxTokens: 16,
        agentType: 'test',
      });
      const responseTime = Date.now() - startTime;

      res.json({
        success: true,
        model: aiConfig.defaultModel,
        responseTime,
        tokenUsage: response.tokenUsage.totalTokens,
      });
    } catch (err: any) {
      res.json({
        success: false,
        model: aiConfig.defaultModel,
        error: err.message || '连接失败',
      });
    }
  });

  return router;
}
