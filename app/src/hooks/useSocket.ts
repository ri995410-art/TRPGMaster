import { io, Socket } from 'socket.io-client';
import { useGameStore, type AdventureMessage } from '../store/gameStore';
import type {
  GameEvent,
  SessionState,
  Character,
  GameEventType,
  Player,
} from '@trpgmaster/shared';

// Local SocketMessage interface for wire format
interface SocketMessage<T = unknown> {
  type: string;
  sessionId: string;
  senderId: string;
  payload: T;
  timestamp: number;
}

let socket: Socket | null = null;
let hasJoinedSession = false;  // Track whether we've done initial join vs rejoin

export function connectToServer(serverUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Ensure we have a stable playerId before connecting
    useGameStore.getState().initPlayerId();

    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 5000,
    });

    socket.on('connect', () => {
      useGameStore.getState().setConnected(true);
      useGameStore.getState().setServerUrl(serverUrl);

      const store = useGameStore.getState();
      const playerId = store.playerId;
      const character = store.character;

      if (!hasJoinedSession) {
        // First connection: send session:join
        socket!.emit('session:join', {
          type: 'session:join',
          sessionId: '',
          senderId: playerId,
          payload: {
            playerId,
            role: 'player',
            name: character?.name || 'Player',
            character: character || undefined,
          },
          timestamp: Date.now(),
        } as SocketMessage<{ playerId: string; role: 'player'; name: string; character?: Character }>);
        hasJoinedSession = true;
      } else {
        // Reconnection: send session:rejoin (silent rejoin, no playerJoined broadcast)
        socket!.emit('session:rejoin', {
          type: 'session:rejoin',
          sessionId: store.campaignId || '',
          senderId: playerId,
          payload: {
            playerId,
            name: character?.name || 'Player',
            character: character || undefined,
          },
          timestamp: Date.now(),
        } as SocketMessage<{ playerId: string; name: string; character?: Character }>);
      }
      // Fetch character from server if we don't have one locally
      if (!character) {
        fetch(`${serverUrl}/api/character`)
          .then((res) => res.json())
          .then((char) => {
            if (char && char.id && char.name) {
              console.log('[useSocket] Restored character from server:', char.name);
              useGameStore.getState().setCharacter(char);
            }
          })
          .catch(() => {
            // No character on server, that's fine
          });
      } else {
        // We have a local character — sync it to server
        fetch(`${serverUrl}/api/character`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(character),
        }).catch(() => {
          // Sync failure is non-critical
        });
      }

      // Fetch AI config from server
      fetch(`${serverUrl}/api/ai/config`)
        .then((res) => res.json())
        .then((config) => {
          if (config) {
            useGameStore.getState().setAiConfig({
              apiKey: config.apiKey || '',
              baseUrl: config.baseUrl || '',
              defaultModel: config.defaultModel || '',
              narratorModel: config.narratorModel || '',
              temperature: config.temperature ?? 0.8,
              maxTokens: config.maxTokens ?? 4096,
              aiConnected: config.aiConnected ?? false,
            });
          }
        })
        .catch(() => {
          // Config fetch failure is non-critical
        });

      resolve(socket!.id!);
    });

    socket.on('disconnect', () => {
      useGameStore.getState().setConnected(false);
    });

    socket.on('connect_error', (err) => {
      reject(err);
    });

    // ===== Game State Sync =====

    socket.on('game:state', (msg: SocketMessage<{ state: SessionState; adventureMessages?: Array<{ id: string; role: 'player' | 'narrator' | 'npc' | 'system'; content: string; timestamp: number; npcName?: string; npcId?: string; choices?: Array<{ id: string; text: string; action?: string }> }> }>) => {
      const { state, adventureMessages } = msg.payload;
      const store = useGameStore.getState();
      store.setCampaign(state.sessionId, state);

      // Update character from state (only if server has one — don't overwrite local with null)
      if (state.character) {
        store.setCharacter(state.character);
      }

      // Update scene info
      const scene = state.currentScene;
      store.updateSceneInfo(scene.name, 0, 'none');

      // Update fear points (set absolute value)
      const fearDelta = state.fearPoints - store.fearPoints;
      if (fearDelta !== 0) {
        store.updateFearPoints(fearDelta);
      }

      // Update session code if present
      if (state.sessionCode) {
        store.setSessionCode(state.sessionCode);
      }

      // Update players list from state
      if (state.players && state.players.length > 0) {
        store.setPlayers(state.players.map(p => ({
          id: p.id,
          name: p.name,
          characterName: p.character?.name,
          isConnected: p.isConnected,
        })));
      }

      // Sync adventure messages from server
      // Only replace if server has more messages (server is the source of truth)
      if (adventureMessages && adventureMessages.length > store.adventureMessages.length) {
        store.setAdventureMessages(adventureMessages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          npcName: m.npcName,
          npcId: m.npcId,
          choices: m.choices?.map(c => ({
            id: c.id,
            text: c.text,
            action: c.action,
          })),
        })));
      }
    });

    // ===== Game Events =====

    socket.on('game:event', (msg: SocketMessage<GameEvent>) => {
      useGameStore.getState().addEvent(msg.payload);
    });

    // ===== AI GM Narration =====

    socket.on('gm:narrate', (msg: SocketMessage<{ content: string; choices?: Array<{ id: string; label: string; action?: string }>; npcName?: string; npcId?: string; playerName?: string; characterName?: string }>) => {
      const store = useGameStore.getState();
      const adventureMsg: AdventureMessage = {
        id: `msg_${msg.timestamp}`,
        role: msg.payload.npcName ? 'npc' : 'narrator',
        content: msg.payload.content,
        timestamp: msg.timestamp,
        npcName: msg.payload.npcName,
        npcId: msg.payload.npcId,
        choices: msg.payload.choices?.map(c => ({
          id: c.id,
          text: c.label,
          action: c.action,
        })),
      };
      store.addAdventureMessage(adventureMsg);
      store.setAiProcessing(false);
    });

    // ===== Character Updates =====

    socket.on('character:update', (msg: SocketMessage<{ character: Character }>) => {
      useGameStore.getState().updateCharacterFromServer(msg.payload.character);
    });

    // ===== Session Events =====

    socket.on('session:started', () => {
      const store = useGameStore.getState();
      const sysMsg: AdventureMessage = {
        id: `msg_${Date.now()}_sys`,
        role: 'system',
        content: '冒险开始！',
        timestamp: Date.now(),
      };
      store.addAdventureMessage(sysMsg);
    });

    socket.on('session:ended', () => {
      const store = useGameStore.getState();
      const sysMsg: AdventureMessage = {
        id: `msg_${Date.now()}_sys`,
        role: 'system',
        content: '会话已结束',
        timestamp: Date.now(),
      };
      store.addAdventureMessage(sysMsg);
    });

    // ===== Multi-player Session Events =====

    socket.on('session:created', (msg: SocketMessage<{ sessionId: string; code: string; isHost: boolean }>) => {
      const store = useGameStore.getState();
      store.setSessionCode(msg.payload.code);
      store.setIsHost(msg.payload.isHost);
      console.log('[useSocket] Session created:', msg.payload.code);
    });

    socket.on('session:joined', (msg: SocketMessage<{ sessionId: string; code: string; isHost: boolean; status: string }>) => {
      const store = useGameStore.getState();
      store.setSessionCode(msg.payload.code);
      store.setIsHost(msg.payload.isHost);
      console.log('[useSocket] Joined session:', msg.payload.code);
    });

    socket.on('session:playerJoined', (msg: SocketMessage<{ name: string; characterName?: string }>) => {
      const store = useGameStore.getState();
      const sysMsg: AdventureMessage = {
        id: `msg_${Date.now()}_join`,
        role: 'system',
        content: `${msg.payload.name}${msg.payload.characterName ? `（${msg.payload.characterName}）` : ''} 加入了房间`,
        timestamp: Date.now(),
      };
      store.addAdventureMessage(sysMsg);
    });

    socket.on('session:playerLeft', (msg: SocketMessage<{ name: string }>) => {
      const store = useGameStore.getState();
      const sysMsg: AdventureMessage = {
        id: `msg_${Date.now()}_leave`,
        role: 'system',
        content: `${msg.payload.name} 离开了房间`,
        timestamp: Date.now(),
      };
      store.addAdventureMessage(sysMsg);
    });

    socket.on('session:playerList', (msg: SocketMessage<{ players: Array<{ id: string; name: string; characterName?: string; isConnected: boolean }>; code?: string }>) => {
      const store = useGameStore.getState();
      store.setPlayers(msg.payload.players);
      if (msg.payload.code) {
        store.setSessionCode(msg.payload.code);
      }
    });

    // Silent rejoin confirmation (no "player joined" message)
    socket.on('session:rejoined', (msg: SocketMessage<{ sessionId: string; code?: string }>) => {
      const store = useGameStore.getState();
      if (msg.payload.code) {
        store.setSessionCode(msg.payload.code);
      }
      console.log('[useSocket] Rejoined session:', msg.payload.sessionId);
    });

    socket.on('session:error', (msg: SocketMessage<{ error: string; code?: string }>) => {
      const store = useGameStore.getState();
      const sysMsg: AdventureMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'system',
        content: `错误：${msg.payload.error}`,
        timestamp: Date.now(),
      };
      store.addAdventureMessage(sysMsg);
    });
  });
}

/** Send player action to AI GM */
export function sendPlayerAction(action: string): void {
  if (!socket) {
    const store = useGameStore.getState();
    store.addAdventureMessage({
      id: `msg_${Date.now()}_offline`,
      role: 'system',
      content: '未连接到服务器，请先在首页连接服务器。',
      timestamp: Date.now(),
    });
    return;
  }

  const store = useGameStore.getState();
  store.setAiProcessing(true);

  socket.emit('player:action', {
    type: 'player:action',
    sessionId: store.campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { action },
    timestamp: Date.now(),
  } as SocketMessage<{ action: string }>);

  // Safety timeout: clear aiProcessing after 120s if no response (AI GM with large context can take 30-90s)
  setTimeout(() => {
    if (useGameStore.getState().aiProcessing) {
      useGameStore.getState().setAiProcessing(false);
      useGameStore.getState().addAdventureMessage({
        id: `msg_${Date.now()}_timeout`,
        role: 'system',
        content: 'AI管家响应超时，请检查服务器连接或重试。',
        timestamp: Date.now(),
      });
    }
  }, 120000);
}

/** Send player choice to AI GM */
export function sendPlayerChoice(choiceId: string, choiceText: string): void {
  if (!socket) {
    const store = useGameStore.getState();
    store.addAdventureMessage({
      id: `msg_${Date.now()}_offline`,
      role: 'system',
      content: '未连接到服务器。',
      timestamp: Date.now(),
    });
    return;
  }

  const store = useGameStore.getState();
  store.setAiProcessing(true);

  socket.emit('player:choice', {
    type: 'player:choice',
    sessionId: store.campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { choiceId, choiceText },
    timestamp: Date.now(),
  } as SocketMessage<{ choiceId: string; choiceText: string }>);
}

/** Request scene narration from AI GM */
export function requestNarration(): void {
  if (!socket) return;

  socket.emit('gm:narrate', {
    type: 'gm:narrate',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: {},
    timestamp: Date.now(),
  } as SocketMessage);
}

/** Send rest request */
export function sendRestRequest(restType: 'short' | 'long', actions: string[]): void {
  if (!socket) return;

  socket.emit('player:rest', {
    type: 'player:rest',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { restType, actions },
    timestamp: Date.now(),
  } as SocketMessage<{ restType: string; actions: string[] }>);
}

/** Send combat action */
export function sendCombatAction(actionId: string, targetId?: string): void {
  if (!socket) return;

  socket.emit('combat:action', {
    type: 'combat:action',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { actionId, targetId },
    timestamp: Date.now(),
  } as SocketMessage<{ actionId: string; targetId?: string }>);
}

/** Request session start */
export function startSession(): void {
  if (!socket) return;
  socket.emit('session:start', {
    type: 'session:start',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: {},
    timestamp: Date.now(),
  } as SocketMessage);
}

/** Request session end */
export function endSession(): void {
  if (!socket) return;
  socket.emit('session:end', {
    type: 'session:end',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: {},
    timestamp: Date.now(),
  } as SocketMessage);
}

/** Create a new multiplayer session */
export function createSession(character: Character): Promise<{ sessionId: string; code: string }> {
  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('未连接到服务器'));
      return;
    }

    const handler = (msg: SocketMessage<{ sessionId: string; code: string; isHost: boolean }>) => {
      socket!.off('session:created', handler);
      resolve({ sessionId: msg.payload.sessionId, code: msg.payload.code });
    };

    socket.on('session:created', handler);

    socket.emit('session:create', {
      type: 'session:create',
      sessionId: '',
      senderId: useGameStore.getState().playerId,
      payload: { name: character.name, character },
      timestamp: Date.now(),
    } as SocketMessage<{ name: string; character: Character }>);

    // Timeout
    setTimeout(() => {
      socket!.off('session:created', handler);
      reject(new Error('创建会话超时'));
    }, 10000);
  });
}

/** Join a session by room code */
export function joinSessionByCode(code: string, character: Character): Promise<{ sessionId: string; code: string }> {
  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('未连接到服务器'));
      return;
    }

    const handler = (msg: SocketMessage<{ sessionId: string; code: string; isHost: boolean; status: string }>) => {
      socket!.off('session:joined', handler);
      resolve({ sessionId: msg.payload.sessionId, code: msg.payload.code });
    };

    const errorHandler = (msg: SocketMessage<{ error: string; code?: string }>) => {
      socket!.off('session:error', errorHandler);
      reject(new Error(msg.payload.error));
    };

    socket.on('session:joined', handler);
    socket.on('session:error', errorHandler);

    socket.emit('session:joinByCode', {
      type: 'session:joinByCode',
      sessionId: '',
      senderId: useGameStore.getState().playerId,
      payload: { code, name: character.name, character },
      timestamp: Date.now(),
    } as SocketMessage<{ code: string; name: string; character: Character }>);

    // Timeout
    setTimeout(() => {
      socket!.off('session:joined', handler);
      socket!.off('session:error', errorHandler);
      reject(new Error('加入会话超时'));
    }, 10000);
  });
}

/** Disconnect from server */
export function disconnect(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  hasJoinedSession = false;
  // Only clear connection state, preserve character and adventure data
  const store = useGameStore.getState();
  store.setConnected(false);
  store.setAiProcessing(false);
}

/** Get the raw socket instance */
export function getSocket(): Socket | null {
  return socket;
}
