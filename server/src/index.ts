import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { SessionOrchestrator } from './core/SessionOrchestrator';
import { RulesAgent } from './agents/RulesAgent';
import { NarrativeAgent } from './agents/NarrativeAgent';
import { NPCAgent } from './agents/NPCAgent';
import { CombatAgent } from './agents/CombatAgent';
import { FactionAgent } from './agents/FactionAgent';
import { MemoryCompressorAgent } from './agents/MemoryCompressorAgent';
import { ImageDirectorAgent } from './agents/ImageDirectorAgent';
import { NovelAgent } from './agents/NovelAgent';
import { SceneDirectorAgent } from './agents/SceneDirectorAgent';
import { UnifiedAgent } from './agents/UnifiedAgent';
import { AIGateway } from './ai/AIGateway';
import { AgentAIConfig } from './ai/AgentAIConfig';
import { CharacterCreator } from './core/CharacterCreator';
import { CharacterLevelUp } from './core/CharacterLevelUp';
import { SocketServer } from './network/SocketServer';
import { VoiceProcessor } from './input/VoiceProcessor';
import { ImageClient } from './image/ImageClient';
import { LANDiscovery } from './network/LANDiscovery';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  const app = express();
  const httpServer = createServer(app);

  app.use(express.json());

  // CORS — allow all origins for LAN development (React Native + Expo web mode)
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Initialize AgentAIConfig
  const agentAIConfig = new AgentAIConfig();
  const defaultConfig = agentAIConfig.getConfig('narrative');

  // Initialize AI Gateway
  const aiGateway = agentAIConfig.isConfigured()
    ? new AIGateway({
        apiKey: defaultConfig.apiKey,
        baseUrl: defaultConfig.baseUrl,
        defaultModel: defaultConfig.model,
        maxRetries: 3,
        retryDelay: 1000,
        maxConcurrent: 5,
      })
    : undefined;

  if (aiGateway) {
    console.log(`AI Gateway initialized with SiliconFlow (${defaultConfig.baseUrl})`);
  } else {
    console.log('Warning: No SILICONFLOW_API_KEY set, agents will use fallback responses');
  }

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      agents: ['rules', 'narrative', 'npc', 'combat', 'faction', 'memoryCompressor', 'imageDirector', 'novel', 'sceneDirector', 'unified'],
      aiConnected: !!aiGateway,
      models: agentAIConfig.isConfigured() ? agentAIConfig.getAllConfigs() : undefined,
      agentMode,
    });
  });

  // Create session orchestrator
  const orchestrator = new SessionOrchestrator('daggerheart', aiGateway, agentAIConfig);

  // Create VoiceProcessor and ImageClient with config
  const sttConfig = agentAIConfig.isConfigured() ? agentAIConfig.getSTTConfig() : undefined;
  const imageConfig = agentAIConfig.isConfigured() ? agentAIConfig.getImageConfig() : undefined;
  const voiceProcessor = new VoiceProcessor(sttConfig);
  const imageClient = new ImageClient(imageConfig);

  // Register all agents with per-agent AI config
  const multiAgents = [
    new RulesAgent(),
    new NarrativeAgent(aiGateway, agentAIConfig),
    new NPCAgent(aiGateway, agentAIConfig),
    new CombatAgent(aiGateway, agentAIConfig),
    new FactionAgent(aiGateway, agentAIConfig),
    new MemoryCompressorAgent(aiGateway, 30 * 60 * 1000, agentAIConfig),
    new ImageDirectorAgent(aiGateway, imageClient, agentAIConfig),
    new NovelAgent(aiGateway, agentAIConfig),
    new SceneDirectorAgent(aiGateway, agentAIConfig),
  ];
  const unifiedAgent = new UnifiedAgent(aiGateway, agentAIConfig);

  for (const agent of multiAgents) {
    orchestrator.getAgentCoordinator().registerAgent(
      agent.agentType,
      (event, context) => agent.process(event, context),
    );
    console.log(`Registered agent: ${agent.agentType}`);
  }
  orchestrator.getAgentCoordinator().registerAgent(
    unifiedAgent.agentType,
    (event, context) => unifiedAgent.process(event, context),
  );
  console.log(`Registered agent: ${unifiedAgent.agentType}`);

  // Track current agent mode
  let agentMode: 'multi' | 'unified' = 'multi';

  // Setup Socket.IO
  const socketServer = new SocketServer(httpServer, orchestrator);

  // Sync state changes to clients
  orchestrator.getStateManager().onChange('state', (state) => {
    socketServer.broadcastState(state);
  });

  // Forward agent output to clients via Socket.IO
  orchestrator.setAgentOutputHandler((agentType, output) => {
    socketServer.broadcastAgentOutput(agentType, output);
  });

  // API routes
  app.get('/api/session', (_req, res) => {
    res.json(orchestrator.getState());
  });

  app.post('/api/session/start', (_req, res) => {
    orchestrator.startSession();
    res.json({ status: 'started' });
  });

  app.post('/api/session/end', (_req, res) => {
    orchestrator.endSession();
    res.json({ status: 'ended' });
  });

  app.get('/api/characters', (_req, res) => {
    res.json(orchestrator.getStateManager().getAllCharacters());
  });

  // AI stats endpoint
  app.get('/api/ai/stats', (_req, res) => {
    if (aiGateway) {
      res.json(aiGateway.getStats());
    } else {
      res.json({ error: 'AI Gateway not configured' });
    }
  });

  // Agent status endpoint
  app.get('/api/agents', (_req, res) => {
    res.json({
      enabled: orchestrator.getAgentCoordinator().getEnabledAgents(),
      processing: orchestrator.getAgentCoordinator().getProcessingCount(),
      mode: agentMode,
    });
  });

  // Agent mode switching (also available via socket.io agent:mode event)
  app.post('/api/agents/mode', (req, res) => {
    const { mode } = req.body as { mode: 'multi' | 'unified' };
    if (mode !== 'multi' && mode !== 'unified') {
      res.status(400).json({ error: 'Invalid mode. Use "multi" or "unified".' });
      return;
    }

    agentMode = mode;
    socketServer.switchAgentMode(mode);

    res.json({
      mode: agentMode,
      enabled: orchestrator.getAgentCoordinator().getEnabledAgents(),
    });
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
    const { playerId, data } = req.body as { playerId: string; data: Record<string, unknown> };
    const creator = new CharacterCreator();
    creator.setStepData(data);
    const { character, errors } = creator.buildCharacter(playerId);
    if (errors.length > 0) {
      res.status(400).json({ errors });
    } else {
      orchestrator.addPlayer(
        { playerId, name: character.name, connected: true, characterId: character.id, isActing: false },
        character,
      );
      // Broadcast updated state so all clients see the new character
      socketServer.broadcastState(orchestrator.getState());
      res.json({ character });
    }
  });

  // Character level-up endpoint (GM approves)
  app.post('/api/character/levelup', (req, res) => {
    const { characterId, newLevel, options, attributeChoices, experienceChoices, domainCardChoice, domainCardSwap } =
      req.body as {
        characterId: string;
        newLevel: number;
        options: string[];
        attributeChoices?: [string, string];
        experienceChoices?: [string, string];
        domainCardChoice?: string;
        domainCardSwap?: { add: string; remove: string };
      };

    const character = orchestrator.getStateManager().getCharacter(characterId);
    if (!character) {
      res.status(404).json({ errors: ['角色不存在'] });
      return;
    }

    const request: import('./core/CharacterLevelUp').LevelUpRequest = {
      characterId,
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

    // Update character in state manager
    orchestrator.getStateManager().setCharacter(result.character);
    socketServer.broadcastState(orchestrator.getState());

    res.json({
      character: result.character,
      tierChanged: result.tierChanged,
      oldTier: result.oldTier,
      newTier: result.newTier,
    });
  });

  // Get available level-up options for a character
  app.get('/api/character/:id/levelup-options', (req, res) => {
    const characterId = req.params.id;
    const character = orchestrator.getStateManager().getCharacter(characterId);
    if (!character) {
      res.status(404).json({ errors: ['角色不存在'] });
      return;
    }
    const options = CharacterLevelUp.getAvailableOptions(character);
    const bonuses = CharacterLevelUp.getTierAdvancementBonuses(character.level + 1);
    res.json({ options, nextLevel: character.level + 1, bonuses });
  });

  // GM inventory management - add item to character
  app.post('/api/character/:id/inventory/add', (req, res) => {
    const characterId = req.params.id;
    const { itemId, name, quantity, description } = req.body as {
      itemId?: string;
      name?: string;
      quantity?: number;
      description?: string;
    };

    const character = orchestrator.getStateManager().getCharacter(characterId);
    if (!character) {
      res.status(404).json({ errors: ['角色不存在'] });
      return;
    }

    // Generate item ID if not provided
    const item = {
      id: itemId || `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name || '未命名物品',
      quantity: quantity || 1,
      description: description || '',
      equipped: false,
    };

    // Check if item already exists in inventory
    const existing = character.inventory.find(i => i.id === item.id);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      character.inventory.push(item);
    }

    orchestrator.getStateManager().setCharacter(character);
    socketServer.broadcastState(orchestrator.getState());

    res.json({ character, itemAdded: item });
  });

  // GM inventory management - remove item from character
  app.post('/api/character/:id/inventory/remove', (req, res) => {
    const characterId = req.params.id;
    const { itemId, quantity } = req.body as { itemId: string; quantity?: number };

    const character = orchestrator.getStateManager().getCharacter(characterId);
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

    orchestrator.getStateManager().setCharacter(character);
    socketServer.broadcastState(orchestrator.getState());

    res.json({ character });
  });

  // Loot/consumable data endpoint
  app.get('/api/data/loot', (_req, res) => {
    const loot = require('./rules/data/daggerheart/loot.json');
    res.json(loot);
  });

  app.get('/api/data/consumables', (_req, res) => {
    const consumables = require('./rules/data/daggerheart/consumables.json');
    res.json(consumables);
  });

  // Start server
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================`);
    console.log(`  TRPGMaster Server v0.3.0`);
    console.log(`  Session ID: ${orchestrator.getSessionId()}`);
    console.log(`  Port: ${PORT}`);
    console.log(`  AI: ${aiGateway ? `SiliconFlow (${defaultConfig.model})` : 'Fallback Mode'}`);
    console.log(`  STT: ${voiceProcessor.isConfigured() ? 'Configured' : 'Not configured'}`);
    console.log(`  Image: ${imageClient.isConfigured() ? 'Configured' : 'Not configured'}`);
    console.log(`  Agents: ${multiAgents.map(a => a.agentType).join(', ')}, unified`);
    console.log(`========================================\n`);
    console.log('Waiting for players to connect...');
  });

  // Start LAN Discovery for local network device discovery
  const lanDiscovery = new LANDiscovery(19000);
  lanDiscovery.startBroadcasting({
    serviceName: 'TRPGMaster',
    port: PORT,
    host: '0.0.0.0',
    sessionId: orchestrator.getSessionId(),
  }).catch(err => console.error('LAN Discovery broadcast failed:', err.message));

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    lanDiscovery.stop();
    socketServer.close();
    httpServer.close();
    process.exit(0);
  });
}

main().catch(console.error);