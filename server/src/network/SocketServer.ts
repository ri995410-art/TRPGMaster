import { Server as IOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { getDataProvider } from '../rules/DataProviderRegistry';
import type { StateManager } from '../core/StateManager';
import type { SessionRegistry } from '../core/SessionRegistry';
import type { AIGameMaster } from '../ai/AIGameMaster';
import type { AIGameMasterPool } from '../ai/AIGameMasterPool';
import { resolveDualityDice, gainFearOnRest, executeRest, gloriousSacrifice, avoidDeath, desperateGamble, swapDomainCard, recallDomainCard } from '../rules/systems/DaggerHeartRules';
import { resolvePlayerAttack, resolveDamageToCharacter, resolveAbilityCheck, resolveEnemyAttack } from '../rules/combatResolver';
import { rollLootTable, rollSceneSearchLoot } from '../rules/lootResolver';
import type { LootResult } from '@trpgmaster/shared';
import { applyPlayerAttack, applyDamageToCharacter } from './combatApply';
import { selectEnemyActions } from '../rules/systems/enemyBehavior';
import { spawnEncounter, getTierFromLevel, type EncounterDifficulty } from '../rules/systems/encounterSpawner';
import { CharacterLevelUp } from '../core/CharacterLevelUp';
import type { LevelUpRequest, LevelUpOptionType } from '../core/CharacterLevelUp';
import { extractGmEffects, playerInputSuggestsCombat } from '../ai/extractGmEffects';
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
  ShortRestAction,
  LongRestAction,
  Attribute,
} from '@trpgmaster/shared';
import type { AIGMContext } from '@trpgmaster/shared';
import type { PersistedAdventureMessage } from '../core/SessionPersistence';
import type { SessionStore } from '../core/SessionStore';
import { SpotlightManager } from '../core/SpotlightManager';
import { SafetyManager } from '../core/SafetyManager';
import {
  validatePayload,
  diceRollPayload,
  playerActionPayload,
  playerChoicePayload,
  chatMessagePayload,
  playerRestPayload,
  characterResourceUpdatePayload,
  deathMovePayload,
  levelUpPayload,
  contaminationPayload,
  hazeEffectPayload,
  deleriumFoundPayload,
  sealFoundPayload,
  swapDomainCardPayload,
  combatActionPayload,
  combatAddEnemyPayload,
  combatSpawnEncounterPayload,
  reactionDeclarePayload,
  actionUseFeaturePayload,
  lootPickupPayload,
  spotlightPassPayload,
  s0SubmitPayload,
  characterUpdatePayload,
  sessionJoinPayload,
  sessionCreatePayload,
  sessionJoinByCodePayload,
  sessionRejoinPayload,
  sessionRejoinByIdPayload,
} from './validation';
import type { ZodTypeAny } from 'zod';

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
  private gmPool: AIGameMasterPool | undefined;
  private clients: Map<string, ConnectedClient>;
  private activeStreams: Map<string, { controller: AbortController; senderId?: string }>; // sessionId → active stream
  private sessionStore: SessionStore | null;
  private spotlightManager: SpotlightManager;
  private safetyManager: SafetyManager;

  constructor(httpServer: HttpServer, sessionRegistry: SessionRegistry, gmPool?: AIGameMasterPool) {
    this.sessionRegistry = sessionRegistry;
    this.gmPool = gmPool;
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
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, sessionJoinPayload);
        if (!validated) return;
        msg.payload = validated;
        this.handleJoin(socket, msg);
      });

      socket.on('session:create', (msg: SocketMessage<{ name: string; character?: Character }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, sessionCreatePayload);
        if (!validated) return;
        msg.payload = validated;
        this.handleCreateSession(socket, msg);
      });

      socket.on('session:joinByCode', (msg: SocketMessage<{ code: string; name: string; character?: Character }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, sessionJoinByCodePayload);
        if (!validated) return;
        msg.payload = validated;
        this.handleJoinByCode(socket, msg);
      });

      socket.on('session:rejoin', (msg: SocketMessage<{ playerId: string; name: string; character?: Character }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, sessionRejoinPayload);
        if (!validated) return;
        msg.payload = validated;
        this.handleRejoin(socket, msg);
      });

      socket.on('session:rejoinById', (msg: SocketMessage<{ sessionId: string; playerId: string; name: string; character?: Character }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, sessionRejoinByIdPayload);
        if (!validated) return;
        msg.payload = validated;
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
        const validated = this.validateMsg<{ text: string; sender: string }>(socket, msg, chatMessagePayload);
        if (!validated) return;
        const client = this.clients.get(socket.id);
        if (!client) return;
        const sessionId = client.sessionId;
        this.io.to(sessionId).emit('chat:message', { ...msg, payload: validated });
      });

      socket.on('dice:roll', (msg: SocketMessage<{ hopeDie: number; fearDie: number; modifier: number; difficulty: number }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, diceRollPayload);
        if (!validated) return;
        const client = this.clients.get(socket.id);
        if (!client) return;
        const sessionId = client.sessionId;
        const stateManager = this.sessionRegistry.findById(sessionId);
        if (!stateManager) {
          this.io.to(sessionId).emit('dice:roll', msg);
          return;
        }

        const { hopeDie, fearDie, modifier, difficulty } = validated;
        const result = resolveDualityDice(hopeDie, fearDie, modifier, difficulty);

        // Apply hope gain to character
        if (result.hopeGain > 0) {
          const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
          if (character) {
            stateManager.updateCharacterHope(result.hopeGain);
          }
        }

        // Apply stress clear on critical success
        if (result.stressCleared > 0) {
          const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
          if (character) {
            stateManager.updateCharacterStress(-result.stressCleared);
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
            stressCleared: result.stressCleared,
            canTakeFreeAction: result.canTakeFreeAction,
            success: result.success,
            total: result.total,
          },
        });

        // Trigger AI narration for standalone dice rolls (not from action:roll/action:attack)
        if (!this.activeStreams.has(sessionId)) {
          const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
          if (character) {
            const state = stateManager.getState();
            const aiGM = this.gmPool?.getOrCreate(sessionId, state.systemId || 'daggerheart');
            if (aiGM) {
              const outcomeMap: Record<string, string> = {
                criticalSuccess: '关键成功', hopeSuccess: '希望成功',
                fearSuccess: '恐惧成功', hopeFailure: '希望失败', fearFailure: '恐惧失败',
              };
              const context = {
                sessionId,
                character,
                characters: state.characters.length > 0 ? state.characters : [character],
                activePlayerId: client.playerId,
                activePlayerName: client.name,
                sessionState: state,
                worldLore: aiGM.getWorldLore(),
              };
              const actionText = `${character.name}掷骰：${outcomeMap[result.outcome] || result.outcome}（${result.total} vs ${difficulty}）`;
              this.runNarration(socket, client, stateManager, context, actionText, false, undefined, aiGM).catch(err => {
                console.error('Standalone dice narration error:', err);
              });
            }
          }
        }
      });

      socket.on('input:text', (msg: SocketMessage<{ text: string }>) => {
        this.handleInputText(socket, msg);
      });

      // ===== Player Actions (AI GM) =====

      socket.on('player:action', (msg: SocketMessage<{ action: string }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, playerActionPayload);
        if (!validated) return;
        msg.payload = validated;
        this.handlePlayerAction(socket, msg);
      });

      socket.on('player:choice', (msg: SocketMessage<{ choiceId: string; choiceText: string }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, playerChoicePayload);
        if (!validated) return;
        msg.payload = validated;
        this.handlePlayerChoice(socket, msg);
      });

      socket.on('spotlight:request', () => {
        this.handleSpotlightRequest(socket);
      });

      socket.on('spotlight:pass', (msg: SocketMessage<{ targetPlayerId?: string }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, spotlightPassPayload);
        if (!validated) return;
        msg.payload = validated;
        this.handleSpotlightPass(socket, msg);
      });

      socket.on('s0:submit', (msg: SocketMessage<{ lines: string[]; veils: string[]; toneFlags: string[] }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, s0SubmitPayload);
        if (!validated) return;
        msg.payload = validated;
        this.handleS0Submit(socket, msg);
      });

      socket.on('safety:xcard', () => {
        this.handleXCard(socket);
      });

      socket.on('safety:resume', () => {
        this.handleSafetyResume(socket);
      });

      // Cancel active AI narration
      socket.on('gm:cancelNarration', () => {
        const client = this.clients.get(socket.id);
        if (!client) return;
        const sessionId = client.sessionId;

        const activeStream = this.activeStreams.get(sessionId);
        if (activeStream && activeStream.senderId && activeStream.senderId !== client.playerId) {
          socket.emit('session:error', {
            type: 'session:error',
            sessionId, senderId: 'system',
            payload: { error: '无权取消他人的叙述', code: 'FORBIDDEN' },
            timestamp: Date.now(),
          });
          return;
        }

        this.abortStream(sessionId);

        this.io.to(sessionId).emit('gm:narrate:end', {
          type: 'gm:narrate:end',
          sessionId,
          senderId: 'system',
          payload: {
            turnId: `cancelled_${Date.now()}`,
            fullText: '（叙事已取消）',
            choices: [],
          },
          timestamp: Date.now(),
        });

        if (this.sessionStore) {
          this.sessionStore.releaseTurnLock(sessionId).catch(() => {});
        }
      });

      socket.on('player:rest', (msg: SocketMessage<{ restType: string; actions: string[]; projectDescription?: string }>) => {
        const validated = this.validateMsg(socket, msg, playerRestPayload);
        if (!validated) return;
        msg.payload = validated as typeof msg.payload;
        const client = this.clients.get(socket.id);
        const sessionId = client?.sessionId || msg.sessionId;
        const stateManager = this.sessionRegistry.findById(sessionId);

        // Apply fear gain on rest (server-side, deterministic)
        if (stateManager) {
          const restType: 'short' | 'long' = msg.payload.restType === 'long' ? 'long' : 'short';
          const fearGain = gainFearOnRest(restType);
          stateManager.addFearPoints(fearGain);

          // Apply mechanical rest effects
          const character = stateManager.getPlayerCharacter(client!.playerId) || stateManager.getCharacter();
          if (character) {
            const restResult = executeRest(
              restType,
              msg.payload.actions as (ShortRestAction | LongRestAction)[],
              character,
              stateManager.getShortRestsSinceLong(),
            );
            if (restResult.hpRestored > 0) stateManager.updateCharacterHp(restResult.hpRestored);
            if (restResult.stressCleared > 0) stateManager.updateCharacterStress(-restResult.stressCleared);
            if (restResult.armorSlotsCleared > 0) stateManager.adjustCharacterArmorSlots(restResult.armorSlotsCleared);
            if (restResult.hopeGained > 0) stateManager.updateCharacterHope(restResult.hopeGained);
            if (restType === 'long') {
              stateManager.resetShortRests();
            } else {
              stateManager.incrementShortRests();
            }
          }
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

      // Character resource update from CharacterScreen +/- buttons
      socket.on('character:resourceUpdate', (msg: SocketMessage<{ resource: string; delta: number }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, characterResourceUpdatePayload);
        if (!validated) return;
        const client = this.clients.get(socket.id);
        if (!client) return;
        const stateManager = this.sessionRegistry.findById(client.sessionId);
        if (!stateManager) return;
        const { resource, delta } = validated;
        switch (resource) {
          case 'hp': stateManager.updateCharacterHp(delta); break;
          case 'stress': stateManager.updateCharacterStress(delta); break;
          case 'hope': stateManager.updateCharacterHope(delta); break;
          case 'armorSlots': stateManager.adjustCharacterArmorSlots(delta); break;
        }
        this.broadcastState(stateManager.getState());
      });

      // Death move — player chooses action when HP reaches 0
      socket.on('player:deathMove', async (msg: SocketMessage<{ moveType: string; hopeDie?: number; fearDie?: number }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, deathMovePayload);
        if (!validated) return;
        const client = this.clients.get(socket.id);
        if (!client) return;
        const stateManager = this.sessionRegistry.findById(client.sessionId);
        if (!stateManager) return;

        const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
        if (!character) return;

        // Must be in Dying condition to use death move
        const isDying = character.conditions?.some(c => c.condition === 'dying');
        if (!isDying && character.hp > 0) return;

        const { moveType, hopeDie, fearDie } = validated;
        let result;
        switch (moveType) {
          case 'gloriousSacrifice':
            result = gloriousSacrifice();
            break;
          case 'avoidDeath':
            result = avoidDeath(character.level, hopeDie ?? Math.floor(Math.random() * 12) + 1);
            break;
          case 'desperateGamble':
            result = desperateGamble(hopeDie ?? Math.floor(Math.random() * 12) + 1, fearDie ?? Math.floor(Math.random() * 12) + 1);
            break;
          default: return;
        }

        // Apply using the structured method (handles Dying removal, scar, etc.)
        stateManager.applyDeathMoveResult({
          characterDied: result.characterDied,
          hpRestored: result.hpRestored,
          stressCleared: result.stressCleared,
          scarGained: result.scarGained,
        });
        this.broadcastState(stateManager.getState());

        this.handlePlayerAction(socket, {
          type: 'player:action',
          sessionId: msg.sessionId,
          senderId: msg.senderId,
          payload: { action: `死亡行动：${result.narrative}` },
          timestamp: msg.timestamp,
        });
      });

      // Level-up via socket event
      socket.on('campaign:levelUp', (msg: SocketMessage<{ options: string[]; attributeChoices?: [string, string]; experienceChoices?: [string, string]; domainCardChoice?: string }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, levelUpPayload);
        if (!validated) return;
        const client = this.clients.get(socket.id);
        if (!client) return;
        const stateManager = this.sessionRegistry.findById(client.sessionId);
        if (!stateManager) return;

        const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
        if (!character) return;

        const request: LevelUpRequest = {
          characterId: character.id,
          newLevel: character.level + 1,
          options: validated.options as LevelUpOptionType[],
          attributeChoices: validated.attributeChoices as [Attribute, Attribute] | undefined,
          experienceChoices: validated.experienceChoices,
          domainCardChoice: validated.domainCardChoice,
        };

        const result = CharacterLevelUp.levelUp(character, request);
        if (result.success && result.character) {
          stateManager.updatePlayerCharacter(client.playerId, result.character);
          this.broadcastState(stateManager.getState());

          this.io.to(client.sessionId).emit('campaign:levelUpResult', {
            type: 'campaign:levelUpResult',
            sessionId: client.sessionId,
            senderId: 'system',
            payload: { success: true, character: result.character, tierChanged: result.tierChanged },
            timestamp: Date.now(),
          });
        } else {
          socket.emit('campaign:levelUpResult', {
            type: 'campaign:levelUpResult',
            sessionId: client.sessionId,
            senderId: 'system',
            payload: { success: false, errors: result.errors },
            timestamp: Date.now(),
          });
        }
      });

      // Drakkenheim: contamination level change
      socket.on('drakkenheim:contamination', (msg: SocketMessage<{ level: number }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, contaminationPayload);
        if (!validated) return;
        const client = this.clients.get(socket.id);
        if (!client) return;
        const stateManager = this.sessionRegistry.findById(client.sessionId);
        if (!stateManager) return;
        const cs = stateManager.getCampaignState();
        const newLevel = Math.min(6, Math.max(0, cs.contaminationLevel + validated.level));
        stateManager.updateCampaignState({ contaminationLevel: newLevel });
        if (newLevel >= 3 && cs.contaminationLevel < 3) {
          stateManager.addAdventureMessage({
            id: `msg_${Date.now()}_system`,
            role: 'system' as const,
            content: '污染达到临界值，需抽取变异卡',
            timestamp: Date.now(),
          });
        }
        this.broadcastState(stateManager.getState());
      });

      // Drakkenheim: haze effect exposure — narrative only
      socket.on('drakkenheim:hazeEffect', (msg: SocketMessage<{ zone: string }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, hazeEffectPayload);
        if (!validated) return;
        this.handlePlayerAction(socket, {
          type: 'player:action',
          sessionId: msg.sessionId,
          senderId: msg.senderId,
          payload: { action: `暴露在污霭中（区域：${validated.zone}）` },
          timestamp: msg.timestamp,
        });
      });

      // Drakkenheim: delerium crystal found
      socket.on('drakkenheim:deleriumFound', (msg: SocketMessage<{ quantity: number }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, deleriumFoundPayload);
        if (!validated) return;
        const client = this.clients.get(socket.id);
        if (!client) return;
        const stateManager = this.sessionRegistry.findById(client.sessionId);
        if (!stateManager) return;
        const cs = stateManager.getCampaignState();
        stateManager.updateCampaignState({ deleriumCollected: cs.deleriumCollected + validated.quantity });
        // Risk contamination on delerium handling
        if (Math.random() < 0.3) {
          stateManager.updateCampaignState({ contaminationLevel: Math.min(6, cs.contaminationLevel + 1) });
        }
        this.broadcastState(stateManager.getState());
      });

      // Drakkenheim: seal found
      socket.on('drakkenheim:sealFound', (msg: SocketMessage<{ sealId: string }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, sealFoundPayload);
        if (!validated) return;
        const client = this.clients.get(socket.id);
        if (!client) return;
        const stateManager = this.sessionRegistry.findById(client.sessionId);
        if (!stateManager) return;
        const cs = stateManager.getCampaignState();
        if (!cs.sealsFound.includes(validated.sealId)) {
          stateManager.updateCampaignState({ sealsFound: [...cs.sealsFound, validated.sealId] });
        }
        this.broadcastState(stateManager.getState());
      });

      // Swap a domain card between loadout and vault
      socket.on('player:swapDomainCard', (msg: SocketMessage<{ loadoutCardId: string; vaultCardId: string }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, swapDomainCardPayload);
        if (!validated) return;
        const client = this.clients.get(socket.id);
        if (!client) return;
        const stateManager = this.sessionRegistry.findById(client.sessionId);
        if (!stateManager) return;

        const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
        if (!character) return;

        const { loadoutCardId, vaultCardId } = validated;
        const result = swapDomainCard(
          loadoutCardId, vaultCardId,
          character.domainCardConfig.loadout,
          character.domainCardConfig.vault || [],
        );
        if (result) {
          stateManager.updatePlayerCharacter(client.playerId, {
            domainCardConfig: {
              ...character.domainCardConfig,
              loadout: result.newLoadout,
              vault: result.newVault,
            },
          });
          this.broadcastState(stateManager.getState());
        }
      });

      // Recall a domain card from Vault to Loadout (costs Hope)
      socket.on('player:recallDomainCard', (msg: SocketMessage<{ cardId: string }>) => {
        const client = this.clients.get(socket.id);
        if (!client) return;
        const stateManager = this.sessionRegistry.findById(client.sessionId);
        if (!stateManager) return;

        const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
        if (!character) return;

        const { cardId } = msg.payload;
        const vault = character.domainCardConfig.vault || [];
        const card = vault.find(c => c.id === cardId);
        if (!card) {
          socket.emit('error', { message: '卡牌不在宝库中' });
          return;
        }

        // Rules: Chapter 2 "第八步：选择领域卡" — recall cost is paid in stress marks, not hope
        const recallCost = card.recallCost ?? 1;
        if (character.stress + recallCost > character.maxStress) {
          socket.emit('error', { message: `回忆需要${recallCost}压力点空间，当前压力${character.stress}/${character.maxStress}` });
          return;
        }

        if (character.domainCardConfig.loadout.length >= character.domainCardConfig.maxLoadout) {
          socket.emit('error', { message: '配置已满，无法回忆更多卡牌' });
          return;
        }

        // Rules: Chapter 2 — recall cost marks stress, not hope
        const result = recallDomainCard(
          cardId,
          character.domainCardConfig.loadout,
          vault,
          character.maxStress - character.stress, // available stress capacity as "recall budget"
        );
        if (result) {
          stateManager.updateCharacterStress(result.costPaid);
          stateManager.updatePlayerCharacter(client.playerId, {
            domainCardConfig: {
              ...character.domainCardConfig,
              loadout: result.newLoadout,
              vault: result.newVault,
            },
          });
          this.broadcastState(stateManager.getState());
        }
      });

      // Legacy combat:action — routes as plain text narrative with mechanical hooks
      socket.on('combat:action', (msg: SocketMessage<{ actionId: string; targetId?: string }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, combatActionPayload);
        if (!validated) return;
        msg.payload = validated;
        const client = this.clients.get(socket.id);
        const stateManager = client ? this.sessionRegistry.findById(client.sessionId) : undefined;

        // Apply mechanical effects for specific combat actions
        if (stateManager) {
          switch (msg.payload.actionId) {
            case 'defend':
              stateManager.adjustCharacterArmorSlots(1);
              break;
            case 'flee':
              // Flee intent — AI narration determines outcome
              break;
          }
        }

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
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, combatAddEnemyPayload);
        if (!validated) return;
        msg.payload = validated;
        this.handleCombatAddEnemy(socket, msg);
      });

      socket.on('combat:spawnEncounter', (msg: SocketMessage<{ difficulty?: string }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, combatSpawnEncounterPayload);
        if (!validated) return;
        msg.payload = validated;
        this.handleCombatSpawnEncounter(socket, msg.payload.difficulty as EncounterDifficulty);
      });

      socket.on('combat:end', () => {
        this.handleCombatEnd(socket);
      });

      socket.on('combat:reactionDeclare', (msg: SocketMessage<{ reactionType: string; hopeDie?: number; fearDie?: number; armorSlotsToSpend?: number; sourceId?: string }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, reactionDeclarePayload);
        if (!validated) return;
        this.handleReactionDeclare(socket, validated);
      });

      socket.on('gm:fearAction', (msg: SocketMessage<{ actionType: string; enemyId?: string; experienceIndex?: number; cost?: number }>) => {
        const client = this.clients.get(socket.id);
        if (!client) return;
        const sessionId = client.sessionId;
        const stateManager = this.sessionRegistry.findById(sessionId);
        if (!stateManager) return;

        // Only host can spend Fear
        if (!this.requireHost(socket, client)) return;

        const state = stateManager.getState();
        const combat = stateManager.getCombatState();
        const { resolveFearAction, getAvailableFearActions } = require('../rules/systems/fearActions');

        const result = resolveFearAction(
          {
            type: msg.payload.actionType as import('../rules/systems/fearActions').FearActionType,
            cost: msg.payload.cost ?? 1,
            enemyId: msg.payload.enemyId,
            experienceIndex: msg.payload.experienceIndex,
          },
          state.fearPoints,
          combat?.enemies,
        );

        if (result.success) {
          stateManager.spendFearPoints(result.fearSpent);
          this.broadcastState(stateManager.getState());

          // Notify all clients about the Fear action
          this.io.to(sessionId).emit('gm:fearAction', {
            type: 'gm:fearAction',
            sessionId,
            senderId: client.playerId,
            payload: {
              actionType: msg.payload.actionType,
              fearSpent: result.fearSpent,
              remainingFear: result.remainingFear,
              effect: result.effect,
              mechanicalEffect: result.mechanicalEffect,
            },
            timestamp: Date.now(),
          });
        } else {
          socket.emit('gm:fearAction', {
            type: 'gm:fearAction',
            sessionId,
            senderId: 'system',
            payload: { success: false, errors: result.errors },
            timestamp: Date.now(),
          });
        }
      });

      // Enemy auto-turn: rules engine calculates, AI only narrates
      socket.on('combat:enemyTurn', (msg: SocketMessage<{ enemyId?: string }>) => {
        const client = this.clients.get(socket.id);
        if (!client) return;
        if (!this.requireHost(socket, client)) return;

        const stateManager = this.sessionRegistry.findById(client.sessionId);
        if (!stateManager) return;

        const combat = stateManager.getCombatState();
        if (!combat) {
          socket.emit('error', { message: '当前不在战斗中' });
          return;
        }

        const state = stateManager.getState();

        // Process each enemy that hasn't acted this round
        const enemiesToAct = msg.payload?.enemyId
          ? combat.enemies.filter(e => e.id === msg.payload!.enemyId)
          : combat.enemies.filter(e => !e.hasActed && e.currentHp > 0);

        const results: Array<{
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
        }> = [];

        for (const enemy of enemiesToAct) {
          const behaviorCtx = {
            enemy,
            players: state.characters.filter((c: Character) => c.hp > 0),
            allEnemies: combat.enemies,
            fearPoints: state.fearPoints,
            currentFocus: combat.currentFocus,
            round: combat.round,
          };

          const turnResult = selectEnemyActions(behaviorCtx);

          // Apply each action's mechanical effects
          for (const action of turnResult.actions) {
            if (action.kind === 'attack' && action.damageResult) {
              const target = state.characters.find((c: Character) => c.id === action.targetId);
              if (target) {
                const resolution = resolveEnemyAttack(
                  { id: enemy.id, name: enemy.name },
                  target,
                  action.damageResult.total,
                  {
                    attackName: enemy.attacks[action.attackIndex!]?.name ?? '攻击',
                    stressDamage: action.stressDamage,
                    conditionApplied: action.conditionApplied,
                    conditionDuration: action.conditionDuration,
                    fearCost: action.fearCost,
                  },
                );

                // Apply HP loss
                stateManager.updateCharacterHp(-resolution.hpLoss);
                // Apply armor slot consumption
                if (resolution.armorSlotsSpent > 0) {
                  stateManager.consumeCharacterArmorSlots(resolution.armorSlotsSpent);
                }
                // Apply stress damage
                if (resolution.stressDamage > 0) {
                  stateManager.updateCharacterStress(resolution.stressDamage);
                }
                // Apply condition
                if (resolution.conditionApplied) {
                  stateManager.addCharacterCondition({
                    condition: resolution.conditionApplied,
                    duration: 'temporary',
                    source: `${enemy.name}的${resolution.attackName}`,
                    roundsRemaining: resolution.conditionDuration ?? 2,
                  });
                }
              }
            }

            // Spend fear if action costs fear
            if (action.fearCost > 0) {
              stateManager.spendFearPoints(action.fearCost);
            }
          }

          // Mark enemy as having acted
          stateManager.markEnemyActed(enemy.id);

          results.push({
            enemyId: turnResult.enemyId,
            enemyName: turnResult.enemyName,
            actions: turnResult.actions.map(a => ({
              kind: a.kind,
              rawDamage: a.damageResult?.total,
              hpLoss: a.damageResult?.total, // Simplified; actual HP loss computed per-player thresholds
              stressDamage: a.stressDamage,
              conditionApplied: a.conditionApplied,
              fearCost: a.fearCost,
              description: a.description,
            })),
            narrationHint: turnResult.narrationHint,
          });
        }

        // Broadcast the enemy turn results
        this.io.to(client.sessionId).emit('combat:enemyTurn', {
          type: 'combat:enemyTurn',
          sessionId: client.sessionId,
          senderId: 'system',
          payload: { results },
          timestamp: Date.now(),
        });

        // Update state for all clients
        this.broadcastState(stateManager.getState());
      });

      socket.on('action:useFeature', (msg: SocketMessage<{ featureId: string; featureType: string; action: string; targetId?: string; attribute?: string }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, actionUseFeaturePayload);
        if (!validated) return;
        msg.payload = validated;
        this.handleUseFeature(socket, msg);
      });

      socket.on('loot:pickup', (msg: SocketMessage<{ itemIds: string[] }>) => {
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, lootPickupPayload);
        if (!validated) return;
        msg.payload = validated;
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
        const validated = this.validateMsg<typeof msg.payload>(socket, msg, characterUpdatePayload);
        if (!validated) return;
        msg.payload = validated;
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
        const sessionId = this.clients.get(socket.id)?.sessionId;
        if (sessionId) {
          this.activeStreams.delete(sessionId);
          this.pendingReactionContext.delete(sessionId);
        }
        this.clients.delete(socket.id);
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }

  /** Validate a socket message payload against a Zod schema. Emits error and returns null on failure. */
  private validateMsg<T>(socket: Socket, msg: SocketMessage<unknown>, schema: ZodTypeAny): T | null {
    const result = validatePayload<T>(schema, msg.payload);
    if (!result.success) {
      socket.emit('session:error', {
        type: 'session:error',
        sessionId: msg.sessionId || '',
        senderId: 'system',
        payload: { error: `输入验证失败: ${result.error}`, code: 'VALIDATION_ERROR' },
        timestamp: Date.now(),
      });
      return null;
    }
    return result.data;
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
    if (!this.requireHost(socket, client)) return;

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
      const aiGM = this.gmPool?.getOrCreate(sessionId, state.systemId || 'daggerheart');
      if (aiGM) {
        const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
        if (character) {
          const context = {
            sessionId,
            character,
            characters: state.characters.length > 0 ? state.characters : [character],
            activePlayerId: client.playerId,
            activePlayerName: client.name,
            sessionState: state,
            worldLore: aiGM.getWorldLore(),
          };

          aiGM.runSessionZero(context).then(response => {
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
    if (!this.requireHost(socket, client)) return;

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
    if (!this.requireHost(socket, client)) return;

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

    // Update character via StateManager to ensure proper sync (characters[], players[], backward compat)
    stateManager.setCharacter(character);

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

    // Record character switch in AI-visible history
    stateManager.addAdventureMessage({
      id: `msg_${Date.now()}_system`,
      role: 'system' as const,
      content: `${client.name} 切换为角色 ${character.name}（${character.classId}）`,
      timestamp: Date.now(),
    });

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

    // Acquire turn lock — reject action if lock cannot be acquired immediately
    if (this.sessionStore) {
      const lockAcquired = await this.sessionStore.acquireTurnLock(sessionId, 90000);
      if (!lockAcquired) {
        socket.emit('session:error', {
          type: 'session:error',
          sessionId,
          senderId: 'system',
          payload: { error: '当前有其他操作正在进行，请稍后再试' },
          timestamp: Date.now(),
        });
        return false;
      }
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

    const state = stateManager.getState();
    const aiGM = this.gmPool?.getOrCreate(sessionId, state.systemId || 'daggerheart');

    if (aiGM) {
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
        worldLore: aiGM.getWorldLore(),
      };

      const isSessionZero = state.status === 'sessionZero';

      try {
        await this.runNarration(
          socket, client, stateManager, context, playerAction, isSessionZero, undefined, aiGM,
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
    aiGM?: AIGameMaster,
  ): Promise<void> {
    const sessionId = client.sessionId;
    const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
    if (!character) return;
    const turnId = uuidv4();

    const abortController = new AbortController();
    this.activeStreams.set(sessionId, { controller: abortController, senderId: client.playerId });
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
        ? await aiGM!.runSessionZero(aiContext, effectiveAction)
        : await aiGM!.processPlayerActionStream(aiContext, effectiveAction, onToken, undefined, abortController.signal, resolvedOutcome?.narrationHint);

      const rawContent = isSessionZero ? response.message.content : fullText;

      // Extract [STATE] changes from AI response (fallback — kept as safety net)
      const { cleanContent, stateChanges: parsedStateChanges } = extractStateChanges(rawContent);

      // Apply [STATE] changes to StateManager
      if (parsedStateChanges.length > 0) {
        applyStateChanges(stateManager, client.playerId, parsedStateChanges);
      }

      // Extract GM effects via structured channel (narration → JSON extraction)
      let effectsApplied = false;
      let effectsEmpty = false;
      try {
        const gmModel = aiGM!.getConfig().narratorModel;
        const gmEffects = await extractGmEffects(aiGM!.getGateway(), cleanContent, gmModel, actionText);
        if (gmEffects.length === 0 && parsedStateChanges.length === 0) {
          effectsEmpty = true;
        }
        for (const effect of gmEffects) {
          this.applyGmEffect(stateManager, client.playerId, effect);
          effectsApplied = true;
        }
      } catch {
        // Structured extraction failure is non-fatal — [STATE] fallback may have already applied
        effectsEmpty = parsedStateChanges.length === 0;
      }

      // Auto-end combat if all enemies defeated
      const combatAfter = stateManager.getCombatState();
      if (combatAfter && combatAfter.enemies.length === 0) {
        stateManager.endCombat();
        this.io.to(sessionId).emit('combat:end', {
          type: 'combat:end',
          sessionId,
          senderId: 'system',
          payload: { reason: 'allEnemiesDefeated' },
          timestamp: Date.now(),
        });
      }

      // Keyword-based combat fallback: if player input suggests combat but no combat was triggered
      // by GM effects, force start combat with a generic enemy
      if (playerInputSuggestsCombat(actionText) && !stateManager.getCombatState()) {
          const genericEnemy: CombatEnemy = {
            id: `enemy_${uuidv4()}`,
            statBlockId: 'generic',
            name: '敌对者',
            currentHp: 5,
            maxHp: 5,
            currentStress: 0,
            maxStress: 3,
            conditions: [],
            isFocused: false,
            hasActed: false,
            evasion: 10,
            behavior: 'bruiser',
            attacks: [{ name: '攻击', attribute: 'strength', distance: 'melee', damage: { dice: [{ count: 1, sides: 8 }], modifier: 0, type: 'physical' }, targets: 'single' }],
            features: [],
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
          effectsEmpty,
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

        if (currentIndex >= 0 && currentIndex < S0_PHASES.length - 1) {
          const nextPhase = S0_PHASES[currentIndex + 1];
          stateManager.setSessionZeroPhase(nextPhase);
          console.log(`Session Zero advanced to phase: ${nextPhase}`);
        } else if (currentIndex === S0_PHASES.length - 1) {
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

      // Increment combat round after each turn
      if (stateManager.getCombatState()) {
        stateManager.incrementCombatRound();
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
        stressCleared: res.stressCleared,
        canTakeFreeAction: res.canTakeFreeAction,
        success: res.success,
      },
      timestamp: Date.now(),
    });
    // onChange has already broadcast state:update; front-end sees enemy HP / hope / fear changes

    // 2) Feed resolved result to AI for narration only
    const actionText = `${attacker.name} 攻击 ${enemy.name}`;
    const state = stateManager.getState();
    const aiGM = this.gmPool?.getOrCreate(sessionId, state.systemId || 'daggerheart');
    const context = {
      sessionId,
      character: attacker,
      characters: state.characters.length > 0 ? state.characters : [attacker],
      activePlayerId: client.playerId,
      activePlayerName: client.name,
      sessionState: state,
      worldLore: aiGM?.getWorldLore(),
    };

    try {
      await this.runNarration(
        socket, client, stateManager, context, actionText, false,
        { narrationHint: res.narrationHint }, aiGM,
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
        stressCleared: res.stressCleared,
        canTakeFreeAction: res.canTakeFreeAction,
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
    if (res.stressCleared > 0) {
      stateManager.updateCharacterStress(-res.stressCleared);
    }
    stateManager.updatePlayerCharacter(client.playerId, charUpdates);
    this.broadcastState(stateManager.getState());

    // 2) Feed resolved result to AI for narration
    const state = stateManager.getState();
    const aiGM = this.gmPool?.getOrCreate(sessionId, state.systemId || 'daggerheart');
    const context = {
      sessionId,
      character,
      characters: state.characters.length > 0 ? state.characters : [character],
      activePlayerId: client.playerId,
      activePlayerName: client.name,
      sessionState: state,
      worldLore: aiGM?.getWorldLore(),
    };

    try {
      await this.runNarration(
        socket, client, stateManager, context, decl.action, false,
        { narrationHint: res.narrationHint }, aiGM,
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
    const dataProvider = getDataProvider('daggerheart');
    const statBlock = dataProvider.getEnemyById(statBlockId);
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
      behavior: statBlock.behavior || 'bruiser',
      attacks: statBlock.attacks || [],
      features: statBlock.features || [],
      experiences: statBlock.experiences || [],
      fearTraits: statBlock.features
        ?.filter((f: any) => f.type === 'fear')
        ?.map((f: any) => ({ name: f.name, cost: f.cost, description: f.description })) ?? [],
      type: statBlock.type,
      majorThreshold: statBlock.majorThreshold,
      severeThreshold: statBlock.severeThreshold,
      minionDefeatThreshold: statBlock.minionDefeatThreshold,
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

  private handleCombatSpawnEncounter(socket: Socket, difficulty: EncounterDifficulty): void {
    const client = this.clients.get(socket.id);
    if (!client) return;
    if (!this.requireHost(socket, client)) return;

    const stateManager = this.sessionRegistry.findById(client.sessionId);
    if (!stateManager) return;

    const state = stateManager.getState();
    const characters = state.characters?.length ? state.characters : (state.character ? [state.character] : []);
    if (characters.length === 0) {
      socket.emit('error', { message: '没有角色数据，无法生成遭遇' });
      return;
    }

    const avgLevel = characters.reduce((sum, c) => sum + (c.level ?? 1), 0) / characters.length;
    const playerTier = getTierFromLevel(Math.round(avgLevel));
    const playerCount = characters.length;

    const dataProvider = getDataProvider('daggerheart');
    const allEnemies = dataProvider.getEnemies();

    const encounter = spawnEncounter(playerTier, playerCount, allEnemies, difficulty);
    if (encounter.enemies.length === 0) {
      socket.emit('error', { message: '无法生成遭遇：没有合适的敌人' });
      return;
    }

    // Add all enemies to combat
    for (const enemy of encounter.enemies) {
      stateManager.addCombatEnemy(enemy);
    }

    // Send encounter narration prompt to the AI GM for combat intro narration
    if (encounter.narrationPrompt) {
      const sessionId = client.sessionId;
      this.io.to(sessionId).emit('combat:encounterNarration', {
        type: 'combat:encounterNarration',
        sessionId,
        senderId: 'system',
        payload: {
          narrationPrompt: encounter.narrationPrompt,
          enemyCount: encounter.enemies.length,
          totalCost: encounter.totalCost,
          budget: encounter.budget,
        },
        timestamp: Date.now(),
      });
    }

    this.broadcastState(stateManager.getState());
    console.log(`Encounter spawned: ${encounter.enemies.length} enemies (cost ${encounter.totalCost}/${encounter.budget}) in session ${client.sessionId}`);
  }

  private pendingLootBySession: Map<string, LootResult> = new Map();
  private pendingReactionContext: Map<string, import('../rules/systems/reactionSystem').ReactionContext> = new Map();
  private searchCooldownBySession: Map<string, number> = new Map(); // sessionId → last search timestamp

  private handleCombatEnd(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (!client) return;
    if (!this.requireHost(socket, client)) return;

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

  private handleReactionDeclare(
    socket: Socket,
    payload: { reactionType: string; hopeDie?: number; fearDie?: number; armorSlotsToSpend?: number; sourceId?: string },
  ): void {
    const client = this.clients.get(socket.id);
    if (!client) return;
    const stateManager = this.sessionRegistry.findById(client.sessionId);
    if (!stateManager) return;

    const character = stateManager.getPlayerCharacter(client.playerId) || stateManager.getCharacter();
    if (!character) return;

    // Check if the character already used their reaction this round
    const charData = (character as Character & { daggerheartData?: { reactionsUsed: number } }).daggerheartData;
    const reactionsUsed = charData?.reactionsUsed ?? 0;
    if (reactionsUsed >= 1) {
      socket.emit('session:error', {
        type: 'session:error',
        sessionId: client.sessionId,
        senderId: 'system',
        payload: { error: '本回合已使用过反应', code: 'REACTION_USED' },
        timestamp: Date.now(),
      });
      return;
    }

    // Get the pending reaction context (set by the enemy attack handler)
    const pendingCtx = this.pendingReactionContext.get(client.sessionId);
    if (!pendingCtx) {
      socket.emit('session:error', {
        type: 'session:error',
        sessionId: client.sessionId,
        senderId: 'system',
        payload: { error: '没有待处理的反应', code: 'NO_PENDING_REACTION' },
        timestamp: Date.now(),
      });
      return;
    }

    const { resolveReaction, findAvailableReactions } = require('../rules/systems/reactionSystem');

    // Check this reaction type is available
    const available = findAvailableReactions(character, pendingCtx, reactionsUsed);
    const chosen = available.find((r: { type: string }) => r.type === payload.reactionType);
    if (!chosen) {
      socket.emit('session:error', {
        type: 'session:error',
        sessionId: client.sessionId,
        senderId: 'system',
        payload: { error: `无法使用反应: ${payload.reactionType}`, code: 'INVALID_REACTION' },
        timestamp: Date.now(),
      });
      return;
    }

    const result = resolveReaction(character, {
      type: payload.reactionType as import('../rules/systems/reactionSystem').ReactionType,
      hopeDie: payload.hopeDie,
      fearDie: payload.fearDie,
      armorSlotsToSpend: payload.armorSlotsToSpend,
      sourceId: payload.sourceId,
    }, pendingCtx);

    // Apply reaction effects to state
    if (result.reactionUsed) {
      // Mark reaction used this round
      if (charData) {
        charData.reactionsUsed = reactionsUsed + 1;
      }
    }

    if (result.armorSlotsSpent > 0) {
      stateManager.adjustCharacterArmorSlots(-result.armorSlotsSpent);
    }

    if (result.hopeCost > 0) {
      stateManager.updateCharacterHope(-result.hopeCost);
    }

    // Broadcast reaction result
    this.io.to(client.sessionId).emit('combat:reactionResult', {
      type: 'combat:reactionResult',
      sessionId: client.sessionId,
      senderId: 'system',
      payload: {
        reactionType: result.type,
        characterId: character.id,
        success: result.success,
        isCritical: result.isCritical,
        damagePrevented: result.damagePrevented,
        newSeverity: result.newSeverity,
        armorSlotsSpent: result.armorSlotsSpent,
        counterDamage: result.counterDamage,
        counterTargetHpLoss: result.counterTargetHpLoss,
        hopeGain: result.hopeGain,
        hopeCost: result.hopeCost,
        reactionUsed: result.reactionUsed,
        narrationHint: result.narrationHint,
      },
      timestamp: Date.now(),
    });

    // Clear pending reaction
    this.pendingReactionContext.delete(client.sessionId);

    // Broadcast updated state
    this.broadcastState(stateManager.getState());
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
    const aiGM = this.gmPool?.getOrCreate(sessionId, state.systemId || 'daggerheart');
    const context = {
      sessionId,
      character,
      characters: state.characters.length > 0 ? state.characters : [character],
      activePlayerId: client.playerId,
      activePlayerName: client.name,
      sessionState: state,
      worldLore: aiGM?.getWorldLore(),
    };

    try {
      await this.runNarration(
        socket, client, stateManager, context,
        `${character.name}探查了周围环境，寻找有用的物品和线索`,
        false, undefined, aiGM,
      );

      // After narration, check if AI already added items via GmEffect
      // Only supplement with random loot if AI didn't provide any items
      const currentChar = stateManager.getCharacter();
      const currentInventory = currentChar?.inventory ?? [];
      const hadItemAdded = currentInventory.length > character.inventory.length;

      if (!hadItemAdded) {
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

        // Explicit loot notification so player knows what was found
        if (loot.items.length > 0 || loot.gold?.coins) {
          const lootDesc = loot.items.map(i => i.name).join('、');
          const goldDesc = loot.gold?.coins ? `、${loot.gold.coins}金币` : '';
          this.io.to(sessionId).emit('gm:narrate:end', {
            type: 'gm:narrate:end',
            sessionId,
            senderId: 'system',
            payload: {
              turnId: `loot_${Date.now()}`,
              fullText: `你搜索了周围，找到了：${lootDesc}${goldDesc}`,
              choices: [],
            },
            timestamp: Date.now(),
          });
        }
      } // end if (!hadItemAdded)
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
        attribute: attribute as Attribute,
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
          stressCleared: rollRes.stressCleared,
          canTakeFreeAction: rollRes.canTakeFreeAction,
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
      if (rollRes.stressCleared > 0) {
        stateManager.updateCharacterStress(-rollRes.stressCleared);
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
    const aiGM = this.gmPool?.getOrCreate(sessionId, state.systemId || 'daggerheart');
    const context = {
      sessionId,
      character,
      characters: state.characters.length > 0 ? state.characters : [character],
      activePlayerId: client.playerId,
      activePlayerName: client.name,
      sessionState: state,
      worldLore: aiGM?.getWorldLore(),
    };

    try {
      await this.runNarration(
        socket, client, stateManager, context, action, false,
        { narrationHint }, aiGM,
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
    if (!this.requireHost(socket, client)) return;

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

    const state = stateManager.getState();
    const aiGM = this.gmPool?.getOrCreate(sessionId, state.systemId || 'daggerheart');

    if (aiGM) {
      try {
        const context = {
          sessionId,
          character,
          characters: state.characters.length > 0 ? state.characters : [character],
          activePlayerId: client.playerId,
          activePlayerName: client.name,
          sessionState: state,
          worldLore: aiGM.getWorldLore(),
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

        const { fullText } = await aiGM.getGateway().sendStreamRequest(
          {
            model: aiGM.getConfig().narratorModel || aiGM.getConfig().gateway.defaultModel,
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
      case 'addEnemy': {
        const statBlockId = effect.enemyStatBlockId;
        const enemyName = effect.enemyName;
        let enemy: CombatEnemy | null = null;
        if (statBlockId) {
          enemy = this.loadEnemyFromStatBlock(statBlockId, enemyName);
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
            behavior: 'bruiser',
            attacks: [{ name: '攻击', attribute: 'strength', distance: 'melee', damage: { dice: [{ count: 1, sides: 8 }], modifier: 0, type: 'physical' }, targets: 'single' }],
            features: [],
          };
        }
        if (enemy) {
          sm.addCombatEnemy(enemy);
        }
        break;
      }
      case 'startCombat': {
        // Combat starts — enemies are added by individual addEnemy effects
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
      case 'setSceneName': {
        if (effect.sceneName) {
          const scene = sm.getState().currentScene;
          sm.setCurrentScene({ ...scene, name: effect.sceneName });
        }
        break;
      }
    }
  }

  private async handlePlayerChoice(socket: Socket, msg: SocketMessage<{ choiceId: string; choiceText: string }>): Promise<void> {
    const { choiceId, choiceText } = msg.payload;
    this.handlePlayerAction(socket, {
      type: 'player:action',
      sessionId: msg.sessionId,
      senderId: msg.senderId,
      payload: { action: `[选择:${choiceId}] ${choiceText}` },
      timestamp: msg.timestamp,
    });
  }

  private async handleNarrationRequest(socket: Socket): Promise<void> {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) return;

    const state = stateManager.getState();
    const aiGM = this.gmPool?.getOrCreate(sessionId, state.systemId || 'daggerheart');

    if (aiGM) {
      try {
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
          worldLore: aiGM.getWorldLore(),
        };

        const response = await aiGM.narrateScene(context);
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

  // ===== Spotlight Pass =====

  private handleSpotlightPass(socket: Socket, msg: SocketMessage<{ targetPlayerId?: string }>): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) return;

    const spotlight = stateManager.getSpotlightState();
    if (!spotlight) return; // Single-player — no spotlight

    // Only the current holder can pass
    if (spotlight.current !== client.playerId) return;

    const { targetPlayerId } = msg.payload;
    const newSpotlight = this.spotlightManager.pass(spotlight, targetPlayerId);
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
    if (!this.requireHost(socket, client)) return;

    const sessionId = client.sessionId;
    const stateManager = this.sessionRegistry.findById(sessionId);
    if (!stateManager) return;

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

  /** Check if client is the session host (GM). Returns false and emits error if not. */
  private requireHost(socket: Socket, client: ConnectedClient): boolean {
    const hostId = this.sessionRegistry.getHostId(client.sessionId);
    if (hostId && hostId !== client.playerId) {
      socket.emit('session:error', {
        type: 'session:error',
        sessionId: client.sessionId,
        senderId: 'system',
        payload: { error: '只有主持人(GM)才能执行此操作', code: 'NOT_HOST' },
        timestamp: Date.now(),
      });
      return false;
    }
    return true;
  }

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
    const entry = this.activeStreams.get(sessionId);
    if (entry) {
      entry.controller.abort();
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
   * Update the GM pool instance (for hot-reload after config change)
   */
  setGMPool(pool: AIGameMasterPool | undefined): void {
    this.gmPool = pool;
    console.log('[SocketServer] GM pool instance updated');
    // Notify all connected clients about AI config change
    for (const [socketId, client] of this.clients) {
      this.io.to(client.sessionId).emit('ai:configUpdated', {
        type: 'ai:configUpdated',
        sessionId: client.sessionId,
        senderId: 'system',
        payload: { aiConnected: !!pool },
        timestamp: Date.now(),
      });
    }
  }

  close(): void {
    this.io.close();
  }
}
