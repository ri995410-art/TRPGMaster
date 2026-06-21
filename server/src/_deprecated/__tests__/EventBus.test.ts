import { EventBus } from '../core/EventBus';
import type { GameEvent, GameEventType, EventSource } from '@trpgmaster/shared';

function createEvent(type: GameEventType, source: GameEvent['source'] = 'system'): GameEvent {
  return {
    id: `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sessionId: 'test_session',
    timestamp: Date.now(),
    type,
    source,
  };
}

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('subscribe and publish', () => {
    it('calls handler when event is published', async () => {
      const handler = jest.fn();
      eventBus.subscribe('player:action', handler);

      const event = createEvent('player:action');
      await eventBus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('does not call handler for different event type', async () => {
      const handler = jest.fn();
      eventBus.subscribe('player:action', handler);

      await eventBus.publish(createEvent('combat:start'));

      expect(handler).not.toHaveBeenCalled();
    });

    it('supports multiple subscribers for same event type', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.subscribe('player:action', handler1);
      eventBus.subscribe('player:action', handler2);

      const event = createEvent('player:action');
      await eventBus.publish(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it('supports subscribing to multiple event types', () => {
      const handler = jest.fn();
      const ids = eventBus.subscribeMultiple(
        ['player:action', 'combat:start', 'gm:narrate'],
        handler,
      );

      expect(ids).toHaveLength(3);
    });
  });

  describe('unsubscribe', () => {
    it('removes handler after unsubscribing', async () => {
      const handler = jest.fn();
      const id = eventBus.subscribe('player:action', handler);

      eventBus.unsubscribe(id);
      await eventBus.publish(createEvent('player:action'));

      expect(handler).not.toHaveBeenCalled();
    });

    it('handles unsubscribing non-existent id gracefully', () => {
      eventBus.unsubscribe('nonexistent_id');
      // Should not throw
    });
  });

  describe('middleware', () => {
    it('transforms events through middleware chain', async () => {
      const handler = jest.fn();
      eventBus.subscribe('player:action', handler);

      eventBus.addMiddleware((event: GameEvent | null) => {
        if (!event) return null;
        return { ...event, source: 'system' as EventSource };
      });

      await eventBus.publish(createEvent('player:action', 'player'));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'system' }),
      );
    });

    it('blocks event when middleware returns null', async () => {
      const handler = jest.fn();
      eventBus.subscribe('player:action', handler);

      eventBus.addMiddleware((_event: GameEvent | null) => null);

      await eventBus.publish(createEvent('player:action'));

      expect(handler).not.toHaveBeenCalled();
    });

    it('runs multiple middleware in order', async () => {
      const handler = jest.fn();
      eventBus.subscribe('player:action', handler);

      eventBus.addMiddleware((event: GameEvent | null) => {
        if (!event) return null;
        return { ...event, source: 'agent' as EventSource };
      });
      eventBus.addMiddleware((event: GameEvent | null) => {
        if (!event) return null;
        return { ...event, type: event.type as GameEventType };
      });

      await eventBus.publish(createEvent('player:action', 'player'));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'agent' }),
      );
    });
  });

  describe('event log', () => {
    it('logs published events', async () => {
      const event = createEvent('player:action');
      await eventBus.publish(event);

      const log = eventBus.getEventLog();
      expect(log).toHaveLength(1);
      expect(log[0]).toEqual(event);
    });

    it('limits log size to maxLogSize', async () => {
      const smallBus = new EventBus(5);

      for (let i = 0; i < 10; i++) {
        await smallBus.publish(createEvent('player:action'));
      }

      const log = smallBus.getEventLog();
      expect(log).toHaveLength(5);
    });

    it('filters log by event type', async () => {
      await eventBus.publish(createEvent('player:action'));
      await eventBus.publish(createEvent('combat:start'));
      await eventBus.publish(createEvent('player:action'));

      const actionLog = eventBus.getEventLog('player:action');
      expect(actionLog).toHaveLength(2);

      const combatLog = eventBus.getEventLog('combat:start');
      expect(combatLog).toHaveLength(1);
    });

    it('returns events since given timestamp', async () => {
      const before = Date.now();
      await eventBus.publish(createEvent('player:action'));

      const sinceLog = eventBus.getEventLogSince(before);
      expect(sinceLog.length).toBeGreaterThanOrEqual(1);
    });

    it('clears log', async () => {
      await eventBus.publish(createEvent('player:action'));
      eventBus.clearLog();

      expect(eventBus.getEventLog()).toHaveLength(0);
    });
  });

  describe('wildcard listener', () => {
    it('onAny receives all events', async () => {
      const wildcardHandler = jest.fn();
      eventBus.onAny(wildcardHandler);

      await eventBus.publish(createEvent('player:action'));
      await eventBus.publish(createEvent('combat:start'));

      expect(wildcardHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('subscriber count', () => {
    it('returns correct count for specific event type', () => {
      eventBus.subscribe('player:action', jest.fn());
      eventBus.subscribe('player:action', jest.fn());
      eventBus.subscribe('combat:start', jest.fn());

      expect(eventBus.getSubscriberCount('player:action')).toBe(2);
      expect(eventBus.getSubscriberCount('combat:start')).toBe(1);
    });

    it('returns total count when no event type specified', () => {
      eventBus.subscribe('player:action', jest.fn());
      eventBus.subscribe('combat:start', jest.fn());

      expect(eventBus.getSubscriberCount()).toBe(2);
    });
  });

  describe('async handlers', () => {
    it('supports async handlers', async () => {
      const results: number[] = [];
      const asyncHandler = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(1);
      });

      eventBus.subscribe('player:action', asyncHandler);
      await eventBus.publish(createEvent('player:action'));

      expect(asyncHandler).toHaveBeenCalled();
      expect(results).toEqual([1]);
    });
  });

  describe('event log limit', () => {
    it('respects maxLogSize from constructor', async () => {
      const smallBus = new EventBus(3);
      for (let i = 0; i < 5; i++) {
        await smallBus.publish(createEvent('player:action'));
      }
      expect(smallBus.getEventLog()).toHaveLength(3);
    });
  });
});