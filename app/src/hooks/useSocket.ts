import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../store/gameStore';
import type {
  SocketMessage,
  GameEvent,
  SessionState,
  Character,
  InputTextPayload,
  InputVoicePayload,
  InputVisionPayload,
  ParsedIntent,
  GameEventType,
  Suggestion,
  RiskLevel,
  AgentType,
} from '@trpgmaster/shared';

let socket: Socket | null = null;

export function connectToServer(serverUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 5000,
    });

    // Save server URL for HTTP API calls
    useGameStore.getState().setServerUrl(serverUrl);

    socket.on('connect', () => {
      useGameStore.getState().setConnected(true);
      resolve(socket!.id!);
    });

    socket.on('disconnect', () => {
      useGameStore.getState().setConnected(false);
    });

    socket.on('connect_error', (err) => {
      reject(err);
    });

    // State sync - payload is { state: SessionState, characters: Character[] }
    socket.on('game:state', (msg: SocketMessage<{ state: SessionState; characters: Character[] }>) => {
      const { state, characters } = msg.payload;
      const store = useGameStore.getState();
      store.setSession(state.sessionId, state);
      if (characters && characters.length > 0) {
        store.setCharacters(characters);
      }

      // Derive myCharacterId from player list (match our socket ID to a player)
      if (socket && store.role === 'player') {
        const mySocketId = socket.id;
        const myPlayer = state.players.find(p => p.playerId === mySocketId);
        if (myPlayer && myPlayer.characterId) {
          store.setMyCharacter(myPlayer.characterId);
        }
      }
    });

    // Game events
    socket.on('game:event', (msg: SocketMessage<GameEvent>) => {
      useGameStore.getState().addEvent(msg.payload);
    });

    // Chat messages - now include typeLabel for categorized display
    socket.on('chat:message', (msg: SocketMessage<{ text: string; sender: string; typeLabel?: string; autoSent?: boolean; suggestionId?: string }>) => {
      const state = useGameStore.getState();

      // Determine message type based on sender
      const senderType = msg.payload.sender === 'GM' ? 'gm' :
        msg.payload.sender === '系统' ? 'system' : 'player';

      state.addChatMessage({
        id: msg.timestamp.toString(),
        sender: senderType === 'gm' ? 'gm' : msg.payload.sender,
        senderName: msg.payload.sender,
        text: msg.payload.text,
        timestamp: msg.timestamp,
        type: senderType,
        typeLabel: msg.payload.typeLabel,
        autoSent: msg.payload.autoSent,
        suggestionId: msg.payload.suggestionId,
      });

      // If this message came from an auto-sent suggestion, remove the suggestion
      // so it only appears in chat (not duplicated in SuggestionPanel)
      if (msg.payload.suggestionId) {
        state.dismissSuggestion(msg.payload.suggestionId);
      }
    });

    // Chat undo - remove a specific message
    socket.on('chat:undo', (msg: SocketMessage<{ messageId: string }>) => {
      useGameStore.getState().removeChatMessage(msg.payload.messageId);
    });

    // Agent stream - now sends Suggestion objects to GM
    socket.on('agent:stream', (msg: SocketMessage<Suggestion>) => {
      const suggestion = msg.payload as Suggestion;
      useGameStore.getState().addSuggestion(suggestion);
    });

    // Agent complete - auto-sent messages to players (no longer raw agent output)
    socket.on('agent:complete', (msg: SocketMessage<{ text: string; typeLabel: string; autoSent: boolean; suggestionId?: string }>) => {
      const payload = msg.payload;
      useGameStore.getState().addChatMessage({
        id: msg.timestamp.toString(),
        sender: 'GM',
        senderName: 'GM',
        text: payload.text,
        timestamp: msg.timestamp,
        type: 'gm',
        typeLabel: payload.typeLabel,
        autoSent: payload.autoSent,
        suggestionId: payload.suggestionId,
      });
    });

    // Session events
    socket.on('session:join', (msg: SocketMessage<{ name: string; role: string }>) => {
      useGameStore.getState().addChatMessage({
        id: msg.timestamp.toString(),
        sender: 'system',
        senderName: '系统',
        text: `${msg.payload.name} 加入了会话`,
        timestamp: msg.timestamp,
        type: 'system',
      });
    });

    socket.on('session:started', (msg: SocketMessage<{ status: string }>) => {
      useGameStore.getState().addChatMessage({
        id: msg.timestamp.toString(),
        sender: 'system',
        senderName: '系统',
        text: '会话已开始！',
        timestamp: msg.timestamp,
        type: 'system',
      });
    });

    socket.on('session:ended', (msg: SocketMessage<{ status: string }>) => {
      useGameStore.getState().addChatMessage({
        id: msg.timestamp.toString(),
        sender: 'system',
        senderName: '系统',
        text: '会话已结束',
        timestamp: msg.timestamp,
        type: 'system',
      });
    });

    // Input parsed events
    socket.on('input:parsed', (msg: SocketMessage<{ originalType: GameEventType; parsedIntent: ParsedIntent; generatedEventTypes: GameEventType[] }>) => {
      useGameStore.getState().setParsedIntent(msg.payload.parsedIntent);
    });

    // Image generation complete
    socket.on('image:complete', (msg: SocketMessage<{ imageId: string; url: string; category: string }>) => {
      const { imageId, url, category } = msg.payload;
      useGameStore.getState().addGeneratedImage({
        id: imageId,
        url,
        category,
        timestamp: msg.timestamp,
      });
    });

    socket.on('agent:mode', (msg: SocketMessage<{ mode: 'multi' | 'unified' }>) => {
      useGameStore.getState().setAgentMode(msg.payload.mode);
    });

    socket.on('character:update', (msg: SocketMessage<{ character: Character }>) => {
      const { character } = msg.payload;
      useGameStore.getState().updateCharacterFromServer(character);
    });
  });
}

export function joinSession(role: 'gm' | 'player', name: string): void {
  if (!socket) return;

  const playerId = socket.id || 'unknown';
  socket.emit('session:join', {
    type: 'session:join',
    sessionId: useGameStore.getState().sessionId || '',
    senderId: playerId,
    payload: { role, name },
    timestamp: Date.now(),
  } as SocketMessage);

  useGameStore.getState().setRole(role);
  useGameStore.getState().setPlayerName(name);
}

export function sendGameEvent(event: GameEvent): void {
  if (!socket) return;

  socket.emit('game:event', {
    type: 'game:event',
    sessionId: useGameStore.getState().sessionId || '',
    senderId: socket.id || 'unknown',
    payload: event,
    timestamp: Date.now(),
  } as SocketMessage<GameEvent>);
}

export function sendChatMessage(text: string): void {
  if (!socket) return;

  const state = useGameStore.getState();
  socket.emit('chat:message', {
    type: 'chat:message',
    sessionId: state.sessionId || '',
    senderId: socket.id || 'unknown',
    payload: { text, sender: state.playerName },
    timestamp: Date.now(),
  } as SocketMessage<{ text: string; sender: string }>);
}

export function sendSuggestionAdopt(suggestionId: string, optionIndex: number, editContent?: string): void {
  if (!socket) return;

  socket.emit('gm:publishSuggestion', {
    type: 'gm:publishSuggestion',
    sessionId: useGameStore.getState().sessionId || '',
    senderId: socket.id || 'unknown',
    payload: { suggestionId, optionIndex, editContent },
    timestamp: Date.now(),
  } as SocketMessage<{ suggestionId: string; optionIndex: number; editContent?: string }>);
}

export function sendSuggestionDismiss(suggestionId: string): void {
  if (!socket) return;

  socket.emit('agent:dismiss', {
    type: 'agent:dismiss',
    sessionId: useGameStore.getState().sessionId || '',
    senderId: socket.id || 'unknown',
    payload: { suggestionId },
    timestamp: Date.now(),
  } as SocketMessage<{ suggestionId: string }>);
}

export function sendUndoLastAuto(): void {
  if (!socket) return;

  socket.emit('chat:undo', {
    type: 'chat:undo',
    sessionId: useGameStore.getState().sessionId || '',
    senderId: socket.id || 'unknown',
    payload: {},
    timestamp: Date.now(),
  } as SocketMessage);
}

export function startSession(): void {
  if (!socket) return;
  socket.emit('session:start', {
    type: 'session:start',
    sessionId: useGameStore.getState().sessionId || '',
    senderId: socket.id || 'unknown',
    payload: {},
    timestamp: Date.now(),
  } as SocketMessage);
}

export function endSession(): void {
  if (!socket) return;
  socket.emit('session:end', {
    type: 'session:end',
    sessionId: useGameStore.getState().sessionId || '',
    senderId: socket.id || 'unknown',
    payload: {},
    timestamp: Date.now(),
  } as SocketMessage);
}

export function sendInputText(text: string, characterId?: string): void {
  if (!socket) return;

  const state = useGameStore.getState();
  const payload: InputTextPayload = {
    text,
    source: state.role === 'gm' ? 'gm' : 'player',
    characterId,
  };

  socket.emit('input:text', {
    type: 'input:text',
    sessionId: state.sessionId || '',
    senderId: socket.id || 'unknown',
    payload,
    timestamp: Date.now(),
  } as SocketMessage<InputTextPayload>);
}

export function sendInputVoice(audioData: string, format: 'wav' | 'mp3' | 'ogg' | 'webm', duration: number): void {
  if (!socket) return;

  const state = useGameStore.getState();
  const payload: InputVoicePayload = {
    audioData,
    format,
    duration,
  };

  socket.emit('input:voice', {
    type: 'input:voice',
    sessionId: state.sessionId || '',
    senderId: socket.id || 'unknown',
    payload,
    timestamp: Date.now(),
  } as SocketMessage<InputVoicePayload>);
}

export function sendInputVision(imageData: string, format: 'jpeg' | 'png'): void {
  if (!socket) return;

  const state = useGameStore.getState();
  const payload: InputVisionPayload = {
    imageData,
    format,
    timestamp: Date.now(),
  };

  socket.emit('input:vision', {
    type: 'input:vision',
    sessionId: state.sessionId || '',
    senderId: socket.id || 'unknown',
    payload,
    timestamp: Date.now(),
  } as SocketMessage<InputVisionPayload>);
}

export function sendAgentModeSwitch(mode: 'multi' | 'unified'): void {
  if (!socket) return;

  socket.emit('agent:mode', {
    type: 'agent:mode',
    sessionId: useGameStore.getState().sessionId || '',
    senderId: socket.id || 'unknown',
    payload: { mode },
    timestamp: Date.now(),
  } as SocketMessage<{ mode: 'multi' | 'unified' }>);
}

export function sendCharacterUpdate(characterId: string, updates: Record<string, unknown>): void {
  if (!socket) return;

  socket.emit('character:update', {
    type: 'character:update',
    sessionId: useGameStore.getState().sessionId || '',
    senderId: socket.id || 'unknown',
    payload: { characterId, updates },
    timestamp: Date.now(),
  } as SocketMessage<{ characterId: string; updates: Record<string, unknown> }>);
}

export function disconnect(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  useGameStore.getState().reset();
}

export function getSocket(): Socket | null {
  return socket;
}
