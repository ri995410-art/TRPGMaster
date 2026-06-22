import { Server as IOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import type { StateManager } from '../core/StateManager';
import type { SessionRegistry } from '../core/SessionRegistry';
import type { AIGameMaster } from '../ai/AIGameMaster';
import type {
  GameEvent,
  GameEventType,
  SessionState,
  Player,
  Character,
} from '@trpgmaster/shared';
import type { PersistedAdventureMessage } from '../core/SessionPersistence';

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

  constructor(httpServer: HttpServer, sessionRegistry: SessionRegistry, aiGM?: AIGameMaster) {
    this.sessionRegistry = sessionRegistry;
    this.aiGM = aiGM;
    this.clients = new Map();

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
        this.io.to(sessionId).emit('dice:roll', msg);
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

      socket.on('player:rest', (msg: SocketMessage<{ restType: string; actions: string[] }>) => {
        this.handlePlayerAction(socket, {
          type: 'player:action',
          sessionId: msg.sessionId,
          senderId: msg.senderId,
          payload: { action: `请求${msg.payload.restType === 'long' ? '长' : '短'}休，活动：${msg.payload.actions.join('、')}` },
          timestamp: msg.timestamp,
        });
      });

      socket.on('combat:action', (msg: SocketMessage<{ actionId: string; targetId?: string }>) => {
        this.handlePlayerAction(socket, {
          type: 'player:action',
          sessionId: msg.sessionId,
          senderId: msg.senderId,
          payload: { action: `战斗行动：${msg.payload.actionId}${msg.payload.targetId ? `，目标：${msg.payload.targetId}` : ''}` },
          timestamp: msg.timestamp,
        });
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

    // Determine which session to join — default to first available (single-player compat)
    const allSessions = this.sessionRegistry.getAllSessions();
    let sessionId: string;
    let stateManager: StateManager;

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
            recentHistory: [],
            worldLore: null as any,
          };

          this.aiGM.runSessionZero(context).then(response => {
            const { cleanContent } = this.extractStateChanges(response.message.content);
            const choices = this.extractChoices(cleanContent);
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

    if (this.aiGM) {
      try {
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
          recentHistory: [],
          worldLore: null as any,
        };

        // Route to Session Zero or normal gameplay
        const isSessionZero = state.status === 'sessionZero';
        const response = isSessionZero
          ? await this.aiGM.runSessionZero(context, playerAction)
          : await this.aiGM.processPlayerAction(context, playerAction);

        // Extract state changes from AI response
        const { cleanContent, stateChanges } = this.extractStateChanges(response.message.content);

        // Apply state changes to StateManager
        if (stateChanges.length > 0) {
          this.applyStateChanges(stateManager, client.playerId, stateChanges);
        }

        // Extract choices from cleaned content (without [STATE] lines)
        const choices = this.extractChoices(cleanContent);

        // Emit GM narration to all clients in the session
        this.io.to(sessionId).emit('gm:narrate', {
          type: 'gm:narrate',
          sessionId,
          senderId: 'system',
          payload: {
            content: cleanContent,
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

        // Process generated events
        if (response.events && response.events.length > 0) {
          for (const event of response.events) {
            this.io.to(sessionId).emit('game:event', {
              type: 'game:event',
              sessionId,
              senderId: 'system',
              payload: event,
              timestamp: Date.now(),
            });
          }
        }

        // Session Zero phase advancement
        if (isSessionZero) {
          const S0_PHASES: Array<import('@trpgmaster/shared').SessionZeroPhase> = ['safety', 'worldbuilding', 'connections', 'expectations', 'narrativePact'];
          const currentPhase = state.sessionZeroPhase;
          const currentIndex = S0_PHASES.indexOf(currentPhase!);

          if (currentIndex >= 0 && currentIndex < S0_PHASES.length - 1) {
            // Advance to next phase
            const nextPhase = S0_PHASES[currentIndex + 1];
            stateManager.setSessionZeroPhase(nextPhase);
            console.log(`Session Zero advanced to phase: ${nextPhase}`);
          } else if (currentIndex === S0_PHASES.length - 1) {
            // Final phase (narrativePact) completed — transition to active gameplay
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

        console.log(`AI GM responded to ${client.name} (${response.tokenUsage} tokens)`);
      } catch (err) {
        console.error('AI GM error:', err);
        socket.emit('gm:narrate', {
          type: 'gm:narrate',
          sessionId,
          senderId: 'system',
          payload: {
            content: `（AI管家暂时无法响应，请稍后重试。错误：${(err as Error).message}）`,
          },
          timestamp: Date.now(),
        });
      }
    } else {
      // No AI GM configured — fallback response
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
          recentHistory: [],
          worldLore: null as any,
        };

        const response = await this.aiGM.narrateScene(context);
        const choices = this.extractChoices(response.message.content);

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
   * Extract choice options from AI response text
   */
  private extractChoices(content: string): Array<{ id: string; label: string; action?: string }> | undefined {
    const choices: Array<{ id: string; label: string; action?: string }> = [];

    // Match numbered options: 1) xxx, 1. xxx, ① xxx
    const numberedMatch = content.match(/(?:\d+[.)]|[①②③④⑤⑥⑦⑧⑨])\s*.+/g);
    if (numberedMatch && numberedMatch.length >= 2) {
      for (let i = 0; i < Math.min(numberedMatch.length, 4); i++) {
        const label = numberedMatch[i].replace(/^(?:\d+[.)]|[①②③④⑤⑥⑦⑧⑨])\s*/, '').trim();
        choices.push({ id: `choice_${i + 1}`, label, action: label });
      }
      return choices;
    }

    // Match bracketed options: 【xxx】 or [xxx]
    const bracketMatch = content.match(/[【\[][^】\]]+[】\]]/g);
    if (bracketMatch && bracketMatch.length >= 2) {
      for (let i = 0; i < Math.min(bracketMatch.length, 4); i++) {
        const label = bracketMatch[i].replace(/[【\[】\]]/g, '').trim();
        choices.push({ id: `choice_${i + 1}`, label, action: label });
      }
      return choices;
    }

    return undefined;
  }

  /**
   * Extract state changes from AI response [STATE] lines
   * Returns clean content (without [STATE] lines) and parsed state changes
   */
  private extractStateChanges(content: string): { cleanContent: string; stateChanges: Array<{ characterName?: string; changes: Record<string, number> }> } {
    const stateChanges: Array<{ characterName?: string; changes: Record<string, number> }> = [];
    const lines = content.split('\n');
    const cleanLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Match [STATE:CharacterName] key:value key:value or [STATE] key:value
      const namedMatch = trimmed.match(/^\[STATE:(.+?)\]\s*(.+)$/);
      const unnamedMatch = trimmed.match(/^\[STATE\]\s*(.+)$/);

      if (namedMatch) {
        const characterName = namedMatch[1].trim();
        const changes = this.parseStateKeyValue(namedMatch[2]);
        if (Object.keys(changes).length > 0) {
          stateChanges.push({ characterName, changes });
        }
      } else if (unnamedMatch) {
        const changes = this.parseStateKeyValue(unnamedMatch[1]);
        if (Object.keys(changes).length > 0) {
          stateChanges.push({ changes });
        }
      } else {
        cleanLines.push(line);
      }
    }

    return { cleanContent: cleanLines.join('\n').trim(), stateChanges };
  }

  private parseStateKeyValue(text: string): Record<string, number> {
    const changes: Record<string, number> = {};
    const pairs = text.trim().split(/\s+/);
    for (const pair of pairs) {
      const match = pair.match(/^(\w+):([+-]?\d+)$/);
      if (match) {
        changes[match[1]] = parseInt(match[2], 10);
      }
    }
    return changes;
  }

  private applyStateChanges(stateManager: StateManager, playerId: string, stateChanges: Array<{ characterName?: string; changes: Record<string, number> }>): void {
    for (const sc of stateChanges) {
      // Find the target character — by name if specified, else use current player
      let targetPlayerId = playerId;
      if (sc.characterName) {
        const players = stateManager.getPlayers();
        const found = players.find(p => p.character?.name === sc.characterName);
        if (found) targetPlayerId = found.id;
      }

      const char = stateManager.getPlayerCharacter(targetPlayerId);
      if (!char) continue;

      const updates: Partial<Character> = {};

      for (const [key, delta] of Object.entries(sc.changes)) {
        switch (key) {
          case 'hp':
            updates.hp = Math.max(0, Math.min(char.maxHp, char.hp + delta));
            break;
          case 'stress':
            updates.stress = Math.max(0, Math.min(char.maxStress, char.stress + delta));
            break;
          case 'hope':
            updates.hope = Math.max(0, Math.min(char.maxHope, char.hope + delta));
            break;
          case 'fearPoints':
            if (delta > 0) {
              stateManager.addFearPoints(delta);
            } else if (delta < 0) {
              stateManager.spendFearPoints(Math.abs(delta));
            }
            break;
        }
      }

      if (Object.keys(updates).length > 0) {
        stateManager.updatePlayerCharacter(targetPlayerId, updates);
      }
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

  // ===== Lifecycle =====

  getConnectedClients(): ConnectedClient[] {
    return Array.from(this.clients.values());
  }

  getClientCount(): number {
    return this.clients.size;
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
