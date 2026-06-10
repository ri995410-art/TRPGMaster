import { v4 as uuidv4 } from 'uuid';
import { EventBus } from './EventBus';
import { StateManager } from './StateManager';
import { AgentCoordinator } from './AgentCoordinator';
import { InputProcessor, IntentParser, VoiceProcessor, VisionProcessor } from '../input';
import type { AgentAIConfig } from '../ai/AgentAIConfig';
import type {
  GameEvent,
  GameEventType,
  SessionState,
  PlayerState,
  Character,
  InputTextPayload,
  InputVoicePayload,
  InputVisionPayload,
  ParsedIntent,
  AgentType,
} from '@trpgmaster/shared';

type AgentOutputHandler = (agentType: AgentType, output: string) => void;

export class SessionOrchestrator {
  private eventBus: EventBus;
  private stateManager: StateManager;
  private agentCoordinator: AgentCoordinator;
  private inputProcessor: InputProcessor;
  private sessionId: string;
  private agentOutputHandler: AgentOutputHandler | null = null;

  constructor(ruleSystem: SessionState['ruleSystem'] = 'daggerheart', aiGateway?: unknown, agentAIConfig?: AgentAIConfig) {
    this.sessionId = uuidv4();
    this.eventBus = new EventBus();
    this.stateManager = new StateManager(this.sessionId, 'gm', ruleSystem);
    this.agentCoordinator = new AgentCoordinator(this.eventBus, this.stateManager);

    const intentParser = new IntentParser(aiGateway as any, agentAIConfig);
    const voiceProcessor = new VoiceProcessor(agentAIConfig?.getSTTConfig());
    const visionProcessor = new VisionProcessor();
    this.inputProcessor = new InputProcessor(
      this.eventBus,
      intentParser,
      voiceProcessor,
      visionProcessor,
      this.sessionId,
    );

    this.setupEventHandlers();
    this.setupAgentOutputForwarding();
  }

  private setupEventHandlers(): void {
    this.eventBus.subscribe('player:roll', (event) => {
      const rollEvent = event as GameEvent & {
        result: string;
        characterId: string;
      };

      if (rollEvent.result === 'criticalSuccess' || rollEvent.result === 'hopeSuccess' || rollEvent.result === 'hopeFailure') {
        this.stateManager.updateCharacterHope(rollEvent.characterId, 1);
      }
      if (rollEvent.result === 'fearSuccess' || rollEvent.result === 'fearFailure') {
        this.stateManager.addFearPoints(1);
      }
      if (rollEvent.result === 'criticalSuccess') {
        this.stateManager.updateCharacterStress(rollEvent.characterId, -1);
      }
    });

    this.eventBus.subscribe('combat:damage', (event) => {
      const dmgEvent = event as GameEvent & {
        targetId: string;
        targetType: string;
        hpChange: number;
        armorSlotUsed: boolean;
      };

      if (dmgEvent.targetType === 'player') {
        if (dmgEvent.armorSlotUsed) {
          this.stateManager.updateCharacterArmorSlots(dmgEvent.targetId, true);
        }
        this.stateManager.updateCharacterHp(dmgEvent.targetId, -dmgEvent.hpChange);
      } else if (dmgEvent.targetType === 'enemy') {
        this.stateManager.updateCombatEnemyHp(dmgEvent.targetId, -dmgEvent.hpChange);
      }
    });

    this.eventBus.subscribe('combat:heal', (event) => {
      const healEvent = event as GameEvent & {
        targetId: string;
        amount: number;
        resource: 'hp' | 'stress' | 'armor';
      };

      if (healEvent.resource === 'hp') {
        this.stateManager.updateCharacterHp(healEvent.targetId, healEvent.amount);
      } else if (healEvent.resource === 'stress') {
        this.stateManager.updateCharacterStress(healEvent.targetId, -healEvent.amount);
      } else if (healEvent.resource === 'armor') {
        this.stateManager.updateCharacterArmorSlots(healEvent.targetId, false);
      }
    });

    this.eventBus.subscribe('gm:useFear', (event) => {
      const fearEvent = event as GameEvent & { amount: number };
      this.stateManager.spendFearPoints(fearEvent.amount);
    });

    this.eventBus.subscribe('player:rest', (event) => {
      const restEvent = event as GameEvent & { restType: 'short' | 'long'; playerCount: number };
      if (restEvent.restType === 'short') {
        this.stateManager.addFearPoints(Math.floor(Math.random() * 4) + 1);
      } else {
        this.stateManager.addFearPoints(restEvent.playerCount + Math.floor(Math.random() * 4) + 1);
      }
    });
  }

  private setupAgentOutputForwarding(): void {
    this.agentCoordinator.onAgentOutput((response, _event) => {
      if (this.agentOutputHandler) {
        this.agentOutputHandler(response.agentType, response.output);
      }
    });
  }

  setAgentOutputHandler(handler: AgentOutputHandler): void {
    this.agentOutputHandler = handler;
  }

  // ===== Public API =====

  getSessionId(): string {
    return this.sessionId;
  }

  getState(): SessionState {
    return this.stateManager.getState();
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }

  getStateManager(): StateManager {
    return this.stateManager;
  }

  getAgentCoordinator(): AgentCoordinator {
    return this.agentCoordinator;
  }

  // ===== Session Lifecycle =====

  startSession(): void {
    // First change state and enable agents, THEN publish event
    // This ensures handlers receiving 'session:start' see a valid session state
    this.stateManager.startSession();
    this.agentCoordinator.enableAll();
    const event = this.createEvent('session:start', 'system');
    this.eventBus.publish(event);
  }

  pauseSession(): void {
    this.stateManager.pauseSession();
  }

  resumeSession(): void {
    this.stateManager.resumeSession();
  }

  endSession(): void {
    // Stop state and clean up BEFORE publishing event, consistent with startSession fix
    this.stateManager.endSession();
    this.agentCoordinator.getEnabledAgents().forEach(agentType => {
      this.agentCoordinator.disableAgent(agentType);
    });
    this.agentCoordinator.clearOutputCache();
    const event = this.createEvent('session:end', 'system');
    this.eventBus.publish(event);
  }

  // ===== Player Management =====

  addPlayer(player: PlayerState, character: Character): void {
    this.stateManager.addPlayer(player);
    this.stateManager.setCharacter(character);
  }

  removePlayer(playerId: string): void {
    this.stateManager.removePlayer(playerId);
  }

  // ===== Event Publishing =====

  publishEvent(type: GameEventType, source: GameEvent['source'], data: Record<string, unknown> = {}): void {
    const event = this.createEvent(type, source, data);
    this.eventBus.publish(event);
  }

  // ===== Input Processing =====

  async processTextInput(payload: InputTextPayload): Promise<{ parsedIntent: ParsedIntent; generatedEventTypes: GameEventType[] }> {
    const state = this.stateManager.getState();
    const context = {
      ruleSystem: state.ruleSystem,
      currentScene: state.currentScene.name,
      recentEvents: this.eventBus.getEventLog().slice(-5).map(e => e.type),
    };

    const result = await this.inputProcessor.processTextInput(payload, context);

    const generatedEventTypes = result.generatedEvents.map(e => e.type);

    if (this.agentOutputHandler && result.parsedIntent.intentType !== 'command') {
      this.agentOutputHandler('intentParser', JSON.stringify({
        intentType: result.parsedIntent.intentType,
        confidence: result.parsedIntent.confidence,
        rawInput: result.parsedIntent.rawInput,
      }));
    }

    return {
      parsedIntent: result.parsedIntent,
      generatedEventTypes,
    };
  }

  async processVoiceInput(payload: InputVoicePayload): Promise<{ parsedIntent: ParsedIntent; generatedEventTypes: GameEventType[] }> {
    const state = this.stateManager.getState();
    const context = {
      ruleSystem: state.ruleSystem,
      currentScene: state.currentScene.name,
    };

    const result = await this.inputProcessor.processVoiceInput(payload, context);
    const generatedEventTypes = result.generatedEvents.map(e => e.type);

    return {
      parsedIntent: result.parsedIntent,
      generatedEventTypes,
    };
  }

  async processVisionInput(payload: InputVisionPayload): Promise<{ parsedIntent: ParsedIntent; generatedEventTypes: GameEventType[] }> {
    const result = await this.inputProcessor.processVisionInput(payload);
    const generatedEventTypes = result.generatedEvents.map(e => e.type);

    return {
      parsedIntent: result.parsedIntent,
      generatedEventTypes,
    };
  }

  private createEvent(type: GameEventType, source: GameEvent['source'], data: Record<string, unknown> = {}): GameEvent {
    return {
      id: uuidv4(),
      sessionId: this.sessionId,
      timestamp: Date.now(),
      type,
      source,
      ...data,
    } as GameEvent;
  }

  // ===== Snapshot for Sync =====

  getSnapshot(): Record<string, unknown> {
    return this.stateManager.getSnapshot();
  }
}
