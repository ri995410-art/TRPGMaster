import { io, Socket } from 'socket.io-client';
import { useGameStore, type JournalEntry, type AdventureMessage } from '../store/gameStore';
import type {
  GameEvent,
  SessionState,
  Character,
  GameEventType,
  Player,
  SpotlightState,
  SafetyState,
  CombatState,
  LootResult,
  AdventureSummary,
} from '@trpgmaster/shared';
import type { ActionDeclaration, RollDeclaration } from '@trpgmaster/shared';
import type { DiceResult } from '../store/gameStore';

// Local SocketMessage interface for wire format
interface SocketMessage<T = unknown> {
  type: string;
  sessionId: string;
  senderId: string;
  payload: T;
  timestamp: number;
}

/**
 * Extract journal entries from GM narration text.
 * NOTE: Journal entries are client-side derived data, not persisted to server.
 * They are regenerated from narration text patterns. If server-side persistence
 * is needed in the future, add a journalEntries field to PersistedAdventureMessage
 * and extract during narration storage.
 */
function extractJournalEntries(text: string, npcName?: string): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const now = Date.now();

  // NPC encounter: narrative mentions a named character speaking or appearing
  if (npcName) {
    entries.push({
      id: `je_${now}_npc`,
      type: 'npc',
      title: npcName,
      content: text.substring(0, 150),
      timestamp: now,
    });
  }

  // NPC detection from narrative text (when no explicit npcName)
  if (!npcName) {
    const npcPatterns = [
      /(?:一个|一名|那位|那个)叫(?:做|着)?(.{1,10}?)(?:的|人|者|男|女|老|少)/,
      /(?:名叫|叫做|名为|自称)(.{1,10}?)(?:的|人|者|男|女|老人|家伙|先生|女士|商人)/,
    ];
    for (const pat of npcPatterns) {
      const match = text.match(pat);
      if (match && match[1]) {
        entries.push({
          id: `je_${now}_npc_auto`,
          type: 'npc',
          title: match[1].trim(),
          content: text.substring(0, 150),
          timestamp: now,
        });
        break;
      }
    }
  }

  // Quest-related keywords
  const questPatterns = [
    /(?:任务|委托|使命|quest)[:：]?\s*(.{2,40})/i,
    /(?:接受|完成|推进|失败|放弃)(?:了|了)?(?:任务|委托|使命)(.{0,30})/i,
  ];
  for (const pat of questPatterns) {
    const match = text.match(pat);
    if (match) {
      entries.push({
        id: `je_${now}_quest`,
        type: 'quest',
        title: match[1] ? match[1].trim() : '任务进展',
        content: text.substring(0, 150),
        timestamp: now,
      });
      break;
    }
  }

  // Discovery keywords
  const discoveryPatterns = [
    /(?:发现|找到|揭示|揭开|得知|获悉)(?:了|了)?(.{2,50})/i,
    /(?:秘密|线索|真相|隐藏)(.{2,40})/i,
  ];
  for (const pat of discoveryPatterns) {
    const match = text.match(pat);
    if (match) {
      entries.push({
        id: `je_${now}_disc`,
        type: 'discovery',
        title: match[0].substring(0, 40),
        content: text.substring(0, 150),
        timestamp: now,
      });
      break;
    }
  }

  // Faction keywords
  const factionPatterns = [
    /(?:提灯团|女王之仆|白银骑士团|陨火信徒|紫晶学院)(.{0,30})/i,
  ];
  for (const pat of factionPatterns) {
    const match = text.match(pat);
    if (match) {
      entries.push({
        id: `je_${now}_faction`,
        type: 'faction',
        title: match[0].substring(0, 40),
        content: text.substring(0, 150),
        timestamp: now,
      });
      break;
    }
  }

  // Major events: combat, death, level up, location change
  const eventPatterns = [
    /(?:战斗|交战|冲突|袭击|伏击)(.{0,30})/i,
    /(?:升级|升到|等级提升)/i,
    /(?:死亡|倒下|倒地|重伤)/i,
    /(?:抵达|来到|进入|离开)(.{2,30})/i,
  ];
  for (const pat of eventPatterns) {
    const match = text.match(pat);
    if (match) {
      entries.push({
        id: `je_${now}_event`,
        type: 'event',
        title: match[0].substring(0, 40),
        content: text.substring(0, 150),
        timestamp: now,
      });
      break;
    }
  }

  return entries;
}

let socket: Socket | null = null;
let hasJoinedSession = false;  // Track whether we've done initial join vs rejoin
let isSendingAction = false;   // Debounce guard: prevent duplicate action sends

export function connectToServer(serverUrl: string, options?: { autoJoin?: boolean }): Promise<string> {
  const autoJoin = options?.autoJoin !== false;  // default true
  return new Promise((resolve, reject) => {
    // Ensure we have a stable playerId before connecting
    useGameStore.getState().initPlayerId();

    // Clean up any previous socket and its listeners
    if (socket) {
      socket.disconnect();
      socket.removeAllListeners();
      socket = null;
    }
    // Reset session join state for the new server connection
    hasJoinedSession = false;

    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 5000,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      useGameStore.getState().setConnected(true);
      useGameStore.getState().setServerUrl(serverUrl);

      const store = useGameStore.getState();
      const playerId = store.playerId;
      const character = store.character;

      if (!hasJoinedSession) {
        // First connection: send session:join (unless autoJoin is disabled)
        if (autoJoin) {
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
        }
        hasJoinedSession = true;
      } else {
        // Reconnection: send session:rejoin (silent rejoin, no playerJoined broadcast)
        if (autoJoin) {
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

    socket.on('disconnect', (reason) => {
      useGameStore.getState().setConnected(false);
      // Show reconnecting message if not explicitly disconnected by user
      if (reason !== 'io client disconnect') {
        useGameStore.getState().addAdventureMessage({
          id: `msg_${Date.now()}_reconnect`,
          role: 'system',
          content: '连接中断，正在重新连接...',
          timestamp: Date.now(),
        });
      }
    });

    socket.on('connect_error', (err) => {
      reject(err);
    });

    // Handle successful reconnection after a disconnect
    socket.on('reconnect', () => {
      const store = useGameStore.getState();
      store.setConnected(true);

      // Re-join the session on reconnect
      if (hasJoinedSession && store.campaignId) {
        socket!.emit('session:rejoin', {
          type: 'session:rejoin',
          sessionId: store.campaignId,
          senderId: store.playerId,
          payload: {
            playerId: store.playerId,
            name: store.character?.name || 'Player',
            character: store.character || undefined,
          },
          timestamp: Date.now(),
        } as SocketMessage<{ playerId: string; name: string; character?: Character }>);
      }

      store.addAdventureMessage({
        id: `msg_${Date.now()}_reconnect`,
        role: 'system',
        content: '连接已恢复',
        timestamp: Date.now(),
      });
    });

    // ===== Game State Sync =====

    socket.on('game:state', (msg: SocketMessage<{ state: SessionState; adventureMessages?: Array<{ id: string; role: 'player' | 'narrator' | 'npc' | 'system'; content: string; timestamp: number; npcName?: string; npcId?: string; choices?: Array<{ id: string; text: string; action?: string }> }> }>) => {
      const { state, adventureMessages } = msg.payload;
      const store = useGameStore.getState();
      store.setCampaign(state.sessionId, state);

      // Record this character-session association
      if (store.character) {
        store.addCharacterSession(store.character.id, state.sessionId);
      }

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

      // Update combat state from server
      store.setCombatState(state.activeCombat || null);

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
      if (adventureMessages && adventureMessages.length > 0) {
        const key = state.sessionId || '_default';
        const currentMsgs = store.adventureMessagesBySession[key] || [];
        if (adventureMessages.length > currentMsgs.length) {
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
      }
    });

    // ===== Game Events =====

    socket.on('game:event', (msg: SocketMessage<GameEvent>) => {
      useGameStore.getState().addEvent(msg.payload);
    });

    // ===== AI GM Narration =====

    // Legacy non-streaming event (fallback when no AI GM configured)
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
      isSendingAction = false;
      store.setAiProcessing(false);
    });

    // Streaming: start
    socket.on('gm:narrate:start', (msg: SocketMessage<{ turnId: string; activePlayerId?: string; characterName?: string; playerName?: string }>) => {
      const store = useGameStore.getState();
      store.setStreamingTurnId(msg.payload.turnId);
      store.setGmTyping(true);
    });

    // Streaming: delta
    socket.on('gm:narrate:delta', (msg: SocketMessage<{ turnId: string; text: string }>) => {
      const store = useGameStore.getState();
      // Only append if this delta belongs to the current stream
      if (store.streamingTurnId === msg.payload.turnId) {
        store.appendStreamingText(msg.payload.text);
      }
      // Also append to streaming summary if adventure is ending
      if (store.isAdventureEnding) {
        store.appendStreamingSummary(msg.payload.text);
      }
    });

    // Streaming: end
    socket.on('gm:narrate:end', (msg: SocketMessage<{ turnId: string; fullText: string; choices?: Array<{ id: string; label: string; action?: string }>; npcName?: string; npcId?: string; playerName?: string; characterName?: string; error?: boolean; effectsEmpty?: boolean }>) => {
      const store = useGameStore.getState();
      // Only finalize if this end belongs to the current stream
      if (store.streamingTurnId === msg.payload.turnId) {
        const adventureMsg: AdventureMessage = {
          id: `msg_${Date.now()}_gm`,
          role: msg.payload.npcName ? 'npc' : 'narrator',
          content: msg.payload.fullText,
          timestamp: Date.now(),
          npcName: msg.payload.npcName,
          npcId: msg.payload.npcId,
          choices: msg.payload.choices?.map(c => ({
            id: c.id,
            text: c.label,
            action: c.action,
          })),
        };
        store.addAdventureMessage(adventureMsg);
        store.setStreamingTurnId(null);
        store.setGmTyping(false);
        isSendingAction = false;
        store.setAiProcessing(false);

        // Notify when GM effect extraction returned nothing — state may be stale
        if (msg.payload.effectsEmpty) {
          store.addAdventureMessage({
            id: `msg_${Date.now()}_effectsWarning`,
            role: 'system',
            content: '⚠ AI状态解析未生效，角色数值可能未更新。如需修正请手动调整或重新描述行动。',
            timestamp: Date.now(),
          });
        }

        // Auto-generate journal entries from narration
        if (!msg.payload.error && msg.payload.fullText.length > 20) {
          const journalEntries = extractJournalEntries(msg.payload.fullText, msg.payload.npcName);
          for (const entry of journalEntries) {
            store.addJournalEntry(entry);
          }
        }
      }
    });

    // ===== Character Updates =====

    socket.on('character:update', (msg: SocketMessage<{ character: Character }>) => {
      useGameStore.getState().updateCharacterFromServer(msg.payload.character);
    });

    socket.on('campaign:levelUpResult', (msg: SocketMessage<{ success: boolean; character?: Character; tierChanged?: boolean; errors?: string[] }>) => {
      if (msg.payload.success && msg.payload.character) {
        useGameStore.getState().updateCharacterFromServer(msg.payload.character);
      }
    });

    socket.on('ai:configUpdated', (msg: SocketMessage<{ aiConnected: boolean }>) => {
      // AI config changed on server — could update UI state if needed
      console.log('[useSocket] AI config updated, aiConnected:', msg.payload.aiConnected);
    });

    // ===== Dice Results =====

    socket.on('dice:roll', (msg: SocketMessage<{ hopeDie: number; fearDie: number; modifier: number; difficulty: number; outcome?: string; isCritical?: boolean; withHope?: boolean; withFear?: boolean; hopeGain?: number; fearGain?: number; stressCleared?: number; canTakeFreeAction?: boolean; success?: boolean; total?: number }>) => {
      // Only set pendingDiceResult for this player's own rolls
      if (msg.senderId === useGameStore.getState().playerId && msg.payload.outcome) {
        const result: DiceResult = {
          hopeDie: msg.payload.hopeDie,
          fearDie: msg.payload.fearDie,
          modifier: msg.payload.modifier,
          difficulty: msg.payload.difficulty,
          outcome: msg.payload.outcome,
          isCritical: msg.payload.isCritical ?? false,
          withHope: msg.payload.withHope ?? false,
          withFear: msg.payload.withFear ?? false,
          hopeGain: msg.payload.hopeGain ?? 0,
          fearGain: msg.payload.fearGain ?? 0,
          stressCleared: msg.payload.stressCleared ?? 0,
          canTakeFreeAction: msg.payload.canTakeFreeAction ?? false,
          success: msg.payload.success ?? false,
          total: msg.payload.total ?? 0,
        };
        useGameStore.getState().setPendingDiceResult(result);
      }
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

    // ===== Session Zero Events =====

    socket.on('session:sessionZeroStarted', (msg: SocketMessage<{ phase: string }>) => {
      const store = useGameStore.getState();
      const sysMsg: AdventureMessage = {
        id: `msg_${Date.now()}_s0start`,
        role: 'system',
        content: '🎉 Session Zero 开始——让我们共同设定这场战役！',
        timestamp: Date.now(),
      };
      store.addAdventureMessage(sysMsg);
      store.setSessionZeroPhase(msg.payload.phase);
      console.log('[useSocket] Session Zero started, phase:', msg.payload.phase);
    });

    socket.on('session:completeSessionZero', () => {
      const store = useGameStore.getState();
      const sysMsg: AdventureMessage = {
        id: `msg_${Date.now()}_s0end`,
        role: 'system',
        content: '🎉 Session Zero 完成——冒险正式开始！',
        timestamp: Date.now(),
      };
      store.addAdventureMessage(sysMsg);
      store.setSessionZeroPhase(null);
      console.log('[useSocket] Session Zero completed');
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

    // ===== Spotlight Events =====

    socket.on('spotlight:state', (msg: SocketMessage<{ spotlight: SpotlightState }>) => {
      useGameStore.getState().setSpotlightState(msg.payload.spotlight);
    });

    socket.on('action:queued', (msg: SocketMessage<{ queuePosition: number }>) => {
      const store = useGameStore.getState();
      const sysMsg: AdventureMessage = {
        id: `msg_${Date.now()}_queued`,
        role: 'system',
        content: `你的行动已排队，前方还有 ${msg.payload.queuePosition} 人`,
        timestamp: Date.now(),
      };
      store.addAdventureMessage(sysMsg);
    });

    // ===== Safety Events =====

    socket.on('safety:update', (msg: SocketMessage<{ safety: SafetyState }>) => {
      useGameStore.getState().setSafetyState(msg.payload.safety);
    });

    socket.on('safety:paused', () => {
      useGameStore.getState().setXcardPaused(true);
    });

    socket.on('safety:resumed', () => {
      useGameStore.getState().setXcardPaused(false);
    });

    socket.on('s0:ready', (msg: SocketMessage<{ playerId: string }>) => {
      const store = useGameStore.getState();
      const sysMsg: AdventureMessage = {
        id: `msg_${Date.now()}_s0ready`,
        role: 'system',
        content: 'Lines/Veils 已提交',
        timestamp: Date.now(),
      };
      store.addAdventureMessage(sysMsg);
    });

    socket.on('s0:complete', () => {
      const store = useGameStore.getState();
      const sysMsg: AdventureMessage = {
        id: `msg_${Date.now()}_s0complete`,
        role: 'system',
        content: '安全工具设定完成，进入世界观共创阶段',
        timestamp: Date.now(),
      };
      store.addAdventureMessage(sysMsg);
    });

    // ===== Campaign Reset =====

    socket.on('campaign:resetDone', (msg: SocketMessage<{ state: SessionState }>) => {
      const store = useGameStore.getState();
      // Reset local store completely, then apply new server state
      store.reset();
      store.setCampaign(msg.payload.state.sessionId, msg.payload.state);
      store.setConnected(true);
      console.log('[useSocket] Campaign reset done, new session:', msg.payload.state.sessionId);
    });

    // ===== Loot Events =====

    socket.on('loot:available', (msg: SocketMessage<LootResult>) => {
      useGameStore.getState().setPendingLoot(msg.payload);
    });

    // ===== Combat Enemy Turn Events =====

    socket.on('combat:enemyTurn', (msg: SocketMessage<{
      results: Array<{
        enemyId: string;
        enemyName: string;
        actions: Array<{
          kind: string;
          rawDamage?: number;
          hpLoss?: number;
          severity?: string;
          stressDamage?: number;
          conditionApplied?: string;
          fearCost: number;
          description: string;
        }>;
        narrationHint: string;
      }>;
    }>) => {
      const store = useGameStore.getState();

      // Build a system message summarizing enemy actions
      const summary = msg.payload.results
        .map(r => r.narrationHint)
        .join('\n');

      const sysMsg: AdventureMessage = {
        id: `msg_${Date.now()}_enemyTurn`,
        role: 'combat',
        content: summary,
        timestamp: Date.now(),
      };
      store.addAdventureMessage(sysMsg);
    });

    // ===== Reaction Events =====

    socket.on('combat:reactionPrompt', (msg: SocketMessage<{
      trigger: string;
      sourceId: string;
      sourceType: string;
      targetId: string;
      rawDamage?: number;
      severity?: string;
      attackName?: string;
      availableReactions: Array<{
        type: string;
        name: string;
        description: string;
        attribute?: string;
        difficulty?: number;
        hopeCost?: number;
        usesReaction: boolean;
        sourceId?: string;
        sourceType?: string;
      }>;
    }>) => {
      const store = useGameStore.getState();
      store.setPendingReactionPrompt(msg.payload);
    });

    socket.on('combat:reactionResult', (msg: SocketMessage<{
      reactionType: string;
      characterId: string;
      success: boolean;
      isCritical: boolean;
      damagePrevented: number;
      newSeverity?: string;
      armorSlotsSpent: number;
      counterDamage?: number;
      counterTargetHpLoss?: number;
      hopeGain: number;
      hopeCost: number;
      reactionUsed: boolean;
      narrationHint: string;
    }>) => {
      const store = useGameStore.getState();
      // Add narration hint as adventure message
      const sysMsg: AdventureMessage = {
        id: `msg_${Date.now()}_reaction`,
        role: 'combat',
        content: msg.payload.narrationHint,
        timestamp: Date.now(),
      };
      store.addAdventureMessage(sysMsg);
      store.setPendingReactionPrompt(null);
    });

    // ===== Adventure End Events =====

    socket.on('adventure:ending', () => {
      const store = useGameStore.getState();
      // Show summary modal immediately with return-to-lobby button
      store.setIsAdventureEnding(true);
      isSendingAction = false;
      store.setAiProcessing(false);
    });

    socket.on('adventure:summary', (msg: SocketMessage<AdventureSummary>) => {
      const store = useGameStore.getState();
      const sysMsg: AdventureMessage = {
        id: `msg_${Date.now()}_summary`,
        role: 'system',
        content: `冒险总结\n${msg.payload.summary}`,
        timestamp: Date.now(),
      };
      store.addAdventureMessage(sysMsg);
      // Finalize the summary text (persists locally for later viewing)
      store.finalizeStreamingSummary(msg.payload.summary);
    });

    // ===== OOC Chat Events =====

    socket.on('chat:message', (msg: SocketMessage<{ text: string; sender: string }>) => {
      const store = useGameStore.getState();
      store.addOocMessage({
        id: `ooc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        sender: msg.payload.sender,
        text: msg.payload.text,
        timestamp: Date.now(),
      });
    });
  });
}

/** Send player action to AI GM */
export function sendPlayerAction(action: string, diceContext?: string): void {
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
  // Debounce guard: reject if a previous action is still being sent
  if (isSendingAction || store.aiProcessing) {
    store.addAdventureMessage({
      id: `msg_${Date.now()}_debounce`,
      role: 'system',
      content: '操作处理中，请稍后再试。',
      timestamp: Date.now(),
    });
    return;
  }
  isSendingAction = true;
  store.setAiProcessing(true);

  // If no explicit diceContext, check for pendingDiceResult
  let finalAction = action;
  if (!diceContext && store.pendingDiceResult) {
    const d = store.pendingDiceResult;
    const outcomeLabel = d.success ? '成功' : '失败';
    const typeLabel = d.withHope ? '希望' : d.withFear ? '恐惧' : '中立';
    diceContext = `[骰子结果: ${typeLabel}${outcomeLabel} (${d.hopeDie}+${d.fearDie}+${d.modifier}=${d.total} vs ${d.difficulty})${d.isCritical ? ' 大成功!' : ''}]`;
    store.clearPendingDiceResult();
  }
  if (diceContext) {
    finalAction = `${diceContext} ${action}`;
  }

  socket.emit('player:action', {
    type: 'player:action',
    sessionId: store.campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { action: finalAction },
    timestamp: Date.now(),
  } as SocketMessage<{ action: string }>);
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
export function sendRestRequest(restType: 'short' | 'long', actions: string[], projectDescription?: string): void {
  if (!socket) return;

  socket.emit('player:rest', {
    type: 'player:rest',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { restType, actions, projectDescription },
    timestamp: Date.now(),
  } as SocketMessage<{ restType: string; actions: string[]; projectDescription?: string }>);
}

/** Send combat action (legacy) */
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

/** Send structured attack action to server */
export function sendAttackAction(decl: ActionDeclaration): void {
  if (!socket) return;

  const store = useGameStore.getState();
  store.setAiProcessing(true);

  socket.emit('action:attack', {
    type: 'action:attack',
    sessionId: store.campaignId || '',
    senderId: store.playerId,
    payload: decl,
    timestamp: Date.now(),
  } as SocketMessage<ActionDeclaration>);
}

/** Send dice roll to server for resolution */
export function sendDiceRoll(hopeDie: number, fearDie: number, modifier: number, difficulty: number): void {
  if (!socket) return;

  socket.emit('dice:roll', {
    type: 'dice:roll',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { hopeDie, fearDie, modifier, difficulty },
    timestamp: Date.now(),
  } as SocketMessage<{ hopeDie: number; fearDie: number; modifier: number; difficulty: number }>);
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
      useGameStore.getState().addCharacterSession(character.id, msg.payload.sessionId);
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
      socket!.off('session:error', errorHandler);
      useGameStore.getState().addCharacterSession(character.id, msg.payload.sessionId);
      resolve({ sessionId: msg.payload.sessionId, code: msg.payload.code });
    };

    const errorHandler = (msg: SocketMessage<{ error: string; code?: string }>) => {
      socket!.off('session:joined', handler);
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

/** Rejoin a specific session by sessionId */
export function rejoinSessionById(sessionId: string, character: Character): Promise<{ sessionId: string; code: string }> {
  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('未连接到服务器'));
      return;
    }

    const playerId = useGameStore.getState().playerId;

    const handler = (msg: SocketMessage<{ sessionId: string; code: string }>) => {
      socket!.off('session:rejoined', handler);
      socket!.off('session:error', errorHandler);
      useGameStore.getState().addCharacterSession(character.id, sessionId);
      resolve({ sessionId: msg.payload.sessionId, code: msg.payload.code });
    };

    const errorHandler = (msg: SocketMessage<{ message: string }>) => {
      socket!.off('session:rejoined', handler);
      socket!.off('session:error', errorHandler);
      reject(new Error(msg.payload.message || '重新加入失败'));
    };

    socket.on('session:rejoined', handler);
    socket.on('session:error', errorHandler);

    socket.emit('session:rejoinById', {
      type: 'session:rejoinById',
      sessionId,
      senderId: playerId,
      payload: { sessionId, playerId, name: character.name, character },
      timestamp: Date.now(),
    } as SocketMessage<{ sessionId: string; playerId: string; name: string; character?: Character }>);

    // Timeout
    setTimeout(() => {
      socket!.off('session:rejoined', handler);
      socket!.off('session:error', errorHandler);
      reject(new Error('重新加入超时'));
    }, 10000);
  });
}

/** Request spotlight (enqueue to act) */
export function requestSpotlight(): void {
  if (!socket) return;
  socket.emit('spotlight:request', {
    type: 'spotlight:request',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: {},
    timestamp: Date.now(),
  } as SocketMessage);
}

/** Pass spotlight to the next player (or a specific target) */
export function passSpotlight(targetPlayerId?: string): void {
  if (!socket) return;
  socket.emit('spotlight:pass', {
    type: 'spotlight:pass',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { targetPlayerId },
    timestamp: Date.now(),
  } as SocketMessage<{ targetPlayerId?: string }>);
}

/** Submit Lines/Veils during Session Zero */
export function submitS0(lines: string[], veils: string[], toneFlags: string[]): void {
  if (!socket) return;
  socket.emit('s0:submit', {
    type: 's0:submit',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { lines, veils, toneFlags },
    timestamp: Date.now(),
  } as SocketMessage<{ lines: string[]; veils: string[]; toneFlags: string[] }>);
}

/** Send OOC (out-of-character) chat message */
export function sendChatMessage(text: string): void {
  if (!socket) return;
  const store = useGameStore.getState();
  socket.emit('chat:message', {
    type: 'chat:message',
    sessionId: store.campaignId || '',
    senderId: store.playerId,
    payload: { text, sender: store.character?.name || store.playerId },
    timestamp: Date.now(),
  } as SocketMessage<{ text: string; sender: string }>);
}

/** Activate X-Card (anonymous pause) */
export function activateXCard(): void {
  if (!socket) return;
  socket.emit('safety:xcard', {
    type: 'safety:xcard',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: {},
    timestamp: Date.now(),
  } as SocketMessage);
}

/** Resume game after X-Card (host only) */
export function resumeSafety(): void {
  if (!socket) return;
  socket.emit('safety:resume', {
    type: 'safety:resume',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: {},
    timestamp: Date.now(),
  } as SocketMessage);
}

/** Reset campaign — deletes server session and creates a fresh one */
export function sendCampaignReset(): void {
  if (!socket) return;
  socket.emit('campaign:reset', {
    type: 'campaign:reset',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: {},
    timestamp: Date.now(),
  } as SocketMessage);
}

/** Send action roll — contextual dice roll with attribute and difficulty */
export function sendActionRoll(decl: RollDeclaration): void {
  if (!socket) return;

  const store = useGameStore.getState();
  store.setAiProcessing(true);

  socket.emit('action:roll', {
    type: 'action:roll',
    sessionId: store.campaignId || '',
    senderId: store.playerId,
    payload: decl,
    timestamp: Date.now(),
  } as SocketMessage<RollDeclaration>);
}

/** Add an enemy to combat by stat block ID */
export function sendCombatAddEnemy(statBlockId: string, name?: string): void {
  if (!socket) return;

  socket.emit('combat:addEnemy', {
    type: 'combat:addEnemy',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { statBlockId, name },
    timestamp: Date.now(),
  } as SocketMessage<{ statBlockId: string; name?: string }>);
}

/** End current combat */
export function sendCombatEnd(): void {
  if (!socket) return;

  socket.emit('combat:end', {
    type: 'combat:end',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: {},
    timestamp: Date.now(),
  } as SocketMessage);
}

/** Execute enemy turns (rules engine drives, AI narrates) */
export function sendCombatEnemyTurn(enemyId?: string): void {
  if (!socket) return;

  socket.emit('combat:enemyTurn', {
    type: 'combat:enemyTurn',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { enemyId },
    timestamp: Date.now(),
  } as SocketMessage<{ enemyId?: string }>);
}

/** Declare a reaction during combat */
export function sendReactionDeclare(reactionType: string, options?: { hopeDie?: number; fearDie?: number; armorSlotsToSpend?: number; sourceId?: string }): void {
  if (!socket) return;

  socket.emit('combat:reactionDeclare', {
    type: 'combat:reactionDeclare',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { reactionType, ...options },
    timestamp: Date.now(),
  } as SocketMessage<{ reactionType: string; hopeDie?: number; fearDie?: number; armorSlotsToSpend?: number; sourceId?: string }>);
}

/** Use a feature (domain card, class feature, ancestry feature, etc.) */
export function sendUseFeature(featureId: string, featureType: string, action: string, targetId?: string, attribute?: string): void {
  if (!socket) return;

  const store = useGameStore.getState();
  store.setAiProcessing(true);

  socket.emit('action:useFeature', {
    type: 'action:useFeature',
    sessionId: store.campaignId || '',
    senderId: store.playerId,
    payload: { featureId, featureType, action, targetId, attribute },
    timestamp: Date.now(),
  } as SocketMessage<{ featureId: string; featureType: string; action: string; targetId?: string; attribute?: string }>);
}

/** Pick up loot items */
export function sendLootPickup(itemIds: string[]): void {
  if (!socket) return;

  socket.emit('loot:pickup', {
    type: 'loot:pickup',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { itemIds },
    timestamp: Date.now(),
  } as SocketMessage<{ itemIds: string[] }>);
}

/** Search the current scene */
export function sendSceneSearch(): void {
  if (!socket) return;

  const store = useGameStore.getState();
  store.setAiProcessing(true);

  store.addAdventureMessage({
    id: `msg_${Date.now()}_player`,
    role: 'player',
    content: '探查周围环境...',
    timestamp: Date.now(),
  });

  socket.emit('scene:search', {
    type: 'scene:search',
    sessionId: store.campaignId || '',
    senderId: store.playerId,
    payload: {},
    timestamp: Date.now(),
  } as SocketMessage);
}

/** End the current adventure */
export function sendAdventureEnd(): void {
  if (!socket) return;

  const store = useGameStore.getState();
  store.setAiProcessing(true);

  socket.emit('adventure:end', {
    type: 'adventure:end',
    sessionId: store.campaignId || '',
    senderId: store.playerId,
    payload: {},
    timestamp: Date.now(),
  } as SocketMessage);
}

/** Sync character resource changes to server */
export function sendCharacterResourceUpdate(resource: 'hp' | 'stress' | 'hope' | 'armorSlots', delta: number): void {
  if (!socket) return;
  socket.emit('character:resourceUpdate', {
    type: 'character:resourceUpdate',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { resource, delta },
    timestamp: Date.now(),
  });
}

/** Set character fields to absolute values (GM correction tool) */
export function sendCharacterSetValues(updates: Record<string, unknown>): void {
  if (!socket) return;
  const store = useGameStore.getState();
  const characterId = store.character?.id;
  if (!characterId) return;
  socket.emit('character:update', {
    type: 'character:update',
    sessionId: store.campaignId || '',
    senderId: store.playerId,
    payload: { characterId, updates },
    timestamp: Date.now(),
  } as SocketMessage<{ characterId: string; updates: Record<string, unknown> }>);
  // Also update local store immediately for responsiveness
  store.updateCharacter(updates as Partial<import('@trpgmaster/shared').Character>);
}

/** Send level-up request to server */
export function sendLevelUp(options: string[], attributeChoices?: [string, string], experienceChoices?: [string, string], domainCardChoice?: string): void {
  if (!socket) return;
  socket.emit('campaign:levelUp', {
    type: 'campaign:levelUp',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: { options, attributeChoices, experienceChoices, domainCardChoice },
    timestamp: Date.now(),
  });
}

/** Cancel active AI narration */
export function cancelNarration(): void {
  if (!socket) return;
  socket.emit('gm:cancelNarration', {
    type: 'gm:cancelNarration',
    sessionId: useGameStore.getState().campaignId || '',
    senderId: useGameStore.getState().playerId,
    payload: {},
    timestamp: Date.now(),
  });
}

/** Disconnect from server */
export function disconnect(): void {
  if (socket) {
    socket.disconnect();
    socket.removeAllListeners();
    socket = null;
  }
  hasJoinedSession = false;
  // Only clear connection state, preserve character and adventure data
  const store = useGameStore.getState();
  store.setConnected(false);
  isSendingAction = false;
  store.setAiProcessing(false);
}

/** Get the raw socket instance */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Join the default server session (for solo new adventure).
 * Only call after connectToServer with autoJoin=false.
 */
export function joinDefaultSession(character: Character): void {
  if (!socket) return;
  const playerId = useGameStore.getState().playerId;
  socket.emit('session:join', {
    type: 'session:join',
    sessionId: '',
    senderId: playerId,
    payload: {
      playerId,
      role: 'player',
      name: character.name,
      character,
    },
    timestamp: Date.now(),
  });
}
