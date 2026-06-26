import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { AIGateway } from './ai/AIGateway';
import { AIGameMaster } from './ai/AIGameMaster';
import { buildWorldLore } from './campaign/buildWorldLore';
import { getAIConfig, loadPersistedConfig, savePersistedConfig, deletePersistedConfig, maskApiKey } from './ai/AIConfigService';
import type { AIConfig } from './ai/AIGateway';
import { StateManager } from './core/StateManager';
import { SessionRegistry } from './core/SessionRegistry';
import { SocketServer } from './network/SocketServer';
import { loadSessionData } from './core/SessionPersistence';
import { FileSessionStore } from './core/FileSessionStore';
import type { SessionStore } from './core/SessionStore';
import { createSessionRouter } from './routes/session';
import { createCharacterRouter } from './routes/character';
import { createAiRouter } from './routes/ai';
import type { AIRouterState } from './routes/ai';
import { createDataRouter } from './routes/data';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  const app = express();
  const httpServer = createServer(app);

  app.use(express.json());
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  // Session store (history persistence + turn lock)
  const sessionStore: SessionStore = new FileSessionStore();

  // Initialize AI
  let aiConfig = getAIConfig();
  let aiGateway = aiConfig ? new AIGateway(aiConfig) : undefined;

  const persisted = loadPersistedConfig();
  let currentNarratorModel = persisted?.narratorModel || process.env.AI_NARRATOR_MODEL || (aiConfig?.defaultModel || '');
  let currentCombatModel = persisted?.combatModel || process.env.AI_COMBAT_MODEL || (aiConfig?.defaultModel || '');
  let currentTemperature = persisted?.temperature ?? 0.8;
  let currentMaxTokens = persisted?.maxTokens ?? 4096;

  if (aiGateway && aiConfig) {
    console.log(`AI Gateway initialized (${aiConfig.baseUrl})`);
  } else {
    console.log('Warning: No SILICONFLOW_API_KEY set, AI GM will use fallback responses');
  }

  let aiGM = aiGateway && aiConfig
    ? new AIGameMaster({
        gateway: aiConfig,
        narratorModel: currentNarratorModel || aiConfig.defaultModel,
        combatModel: currentCombatModel || aiConfig.defaultModel,
        maxTokensPerResponse: currentMaxTokens,
        temperature: currentTemperature,
      }, sessionStore)
    : undefined;
  aiGM?.setWorldLore(buildWorldLore());

  // Session registry
  const sessionRegistry = new SessionRegistry();
  const persistedData = loadSessionData();
  let stateManager: StateManager;

  if (persistedData && Object.keys(persistedData.sessions).length > 0) {
    for (const [sessionId, sessionData] of Object.entries(persistedData.sessions)) {
      sessionRegistry.createSessionFromPersisted(sessionData);
    }
    const defaultSessionId = persistedData.defaultSessionId || Object.keys(persistedData.sessions)[0];
    const restoredDefault = sessionRegistry.findById(defaultSessionId);
    if (restoredDefault) {
      stateManager = restoredDefault;
      console.log(`Default session restored: ${defaultSessionId}`);
    } else {
      const newSession = sessionRegistry.createSession();
      stateManager = newSession.stateManager;
      console.log(`Default session created: ${newSession.sessionId} (code: ${newSession.code})`);
    }
    console.log(`Restored ${Object.keys(persistedData.sessions).length} session(s)`);

    // Pre-warm AI conversation history from disk for all restored sessions
    if (sessionStore) {
      for (const sessionId of Object.keys(persistedData.sessions)) {
        sessionStore.getHistory(sessionId).then(entries => {
          if (entries.length > 0) {
            console.log(`[Startup] Pre-warmed ${entries.length} history entries for ${sessionId}`);
          }
        }).catch(() => {});
      }
    }
  } else {
    const defaultSession = sessionRegistry.createSession();
    stateManager = defaultSession.stateManager;
    console.log(`Default session created: ${defaultSession.sessionId} (code: ${defaultSession.code})`);
  }

  // Socket.IO
  const socketServer = new SocketServer(httpServer, sessionRegistry, aiGM);
  socketServer.setSessionStore(sessionStore);

  // Register onChange for ALL sessions (once per session, including default)
  for (const sessionInfo of sessionRegistry.getAllSessions()) {
    const sm = sessionRegistry.findById(sessionInfo.sessionId);
    if (sm) {
      sm.onChange('state', (state) => {
        socketServer.broadcastState(state);
        sessionRegistry.markDirty(state.sessionId);
      });
    }
  }

  // AI hot-reload
  function reinitializeAI(updates: {
    apiKey?: string; baseUrl?: string; defaultModel?: string;
    narratorModel?: string; combatModel?: string;
    temperature?: number; maxTokens?: number;
  }): { success: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (updates.apiKey !== undefined && updates.apiKey.length === 0) errors.push('API Key 不能为空');
    if (updates.baseUrl !== undefined && !/^https?:\/\/.+/.test(updates.baseUrl)) errors.push('API 地址格式无效');
    if (updates.temperature !== undefined && ![0.4, 0.8, 1.2].includes(updates.temperature)) errors.push('温度值无效');
    if (updates.maxTokens !== undefined && (updates.maxTokens < 256 || updates.maxTokens > 1048576)) errors.push('最大Token需在 256-1048576 之间');
    if (errors.length > 0) return { success: false, errors };

    const newApiKey = updates.apiKey ?? aiConfig?.apiKey ?? '';
    const newBaseUrl = updates.baseUrl || aiConfig?.baseUrl || 'https://api.siliconflow.cn/v1';
    const newDefaultModel = updates.defaultModel || aiConfig?.defaultModel || 'deepseek-ai/DeepSeek-V4-Flash';
    if (updates.narratorModel !== undefined) currentNarratorModel = updates.narratorModel;
    if (updates.combatModel !== undefined) currentCombatModel = updates.combatModel;
    if (updates.temperature !== undefined) currentTemperature = updates.temperature;
    if (updates.maxTokens !== undefined) currentMaxTokens = updates.maxTokens;

    if (!newApiKey) {
      aiConfig = null; aiGateway = undefined; aiGM = undefined;
      socketServer.setAIGM(undefined);
      deletePersistedConfig();
      console.log('AI disabled: no API key');
      return { success: true };
    }

    aiConfig = { apiKey: newApiKey, baseUrl: newBaseUrl, defaultModel: newDefaultModel, maxRetries: 3, retryDelay: 1000, maxConcurrent: 5 };
    aiGateway = new AIGateway(aiConfig);
    aiGM = new AIGameMaster({ gateway: aiConfig, narratorModel: currentNarratorModel || aiConfig.defaultModel, combatModel: currentCombatModel || aiConfig.defaultModel, maxTokensPerResponse: currentMaxTokens, temperature: currentTemperature }, sessionStore);
    aiGM.setWorldLore(buildWorldLore());
    socketServer.setAIGM(aiGM);

    savePersistedConfig({ apiKey: newApiKey, baseUrl: newBaseUrl, defaultModel: newDefaultModel, narratorModel: currentNarratorModel, combatModel: currentCombatModel, temperature: currentTemperature, maxTokens: currentMaxTokens });
    console.log(`AI Gateway re-initialized (${aiConfig.baseUrl}, model: ${aiConfig.defaultModel})`);
    return { success: true };
  }

  // Mount routers
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now(), aiConnected: !!aiGateway, version: '2.0.0', rules: 'Daggerheart', campaign: 'Drakkenheim' });
  });

  app.use(createSessionRouter(sessionRegistry, socketServer, () => stateManager));
  app.use(createCharacterRouter(stateManager, socketServer));
  app.use(createAiRouter(() => ({ aiConfig, aiGateway, narratorModel: currentNarratorModel, combatModel: currentCombatModel, temperature: currentTemperature, maxTokens: currentMaxTokens }), reinitializeAI));
  app.use(createDataRouter());

  // Start
  httpServer.listen(PORT, '0.0.0.0', () => {
    const defaultSessionId = sessionRegistry.getDefaultSessionId() || stateManager.getState().sessionId;
    console.log(`\n========================================`);
    console.log(`  TRPGMaster Server v2.0.0`);
    console.log(`  Rules: Daggerheart`);
    console.log(`  Campaign: Drakkenheim`);
    console.log(`  Default Session: ${defaultSessionId}`);
    console.log(`  Port: ${PORT}`);
    console.log(`  AI: ${aiGateway && aiConfig ? `Connected (${aiConfig.defaultModel})` : 'Fallback Mode'}`);
    console.log(`========================================\n`);
    console.log('Waiting for players to connect...');
  });

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    sessionRegistry.persistAll();
    console.log('Session data saved.');
    socketServer.close();
    httpServer.close();
    process.exit(0);
  });
}

main().catch(console.error);
