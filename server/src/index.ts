import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { readFileSync, writeFileSync } from 'fs';
import { AIGateway } from './ai/AIGateway';
import { AIGameMaster } from './ai/AIGameMaster';
import { CharacterCreator } from './core/CharacterCreator';
import { CharacterLevelUp } from './core/CharacterLevelUp';
import { StateManager } from './core/StateManager';
import { SessionRegistry } from './core/SessionRegistry';
import { SocketServer } from './network/SocketServer';
import { loadSessionData } from './core/SessionPersistence';
import type { AIConfig } from './ai/AIGateway';

const PORT = parseInt(process.env.PORT || '3000', 10);
const AI_CONFIG_FILE = 'ai_config.json'; // Persisted runtime AI config

// Mask API key for display (show only last 4 chars)
function maskApiKey(key: string): string {
  if (!key || key.length <= 4) return key ? '••••' : '';
  return '••••' + key.slice(-4);
}

// Persisted runtime AI config shape
interface PersistedAIConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  narratorModel: string;
  combatModel: string;
  temperature: number;
  maxTokens: number;
}

// Load persisted AI config from file (survives server restarts)
function loadPersistedConfig(): PersistedAIConfig | null {
  try {
    const raw = readFileSync(AI_CONFIG_FILE, 'utf-8');
    const cfg = JSON.parse(raw);
    if (cfg && cfg.apiKey) return cfg;
  } catch {
    // File doesn't exist or is invalid — that's fine
  }
  return null;
}

// Save runtime AI config to file
function savePersistedConfig(cfg: PersistedAIConfig): void {
  try {
    writeFileSync(AI_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist AI config:', err);
  }
}

// Simple AI config — prefer persisted file, then fall back to env vars
function getAIConfig(): AIConfig | null {
  // Try persisted config first (from runtime settings saved by user)
  const persisted = loadPersistedConfig();
  if (persisted) {
    return {
      apiKey: persisted.apiKey,
      baseUrl: persisted.baseUrl || 'https://api.siliconflow.cn/v1',
      defaultModel: persisted.defaultModel || 'nex-agi/Nex-N2-Pro',
      maxRetries: 3,
      retryDelay: 1000,
      maxConcurrent: 5,
    };
  }

  // Fall back to environment variables
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
    defaultModel: process.env.AI_DEFAULT_MODEL || 'nex-agi/Nex-N2-Pro',
    maxRetries: 3,
    retryDelay: 1000,
    maxConcurrent: 5,
  };
}

async function main() {
  const app = express();
  const httpServer = createServer(app);

  app.use(express.json());

  // CORS — allow all origins for local development
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Initialize AI Gateway (mutable for hot-reload)
  let aiConfig = getAIConfig();
  let aiGateway = aiConfig ? new AIGateway(aiConfig) : undefined;

  // Track current AI GM parameters — prefer persisted config, then env vars, then defaults
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

  // Initialize AI Game Master
  let aiGM = aiGateway && aiConfig
    ? new AIGameMaster({
        gateway: aiConfig,
        narratorModel: currentNarratorModel || aiConfig.defaultModel,
        combatModel: currentCombatModel || aiConfig.defaultModel,
        maxTokensPerResponse: currentMaxTokens,
        temperature: currentTemperature,
      })
    : undefined;

  // Helper: reinitialize AI with new config
  function reinitializeAI(updates: {
    apiKey?: string;
    baseUrl?: string;
    defaultModel?: string;
    narratorModel?: string;
    combatModel?: string;
    temperature?: number;
    maxTokens?: number;
  }): { success: boolean; errors?: string[] } {
    const errors: string[] = [];

    // Validate
    if (updates.apiKey !== undefined && updates.apiKey.length === 0) {
      errors.push('API Key 不能为空');
    }
    if (updates.baseUrl !== undefined && !/^https?:\/\/.+/.test(updates.baseUrl)) {
      errors.push('API 地址格式无效（需以 http:// 或 https:// 开头）');
    }
    if (updates.temperature !== undefined && ![0.4, 0.8, 1.2].includes(updates.temperature)) {
      errors.push('温度值无效（仅接受 0.4 / 0.8 / 1.2）');
    }
    if (updates.maxTokens !== undefined && (updates.maxTokens < 256 || updates.maxTokens > 1048576)) {
      errors.push('最大Token需在 256-1048576 之间');
    }
    if (errors.length > 0) return { success: false, errors };

    // Build new config — use ?? to allow explicit empty strings to pass through
    // but fall back to hardcoded defaults for base config (apiKey, baseUrl, defaultModel)
    const newApiKey = updates.apiKey ?? aiConfig?.apiKey ?? '';
    const newBaseUrl = updates.baseUrl || aiConfig?.baseUrl || 'https://api.siliconflow.cn/v1';
    const newDefaultModel = updates.defaultModel || aiConfig?.defaultModel || 'nex-agi/Nex-N2-Pro';

    // Update runtime parameters — ?? allows empty narratorModel (means "use default")
    if (updates.narratorModel !== undefined) currentNarratorModel = updates.narratorModel;
    if (updates.combatModel !== undefined) currentCombatModel = updates.combatModel;
    if (updates.temperature !== undefined) currentTemperature = updates.temperature;
    if (updates.maxTokens !== undefined) currentMaxTokens = updates.maxTokens;

    if (!newApiKey) {
      // No API key — disable AI and clear persisted config
      aiConfig = null;
      aiGateway = undefined;
      aiGM = undefined;
      socketServer.setAIGM(undefined);
      try { require('fs').unlinkSync(AI_CONFIG_FILE); } catch { /* ok */ }
      console.log('AI disabled: no API key');
      return { success: true };
    }

    aiConfig = {
      apiKey: newApiKey,
      baseUrl: newBaseUrl,
      defaultModel: newDefaultModel,
      maxRetries: 3,
      retryDelay: 1000,
      maxConcurrent: 5,
    };

    aiGateway = new AIGateway(aiConfig);

    aiGM = new AIGameMaster({
      gateway: aiConfig,
      narratorModel: currentNarratorModel || aiConfig.defaultModel,
      combatModel: currentCombatModel || aiConfig.defaultModel,
      maxTokensPerResponse: currentMaxTokens,
      temperature: currentTemperature,
    });

    socketServer.setAIGM(aiGM);

    // Persist config to file so it survives server restarts
    savePersistedConfig({
      apiKey: newApiKey,
      baseUrl: newBaseUrl,
      defaultModel: newDefaultModel,
      narratorModel: currentNarratorModel,
      combatModel: currentCombatModel,
      temperature: currentTemperature,
      maxTokens: currentMaxTokens,
    });

    console.log(`AI Gateway re-initialized (${aiConfig.baseUrl}, model: ${aiConfig.defaultModel})`);
    return { success: true };
  }

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      aiConnected: !!aiGateway,
      version: '2.0.0',
      rules: 'Daggerheart',
      campaign: 'Drakkenheim',
    });
  });

  // Create session registry for multi-session support
  const sessionRegistry = new SessionRegistry();

  // Try to restore sessions from persisted data
  const persistedData = loadSessionData();
  let stateManager: StateManager;

  if (persistedData && Object.keys(persistedData.sessions).length > 0) {
    // Restore all persisted sessions
    for (const [sessionId, sessionData] of Object.entries(persistedData.sessions)) {
      sessionRegistry.createSessionFromPersisted(sessionData);
    }

    // Use the default session's state manager
    const defaultSessionId = persistedData.defaultSessionId || Object.keys(persistedData.sessions)[0];
    const restoredDefault = sessionRegistry.findById(defaultSessionId);
    if (restoredDefault) {
      stateManager = restoredDefault;
      console.log(`Default session restored: ${defaultSessionId}`);
    } else {
      // Fallback: create new if default session ID not found
      const newSession = sessionRegistry.createSession();
      stateManager = newSession.stateManager;
      console.log(`Default session created: ${newSession.sessionId} (code: ${newSession.code})`);
    }

    console.log(`Restored ${Object.keys(persistedData.sessions).length} session(s) from session_data.json`);
  } else {
    // No persisted data — create a fresh default session
    const defaultSession = sessionRegistry.createSession();
    stateManager = defaultSession.stateManager;
    console.log(`Default session created: ${defaultSession.sessionId} (code: ${defaultSession.code})`);
  }

  // Setup Socket.IO
  const socketServer = new SocketServer(httpServer, sessionRegistry, aiGM);

  // Set up state change listeners for ALL sessions (including restored ones)
  for (const sessionInfo of sessionRegistry.getAllSessions()) {
    const sm = sessionRegistry.findById(sessionInfo.sessionId);
    if (sm) {
      sm.onChange('state', (state) => {
        socketServer.broadcastState(state);
        sessionRegistry.markDirty(state.sessionId);
      });
    }
  }

  // Also set up for the default session specifically (may already be covered above)
  stateManager.onChange('state', (state) => {
    socketServer.broadcastState(state);
    // Trigger debounced persistence
    sessionRegistry.markDirty(state.sessionId);
  });

  // API routes
  app.get('/api/session', (_req, res) => {
    res.json(stateManager.getState());
  });

  app.post('/api/session/start', (_req, res) => {
    stateManager.startSession();
    res.json({ status: 'started' });
  });

  app.post('/api/session/end', (_req, res) => {
    stateManager.endSession();
    res.json({ status: 'ended' });
  });

  // ===== Multi-session API =====

  app.post('/api/session/create', (_req, res) => {
    const { sessionId, code, stateManager: sm } = sessionRegistry.createSession();
    // Set up state change listener for new session
    sm.onChange('state', (state) => {
      socketServer.broadcastState(state);
      sessionRegistry.markDirty(state.sessionId);
    });
    // Persist immediately so the new session is saved
    sessionRegistry.persistSession(sessionId);
    res.json({ sessionId, code });
  });

  app.get('/api/session/by-code/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    const info = sessionRegistry.getSessionInfoByCode(code);
    if (!info) {
      res.status(404).json({ error: '房间码无效' });
      return;
    }
    res.json(info);
  });

  app.get('/api/session/:id/players', (req, res) => {
    const sm = sessionRegistry.findById(req.params.id);
    if (!sm) {
      res.status(404).json({ error: '会话不存在' });
      return;
    }
    const state = sm.getState();
    res.json({
      players: state.players.map(p => ({
        id: p.id,
        name: p.name,
        characterName: p.character?.name,
        isConnected: p.isConnected,
        joinedAt: p.joinedAt,
      })),
    });
  });

  app.get('/api/character', (_req, res) => {
    const char = stateManager.getCharacter();
    if (char) {
      res.json(char);
    } else {
      res.json(null);
    }
  });

  // Direct character set (from client character creation)
  app.put('/api/character', (req, res) => {
    const character = req.body;
    if (!character || !character.id || !character.name) {
      res.status(400).json({ errors: ['无效的角色数据'] });
      return;
    }
    stateManager.setCharacter(character);
    socketServer.broadcastState(stateManager.getState());
    console.log(`Character set: ${character.name} (${character.classId})`);
    res.json({ character: stateManager.getCharacter() });
  });

  // AI stats endpoint
  app.get('/api/ai/stats', (_req, res) => {
    if (aiGateway) {
      res.json(aiGateway.getStats());
    } else {
      res.json({ error: 'AI Gateway not configured' });
    }
  });

  // ===== AI Config API =====

  // Get current AI configuration (apiKey is masked)
  app.get('/api/ai/config', (_req, res) => {
    res.json({
      apiKey: aiConfig ? maskApiKey(aiConfig.apiKey) : '',
      baseUrl: aiConfig?.baseUrl || '',
      defaultModel: aiConfig?.defaultModel || '',
      narratorModel: currentNarratorModel || aiConfig?.defaultModel || '',
      combatModel: currentCombatModel || aiConfig?.defaultModel || '',
      temperature: currentTemperature,
      maxTokens: currentMaxTokens,
      aiConnected: !!aiGateway,
    });
  });

  // Update AI configuration (hot-reload)
  app.put('/api/ai/config', (req, res) => {
    const { apiKey, baseUrl, defaultModel, narratorModel, temperature, maxTokens } = req.body as {
      apiKey?: string;
      baseUrl?: string;
      defaultModel?: string;
      narratorModel?: string;
      temperature?: number;
      maxTokens?: number;
    };

    // If apiKey is masked (contains ••••), don't update it
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

    // Return updated config
    res.json({
      success: true,
      config: {
        apiKey: aiConfig ? maskApiKey(aiConfig.apiKey) : '',
        baseUrl: aiConfig?.baseUrl || '',
        defaultModel: aiConfig?.defaultModel || '',
        narratorModel: currentNarratorModel || '',
        temperature: currentTemperature,
        maxTokens: currentMaxTokens,
        aiConnected: !!aiGateway,
      },
    });
  });

  // Test AI connection
  app.post('/api/ai/test', async (_req, res) => {
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

  // Character creation data
  app.get('/api/data/classes', (_req, res) => {
    const classes = require('./rules/data/daggerheart/classes.json');
    res.json(classes);
  });

  app.get('/api/data/ancestries', (_req, res) => {
    const ancestries = require('./rules/data/daggerheart/ancestries.json');
    res.json(ancestries);
  });

  app.get('/api/data/communities', (_req, res) => {
    const communities = require('./rules/data/daggerheart/communities.json');
    res.json(communities);
  });

  app.get('/api/data/weapons', (_req, res) => {
    const weapons = require('./rules/data/daggerheart/weapons.json');
    res.json(weapons);
  });

  app.get('/api/data/armor', (_req, res) => {
    const armor = require('./rules/data/daggerheart/armor.json');
    res.json(armor);
  });

  app.get('/api/data/domains', (_req, res) => {
    const domains = require('./rules/data/daggerheart/domains.json');
    res.json(domains);
  });

  app.get('/api/data/enemies', (_req, res) => {
    const enemies = require('./rules/data/daggerheart/enemies.json');
    res.json(enemies);
  });

  app.get('/api/data/subclasses', (_req, res) => {
    const subclasses = require('./rules/data/daggerheart/subclasses.json');
    res.json(subclasses);
  });

  // Campaign data
  app.get('/api/data/factions', (_req, res) => {
    const factions = require('./campaign/data/factions.json');
    res.json(factions);
  });

  app.get('/api/data/locations', (_req, res) => {
    const locations = require('./campaign/data/locations.json');
    res.json(locations);
  });

  app.get('/api/data/npcs', (_req, res) => {
    const npcs = require('./campaign/data/npcs.json');
    res.json(npcs);
  });

  // Character creation endpoints
  app.post('/api/character/validate', (req, res) => {
    const { step, data } = req.body as { step: number; data: Record<string, unknown> };
    const creator = new CharacterCreator();
    creator.setStepData(data);
    creator.goToStep(step);
    const errors = creator.validateCurrentStep();
    res.json({ valid: Object.keys(errors).length === 0, errors });
  });

  app.post('/api/character/create', (req, res) => {
    const { data } = req.body as { data: Record<string, unknown> };
    const creator = new CharacterCreator();
    creator.setStepData(data);
    const { character, errors } = creator.buildCharacter();
    if (errors.length > 0) {
      res.status(400).json({ errors });
    } else {
      stateManager.setCharacter(character);
      socketServer.broadcastState(stateManager.getState());
      res.json({ character });
    }
  });

  // Character level-up endpoint
  app.post('/api/character/levelup', (req, res) => {
    const { newLevel, options, attributeChoices, experienceChoices, domainCardChoice, domainCardSwap } =
      req.body as {
        newLevel: number;
        options: string[];
        attributeChoices?: [string, string];
        experienceChoices?: [string, string];
        domainCardChoice?: string;
        domainCardSwap?: { add: string; remove: string };
      };

    const character = stateManager.getCharacter();
    if (!character) {
      res.status(404).json({ errors: ['角色不存在'] });
      return;
    }

    const request: import('./core/CharacterLevelUp').LevelUpRequest = {
      characterId: character.id,
      newLevel,
      options: options as any[],
      attributeChoices: attributeChoices as any,
      experienceChoices,
      domainCardChoice,
      domainCardSwap,
    };

    const result = CharacterLevelUp.levelUp(character, request);
    if (!result.success || !result.character) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    stateManager.setCharacter(result.character);
    socketServer.broadcastState(stateManager.getState());

    res.json({
      character: result.character,
      tierChanged: result.tierChanged,
      oldTier: result.oldTier,
      newTier: result.newTier,
    });
  });

  // Get available level-up options for the character
  app.get('/api/character/levelup-options', (_req, res) => {
    const character = stateManager.getCharacter();
    if (!character) {
      res.status(404).json({ errors: ['角色不存在'] });
      return;
    }
    const options = CharacterLevelUp.getAvailableOptions(character);
    const bonuses = CharacterLevelUp.getTierAdvancementBonuses(character.level + 1);
    res.json({ options, nextLevel: character.level + 1, bonuses });
  });

  // Inventory management
  app.post('/api/character/inventory/add', (req, res) => {
    const { itemId, name, quantity, description } = req.body as {
      itemId?: string;
      name?: string;
      quantity?: number;
      description?: string;
    };

    const character = stateManager.getCharacter();
    if (!character) {
      res.status(404).json({ errors: ['角色不存在'] });
      return;
    }

    const item = {
      id: itemId || `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name || '未命名物品',
      quantity: quantity || 1,
      description: description || '',
      equipped: false,
    };

    const existing = character.inventory.find(i => i.id === item.id);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      character.inventory.push(item);
    }

    stateManager.setCharacter(character);
    socketServer.broadcastState(stateManager.getState());

    res.json({ character, itemAdded: item });
  });

  app.post('/api/character/inventory/remove', (req, res) => {
    const { itemId, quantity } = req.body as { itemId: string; quantity?: number };

    const character = stateManager.getCharacter();
    if (!character) {
      res.status(404).json({ errors: ['角色不存在'] });
      return;
    }

    const itemIndex = character.inventory.findIndex(i => i.id === itemId);
    if (itemIndex < 0) {
      res.status(404).json({ errors: ['物品不存在'] });
      return;
    }

    const removeQty = quantity || character.inventory[itemIndex].quantity;
    if (removeQty >= character.inventory[itemIndex].quantity) {
      character.inventory.splice(itemIndex, 1);
    } else {
      character.inventory[itemIndex].quantity -= removeQty;
    }

    stateManager.setCharacter(character);
    socketServer.broadcastState(stateManager.getState());

    res.json({ character });
  });

  // Loot/consumable data endpoint
  app.get('/api/data/loot', (_req, res) => {
    try {
      const loot = require('./rules/data/daggerheart/loot.json');
      res.json(loot);
    } catch {
      res.json([]);
    }
  });

  app.get('/api/data/consumables', (_req, res) => {
    try {
      const consumables = require('./rules/data/daggerheart/consumables.json');
      res.json(consumables);
    } catch {
      res.json([]);
    }
  });

  // Start server
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

  // Graceful shutdown — save all session data before exiting
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
