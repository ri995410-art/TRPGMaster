import { Server as IOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import type { SessionOrchestrator } from '../core/SessionOrchestrator';
import type {
  SocketMessage,
  SocketMessageType,
  GameEvent,
  SessionState,
  PlayerState,
  InputTextPayload,
  InputVoicePayload,
  InputVisionPayload,
  Suggestion,
  SuggestionOption,
  RiskLevel,
  AgentType,
} from '@trpgmaster/shared';
import { classifyRisk, getTypeLabel, L2_AUTO_SEND_TIMEOUT, L1_UNDO_WINDOW } from '../agents/RiskClassifier';

interface ConnectedClient {
  socketId: string;
  playerId: string;
  role: 'gm' | 'player';
  name: string;
}

interface PendingAutoSend {
  suggestionId: string;
  timeout: NodeJS.Timeout;
  optionIndex: number;
  agentType: AgentType;
  typeLabel: string;
  content: string;
}

interface AutoSentMessage {
  messageId: string;
  suggestionId: string;
  timestamp: number;
  undoTimeout: NodeJS.Timeout;
}

export class SocketServer {
  private io: IOServer;
  private orchestrator: SessionOrchestrator;
  private clients: Map<string, ConnectedClient>;
  private sessionId: string;

  // L2 auto-send timers
  private pendingAutoSends: Map<string, PendingAutoSend> = new Map();

  // L1 auto-sent messages (for undo tracking)
  private autoSentMessages: AutoSentMessage[] = [];

  // Track which suggestions have already been published to avoid double-send
  private publishedSuggestions: Set<string> = new Set();

  // Store all suggestions so GM adoption can retrieve content
  private suggestionStore: Map<string, Suggestion> = new Map();

  constructor(httpServer: HttpServer, orchestrator: SessionOrchestrator) {
    this.orchestrator = orchestrator;
    this.sessionId = orchestrator.getSessionId();
    this.clients = new Map();

    this.io = new IOServer(httpServer, {
      cors: { origin: '*' },
      transports: ['websocket', 'polling'],
      pingInterval: 10000,
      pingTimeout: 5000,
      maxHttpBufferSize: 5e6, // 5MB for voice/image payloads
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);

      socket.on('session:join', (msg: SocketMessage<{ role: 'gm' | 'player'; name: string; characterId?: string }>) => {
        this.handleJoin(socket, msg);
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

      socket.on('game:event', (msg: SocketMessage<GameEvent>) => {
        this.handleGameEvent(socket, msg);
      });

      socket.on('chat:message', (msg: SocketMessage<{ text: string; sender: string }>) => {
        // Simply relay chat messages to all clients in the room
        this.io.to(this.sessionId).emit('chat:message', msg);
      });

      socket.on('dice:roll', (msg: SocketMessage<{ hopeDie: number; fearDie: number; modifier: number; difficulty: number }>) => {
        this.io.to(this.sessionId).emit('dice:roll', msg);
      });

      socket.on('input:text', (msg: SocketMessage<InputTextPayload>) => {
        this.handleInputText(socket, msg);
      });

      socket.on('input:voice', (msg: SocketMessage<InputVoicePayload>) => {
        this.handleInputVoice(socket, msg);
      });

      socket.on('input:vision', (msg: SocketMessage<InputVisionPayload>) => {
        this.handleInputVision(socket, msg);
      });

      // GM publishes a suggestion (adopts an option) - sends to players
      socket.on('gm:publishSuggestion', (msg: SocketMessage<{ suggestionId: string; optionIndex: number; editContent?: string }>) => {
        this.handlePublishSuggestion(socket, msg);
      });

      // GM dismisses a suggestion
      socket.on('agent:dismiss', (msg: SocketMessage<{ suggestionId: string }>) => {
        this.handleDismissSuggestion(socket, msg);
      });

      // GM requests undo of last auto-sent message
      socket.on('chat:undo', (msg: SocketMessage) => {
        this.handleUndoLastAuto(socket);
      });

      // Agent mode switch
      socket.on('agent:mode', (msg: SocketMessage<{ mode: 'multi' | 'unified' }>) => {
        this.handleAgentMode(socket, msg);
      });

      // Character update (GM edits character sheet)
      socket.on('character:update', (msg: SocketMessage<{ characterId: string; updates: Record<string, unknown> }>) => {
        this.handleCharacterUpdate(socket, msg);
      });

      socket.on('disconnect', () => {
        this.handleLeave(socket);
        console.log(`Client disconnected: ${socket.id}`);
      });

      // Send current state to newly connected client
      const snapshot = this.orchestrator.getSnapshot();
      socket.emit('game:state', {
        type: 'game:state',
        sessionId: this.sessionId,
        senderId: 'system',
        payload: snapshot,
        timestamp: Date.now(),
      });
    });
  }

  private handleJoin(socket: Socket, msg: SocketMessage<{ role: 'gm' | 'player'; name: string; characterId?: string }>): void {
    const { role, name, characterId } = msg.payload as { role: 'gm' | 'player'; name: string; characterId?: string };

    const client: ConnectedClient = {
      socketId: socket.id,
      playerId: msg.senderId,
      role,
      name,
    };

    this.clients.set(socket.id, client);
    socket.join(this.sessionId);

    // Add player to state manager so they're tracked in session state
    if (role === 'player') {
      const playerState: PlayerState = {
        playerId: msg.senderId,
        name,
        connected: true,
        characterId: characterId || '',
        isActing: false,
      };

      // If characterId is provided, add both player and character
      if (characterId) {
        const character = this.orchestrator.getStateManager().getCharacter(characterId);
        if (character) {
          this.orchestrator.addPlayer(playerState, character);
        } else {
          this.orchestrator.getStateManager().addPlayer(playerState);
        }
      } else {
        this.orchestrator.getStateManager().addPlayer(playerState);
      }
    }

    // Notify others
    this.io.to(this.sessionId).emit('session:join', {
      type: 'session:join',
      sessionId: this.sessionId,
      senderId: msg.senderId,
      payload: { name, role },
      timestamp: Date.now(),
    });

    // Send full state to the new client
    const snapshot = this.orchestrator.getSnapshot();
    socket.emit('game:state', {
      type: 'game:state',
      sessionId: this.sessionId,
      senderId: 'system',
      payload: snapshot,
      timestamp: Date.now(),
    });

    console.log(`${name} (${role}) joined session ${this.sessionId}`);
  }

  private handleSessionStart(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (!client || client.role !== 'gm') return;

    this.orchestrator.startSession();

    const state = this.orchestrator.getState();
    this.io.to(this.sessionId).emit('session:started', {
      type: 'session:started',
      sessionId: this.sessionId,
      senderId: 'system',
      payload: { status: state.status },
      timestamp: Date.now(),
    });

    this.broadcastState(state);
    console.log(`Session started by ${client.name}`);
  }

  private handleSessionEnd(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (!client || client.role !== 'gm') return;

    this.orchestrator.endSession();

    const state = this.orchestrator.getState();
    this.io.to(this.sessionId).emit('session:ended', {
      type: 'session:ended',
      sessionId: this.sessionId,
      senderId: 'system',
      payload: { status: state.status },
      timestamp: Date.now(),
    });

    this.broadcastState(state);
    console.log(`Session ended by ${client.name}`);
  }

  private handleLeave(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    this.clients.delete(socket.id);
    socket.leave(this.sessionId);

    if (client.role === 'player') {
      this.orchestrator.getStateManager().setPlayerConnected(client.playerId, false);
    }

    this.io.to(this.sessionId).emit('session:leave', {
      type: 'session:leave',
      sessionId: this.sessionId,
      senderId: client.playerId,
      payload: { name: client.name },
      timestamp: Date.now(),
    });
  }

  private handleGameEvent(socket: Socket, msg: SocketMessage<GameEvent>): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const event = msg.payload as GameEvent;

    // Publish to event bus (triggers agents)
    this.orchestrator.publishEvent(event.type, event.source, event as unknown as Record<string, unknown>);

    // Broadcast to all clients in session
    this.io.to(this.sessionId).emit('game:event', msg);
  }

  private async handleInputText(socket: Socket, msg: SocketMessage<InputTextPayload>): Promise<void> {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const payload = msg.payload as InputTextPayload;

    try {
      const result = await this.orchestrator.processTextInput(payload);

      this.io.to(this.sessionId).emit('input:parsed', {
        type: 'input:parsed',
        sessionId: this.sessionId,
        senderId: msg.senderId,
        payload: {
          originalType: 'input:text',
          parsedIntent: result.parsedIntent,
          generatedEventTypes: result.generatedEventTypes,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error processing text input:', error);
    }
  }

  private async handleInputVoice(socket: Socket, msg: SocketMessage<InputVoicePayload>): Promise<void> {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const payload = msg.payload as InputVoicePayload;
    console.log(`Voice input from ${client.name}: format=${payload.format}, dataLength=${payload.audioData?.length || 0}, duration=${payload.duration}`);

    try {
      const result = await this.orchestrator.processVoiceInput(payload);

      console.log(`Voice transcription result: intentType=${result.parsedIntent?.intentType}, rawInput="${result.parsedIntent?.rawInput?.substring(0, 50)}"`, result.generatedEventTypes);

      // Send parsed intent to all
      this.io.to(this.sessionId).emit('input:parsed', {
        type: 'input:parsed',
        sessionId: this.sessionId,
        senderId: msg.senderId,
        payload: {
          originalType: 'input:voice',
          parsedIntent: result.parsedIntent,
          generatedEventTypes: result.generatedEventTypes,
        },
        timestamp: Date.now(),
      });

      // Show transcribed text in chat so GM and players can see it
      const transcribedText = result.parsedIntent?.rawInput || '';
      if (transcribedText) {
        const senderName = client.name;
        this.io.to(this.sessionId).emit('chat:message', {
          type: 'chat:message',
          sessionId: this.sessionId,
          senderId: msg.senderId,
          payload: { text: `[语音] ${transcribedText}`, sender: senderName },
          timestamp: Date.now(),
        });
      } else {
        // No transcription - notify the sender
        socket.emit('chat:message', {
          type: 'chat:message',
          sessionId: this.sessionId,
          senderId: 'system',
          payload: { text: '语音识别未返回文字，请重试或使用文字输入', sender: '系统' },
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('Error processing voice input:', error);
      // Notify the sender that voice processing failed
      socket.emit('chat:message', {
        type: 'chat:message',
        sessionId: this.sessionId,
        senderId: 'system',
        payload: { text: '语音识别失败，请重试或使用文字输入', sender: '系统' },
        timestamp: Date.now(),
      });
    }
  }

  private async handleInputVision(socket: Socket, msg: SocketMessage<InputVisionPayload>): Promise<void> {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const payload = msg.payload as InputVisionPayload;

    try {
      const result = await this.orchestrator.processVisionInput(payload);

      this.io.to(this.sessionId).emit('input:parsed', {
        type: 'input:parsed',
        sessionId: this.sessionId,
        senderId: msg.senderId,
        payload: {
          originalType: 'input:vision',
          parsedIntent: result.parsedIntent,
          generatedEventTypes: result.generatedEventTypes,
        },
        timestamp: Date.now(),
      });

      // Show vision capture notification in chat
      const senderName = client.name;
      this.io.to(this.sessionId).emit('chat:message', {
        type: 'chat:message',
        sessionId: this.sessionId,
        senderId: msg.senderId,
        payload: { text: '[拍摄了场景图片]', sender: senderName },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error processing vision input:', error);
    }
  }

  // ===== Suggestion Management =====

  private handlePublishSuggestion(socket: Socket, msg: SocketMessage<{ suggestionId: string; optionIndex: number; editContent?: string }>): void {
    const client = this.clients.get(socket.id);
    if (!client || client.role !== 'gm') return;

    const { suggestionId, optionIndex, editContent } = msg.payload;

    // Cancel any pending auto-send for this suggestion
    const pending = this.pendingAutoSends.get(suggestionId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingAutoSends.delete(suggestionId);
    }

    // Avoid double-publish
    if (this.publishedSuggestions.has(suggestionId)) return;
    this.publishedSuggestions.add(suggestionId);

    // Clean up tracking after 60 seconds
    setTimeout(() => this.publishedSuggestions.delete(suggestionId), 60000);

    // Publish the selected content to all clients as a chat message
    const storedSuggestion = this.suggestionStore.get(suggestionId);
    const selectedOption = storedSuggestion?.options?.[optionIndex];
    const content = editContent || selectedOption?.content || '';
    const typeLabel = storedSuggestion?.typeLabel || '';

    // Clean up stored suggestion
    this.suggestionStore.delete(suggestionId);

    if (content) {
      this.io.to(this.sessionId).emit('chat:message', {
        type: 'chat:message',
        sessionId: this.sessionId,
        senderId: client.playerId,
        payload: {
          text: content,
          sender: client.name,
          typeLabel,
        },
        timestamp: Date.now(),
      });
    }
  }

  private handleDismissSuggestion(socket: Socket, msg: SocketMessage<{ suggestionId: string }>): void {
    const client = this.clients.get(socket.id);
    if (!client || client.role !== 'gm') return;

    const { suggestionId } = msg.payload;

    // Cancel any pending auto-send for this suggestion
    const pending = this.pendingAutoSends.get(suggestionId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingAutoSends.delete(suggestionId);
    }

    // Mark as published (dismissed) so auto-send won't fire
    this.publishedSuggestions.add(suggestionId);
  }

  private handleUndoLastAuto(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (!client || client.role !== 'gm') return;

    // Find the most recent auto-sent message within the undo window
    const now = Date.now();
    const undoable = [...this.autoSentMessages].reverse().find(m =>
      now - m.timestamp < L1_UNDO_WINDOW
    );

    if (undoable) {
      // Remove from tracking
      this.autoSentMessages = this.autoSentMessages.filter(m => m.messageId !== undoable.messageId);
      if (undoable.undoTimeout) clearTimeout(undoable.undoTimeout);

      // Notify all clients to remove the message
      this.io.to(this.sessionId).emit('chat:undo', {
        type: 'chat:undo',
        sessionId: this.sessionId,
        senderId: 'system',
        payload: { messageId: undoable.messageId },
        timestamp: Date.now(),
      });
    }
  }

  // ===== Character Update =====

  private handleCharacterUpdate(socket: Socket, msg: SocketMessage<{ characterId: string; updates: Record<string, unknown> }>): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    // Only GM can update characters directly
    if (client.role !== 'gm') return;

    const { characterId, updates } = msg.payload;
    if (!characterId || !updates) return;

    const success = this.orchestrator.getStateManager().updateCharacter(characterId, updates as any);
    if (!success) return;

    // Broadcast updated character to all clients
    const updatedChar = this.orchestrator.getStateManager().getAllCharacters().find(c => c.id === characterId);
    if (updatedChar) {
      this.io.to(this.sessionId).emit('character:update', {
        type: 'character:update',
        sessionId: this.sessionId,
        senderId: 'system',
        payload: { character: updatedChar },
        timestamp: Date.now(),
      });
    }
  }

  // ===== Agent Mode Switch =====

  private handleAgentMode(socket: Socket, msg: SocketMessage<{ mode: 'multi' | 'unified' }>): void {
    const client = this.clients.get(socket.id);
    if (!client || client.role !== 'gm') return;

    const { mode } = msg.payload;
    if (mode !== 'multi' && mode !== 'unified') return;

    this.switchAgentMode(mode);
  }

  switchAgentMode(mode: 'multi' | 'unified'): void {
    const coordinator = this.orchestrator.getAgentCoordinator();

    if (mode === 'unified') {
      coordinator.enableAgent('unified');
      coordinator.enableAgent('rules');
      coordinator.enableAgent('sceneDirector');
      coordinator.enableAgent('imageDirector');
      coordinator.disableAgent('narrative');
      coordinator.disableAgent('npc');
      coordinator.disableAgent('combat');
      coordinator.disableAgent('faction');
      console.log('Switched to unified agent mode');
    } else {
      for (const agentType of ['narrative', 'rules', 'sceneDirector', 'npc', 'combat', 'faction', 'imageDirector', 'novel', 'memoryCompressor'] as const) {
        coordinator.enableAgent(agentType);
      }
      coordinator.disableAgent('unified');
      console.log('Switched to multi-agent mode');
    }

    // Broadcast the mode change to all clients
    this.io.to(this.sessionId).emit('agent:mode', {
      type: 'agent:mode',
      sessionId: this.sessionId,
      senderId: 'system',
      payload: { mode },
      timestamp: Date.now(),
    });
  }

  // ===== State Sync =====

  broadcastState(state: SessionState): void {
    const snapshot = this.orchestrator.getSnapshot();
    this.io.to(this.sessionId).emit('game:state', {
      type: 'game:state',
      sessionId: this.sessionId,
      senderId: 'system',
      payload: snapshot,
      timestamp: Date.now(),
    });
  }

  broadcastAgentOutput(agentType: AgentType, output: string): void {
    const riskLevel = classifyRisk(agentType);
    const typeLabel = getTypeLabel(agentType);

    // Parse agent output to extract suggestion data
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(output);
    } catch {
      parsed = { content: output };
    }

    // Special handling for imageDirector: if imageUrl exists, send image:complete directly
    if (agentType === 'imageDirector') {
      if (parsed.imageUrl) {
        const imageUrl = String(parsed.imageUrl);
        const imageId = String(parsed.imageId || '');
        const category = String(parsed.category || 'scene');

        // Send image:complete to all clients
        this.io.to(this.sessionId).emit('image:complete', {
          type: 'image:complete',
          sessionId: this.sessionId,
          senderId: 'system',
          payload: { imageId, url: imageUrl, category },
          timestamp: Date.now(),
        });

        // Also send a chat notification
        this.io.to(this.sessionId).emit('chat:message', {
          type: 'chat:message',
          sessionId: this.sessionId,
          senderId: 'system',
          payload: {
            text: '[图片] AI已生成场景图像',
            sender: 'GM',
            typeLabel: '[图片]',
          },
          timestamp: Date.now(),
        });

        return; // Don't send as suggestion
      } else {
        // Image generation failed - notify GM only
        const gmClients = Array.from(this.clients.values()).filter(c => c.role === 'gm');
        for (const gm of gmClients) {
          this.io.to(gm.socketId).emit('chat:message', {
            type: 'chat:message',
            sessionId: this.sessionId,
            senderId: 'system',
            payload: {
              text: '[图片] 图像生成失败，请重试',
              sender: '系统',
              typeLabel: '[图片]',
            },
            timestamp: Date.now(),
          });
        }
        return;
      }
    }

    // Build Suggestion object
    const suggestionId = `${agentType}_${Date.now()}`;
    const suggestion: Suggestion = {
      id: suggestionId,
      agentType,
      riskLevel,
      timestamp: Date.now(),
      options: this.extractOptions(parsed, agentType),
      typeLabel,
      gmOnly: this.extractGmOnly(parsed, agentType),
    };

    // For L2, set auto-send timeout
    if (riskLevel === 'L2') {
      suggestion.autoSendAt = Date.now() + L2_AUTO_SEND_TIMEOUT;
    }

    // Store suggestion so GM adoption can retrieve content later
    this.suggestionStore.set(suggestionId, suggestion);
    // Clean up after 5 minutes
    setTimeout(() => this.suggestionStore.delete(suggestionId), 300000);

    // Send Suggestion to GM only via agent:stream
    const gmClients = Array.from(this.clients.values()).filter(c => c.role === 'gm');
    for (const gm of gmClients) {
      this.io.to(gm.socketId).emit('agent:stream', {
        type: 'agent:stream',
        sessionId: this.sessionId,
        senderId: 'system',
        payload: suggestion,
        timestamp: Date.now(),
      });
    }

    // Handle auto-send for L0 (fully automatic) and L1 (auto + undo)
    if (riskLevel === 'L0' || riskLevel === 'L1') {
      this.autoSendToPlayers(suggestion, riskLevel);
    }

    // Handle L2: schedule auto-send (but only sends to players, not as suggestion)
    if (riskLevel === 'L2') {
      const content = suggestion.options[0]?.content || '';
      const pendingAuto: PendingAutoSend = {
        suggestionId,
        optionIndex: 0,
        agentType,
        typeLabel,
        content,
        timeout: setTimeout(() => {
          // Only auto-send if GM hasn't already published or dismissed
          if (!this.publishedSuggestions.has(suggestionId)) {
            this.publishedSuggestions.add(suggestionId);
            this.sendL2AutoToPlayers(suggestionId, typeLabel, content);
          }
          this.pendingAutoSends.delete(suggestionId);
        }, L2_AUTO_SEND_TIMEOUT),
      };
      this.pendingAutoSends.set(suggestionId, pendingAuto);
    }

    // L3 and L4: only sent to GM, no auto-send
  }

  // Auto-send for L0/L1: immediate broadcast to all clients
  private autoSendToPlayers(suggestion: Suggestion, riskLevel: RiskLevel): void {
    const content = suggestion.options[0]?.content || '';
    const typeLabel = suggestion.typeLabel;
    const messageId = `auto_${suggestion.id}`;

    // Mark as published to avoid double-send
    this.publishedSuggestions.add(suggestion.id);

    // Send as a chat message to ALL clients (GM + players)
    this.io.to(this.sessionId).emit('chat:message', {
      type: 'chat:message',
      sessionId: this.sessionId,
      senderId: 'system',
      payload: {
        text: content,
        sender: 'GM',
        typeLabel,
        autoSent: true,
        suggestionId: suggestion.id,
      },
      timestamp: Date.now(),
    });

    // Track auto-sent message for undo (L1 only)
    if (riskLevel === 'L1') {
      const autoMsg: AutoSentMessage = {
        messageId,
        suggestionId: suggestion.id,
        timestamp: Date.now(),
        undoTimeout: setTimeout(() => {
          this.autoSentMessages = this.autoSentMessages.filter(m => m.messageId !== messageId);
        }, L1_UNDO_WINDOW),
      };
      this.autoSentMessages.push(autoMsg);
    }
  }

  // L2 auto-send: sends the default option to players when timer expires
  private sendL2AutoToPlayers(suggestionId: string, typeLabel: string, content: string): void {
    this.io.to(this.sessionId).emit('chat:message', {
      type: 'chat:message',
      sessionId: this.sessionId,
      senderId: 'system',
      payload: {
        text: content,
        sender: 'GM',
        typeLabel,
        autoSent: true,
        suggestionId,
      },
      timestamp: Date.now(),
    });
  }

  // Find pending auto-send info for a suggestion (used by handlePublishSuggestion)
  private findPendingInfo(suggestionId: string): { typeLabel: string; content: string } | null {
    const pending = this.pendingAutoSends.get(suggestionId);
    if (pending) {
      return { typeLabel: pending.typeLabel, content: pending.content };
    }
    // Try to find from recent suggestions - fallback
    return null;
  }

  private extractOptions(parsed: Record<string, unknown>, agentType: AgentType): SuggestionOption[] {
    const options: SuggestionOption[] = [];

    // NarrativeAgent format: { options: [{label, content}], ... }
    if (Array.isArray(parsed.options)) {
      for (const opt of parsed.options as Record<string, string>[]) {
        if (opt.label && opt.content) {
          options.push({ label: String(opt.label), content: String(opt.content) });
        }
      }
    }

    // NPCAgent format: { dialogueOptions: [{label, content}], ... }
    if (Array.isArray(parsed.dialogueOptions)) {
      for (const opt of parsed.dialogueOptions as Record<string, string>[]) {
        if (opt.label && opt.content) {
          options.push({ label: String(opt.label), content: String(opt.content) });
        }
      }
    }

    // CombatAgent format: { enemyOptions: [{label, content, effect, fearCost}], ... }
    if (Array.isArray(parsed.enemyOptions)) {
      for (const opt of parsed.enemyOptions as Record<string, unknown>[]) {
        const label = String(opt.label || '');
        const content = String(opt.content || '');
        const effect = opt.effect ? ` [${String(opt.effect)}]` : '';
        const fearCost = opt.fearCost ? ` (恐惧点:${opt.fearCost})` : '';
        if (label && content) {
          options.push({ label, content: content + effect + fearCost });
        }
      }
    }

    // SceneDirectorAgent format: { pacingSuggestions: [{label, content}], ... }
    if (Array.isArray(parsed.pacingSuggestions)) {
      for (const opt of parsed.pacingSuggestions as Record<string, string>[]) {
        if (opt.label && opt.content) {
          options.push({ label: String(opt.label), content: String(opt.content) });
        }
      }
    }

    // FactionAgent format: { factionOptions: [{label, content}], ... } or fallback
    if (Array.isArray(parsed.factionOptions)) {
      for (const opt of parsed.factionOptions as Record<string, string>[]) {
        if (opt.label && opt.content) {
          options.push({ label: String(opt.label), content: String(opt.content) });
        }
      }
    }

    // Fallback: if no structured options found, try common fields
    if (options.length === 0) {
      // Try to extract from various agent output formats
      const contentFields = ['content', 'enemyAction', 'environmentEffect',
        'narrativeDescription', 'sceneDescription', 'analysis'];
      for (const field of contentFields) {
        const val = parsed[field];
        if (typeof val === 'string' && val) {
          options.push({ label: '内容', content: val });
          break;
        }
      }

      // Last resort: stringify the whole thing but avoid [object Object]
      if (options.length === 0) {
        const flatContent = this.flattenToText(parsed);
        if (flatContent) {
          options.push({ label: '内容', content: flatContent });
        }
      }
    }

    return options;
  }

  // Flatten a JSON object to readable text (avoid [object Object])
  private flattenToText(obj: Record<string, unknown>, depth = 0): string {
    if (depth > 3) return '';
    const parts: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string' && val) {
        parts.push(val);
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        parts.push(`${key}: ${val}`);
      } else if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item === 'string' && item) {
            parts.push(item);
          } else if (typeof item === 'object' && item !== null) {
            const sub = this.flattenToText(item as Record<string, unknown>, depth + 1);
            if (sub) parts.push(sub);
          }
        }
      } else if (typeof val === 'object' && val !== null) {
        const sub = this.flattenToText(val as Record<string, unknown>, depth + 1);
        if (sub) parts.push(sub);
      }
    }
    return parts.join('\n');
  }

  private extractGmOnly(parsed: Record<string, unknown>, agentType: AgentType): string | undefined {
    if (parsed.internalThought) return String(parsed.internalThought);
    if (parsed.nextIntentPreview || parsed.nextEnemyIntent) {
      return String(parsed.nextIntentPreview || parsed.nextEnemyIntent);
    }
    if (parsed.tensionNote) return String(parsed.tensionNote);
    if (parsed.pressureNote) return String(parsed.pressureNote);
    return undefined;
  }

  // ===== Lifecycle =====

  getConnectedClients(): ConnectedClient[] {
    return Array.from(this.clients.values());
  }

  getClientCount(): number {
    return this.clients.size;
  }

  close(): void {
    for (const pending of this.pendingAutoSends.values()) {
      clearTimeout(pending.timeout);
    }
    for (const msg of this.autoSentMessages) {
      if (msg.undoTimeout) clearTimeout(msg.undoTimeout);
    }
    this.io.close();
  }
}
