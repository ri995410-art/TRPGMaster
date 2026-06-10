import { EventEmitter } from 'events';
import type { GameEvent, GameEventType } from '@trpgmaster/shared';

type EventHandler = (event: GameEvent) => void | Promise<void>;

interface Subscription {
  id: string;
  eventType: GameEventType;
  handler: EventHandler;
}

export class EventBus {
  private emitter: EventEmitter;
  private subscriptions: Map<string, Subscription>;
  private eventLog: GameEvent[];
  private maxLogSize: number;
  private middleware: ((event: GameEvent) => GameEvent | null)[];

  constructor(maxLogSize = 10000) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100); // many agents may subscribe
    this.subscriptions = new Map();
    this.eventLog = [];
    this.maxLogSize = maxLogSize;
    this.middleware = [];
  }

  addMiddleware(fn: (event: GameEvent) => GameEvent | null): void {
    this.middleware.push(fn);
  }

  subscribe(eventType: GameEventType, handler: EventHandler): string {
    const id = `${eventType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.subscriptions.set(id, { id, eventType, handler });

    this.emitter.on(eventType, handler);
    return id;
  }

  subscribeMultiple(eventTypes: GameEventType[], handler: EventHandler): string[] {
    return eventTypes.map(type => this.subscribe(type, handler));
  }

  unsubscribe(subscriptionId: string): void {
    const sub = this.subscriptions.get(subscriptionId);
    if (sub) {
      this.emitter.off(sub.eventType, sub.handler);
      this.subscriptions.delete(subscriptionId);
    }
  }

  async publish(event: GameEvent): Promise<void> {
    // Run through middleware chain
    let processedEvent: GameEvent | null = event;
    for (const mw of this.middleware) {
      processedEvent = mw(processedEvent);
      if (!processedEvent) {
        console.warn(`[EventBus] Middleware suppressed event of type "${event.type}" (id: ${event.id})`);
        return; // middleware blocked the event
      }
    }

    // Log the event
    this.eventLog.push(processedEvent);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }

    // Collect all listener results (including async)
    const listeners = this.emitter.listeners(processedEvent.type);
    const wildcardListeners = this.emitter.listeners('*');

    // Execute all handlers and await any promises
    const results: (void | Promise<void>)[] = [];
    for (const listener of listeners) {
      try {
        results.push(listener(processedEvent));
      } catch {
        // Sync handler errors are ignored
      }
    }
    for (const listener of wildcardListeners) {
      try {
        results.push(listener(processedEvent));
      } catch {
        // Sync handler errors are ignored
      }
    }

    // Await any async handlers
    await Promise.all(results.filter(r => r instanceof Promise));
  }

  onAny(handler: (event: GameEvent) => void): void {
    this.emitter.on('*', handler);
  }

  getEventLog(eventType?: GameEventType, limit = 100): GameEvent[] {
    const events = eventType
      ? this.eventLog.filter(e => e.type === eventType)
      : this.eventLog;
    return events.slice(-limit);
  }

  getEventLogSince(timestamp: number): GameEvent[] {
    return this.eventLog.filter(e => e.timestamp >= timestamp);
  }

  clearLog(): void {
    this.eventLog = [];
  }

  getSubscriberCount(eventType?: GameEventType): number {
    if (eventType) {
      return Array.from(this.subscriptions.values())
        .filter(s => s.eventType === eventType).length;
    }
    return this.subscriptions.size;
  }
}
