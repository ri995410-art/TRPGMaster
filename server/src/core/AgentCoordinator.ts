import type {
  GameEvent,
  GameEventType,
  AgentType,
  SessionState,
} from '@trpgmaster/shared';
import { EventBus } from './EventBus';
import { StateManager } from './StateManager';
import { AGENT_SUBSCRIPTIONS, EVENT_PRIORITY } from '@trpgmaster/shared';

interface AgentHandler {
  agentType: AgentType;
  handler: (event: GameEvent, context: AgentContext) => Promise<AgentResponse | null>;
}

export interface AgentContext {
  sessionId: string;
  state: SessionState;
  characters: ReturnType<StateManager['getAllCharacters']>;
  recentEvents: GameEvent[];
}

export interface AgentResponse {
  agentType: AgentType;
  output: string;
  events?: { type: GameEventType; payload: Record<string, unknown>; priority: 'low' | 'normal' | 'high' | 'critical' }[];
}

type AgentOutputListener = (response: AgentResponse, event: GameEvent) => void;

export class AgentCoordinator {
  private eventBus: EventBus;
  private stateManager: StateManager;
  private agents: Map<AgentType, AgentHandler>;
  private processingQueue: Map<string, Promise<void>>;
  private enabled: Set<AgentType>;
  private outputCache: Map<string, AgentResponse>;
  private outputListeners: Set<AgentOutputListener>;

  constructor(eventBus: EventBus, stateManager: StateManager) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.agents = new Map();
    this.processingQueue = new Map();
    this.enabled = new Set();
    this.outputCache = new Map();
    this.outputListeners = new Set();

    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    this.eventBus.addMiddleware((event) => {
      this.stateManager.addTimelineEntry({
        id: event.id,
        timestamp: event.timestamp,
        eventType: event.type,
        summary: this.summarizeEvent(event),
        isKeyMoment: this.isKeyMoment(event),
        data: event as unknown as Record<string, unknown>,
      });
      return event;
    });
  }

  registerAgent(agentType: AgentType, handler: AgentHandler['handler']): void {
    this.agents.set(agentType, { agentType, handler });

    const eventTypes = AGENT_SUBSCRIPTIONS[agentType];
    if (eventTypes) {
      this.eventBus.subscribeMultiple(eventTypes, (event) => {
        if (!this.enabled.has(agentType)) return;
        this.enqueueProcessing(agentType, event);
      });
    }
  }

  enableAgent(agentType: AgentType): void {
    this.enabled.add(agentType);
  }

  disableAgent(agentType: AgentType): void {
    this.enabled.delete(agentType);
  }

  enableAll(): void {
    for (const agentType of this.agents.keys()) {
      this.enabled.add(agentType);
    }
  }

  onAgentOutput(listener: AgentOutputListener): () => void {
    this.outputListeners.add(listener);
    return () => { this.outputListeners.delete(listener); };
  }

  private async enqueueProcessing(agentType: AgentType, event: GameEvent): Promise<void> {
    const cacheKey = `${event.id}:${agentType}`;

    if (this.outputCache.has(cacheKey)) return;

    if (this.processingQueue.has(cacheKey)) return;

    const promise = this.processEvent(agentType, event)
      .finally(() => { this.processingQueue.delete(cacheKey); });

    this.processingQueue.set(cacheKey, promise);
    await promise;
  }

  private async processEvent(agentType: AgentType, event: GameEvent): Promise<void> {
    const agent = this.agents.get(agentType);
    if (!agent) return;

    const cacheKey = `${event.id}:${agentType}`;

    const context: AgentContext = {
      sessionId: this.stateManager.getState().sessionId,
      state: this.stateManager.getState(),
      characters: this.stateManager.getAllCharacters(),
      recentEvents: this.eventBus.getEventLogSince(event.timestamp - 60000),
    };

    try {
      const response = await agent.handler(event, context);
      if (!response) return;

      this.outputCache.set(cacheKey, response);

      // Evict oldest entries if cache exceeds 200 items
      if (this.outputCache.size > 200) {
        const keys = Array.from(this.outputCache.keys());
        for (let i = 0; i < keys.length - 200; i++) {
          this.outputCache.delete(keys[i]);
        }
      }

      const outputEvent: GameEvent = {
        id: `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        sessionId: context.sessionId,
        timestamp: Date.now(),
        type: 'agent:output',
        source: 'agent',
        agentType: response.agentType,
        output: response.output,
      } as GameEvent;

      await this.eventBus.publish(outputEvent);

      for (const listener of this.outputListeners) {
        try {
          listener(response, event);
        } catch {
          // Listener errors should not break agent processing
        }
      }

      if (response.events) {
        for (const genEvent of response.events) {
          const newEvent: GameEvent = {
            id: `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            sessionId: context.sessionId,
            timestamp: Date.now(),
            type: genEvent.type,
            source: 'agent',
            ...genEvent.payload,
          } as GameEvent;

          await this.eventBus.publish(newEvent);
        }
      }
    } catch (error) {
      console.error(`Agent ${agentType} error processing event ${event.type}:`, error);
    }
  }

  private summarizeEvent(event: GameEvent): string {
    return `[${event.type}] from ${event.source}`;
  }

  private isKeyMoment(event: GameEvent): boolean {
    const keyTypes: GameEventType[] = [
      'combat:start',
      'combat:end',
      'player:deathMove',
      'gm:sceneChange',
      'faction:relationChange',
      'campaign:corruptionChange',
      'campaign:milestone',
    ];
    return keyTypes.includes(event.type);
  }

  getEnabledAgents(): AgentType[] {
    return Array.from(this.enabled);
  }

  getProcessingCount(): number {
    return this.processingQueue.size;
  }

  getRecentEventsForAgent(agentType: AgentType, limit = 50): GameEvent[] {
    const subscribedTypes = AGENT_SUBSCRIPTIONS[agentType] || [];
    const allEvents = this.eventBus.getEventLog(undefined, 1000);
    return allEvents
      .filter(e => subscribedTypes.includes(e.type) || e.type === 'agent:output')
      .slice(-limit);
  }

  clearOutputCache(): void {
    this.outputCache.clear();
  }
}
