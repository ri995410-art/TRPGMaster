import { Server as IOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import enemyData from '../rules/data/daggerheart/enemies.json';
import type { StateManager } from '../core/StateManager';
import type { SessionRegistry } from '../core/SessionRegistry';
import type { AIGameMaster } from '../ai/AIGameMaster';
import { resolveDualityDice, gainFearOnRest } from '../rules/systems/DaggerHeartRules';
import { resolvePlayerAttack, resolveDamageToCharacter, resolveAbilityCheck } from '../rules/combatResolver';
import { rollLootTable, rollSceneSearchLoot } from '../rules/lootResolver';
import type { LootResult } from '@trpgmaster/shared';
import { applyPlayerAttack, applyDamageToCharacter } from './combatApply';
import { extractGmEffects, playerInputSuggestsCombat, extractEnemyNameFromNarration } from '../ai/extractGmEffects';
import { extractStateChanges, parseStateKeyValue, extractChoices, applyStateChanges } from './stateChangeParser';
import type {
  GameEvent,
  GameEventType,
  SessionState,
  Player,
  Character,
  ActionDeclaration,
  GmEffect,
  RollDeclaration,
  CombatEnemy,
  AdventureSummary,
} from '@trpgmaster/shared';
import type { AIGMContext } from '@trpgmaster/shared';
import type { PersistedAdventureMessage } from '../core/SessionPersistence';
import type { SessionStore } from '../core/SessionStore';
import { SpotlightManager } from '../core/SpotlightManager';
import { SafetyManager } from '../core/SafetyManager';

interface ConnectedClient {
  socketId: string;
  playerId: string;
  role: 'gm' | 'player';
  name: string;
  sessionId: string;       // Which session this client belongs to
  characterId?: string;    // Character ID for this client
}

// Socket message format for communication
interface SocketMessage<T = unknown> {
  type: string;
  sessionId: string;
  senderId: string;
  payload: T;
  timestamp: number;
}

export class SocketServer {
  private io: IOServer;
  private sessionRegistry: SessionRegistry;
  private aiGM: AIGameMaster | undefined;
  private clients: Map<string, ConnectedClient>;
  private activeStreams: Map<string, AbortController>; // sessionId → active stream controller (for X-Card abort)
  private sessionStore: SessionStore | null;
  private spotlightManager: SpotlightManager;
  private safetyManager: SafetyManager;

  constructor(httpServer: HttpServer, sessionRegistry: SessionRegistry, aiGM?: AIGameMaster) {
    this.sessionRegistry = sessionRegistry;
    this.aiGM = aiGM;
    this.clients = new Map();
    this.activeStreams = new Map();
    this.sessionStore = null;
    this.spotlightManager = new SpotlightManager();
    this.safetyManager = new SafetyManager();

    this.io = new IOServer(httpServer, {
      cors: { origin: '*' },
      transports: ['websocket', 'polling'],
      pingInterval: 10000,
      pingTimeout: 25000,
      maxHttpBufferSize: 5e6,
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);

      // ===== Session Management =====

      socket.on('session:join', (msg: SocketMessage<{ role: 'gm' | 'player'; name: string; character?: Character }>) => {
        this.handleJoin(socket, msg);
      });

      socket.on('session:create', (msg: SocketMessage<{ name: string; character?: Character }>) => {
        this.handleCreateSession(socket, msg);
      });

      socket.on('session:joinByCode', (msg: SocketMessage<{ code: string; name: string; character?: Character }>) => {
        this.handleJoinByCode(socket, msg);
      });

      socket.on('session:rejoin', (msg: SocketMessage<{ playerId: string; name: string; character?: Character }>) => {
        this.handleRejoin(socket, msg);
      });

      socket.on('session:rejoinById', (msg: SocketMessage<{ sessionId: string; playerId: string; name: string; character?: Character }>) => {
        this.handleRejoinById(socket, msg);
      });

      socket.on('session:info', () => {
        this.handleSessionInfo(socket);
      });

      socket.on('session:start', () => {
        this.handleSessionStart(socket);
      });

      socket.on('session:end', () => {
        this.handleSessionEnd(socket);
      });

      socket.on('session:leave', () => {
        this.handleLeave(socket);
      });

      // ===== Game Events =====

      socket.on('game:event', (msg: SocketMessage<GameEvent>) => {
        this.handleGameEvent(socket, msg);
      });

      socket.on('chat:message', (msg: SocketMessage<{ text: string; sender: string }>) => {
        const client = this.clients.get(socket.id);
        if (!client) return;
        const sessionId = client.sessionId;
        this.io.to(sessionId).emit('chat:message', msg);
      });

      socket.on('dice:roll', (msg: SocketMessage<{ hopeDie: number; fearDie: number; modifier: number; difficulty: number }>) => {
        const client = this.clients.get(socket.id);
        if (!client) return;
        const sessionId = client.sessionId;
        const stateManager = this.sessionRegistry.findById(sessionId);
        if (!stateManager) {
          this.io.to(sessionId).emit('dice:roll', msg);
          return;
        }

        const { hopeDie, fearDie, modifier, difficulty } = msg.payload;
        const result = resolveDualityDice(hopeDie, fearDie, modifier, difficulty);

        // Apply hope gain to character
        if (result.hopeGain > 0) {
          const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
          if (character) {
            stateManager.updateCharacterHope(result.hopeGain);
          }
        }

        // Apply fear gain to GM pool
        if (result.fearGain > 0) {
          stateManager.addFearPoints(result.fearGain);
        }

        // Broadcast enriched result (original fields + resolution)
        this.io.to(sessionId).emit('dice:roll', {
          ...msg,
          payload: {
            ...msg.payload,
            outcome: result.outcome,
            isCritical: result.isCritical,
            withHope: result.withHope,
            withFear: result.withFear,
            hopeGain: result.hopeGain,
            fearGain: result.fearGain,
            success: result.success,
            total: result.total,
          },
        });
      });

      socket.on('input:text', (msg: SocketMessage<{ text: string }>) => {
        this.handleInputText(socket, msg);
      });

      // ===== Player Actions (AI GM) =====

      socket.on('player:action', (msg: SocketMessage<{ action: string }>) => {
        this.handlePlayerAction(socket, msg);
      });

      socket.on('player:choice', (msg: SocketMessage<{ choiceId: string; choiceText: string }>) => {
        this.handlePlayerChoice(socket, msg);
      });

      socket.on('spotlight:request', () => {
        this.handleSpotlightRequest(socket);
      });

      socket.on('s0:submit', (msg: SocketMessage<{ lines: string[]; veils: string[]; toneFlags: string[] }>) => {
        this.handleS0Submit(socket, msg);
      });

      socket.on('safety:xcard', () => {
        this.handleXCard(socket);
      });

      socket.on('safety:resume', () => {
        this.handleSafetyResume(socket);
      });

      socket.on('player:rest', (msg: SocketMessage<{ restType: string; actions: string[]; projectDescription?: string }>) => {
        const client = this.clients.get(socket.id);
        const sessionId = client?.sessionId || msg.sessionId;
        const stateManager = this.sessionRegistry.findById(sessionId);

        // Apply fear gain on rest (server-side, deterministic)
        if (stateManager) {
          const restType: 'short' | 'long' = msg.payload.restType === 'long' ? 'long' : 'short';
          const fearGain = gainFearOnRest(restType);
          stateManager.addFearPoints(fearGain);
        }

        // Build action text
        let actionText = `请求${msg.payload.restType === 'long' ? '长' : '短'}休，活动：${msg.payload.actions.join('、')}`;
        if (msg.payload.projectDescription) {
          actionText += `，推进项目：${msg.payload.projectDescription}`;
        }

        // Still forward to AI GM for narrative
        this.handlePlayerAction(socket, {
          type: 'player:action',
          sessionId: msg.sessionId,
          senderId: msg.senderId,
          payload: { action: actionText },
          timestamp: msg.timestamp,
        });
      });

      // Legacy combat:action — routes as plain text narrative (no backend resolution)
      // Front-end should migrate to action:attack for structured combat resolution
      socket.on('combat:action', (msg: SocketMessage<{ actionId: string; targetId?: string }>) => {
        this.handlePlayerAction(socket, {
          type: 'player:action',
          sessionId: msg.sessionId,
          senderId: msg.senderId,
          payload: { action: `战斗行动：${msg.payload.actionId}${msg.payload.targetId ? `，目标：${msg.payload.targetId}` : ''}` },
          timestamp: msg.timestamp,
        });
      });

      socket.on('action:attack', (msg: SocketMessage<ActionDeclaration>) => {
        this.handleAttack(socket, msg);
      });

      socket.on('action:roll', (msg: SocketMessage<RollDeclaration>) => {
        this.handleActionRoll(socket, msg);
      });

      socket.on('combat:addEnemy', (msg: SocketMessage<{ statBlockId: string; name?: string }>) => {
        this.handleCombatAddEnemy(socket, msg);
      });

      socket.on('combat:end', () => {
        this.handleCombatEnd(socket);
      });

      socket.on('action:useFeature', (msg: SocketMessage<{ featureId: string; featureType: string; action: string; targetId?: string; attribute?: string }>) => {
        this.handleUseFeature(socket, msg);
      });

      socket.on('loot:pickup', (msg: SocketMessage<{ itemIds: string[] }>) => {
        this.handleLootPickup(socket, msg);
      });

      socket.on('scene:search', () => {
        this.handleSceneSearch(socket);
      });

      socket.on('adventure:end', () => {
        this.handleAdventureEnd(socket);
      });

      // ===== GM Narration =====

      socket.on('gm:narrate', () => {
        this.handleNarrationRequest(socket);
      });

      // ===== Character Update =====

      socket.on('character:update', (msg: SocketMessage<{ characterId: string; updates: Record<string, unknown> }>) => {
        this.handleCharacterUpdate(socket, msg);
      });

      socket.on('character:switch', (msg: SocketMessage<{ character: Character }>) => {
        this.handleCharacterSwitch(socket, msg);
      });

      socket.on('campaign:reset', () => {
        this.handleCampaignReset(socket);
      });

      // ===== Disconnect =====

      socket.on('disconnect', () => {
        this.handleLeave(socket);
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }

  // ===== Session Management Handlers =====

  private handleJoin(socket: Socket, msg: SocketMessage<{ role: 'gm' | 'player'; name: string; character?: Character; playerId?: string }>): void {
    const { role, name, character, playerId } = msg.payload;

    // Use stable playerId if provided, otherwise fall back to senderId
    const effectivePlayerId = playerId || msg.senderId;

    // Try to find an existing session this player belongs to (for rejoin after server restart)
    let sessionId: string;
    let stateManager: StateManager;
    const existingSession = this.sessionRegistry.findByPlayerId(effectivePlayerId);

    if (existingSession) {
      // Player already has a session — rejoin it
      sessionId = existingSession.getState().sessionId;
      stateManager = existingSession;
    } else {
      const allSessions = this.sessionRegistry.getAllSessions();
      if (allSessions.length > 0) {
        // Join the first (default) session for backward compat
        sessionId = allSessions[0].sessionId;
        stateManager = this.sessionRegistry.findById(sessionId)!;
      } else {
        // Create a default session if none exists
        const result = this.sessionRegistry.createSession();
        sessionId = result.sessionId;
        stateManager = result.stateManager;
      }
    }

    const client: ConnectedClient = {
      socketId: socket.id,
      playerId: effectivePlayerId,
      role,
      name,
      sessionId,
      characterId: character?.id,
    };

    this.clients.set(socket.id, client);
    socket.join(sessionId);

    // Check if this player already exists in the session (rejoin)
    const existingPlayer = stateManager.getPlayers().find(p => p.id === effectivePlayerId);

    if (existingPlayer) {
      // Silent rejoin: just update connection status, don't broadcast playerJoined
      existingPlayer.isConnected = true;
      if (character) {
        existingPlayer.character = character;
      }
      console.log(`${name} rejoined session ${sessionId} (playerId: ${effectivePlayerId})`);
    } else if (character && role === 'player') {
      // New player joining
      const player: Player = {
        id: effectivePlayerId,
        name,
        character,
        isConnected: true,
        joinedAt: Date.now(),
      };
      stateManager.addPlayer(player);

      // Notify others about the new player
      this.io.to(sessionId).emit('session:playerJoined', {
        type: 'session:playerJoined',
        sessionId,
        senderId: effectivePlayerId,
        payload: { name, characterName: character?.name },
        timestamp: Date.now(),
      });

      console.log(`${name} joined session ${sessionId} (playerId:${effectivePlayerId})`);
    }

    // Send full state to the client (including adventure messages)
    const state = stateManager.getState();
    const adventureMessages = stateManager.getAdventureMessages();
    socket.emit('game:state', {
      type: 'game:state',
      sessionId,
      senderId: 'system',
      payload: { state, adventureMessages },
      timestamp: Date.now(),
    });

    // Send player list to all clients in the session
    this.broadcastPlayerList(sessionId, stateManager);
  }

  private handleCreateSession(socket: Socket, msg: SocketMessage<{ name: string; character?: Character }>): void {
    const { name, character } = msg.payload;

    const { sessionId, code, stateManager } = this.sessionRegistry.createSession(msg.senderId);

    // Register client
    const client: ConnectedClient = {
      socketId: socket.id,
      playerId: msg.senderId,
      role: 'player',
      name,
      sessionId,
      characterId: character?.id,
    };
    this.clients.set(socket.id, client);
    socket.join(sessionId);

    // Add player as host
    if (character) {
      const player: Player = {
        id: msg.senderId,
        name,
        character,
        isConnected: true,
        joinedAt: Date.now(),
      };
      stateManager.addPlayer(player);
      this.sessionRegistry.setHostId(sessionId, msg.senderId);
    }

    // Send session info back
    socket.emit('session:created', {
      type: 'session:created',
      sessionId,
      senderId: 'system',
      payload: { sessionId, code, isHost: true },
      timestamp: Date.now(),
    });

    // Send state
    const state = stateManager.getState();
    const adventureMessages = stateManager.getAdventureMessages();
    socket.emit('game:state', {
      type: 'game:state',
      sessionId,
      senderId: 'system',
      payload: { state, adventureMessages },
      timestamp: Date.now(),
    });

    this.broadcastPlayerList(sessionId, stateManager);

    console.log(`${name} created session ${sessionId} with code ${code}`);
  }

  private handleJoinByCode(socket: Socket, msg: SocketMessage<{ code: string; name: string; character?: Character }>): void {
    const { code, name, character } = msg.payload;

    const stateManager = this.sessionRegistry.findByCode(code);
    if (!stateManager) {
      socket.emit('session:error', {
        type: 'session:error',
        sessionId: '',
        senderId: 'system',
        payload: { error: '房间码无效，请检查后重试', code },
        timestamp: Date.now(),
      });
      return;
    }

    const sessionId = stateManager.getState().sessionId;

    // Check if session is already started (can still join, but warn)
    const state = stateManager.getState();

    // Register client
    const client: ConnectedClient = {
      socketId: socket.id,
      playerId: msg.senderId,
      role: 'player',
      name,
      sessionId,
      characterId: character?.id,
    };
    this.clients.set(socket.id, client);
    socket.join(sessionId);

    // Add player to session
    if (character) {
      const player: Player = {
        id: msg.senderId,
        name,
        character,
        isConnected: true,
        joinedAt: Date.now(),
      };
      stateManager.addPlayer(player);
    }

    // Send join confirmation
    const isHost = this.sessionRegistry.getHostId(sessionId) === msg.senderId;
    socket.emit('session:joined', {
      type: 'session:joined',
      sessionId,
      senderId: 'system',
      payload: { sessionId, code, isHost, status: state.status },
      timestamp: Date.now(),
    });

    // Notify others in the session
    socket.to(sessionId).emit('session:playerJoined', {
      type: 'session:playerJoined',
      sessionId,
      senderId: msg.senderId,
      payload: { name, characterName: character?.name },
      timestamp: Date.now(),
    });

    // Send full state
    const updatedState = stateManager.getState();
    const adventureMessages = stateManager.getAdventureMessages();
    socket.emit('game:state', {
      type: 'game:state',
      sessionId,
      senderId: 'system',
      payload: { state: updatedState, adventureMessages },
      timestamp: Date.now(),
    });

    this.broadcastPlayerList(sessionId, stateManager);

    console.log(`${name} joined session ${sessionId} via code ${code}`);
  }

  private handleRejoin(socket: Socket, msg: SocketMessage<{ playerId: string; name: string; character?: Character }>): void {
    const { playerId, name, character } = msg.payload;

    // Find the session this player was in
    let stateManager = this.sessionRegistry.findByPlayerId(playerId);
    let sessionId: string;

    if (stateManager) {
      sessionId = stateManager.getState().sessionId;
    } else {
      // No session with this player found — fall back to first available or create new
      const allSessions = this.sessionRegistry.getAllSessions();
      if (allSessions.length > 0) {
        sessionId = allSessions[0].sessionId;
        stateManager = this.sessionRegistry.findById(sessionId)!;
      } else {
        const result = this.sessionRegistry.createSession();
        sessionId = result.sessionId;
        stateManager = result.stateManager;
      }
    }

    // Register client
    const client: ConnectedClient = {
      socketId: socket.id,
      playerId,
      role: 'player',
      name,
      sessionId,
      characterId: character?.id,
    };
    this.clients.set(socket.id, client);
    socket.join(sessionId);

    // Restore player connection status (silent — no playerJoined broadcast)
    const existingPlayer = stateManager.getPlayers().find(p => p.id === playerId);
    if (existingPlayer) {
      existingPlayer.isConnected = true;
      if (character) {
        existingPlayer.character = character;
      }
    } else if (character) {
      // Player not found in session — add as new player (but silently)
      const player: Player = {
        id: playerId,
        name,
        character,
        isConnected: true,
        joinedAt: Date.now(),
      };
      stateManager.addPlayer(player);
    }

    // Send rejoin confirmation (no playerJoined broadcast)
    socket.emit('session:rejoined', {
      type: 'session:rejoined',
      sessionId,
      senderId: 'system',
      payload: { sessionId, code: stateManager.getState().sessionCode },
      timestamp: Date.now(),
    });

    // Send full state
    const state = stateManager.getState();
    const adventureMessages = stateManager.getAdventureMessages();
    socket.emit('game:state', {
      type: 'game:state',
      sessionId,
      senderId: 'system',
      payload: { state, adventureMessages },
      timestamp: Date.now(),
    });

    // Update player list for all clients
    this.broadcastPlayerList(sessionId, stateManager);

    console.log(`${name} rejoined session ${sessionId} (rejoin, playerId: ${playerId})`);
  }

  /**
   * Handle session:rejoinById — rejoin a specific session by sessionId.
   * Like handleRejoin but targets an explicit session instead of searching by playerId.
   */
  private handleRejoinById(socket: Socket, msg: SocketMessage<{ sessionId: string; playerId: string; name: string; character?: Character }>): void {
    const { sessionId, playerId, name, character } = msg.payload;

    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) {
      socket.emit('session:error', {
        type: 'session:error',
        senderId: 'system',
        payload: { message: '会话不存在或已过期' },
        timestamp: Date.now(),
      });
      return;
    }

    // Leave any previous session room
    const prevClient = this.clients.get(socket.id);
    if (prevClient?.sessionId) {
      socket.leave(prevClient.sessionId);
    }

    // Register client
    const client: ConnectedClient = {
      socketId: socket.id,
      playerId,
      role: 'player',
      name,
      sessionId,
      characterId: character?.id,
    };
    this.clients.set(socket.id, client);
    socket.join(sessionId);

    // Restore or add player
    const existingPlayer = stateManager.getPlayers().find(p => p.id === playerId);
    if (existingPlayer) {
      existingPlayer.isConnected = true;
      if (character) {
        existingPlayer.character = character;
      }
    } else if (character) {
      const player: Player = {
        id: playerId,
        name,
        character,
        isConnected: true,
        joinedAt: Date.now(),
      };
      stateManager.addPlayer(player);
    }

    // Send rejoin confirmation
    socket.emit('session:rejoined', {
      type: 'session:rejoined',
      sessionId,
      senderId: 'system',
      payload: { sessionId, code: stateManager.getState().sessionCode },
      timestamp: Date.now(),
    });

    // Send full state
    const state = stateManager.getState();
    const adventureMessages = stateManager.getAdventureMessages();
    socket.emit('game:state', {
      type: 'game:state',
      sessionId,
      senderId: 'system',
      payload: { state, adventureMessages },
      timestamp: Date.now(),
    });

    this.broadcastPlayerList(sessionId, stateManager);
    console.log(`${name} rejoined session ${sessionId} by ID (playerId: ${playerId})`);
  }

  private handleSessionInfo(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const stateManager = this.sessionRegistry.findById(client.sessionId);
    if (!stateManager) return;

    const state = stateManager.getState();
    socket.emit('session:info', {
      type: 'session:info',
      sessionId: client.sessionId,
      senderId: 'system',
      payload: {
        sessionId: client.sessionId,
        code: state.sessionCode,
        status: state.status,
        playerCount: state.players.length,
        players: state.players.map(p => ({
          id: p.id,
          name: p.name,
          characterName: p.character?.name,
          isConnected: p.isConnected,
        })),
        isHost: this.sessionRegistry.getHostId(client.sessionId) === client.playerId,
      },
      timestamp: Date.now(),
    });
  }

  private handleSessionStart(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const stateManager = this.sessionRegistry.findById(client.sessionId);
    if (!stateManager) return;

    stateManager.startSession();

    const state = stateManager.getState();
    const sessionId = client.sessionId;

    if (state.status === 'sessionZero') {
      // Multi-player: enter Session Zero instead of active gameplay
      this.io.to(sessionId).emit('session:sessionZeroStarted', {
        type: 'session:sessionZeroStarted',
        sessionId,
        senderId: 'system',
        payload: { phase: state.sessionZeroPhase },
        timestamp: Date.now(),
      });

      // Start the S0 conversation with AI GM
      if (this.aiGM) {
        const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
        if (character) {
          const context = {
            sessionId,
            character,
            characters: state.characters.length > 0 ? state.characters : [character],
            activePlayerId: client.playerId,
            activePlayerName: client.name,
            sessionState: state,
            worldLore: this.aiGM?.getWorldLore(),
          };

          this.aiGM.runSessionZero(context).then(response => {
            const { cleanContent } = extractStateChanges(response.message.content);
            const choices = extractChoices(cleanContent);
            this.io.to(sessionId).emit('gm:narrate', {
              type: 'gm:narrate',
              sessionId,
              senderId: 'system',
              payload: {
                content: cleanContent,
                choices,
              },
              timestamp: Date.now(),
            });

            const gmMsg: PersistedAdventureMessage = {
              id: `msg_${Date.now()}_gm`,
              role: 'narrator',
              content: cleanContent,
              timestamp: Date.now(),
              choices: choices?.map(c => ({ id: c.id, text: c.label, action: c.action })),
            };
            stateManager.addAdventureMessage(gmMsg);
          }).catch(err => {
            console.error('S0 AI GM error:', err);
          });
        }
      }

      this.broadcastState(state);
      console.log(`Session ${sessionId} entering Session Zero (${state.characters.length} players)`);
    } else {
      // Single-player: go directly to active
      this.io.to(sessionId).emit('session:started', {
        type: 'session:started',
        sessionId,
        senderId: 'system',
        payload: { status: state.status },
        timestamp: Date.now(),
      });

      this.broadcastState(state);
      console.log(`Session ${sessionId} started by ${client.name}`);
    }
  }

  private handleSessionEnd(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const stateManager = this.sessionRegistry.findById(client.sessionId);
    if (!stateManager) return;

    stateManager.endSession();

    const state = stateManager.getState();
    const sessionId = client.sessionId;

    this.io.to(sessionId).emit('session:ended', {
      type: 'session:ended',
      sessionId,
      senderId: 'system',
      payload: { status: state.status },
      timestamp: Date.now(),
    });

    this.broadcastState(state);
    console.log(`Session ${sessionId} ended by ${client.name}`);
  }

  private handleCampaignReset(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const oldSessionId = client.sessionId;

    // Delete old session from persistence and registry
    this.sessionRegistry.removeSession(oldSessionId);

    // Create a fresh session
    const { sessionId, stateManager } = this.sessionRegistry.createSession(client.playerId);

    // Re-assign client to new session
    client.sessionId = sessionId;
    socket.leave(oldSessionId);
    socket.join(sessionId);

    // Start the fresh session
    stateManager.startSession();

    const state = stateManager.getState();

    this.io.to(sessionId).emit('campaign:resetDone', {
      type: 'campaign:resetDone',
      sessionId,
      senderId: 'system',
      payload: { state },
      timestamp: Date.now(),
    });

    this.broadcastState(state);
    console.log(`Campaign reset: ${oldSessionId} → ${sessionId} by ${client.name}`);
  }

  private handleLeave(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);

    this.clients.delete(socket.id);
    socket.leave(sessionId);

    // Mark player as disconnected (but keep their data)
    if (stateManager) {
      stateManager.removePlayer(client.playerId);
      // Remove from spotlight if holding or in queue
      const spotlight = stateManager.getSpotlightState();
      if (spotlight) {
        const newSpotlight = this.spotlightManager.removePlayer(spotlight, client.playerId);
        stateManager.setSpotlightState(newSpotlight);
        this.broadcastSpotlightState(sessionId, newSpotlight);
      }
      // Update player list silently — don't broadcast playerLeft
      // (player may just be reconnecting, we don't want the "left" spam)
      this.broadcastPlayerList(sessionId, stateManager);
    }
  }

  private handleGameEvent(socket: Socket, msg: SocketMessage<GameEvent>): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    this.io.to(sessionId).emit('game:event', msg);
  }

  private handleInputText(socket: Socket, msg: SocketMessage<{ text: string }>): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    this.io.to(sessionId).emit('chat:message', {
      type: 'chat:message',
      sessionId,
      senderId: msg.senderId,
      payload: { text: (msg.payload as { text: string }).text, sender: client.name },
      timestamp: Date.now(),
    });
  }

  // ===== Character Update =====

  private handleCharacterUpdate(socket: Socket, msg: SocketMessage<{ characterId: string; updates: Record<string, unknown> }>): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const stateManager = this.sessionRegistry.findById(client.sessionId);
    if (!stateManager) return;

    const { updates } = msg.payload;
    if (!updates) return;

    // In multi-player mode, update the specific player's character
    if (client.playerId && stateManager.getPlayers().length > 0) {
      stateManager.updatePlayerCharacter(client.playerId, updates as Partial<Character>);
    } else {
      // Single-player fallback
      stateManager.updateCharacter(updates as Partial<Character>);
    }

    // Broadcast updated character to all clients in the session
    const state = stateManager.getState();
    const sessionId = client.sessionId;

    this.io.to(sessionId).emit('character:update', {
      type: 'character:update',
      sessionId,
      senderId: 'system',
      payload: {
        characterId: msg.payload.characterId,
        character: stateManager.getCharacter(),
      },
      timestamp: Date.now(),
    });

    this.broadcastState(state);
  }

  // ===== Character Switch =====

  private handleCharacterSwitch(socket: Socket, msg: SocketMessage<{ character: Character }>): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const stateManager = this.sessionRegistry.findById(client.sessionId);
    if (!stateManager) return;

    const { character } = msg.payload;

    // Update the client's characterId
    client.characterId = character.id;

    // Update the player's character in the session state
    const player = stateManager.getPlayers().find(p => p.id === client.playerId);
    if (player) {
      player.character = character;
      // Also update in characters array
      const charIndex = stateManager.getState().characters.findIndex(c => c.id === character.id);
      if (charIndex >= 0) {
        stateManager.getState().characters[charIndex] = { ...character };
      } else {
        stateManager.getState().characters.push({ ...character });
      }
      // Sync backward compat
      if (stateManager.getPlayers()[0]?.id === client.playerId) {
        stateManager.getState().character = { ...character };
      }
    }

    // Broadcast updated state to all clients
    const state = stateManager.getState();
    const sessionId = client.sessionId;

    // Send updated character to the switching client
    socket.emit('character:update', {
      type: 'character:update',
      sessionId,
      senderId: 'system',
      payload: {
        characterId: character.id,
        character,
      },
      timestamp: Date.now(),
    });

    this.broadcastPlayerList(sessionId, stateManager);
    this.broadcastState(state);

    console.log(`${client.name} switched to character ${character.name}`);
  }

  // ===== Turn guard (shared by handlePlayerAction and handleAttack) =====

  private async guardTurn(
    socket: Socket,
    client: ConnectedClient,
    stateManager: StateManager,
  ): Promise<boolean> {
    const sessionId = client.sessionId;

    // Safety gate: reject if S0 not complete or X-Card active
    const safety = stateManager.getSafetyState();
    if (!this.safetyManager.canPlay(safety)) {
      if (safety?.phase === 's0') {
        socket.emit('session:error', {
          type: 'session:error',
          sessionId,
          senderId: 'system',
          payload: { error: '请先完成 Session Zero（提交 Lines/Veils）再开始游戏' },
          timestamp: Date.now(),
        });
      } else if (safety?.xcardActive) {
        socket.emit('session:error', {
          type: 'session:error',
          sessionId,
          senderId: 'system',
          payload: { error: '游戏已暂停（X-Card 已激活），等待主持人恢复' },
          timestamp: Date.now(),
        });
      }
      return false;
    }

    // Spotlight gate: reject if player cannot act
    const spotlight = stateManager.getSpotlightState();
    if (!this.spotlightManager.canAct(spotlight, client.playerId)) {
      if (spotlight) {
        const newSpotlight = this.spotlightManager.request(spotlight, client.playerId);
        stateManager.setSpotlightState(newSpotlight);
        this.broadcastSpotlightState(sessionId, newSpotlight);
      }
      socket.emit('action:queued', {
        type: 'action:queued',
        sessionId,
        senderId: 'system',
        payload: { queuePosition: spotlight?.queue.length ?? 0 },
        timestamp: Date.now(),
      });
      return false;
    }

    // Acquire turn lock
    if (this.sessionStore) {
      await this.sessionStore.acquireTurnLock(sessionId, 90000);
    }

    return true;
  }

  // ===== Player Action (AI GM) =====

  private async handlePlayerAction(socket: Socket, msg: SocketMessage<{ action: string }>): Promise<void> {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) return;

    const playerAction = (msg.payload as { action: string }).action;
    console.log(`Player action from ${client.name}: ${playerAction.substring(0, 80)}...`);

    // Store player action message on server
    stateManager.addAdventureMessage({
      id: `msg_${msg.timestamp}_player`,
      role: 'player',
      content: playerAction,
      timestamp: msg.timestamp,
    });

    // === Guard: safety + spotlight + turn lock ===
    if (!(await this.guardTurn(socket, client, stateManager))) return;

    if (this.aiGM) {
      const state = stateManager.getState();
      const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();

      if (!character) {
        socket.emit('gm:narrate', {
          type: 'gm:narrate',
          sessionId,
          senderId: 'system',
          payload: {
            content: '请先创建角色，然后开始冒险。在首页点击"新建战役"来创建你的角色。',
          },
          timestamp: Date.now(),
        });
        if (this.sessionStore) {
          await this.sessionStore.releaseTurnLock(sessionId);
        }
        return;
      }

      // Build AI GM context with party awareness
      const context = {
        sessionId,
        character,
        characters: state.characters.length > 0 ? state.characters : [character],
        activePlayerId: client.playerId,
        activePlayerName: client.name,
        sessionState: state,
        worldLore: this.aiGM?.getWorldLore(),
      };

      const isSessionZero = state.status === 'sessionZero';

      try {
        await this.runNarration(
          socket, client, stateManager, context, playerAction, isSessionZero,
        );
      } catch (err) {
        this.activeStreams.delete(sessionId);
        if (this.sessionStore) {
          await this.sessionStore.releaseTurnLock(sessionId);
        }
        console.error('AI GM error:', err);
        this.io.to(sessionId).emit('gm:narrate:end', {
          type: 'gm:narrate:end',
          sessionId,
          senderId: 'system',
          payload: {
            turnId: uuidv4(),
            fullText: `（AI管家暂时无法响应，请稍后重试。错误：${(err as Error).message}）`,
            choices: [],
            error: true,
          },
          timestamp: Date.now(),
        });
      }
    } else {
      // No AI GM configured — fallback response (non-streaming)
      socket.emit('gm:narrate', {
        type: 'gm:narrate',
        sessionId,
        senderId: 'system',
        payload: {
          content: this.getFallbackResponse(playerAction),
          choices: [
            { id: 'continue', label: '继续探索', action: 'explore' },
            { id: 'talk', label: '与NPC交谈', action: 'talk' },
            { id: 'rest', label: '休息', action: 'rest' },
          ],
          playerName: client.name,
        },
        timestamp: Date.now(),
      });
    }
  }

  // ===== Unified narration flow (shared by handlePlayerAction and handleAttack) =====

  private async runNarration(
    socket: Socket,
    client: ConnectedClient,
    stateManager: StateManager,
    context: AIGMContext,
    actionText: string,
    isSessionZero: boolean,
    resolvedOutcome?: { narrationHint: string },
  ): Promise<void> {
    const sessionId = client.sessionId;
    const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
    const turnId = uuidv4();

    const abortController = new AbortController();
    this.activeStreams.set(sessionId, abortController);
    this.io.to(sessionId).emit('gm:narrate:start', {
      type: 'gm:narrate:start',
      sessionId,
      senderId: 'system',
      payload: {
        turnId,
        activePlayerId: client.playerId,
        characterName: character.name,
        playerName: client.name,
      },
      timestamp: Date.now(),
    });

    let fullText = '';

    try {
      const onToken = (delta: string) => {
        fullText += delta;
        this.io.to(sessionId).emit('gm:narrate:delta', {
          type: 'gm:narrate:delta',
          sessionId,
          senderId: 'system',
          payload: { turnId, text: delta },
          timestamp: Date.now(),
        });
      };

      const aiContext = context;

      // If we have a resolved outcome, prepend it to the action text so AI knows the result
      const effectiveAction = resolvedOutcome
        ? `【已结算·请据此叙事，不要改动任何数字】${actionText}。结果：${resolvedOutcome.narrationHint}`
        : actionText;

      const response = isSessionZero
        ? await this.aiGM!.runSessionZero(aiContext, effectiveAction)
        : await this.aiGM!.processPlayerActionStream(aiContext, effectiveAction, onToken, undefined, abortController.signal, resolvedOutcome?.narrationHint);

      const rawContent = isSessionZero ? response.message.content : fullText;

      // Extract [STATE] changes from AI response (fallback — kept as safety net)
      const { cleanContent, stateChanges: parsedStateChanges } = extractStateChanges(rawContent);

      // Apply [STATE] changes to StateManager
      if (parsedStateChanges.length > 0) {
        applyStateChanges(stateManager, client.playerId, parsedStateChanges);
      }

      // Extract GM effects via structured channel (narration → JSON extraction)
      let effectsApplied = false;
      try {
        const gmModel = this.aiGM!.getConfig().narratorModel;
        const gmEffects = await extractGmEffects(this.aiGM!.getGateway(), cleanContent, gmModel, actionText);
        for (const effect of gmEffects) {
          this.applyGmEffect(stateManager, client.playerId, effect);
          effectsApplied = true;
        }
      } catch {
        // Structured extraction failure is non-fatal — [STATE] fallback may have already applied
      }

      // Keyword-based combat fallback: if player input suggests combat but no combat was triggered
      // by GM effects, force start combat with a generic enemy from the narration
      if (playerInputSuggestsCombat(actionText) && !stateManager.getCombatState()) {
          const enemyName = extractEnemyNameFromNarration(cleanContent) || '敌对者';
          const genericEnemy: CombatEnemy = {
            id: `enemy_${uuidv4()}`,
            statBlockId: 'generic',
            name: enemyName,
            currentHp: 5,
            maxHp: 5,
            currentStress: 0,
            maxStress: 3,
            conditions: [],
            isFocused: false,
            hasActed: false,
            evasion: 10,
          };
          stateManager.addCombatEnemy(genericEnemy);
          effectsApplied = true;
        }

      // Broadcast state after GM effects (e.g. enemies added to combat)
      if (effectsApplied) {
        this.broadcastState(stateManager.getState());
      }

      // Extract choices from cleaned content
      const choices = extractChoices(cleanContent);

      // Emit stream end
      this.io.to(sessionId).emit('gm:narrate:end', {
        type: 'gm:narrate:end',
        sessionId,
        senderId: 'system',
        payload: {
          turnId,
          fullText: cleanContent,
          choices,
          npcName: response.message.npcName,
          npcId: response.message.npcId,
          playerName: client.name,
          characterName: character.name,
        },
        timestamp: Date.now(),
      });

      // Store GM narration on server for persistence
      const gmMsg: PersistedAdventureMessage = {
        id: `msg_${Date.now()}_gm`,
        role: response.message.npcName ? 'npc' : 'narrator',
        content: cleanContent,
        timestamp: Date.now(),
        npcName: response.message.npcName,
        npcId: response.message.npcId,
        choices: choices?.map(c => ({ id: c.id, text: c.label, action: c.action })),
      };
      stateManager.addAdventureMessage(gmMsg);

      // Session Zero phase advancement
      if (isSessionZero) {
        const state = stateManager.getState();
        const S0_PHASES: Array<import('@trpgmaster/shared').SessionZeroPhase> = ['safety', 'worldbuilding', 'connections', 'expectations', 'narrativePact'];
        const currentPhase = state.sessionZeroPhase;
        const currentIndex = S0_PHASES.indexOf(currentPhase!);

        if (currentPhase !== 'safety' && currentIndex >= 0 && currentIndex < S0_PHASES.length - 1) {
          const nextPhase = S0_PHASES[currentIndex + 1];
          stateManager.setSessionZeroPhase(nextPhase);
          console.log(`Session Zero advanced to phase: ${nextPhase}`);
        } else if (currentPhase !== 'safety' && currentIndex === S0_PHASES.length - 1) {
          stateManager.completeSessionZero();
          this.io.to(sessionId).emit('session:completeSessionZero', {
            type: 'session:completeSessionZero',
            sessionId,
            senderId: 'system',
            payload: {},
            timestamp: Date.now(),
          });
          this.io.to(sessionId).emit('session:started', {
            type: 'session:started',
            sessionId,
            senderId: 'system',
            payload: { status: 'active' },
            timestamp: Date.now(),
          });
          this.broadcastState(stateManager.getState());
          console.log(`Session Zero completed, game is now active`);
        }
      }

      // Pass spotlight after turn completes
      const currentSpotlight = stateManager.getSpotlightState();
      if (currentSpotlight) {
        const newSpotlight = this.spotlightManager.pass(currentSpotlight);
        stateManager.setSpotlightState(newSpotlight);
        this.broadcastSpotlightState(sessionId, newSpotlight);
      }

      console.log(`AI GM responded to ${client.name} (streaming, ${fullText.length} chars)`);
    } finally {
      this.activeStreams.delete(sessionId);
      if (this.sessionStore) {
        await this.sessionStore.releaseTurnLock(sessionId);
      }
    }
  }

  // ===== Structured Attack (action:attack) =====

  private async handleAttack(socket: Socket, msg: SocketMessage<ActionDeclaration>): Promise<void> {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) return;

    // Guard: safety + spotlight + turn lock
    if (!(await this.guardTurn(socket, client, stateManager))) return;

    const decl = msg.payload;
    const attacker = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
    const enemy = stateManager.getCombatState()?.enemies.find(e => e.id === decl.targetId);
    if (!attacker || !enemy) {
      if (this.sessionStore) {
        await this.sessionStore.releaseTurnLock(sessionId);
      }
      return;
    }

    // Store attack action in adventure history
    stateManager.addAdventureMessage({
      id: `msg_${Date.now()}_player`,
      role: 'player',
      content: `${attacker.name} 攻击 ${enemy.name}`,
      timestamp: Date.now(),
    });

    // 1) Backend resolution + write state (deterministic, before narration)
    const res = resolvePlayerAttack(attacker, enemy, decl);
    applyPlayerAttack(stateManager, client.playerId, enemy.id, res);

    // Send dice result back to player
    this.io.to(sessionId).emit('dice:roll', {
      type: 'dice:roll',
      sessionId,
      senderId: client.playerId,
      payload: {
        hopeDie: res.hopeDie,
        fearDie: res.fearDie,
        modifier: 0,
        difficulty: res.difficulty,
        total: res.total,
        outcome: res.outcome,
        isCritical: res.isCritical,
        withHope: res.outcome === 'hopeSuccess' || res.outcome === 'hopeFailure',
        withFear: res.outcome === 'fearSuccess' || res.outcome === 'fearFailure',
        hopeGain: res.hopeGain,
        fearGain: res.fearGain,
        success: res.success,
      },
      timestamp: Date.now(),
    });
    // onChange has already broadcast state:update; front-end sees enemy HP / hope / fear changes

    // 2) Feed resolved result to AI for narration only
    const actionText = `${attacker.name} 攻击 ${enemy.name}`;
    const state = stateManager.getState();
    const context = {
      sessionId,
      character: attacker,
      characters: state.characters.length > 0 ? state.characters : [attacker],
      activePlayerId: client.playerId,
      activePlayerName: client.name,
      sessionState: state,
      worldLore: this.aiGM?.getWorldLore(),
    };

    try {
      await this.runNarration(
        socket, client, stateManager, context, actionText, false,
        { narrationHint: res.narrationHint },
      );
    } catch (err) {
      this.activeStreams.delete(sessionId);
      if (this.sessionStore) {
        await this.sessionStore.releaseTurnLock(sessionId);
      }
      console.error('Attack narration error:', err);
      this.io.to(sessionId).emit('gm:narrate:end', {
        type: 'gm:narrate:end',
        sessionId,
        senderId: 'system',
        payload: {
          turnId: uuidv4(),
          fullText: `（攻击已结算，但叙事生成失败：${(err as Error).message}）`,
          choices: [],
          error: true,
        },
        timestamp: Date.now(),
      });
    }
  }

  private async handleActionRoll(socket: Socket, msg: SocketMessage<RollDeclaration>): Promise<void> {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) return;

    // Guard: safety + spotlight + turn lock
    if (!(await this.guardTurn(socket, client, stateManager))) return;

    // Override client-side difficulty with AI-evaluated scene difficulty
    const decl = { ...msg.payload, difficulty: stateManager.getSceneDifficulty() };
    const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
    if (!character) {
      if (this.sessionStore) {
        await this.sessionStore.releaseTurnLock(sessionId);
      }
      return;
    }

    // Store player action in adventure history
    stateManager.addAdventureMessage({
      id: `msg_${Date.now()}_player`,
      role: 'player',
      content: decl.action,
      timestamp: Date.now(),
    });

    // 1) Backend resolution
    const res = resolveAbilityCheck(character, decl);

    // Send dice result back to player so they can see hope/fear values
    this.io.to(sessionId).emit('dice:roll', {
      type: 'dice:roll',
      sessionId,
      senderId: client.playerId,
      payload: {
        hopeDie: res.hopeDie,
        fearDie: res.fearDie,
        modifier: res.modifier ?? 0,
        difficulty: res.difficulty,
        total: res.total,
        outcome: res.outcome,
        isCritical: res.isCritical,
        withHope: res.outcome === 'hopeSuccess' || res.outcome === 'hopeFailure',
        withFear: res.outcome === 'fearSuccess' || res.outcome === 'fearFailure',
        hopeGain: res.hopeGain,
        fearGain: res.fearGain,
        success: res.success,
      },
      timestamp: Date.now(),
    });

    // Apply hope/fear changes
    const charUpdates: Partial<Character> = {};
    if (res.hopeGain > 0) {
      charUpdates.hope = Math.min(character.maxHope, character.hope + res.hopeGain);
    }
    if (res.fearGain > 0) {
      stateManager.addFearPoints(res.fearGain);
    }
    stateManager.updatePlayerCharacter(client.playerId, charUpdates);
    this.broadcastState(stateManager.getState());

    // 2) Feed resolved result to AI for narration
    const state = stateManager.getState();
    const context = {
      sessionId,
      character,
      characters: state.characters.length > 0 ? state.characters : [character],
      activePlayerId: client.playerId,
      activePlayerName: client.name,
      sessionState: state,
      worldLore: this.aiGM?.getWorldLore(),
    };

    try {
      await this.runNarration(
        socket, client, stateManager, context, decl.action, false,
        { narrationHint: res.narrationHint },
      );
    } catch (err) {
      this.activeStreams.delete(sessionId);
      if (this.sessionStore) {
        await this.sessionStore.releaseTurnLock(sessionId);
      }
      console.error('Action roll narration error:', err);
      this.io.to(sessionId).emit('gm:narrate:end', {
        type: 'gm:narrate:end',
        sessionId,
        senderId: 'system',
        payload: {
          turnId: uuidv4(),
          fullText: `（行动已结算，但叙事生成失败：${(err as Error).message}）`,
          choices: [],
          error: true,
        },
        timestamp: Date.now(),
      });
    }
  }

  /** Load an enemy from stat block catalog and create a CombatEnemy instance */
  private loadEnemyFromStatBlock(statBlockId: string, customName?: string): CombatEnemy | null {
    const statBlock = (enemyData as any[]).find((e: any) => e.id === statBlockId);
    if (!statBlock) {
      console.warn(`Enemy stat block not found: ${statBlockId}`);
      return null;
    }
    // enemies.json uses "hp"/"stress" for max values
    const maxHp = statBlock.maxHp ?? statBlock.hp ?? 5;
    const maxStress = statBlock.maxStress ?? statBlock.stress ?? 3;
    return {
      id: `enemy_${uuidv4()}`,
      statBlockId,
      name: customName || statBlock.name,
      currentHp: maxHp,
      maxHp,
      currentStress: 0,
      maxStress,
      conditions: [],
      isFocused: false,
      hasActed: false,
      evasion: statBlock.evasion || 10,
    };
  }

  private handleCombatAddEnemy(socket: Socket, msg: SocketMessage<{ statBlockId: string; name?: string }>): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const stateManager = this.sessionRegistry.findById(client.sessionId);
    if (!stateManager) return;

    const { statBlockId, name } = msg.payload;
    const enemy = this.loadEnemyFromStatBlock(statBlockId, name);
    if (!enemy) {
      socket.emit('error', { message: `敌人类型未找到: ${statBlockId}` });
      return;
    }

    stateManager.addCombatEnemy(enemy);
    this.broadcastState(stateManager.getState());
    console.log(`Combat enemy added: ${enemy.name} (${statBlockId}) in session ${client.sessionId}`);
  }

  private pendingLootBySession: Map<string, LootResult> = new Map();
  private searchCooldownBySession: Map<string, number> = new Map(); // sessionId → last search timestamp

  private handleCombatEnd(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const stateManager = this.sessionRegistry.findById(client.sessionId);
    if (!stateManager) return;

    // Generate loot before ending combat
    const combat = stateManager.getCombatState();
    const difficulty = combat?.enemies.length ? 15 : 10;
    const loot = rollLootTable(difficulty);

    // Store pending loot for pickup
    this.pendingLootBySession.set(client.sessionId, loot);

    stateManager.endCombat();
    this.broadcastState(stateManager.getState());

    // Send loot to client
    this.io.to(client.sessionId).emit('loot:available', {
      type: 'loot:available',
      sessionId: client.sessionId,
      senderId: 'system',
      payload: loot,
      timestamp: Date.now(),
    });

    console.log(`Combat ended in session ${client.sessionId}, loot generated`);
  }

  private handleLootPickup(socket: Socket, msg: SocketMessage<{ itemIds: string[] }>): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const stateManager = this.sessionRegistry.findById(client.sessionId);
    if (!stateManager) return;

    const pendingLoot = this.pendingLootBySession.get(client.sessionId);
    if (!pendingLoot) {
      this.broadcastState(stateManager.getState());
      return;
    }

    const { itemIds } = msg.payload;
    // Add selected items to character inventory
    for (const item of pendingLoot.items) {
      if (itemIds.includes(item.id)) {
        stateManager.addInventoryItem(item);
      }
    }
    // Add gold
    if (pendingLoot.gold) {
      stateManager.addGold(pendingLoot.gold);
    }

    // Clear pending loot
    this.pendingLootBySession.delete(client.sessionId);

    this.broadcastState(stateManager.getState());
  }

  private async handleSceneSearch(socket: Socket): Promise<void> {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) return;

    const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
    if (!character) return;

    // Cooldown: 30s between searches, max 3 per scene
    const now = Date.now();
    const lastSearch = this.searchCooldownBySession.get(sessionId) ?? 0;
    if (now - lastSearch < 30000) {
      this.io.to(sessionId).emit('gm:narrate:end', {
        type: 'gm:narrate:end',
        sessionId,
        senderId: 'system',
        payload: {
          turnId: `search_cd_${now}`,
          fullText: '你刚刚才搜索过这里，需要等一会儿再仔细查看。',
          choices: [],
        },
        timestamp: Date.now(),
      });
      return;
    }
    this.searchCooldownBySession.set(sessionId, now);

    // Trigger AI narration for the search first — let AI describe what's found
    const state = stateManager.getState();
    const context = {
      sessionId,
      character,
      characters: state.characters.length > 0 ? state.characters : [character],
      activePlayerId: client.playerId,
      activePlayerName: client.name,
      sessionState: state,
      worldLore: this.aiGM?.getWorldLore(),
    };

    try {
      await this.runNarration(
        socket, client, stateManager, context,
        `${character.name}探查了周围环境，寻找有用的物品和线索`,
        false,
      );

      // After narration, use extractGmEffects to find narrative items
      // Then supplement with a small random loot as fallback
      const loot = rollSceneSearchLoot();
      for (const item of loot.items) {
        stateManager.addInventoryItem(item);
      }
      if (loot.gold) {
        stateManager.addGold(loot.gold);
      }
      this.broadcastState(stateManager.getState());

      this.io.to(sessionId).emit('loot:available', {
        type: 'loot:available',
        sessionId,
        senderId: 'system',
        payload: loot,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('Scene search error:', err);
    }
  }

  private async handleUseFeature(socket: Socket, msg: SocketMessage<{ featureId: string; featureType: string; action: string; targetId?: string; attribute?: string }>): Promise<void> {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) return;

    if (!(await this.guardTurn(socket, client, stateManager))) return;

    const { featureId, featureType, action, targetId, attribute } = msg.payload;
    const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
    if (!character) {
      if (this.sessionStore) await this.sessionStore.releaseTurnLock(sessionId);
      return;
    }

    // Check feature uses remaining
    const currentUses = character.featureUses?.[featureId];
    if (currentUses !== undefined && currentUses <= 0) {
      this.io.to(sessionId).emit('gm:narrate:end', {
        type: 'gm:narrate:end',
        sessionId,
        senderId: 'system',
        payload: {
          turnId: uuidv4(),
          fullText: `（该特性的使用次数已用尽）`,
          choices: [],
          error: true,
        },
        timestamp: Date.now(),
      });
      if (this.sessionStore) await this.sessionStore.releaseTurnLock(sessionId);
      return;
    }

    // Deduct feature use
    const uses = { ...character.featureUses };
    if (currentUses !== undefined) {
      uses[featureId] = currentUses - 1;
    }

    // Deduct hope/stress cost from domain cards
    let hopeCost = 0;
    let stressCost = 0;
    if (featureType === 'domainCard') {
      const card = character.domainCardConfig.loadout.find(c => c.id === featureId);
      hopeCost = card?.hopeCost ?? 0;
      stressCost = card?.stressCost ?? 0;
    }
    const newHope = Math.max(0, character.hope - hopeCost);
    // Apply all character updates in one batch
    stateManager.updatePlayerCharacter(client.playerId, {
      featureUses: uses,
      hope: newHope,
    });
    if (stressCost > 0) {
      stateManager.updateCharacterStress(stressCost);
    }

    // Store player action in adventure history
    stateManager.addAdventureMessage({
      id: `msg_${Date.now()}_player`,
      role: 'player',
      content: action,
      timestamp: Date.now(),
    });

    // If attribute is specified, roll dice for the ability check
    let rollNarrationHint = '';
    if (attribute) {
      const rollDecl: RollDeclaration = {
        action,
        attribute: attribute as any,
        difficulty: stateManager.getSceneDifficulty(),
      };
      const rollRes = resolveAbilityCheck(character, rollDecl);

      // Send dice result back to player
      this.io.to(sessionId).emit('dice:roll', {
        type: 'dice:roll',
        sessionId,
        senderId: client.playerId,
        payload: {
          hopeDie: rollRes.hopeDie,
          fearDie: rollRes.fearDie,
          modifier: rollRes.modifier ?? 0,
          difficulty: rollRes.difficulty,
          total: rollRes.total,
          outcome: rollRes.outcome,
          isCritical: rollRes.isCritical,
          withHope: rollRes.outcome === 'hopeSuccess' || rollRes.outcome === 'hopeFailure',
          withFear: rollRes.outcome === 'fearSuccess' || rollRes.outcome === 'fearFailure',
          hopeGain: rollRes.hopeGain,
          fearGain: rollRes.fearGain,
          success: rollRes.success,
        },
        timestamp: Date.now(),
      });

      // Apply hope/fear from the roll
      const charUpdates: Partial<Character> = {};
      if (rollRes.hopeGain > 0) {
        // Re-read character after cost deduction
        const updatedChar = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
        if (updatedChar) {
          charUpdates.hope = Math.min(updatedChar.maxHope, updatedChar.hope + rollRes.hopeGain);
        }
      }
      if (rollRes.fearGain > 0) {
        stateManager.addFearPoints(rollRes.fearGain);
      }
      if (Object.keys(charUpdates).length > 0) {
        stateManager.updatePlayerCharacter(client.playerId, charUpdates);
      }
      rollNarrationHint = `\n骰子结算：${rollRes.narrationHint}`;
    }

    this.broadcastState(stateManager.getState());

    // If targetId is an enemy, this is an ability-on-enemy action
    let narrationHint = `${character.name} 使用"${action}"`;
    if (targetId) {
      const combat = stateManager.getCombatState();
      const enemy = combat?.enemies.find(e => e.id === targetId);
      if (enemy) {
        narrationHint += ` 对 ${enemy.name}`;
      }
    }
    narrationHint += rollNarrationHint;

    // Feed to AI for narration
    const state = stateManager.getState();
    const context = {
      sessionId,
      character,
      characters: state.characters.length > 0 ? state.characters : [character],
      activePlayerId: client.playerId,
      activePlayerName: client.name,
      sessionState: state,
      worldLore: this.aiGM?.getWorldLore(),
    };

    try {
      await this.runNarration(
        socket, client, stateManager, context, action, false,
        { narrationHint },
      );
    } catch (err) {
      this.activeStreams.delete(sessionId);
      if (this.sessionStore) await this.sessionStore.releaseTurnLock(sessionId);
      console.error('Use feature narration error:', err);
      this.io.to(sessionId).emit('gm:narrate:end', {
        type: 'gm:narrate:end',
        sessionId,
        senderId: 'system',
        payload: {
          turnId: uuidv4(),
          fullText: `（特性已使用，但叙事生成失败）`,
          choices: [],
          error: true,
        },
        timestamp: Date.now(),
      });
    }
  }

  private async handleAdventureEnd(socket: Socket): Promise<void> {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) return;

    const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
    if (!character) return;

    // End session immediately so player can return to home
    stateManager.endSession();
    this.broadcastState(stateManager.getState());

    // Signal client that adventure is ending — show modal immediately
    this.io.to(sessionId).emit('adventure:ending', {
      type: 'adventure:ending',
      sessionId,
      senderId: 'system',
      payload: {},
      timestamp: Date.now(),
    });

    // Stream the summary as narration
    const messages = stateManager.getAdventureMessages().slice(-50).map(m => ({
      role: m.role,
      content: m.content,
    }));

    const turnId = uuidv4();

    if (this.aiGM) {
      try {
        const state = stateManager.getState();
        const context = {
          sessionId,
          character,
          characters: state.characters.length > 0 ? state.characters : [character],
          activePlayerId: client.playerId,
          activePlayerName: client.name,
          sessionState: state,
          worldLore: this.aiGM?.getWorldLore(),
        };

        const prompt = `你是一位小说家。请为以下这场Daggerheart RPG冒险撰写一段第三人称小说式总结（300-500字）。
同时提取3-5个关键里程碑事件，在总结最后用"里程碑："标记。

冒险对话记录：
${messages.slice(-50).map(m => `[${m.role}]: ${m.content}`).join('\n')}

角色：${character.name}（${character.classId}）
当前状态：HP ${character.hp}/${character.maxHp}，压力 ${character.stress}/${character.maxStress}`;

        // Start stream
        this.io.to(sessionId).emit('gm:narrate:start', {
          type: 'gm:narrate:start',
          sessionId,
          senderId: 'system',
          payload: { turnId, characterName: character.name, playerName: client.name },
          timestamp: Date.now(),
        });

        const { fullText } = await this.aiGM.getGateway().sendStreamRequest(
          {
            model: this.aiGM.getConfig().narratorModel || this.aiGM.getConfig().gateway.defaultModel,
            messages: [
              { role: 'system', content: '你是小说家，擅长将RPG冒险总结为引人入胜的短篇叙事。' },
              { role: 'user', content: prompt },
            ],
            temperature: 0.7,
            maxTokens: 1024,
            agentType: 'summary',
          },
          (delta: string) => {
            this.io.to(sessionId).emit('gm:narrate:delta', {
              type: 'gm:narrate:delta',
              sessionId,
              senderId: 'system',
              payload: { turnId, text: delta },
              timestamp: Date.now(),
            });
          },
        );

        // End stream
        this.io.to(sessionId).emit('gm:narrate:end', {
          type: 'gm:narrate:end',
          sessionId,
          senderId: 'system',
          payload: { turnId, fullText: fullText || '冒险结束了。', choices: [] },
          timestamp: Date.now(),
        });

        // Send structured summary for persistence
        const summary: AdventureSummary = {
          sessionId,
          startedAt: Date.now() - 3600000,
          endedAt: Date.now(),
          summary: fullText || '冒险结束了。',
          milestones: [],
          locationsVisited: [],
        };
        const summaries = [...(character.adventureSummaries || []), summary];
        stateManager.updatePlayerCharacter(client.playerId, { adventureSummaries: summaries });

        this.io.to(sessionId).emit('adventure:summary', {
          type: 'adventure:summary',
          sessionId,
          senderId: 'system',
          payload: summary,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('Adventure summary generation error:', err);
        this.io.to(sessionId).emit('gm:narrate:end', {
          type: 'gm:narrate:end',
          sessionId,
          senderId: 'system',
          payload: { turnId, fullText: '冒险结束了。', choices: [] },
          timestamp: Date.now(),
        });
        this.io.to(sessionId).emit('adventure:summary', {
          type: 'adventure:summary',
          sessionId,
          senderId: 'system',
          payload: { sessionId, startedAt: Date.now() - 3600000, endedAt: Date.now(), summary: '冒险结束了。', milestones: [], locationsVisited: [] },
          timestamp: Date.now(),
        });
      }
    } else {
      this.io.to(sessionId).emit('gm:narrate:end', {
        type: 'gm:narrate:end',
        sessionId,
        senderId: 'system',
        payload: { turnId, fullText: '冒险结束了。', choices: [] },
        timestamp: Date.now(),
      });
    }

    console.log(`Adventure ended in session ${sessionId}`);
  }

  // ===== Apply a single GmEffect to StateManager =====

  private applyGmEffect(
    sm: StateManager,
    playerId: string,
    effect: GmEffect,
  ): void {
    const character = sm.getPlayerCharacter(playerId) || sm.getCharacter();

    switch (effect.type) {
      case 'damageToPlayer': {
        if (!character) break;
        const res = resolveDamageToCharacter(character, effect.amount ?? 0);
        applyDamageToCharacter(sm, playerId, res);
        break;
      }
      case 'stressToPlayer': {
        if (effect.amount && effect.amount > 0) {
          sm.updateCharacterStress(effect.amount);
        }
        break;
      }
      case 'enemyAttack': {
        // Enemy attacks player — use amount as raw damage, resolve through severity
        if (!character) break;
        const rawDmg = effect.amount ?? 0;
        if (rawDmg > 0) {
          const res = resolveDamageToCharacter(character, rawDmg);
          applyDamageToCharacter(sm, playerId, res);
        }
        break;
      }
      case 'enemyHp': {
        // Direct enemy HP change (heal or damage)
        if (effect.enemyId && effect.amount) {
          sm.updateCombatEnemyHp(effect.enemyId, effect.amount);
        }
        break;
      }
      case 'spendFear': {
        if (effect.amount && effect.amount > 0) {
          sm.spendFearPoints(effect.amount);
        }
        break;
      }
      case 'addEnemy': {
        const statBlockId = effect.enemyStatBlockId;
        const enemyName = effect.enemyName;
        let enemy: CombatEnemy | null = null;
        if (statBlockId) {
          enemy = this.loadEnemyFromStatBlock(statBlockId, enemyName);
        }
        // Fallback: try matching by name if statBlockId didn't work
        if (!enemy && enemyName) {
          const match = (enemyData as any[]).find((e: any) =>
            e.name === enemyName || e.nameEn === enemyName || e.id === enemyName
          );
          if (match) {
            enemy = this.loadEnemyFromStatBlock(match.id, enemyName);
          }
        }
        // Last resort: create a generic enemy with the given name
        if (!enemy && enemyName) {
          enemy = {
            id: `enemy_${uuidv4()}`,
            statBlockId: 'generic',
            name: enemyName,
            currentHp: 5,
            maxHp: 5,
            currentStress: 0,
            maxStress: 3,
            conditions: [],
            isFocused: false,
            hasActed: false,
            evasion: 10,
          };
        }
        if (enemy) {
          sm.addCombatEnemy(enemy);
        }
        break;
      }
      case 'startCombat': {
        // Combat starts — enemies are added by individual addEnemy effects
        // If no combat exists yet, we just ensure combat state is initialized
        // (addCombatEnemy already auto-starts combat)
        break;
      }
      case 'endCombat': {
        sm.endCombat();
        break;
      }
      case 'setDifficulty': {
        if (effect.amount && effect.amount >= 8 && effect.amount <= 25) {
          sm.setSceneDifficulty(effect.amount);
        }
        break;
      }
      case 'addItem': {
        if (effect.itemName) {
          sm.addInventoryItem({
            id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: effect.itemName,
            quantity: 1,
            description: effect.itemDescription,
            category: effect.itemCategory || 'misc',
          });
        }
        if (effect.goldCoins && effect.goldCoins > 0) {
          sm.addGold({ coins: effect.goldCoins, handfuls: 0, bags: 0, chests: 0 });
        }
        break;
      }
    }
  }

  private async handlePlayerChoice(socket: Socket, msg: SocketMessage<{ choiceId: string; choiceText: string }>): Promise<void> {
    const { choiceText } = msg.payload as { choiceId: string; choiceText: string };
    this.handlePlayerAction(socket, {
      type: 'player:action',
      sessionId: msg.sessionId,
      senderId: msg.senderId,
      payload: { action: choiceText },
      timestamp: msg.timestamp,
    });
  }

  private async handleNarrationRequest(socket: Socket): Promise<void> {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) return;

    if (this.aiGM) {
      try {
        const state = stateManager.getState();
        const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();

        if (!character) {
          socket.emit('gm:narrate', {
            type: 'gm:narrate',
            sessionId,
            senderId: 'system',
            payload: { content: '请先创建角色以开始冒险。' },
            timestamp: Date.now(),
          });
          return;
        }

        const context = {
          sessionId,
          character,
          characters: state.characters.length > 0 ? state.characters : [character],
          activePlayerId: client.playerId,
          activePlayerName: client.name,
          sessionState: state,
          worldLore: this.aiGM?.getWorldLore(),
        };

        const response = await this.aiGM.narrateScene(context);
        const choices = extractChoices(response.message.content);

        this.io.to(sessionId).emit('gm:narrate', {
          type: 'gm:narrate',
          sessionId,
          senderId: 'system',
          payload: {
            content: response.message.content,
            choices,
          },
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('AI narration error:', err);
        socket.emit('gm:narrate', {
          type: 'gm:narrate',
          sessionId,
          senderId: 'system',
          payload: { content: '（AI管家暂时无法响应，请稍后重试。）' },
          timestamp: Date.now(),
        });
      }
    } else {
      socket.emit('gm:narrate', {
        type: 'gm:narrate',
        sessionId,
        senderId: 'system',
        payload: {
          content: '你站在余烬村的入口，迷雾在远处翻涌。空气中弥漫着硫磺和翠晶的气息。几名提灯团的守卫警惕地注视着你。',
          choices: [
            { id: 'enter', label: '进入余烬村', action: 'enter_village' },
            { id: 'explore', label: '探索周围', action: 'explore' },
            { id: 'talk_guard', label: '与守卫交谈', action: 'talk_guard' },
          ],
        },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Fallback response when AI GM is not configured
   */
  private getFallbackResponse(action: string): string {
    const actionLower = action.toLowerCase();

    if (actionLower.includes('探索') || actionLower.includes('查看') || actionLower.includes('观察')) {
      return '你仔细观察周围的环境。破败的建筑在迷雾中若隐若现，地面上散落着翠晶碎片。远处传来奇怪的声响。';
    }
    if (actionLower.includes('交谈') || actionLower.includes('说话') || actionLower.includes('问')) {
      return '对方沉默了片刻，然后用警惕的目光打量着你。"你是新来的冒险者？这片地方可不像看起来那么安全。"';
    }
    if (actionLower.includes('战斗') || actionLower.includes('攻击') || actionLower.includes('挥')) {
      return '你的武器划破空气，但周围似乎没有明显的威胁。不过，你注意到阴影中有东西在移动……';
    }
    if (actionLower.includes('休息') || actionLower.includes('等待')) {
      return '你找了一个相对安全的角落稍作休息。迷雾似乎暂时没有逼近的迹象。';
    }
    if (actionLower.includes('移动') || actionLower.includes('走') || actionLower.includes('前往')) {
      return '你小心翼翼地向前移动。脚下的碎石发出轻微的声响，空气中翠晶的光芒忽明忽暗。';
    }

    return `你${action}。环境依然阴沉而神秘，迷雾在不远处缓缓流动。你需要决定下一步行动。`;
  }

  // ===== Spotlight Request =====

  private handleSpotlightRequest(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) return;

    const spotlight = stateManager.getSpotlightState();
    if (!spotlight) return; // Single-player — no spotlight

    const newSpotlight = this.spotlightManager.request(spotlight, client.playerId);
    stateManager.setSpotlightState(newSpotlight);
    this.broadcastSpotlightState(sessionId, newSpotlight);
  }

  // ===== Safety Event Handlers =====

  private handleS0Submit(socket: Socket, msg: SocketMessage<{ lines: string[]; veils: string[]; toneFlags: string[] }>): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) return;

    const safety = stateManager.getSafetyState();
    if (!safety) return; // Single-player — no safety

    const { lines, veils, toneFlags } = msg.payload;
    const newSafety = this.safetyManager.submitLinesVeils(safety, client.playerId, lines, veils, toneFlags);
    stateManager.setSafetyState(newSafety);

    // Notify all clients of updated safety state
    this.broadcastSafetyState(sessionId, newSafety);

    // Confirm submission to sender
    socket.emit('s0:ready', {
      type: 's0:ready',
      sessionId,
      senderId: 'system',
      payload: { playerId: client.playerId },
      timestamp: Date.now(),
    });

    // Check if all connected players have submitted — if so, advance from 'safety' to 'worldbuilding'
    const state = stateManager.getState();
    if (state.sessionZeroPhase === 'safety') {
      const connectedPlayers = state.players.filter(p => p.isConnected);
      const submittedCount = newSafety.lines.length + newSafety.veils.length;
      // Simple heuristic: if any lines/veils exist from >0 players, the safety phase has started.
      // We consider it done when all connected players have emitted s0:ready at least once.
      // For now: advance when at least one player has submitted, allowing others to submit later.
      // The AI GM conversation for 'safety' phase happens normally, and the first submission transitions.
      if (submittedCount > 0 && connectedPlayers.length > 0) {
        // Advance to worldbuilding phase
        stateManager.setSessionZeroPhase('worldbuilding');
        const updatedSafety = this.safetyManager.completeS0(newSafety);
        // Don't set phase to 'play' yet — we're still in Session Zero, just past the safety gate
        stateManager.setSafetyState(updatedSafety);
        this.broadcastSafetyState(sessionId, updatedSafety);

        this.io.to(sessionId).emit('s0:complete', {
          type: 's0:complete',
          sessionId,
          senderId: 'system',
          payload: {},
          timestamp: Date.now(),
        });

        console.log(`S0 safety phase complete in session ${sessionId}, advancing to worldbuilding`);
      }
    }

    console.log(`S0 submit from ${client.name}: ${lines.length} lines, ${veils.length} veils`);
  }

  private handleXCard(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) return;

    const safety = stateManager.getSafetyState();
    if (!safety) return;

    // Anonymous — activate X-Card, abort any active AI stream, broadcast pause
    const newSafety = this.safetyManager.activateXCard(safety);
    stateManager.setSafetyState(newSafety);

    this.abortStream(sessionId);

    this.io.to(sessionId).emit('safety:paused', {
      type: 'safety:paused',
      sessionId,
      senderId: 'system',
      payload: {},
      timestamp: Date.now(),
    });

    this.broadcastSafetyState(sessionId, newSafety);

    console.log(`X-Card activated in session ${sessionId}`);
  }

  private handleSafetyResume(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) return;

    // Only host can resume
    const hostId = this.sessionRegistry.getHostId(sessionId);
    if (hostId && hostId !== client.playerId) {
      socket.emit('session:error', {
        type: 'session:error',
        sessionId,
        senderId: 'system',
        payload: { error: '只有主持人可以恢复游戏' },
        timestamp: Date.now(),
      });
      return;
    }

    const safety = stateManager.getSafetyState();
    if (!safety) return;

    const newSafety = this.safetyManager.deactivateXCard(safety);
    stateManager.setSafetyState(newSafety);

    this.io.to(sessionId).emit('safety:resumed', {
      type: 'safety:resumed',
      sessionId,
      senderId: 'system',
      payload: {},
      timestamp: Date.now(),
    });

    this.broadcastSafetyState(sessionId, newSafety);

    console.log(`Game resumed by host ${client.name} in session ${sessionId}`);
  }

  // ===== Broadcast Helpers =====

  broadcastState(state: SessionState): void {
    const stateManager = this.sessionRegistry.findById(state.sessionId);
    if (!stateManager) return;

    const snapshot = stateManager.getSnapshot();
    // Include adventure messages for client sync
    const adventureMessages = stateManager.getAdventureMessages();
    this.io.to(state.sessionId).emit('game:state', {
      type: 'game:state',
      sessionId: state.sessionId,
      senderId: 'system',
      payload: { ...snapshot, adventureMessages },
      timestamp: Date.now(),
    });
  }

  private broadcastPlayerList(sessionId: string, stateManager: StateManager): void {
    const state = stateManager.getState();
    const players = state.players.map(p => ({
      id: p.id,
      name: p.name,
      characterName: p.character?.name,
      isConnected: p.isConnected,
    }));

    this.io.to(sessionId).emit('session:playerList', {
      type: 'session:playerList',
      sessionId,
      senderId: 'system',
      payload: { players, code: state.sessionCode },
      timestamp: Date.now(),
    });
  }

  private broadcastSpotlightState(sessionId: string, spotlight: import('@trpgmaster/shared').SpotlightState): void {
    this.io.to(sessionId).emit('spotlight:state', {
      type: 'spotlight:state',
      sessionId,
      senderId: 'system',
      payload: { spotlight },
      timestamp: Date.now(),
    });
  }

  private broadcastSafetyState(sessionId: string, safety: import('@trpgmaster/shared').SafetyState): void {
    this.io.to(sessionId).emit('safety:update', {
      type: 'safety:update',
      sessionId,
      senderId: 'system',
      payload: { safety },
      timestamp: Date.now(),
    });
  }

  // ===== Lifecycle =====

  getConnectedClients(): ConnectedClient[] {
    return Array.from(this.clients.values());
  }

  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Abort the active AI stream for a session (for X-Card / safety pause)
   */
  abortStream(sessionId: string): void {
    const controller = this.activeStreams.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(sessionId);
    }
  }

  /**
   * Set the SessionStore instance (for turn locking)
   */
  setSessionStore(store: SessionStore): void {
    this.sessionStore = store;
  }

  /**
   * Update the AI GM instance (for hot-reload after config change)
   */
  setAIGM(aiGM: AIGameMaster | undefined): void {
    this.aiGM = aiGM;
    console.log('[SocketServer] AI GM instance updated');
  }

  close(): void {
    this.io.close();
  }
}
