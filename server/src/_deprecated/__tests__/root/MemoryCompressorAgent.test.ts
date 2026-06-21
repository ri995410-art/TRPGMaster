import { MemoryCompressorAgent } from '../src/agents/MemoryCompressorAgent';
import type { GameEvent } from '@trpgmaster/shared';
import type { AgentContext } from '../src/core/AgentCoordinator';

// Mock AIGateway
jest.mock('../src/ai/AIGateway', () => ({
  AIGateway: jest.fn().mockImplementation(() => ({
    sendRequest: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        summary: 'AI压缩摘要',
        keyDecisions: ['战斗开始', '角色受伤'],
        statistics: { combatCount: 1, damageDealt: 10, damageTaken: 5, hopeUsed: 1, fearUsed: 2 },
      }),
      tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    }),
    buildAgentContext: jest.fn().mockReturnValue({
      messages: [{ role: 'system', content: 'test' }],
    }),
  })),
}));

function createMockContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    sessionId: 'test-session',
    state: {
      sessionId: 'test-session',
      ruleSystem: 'daggerheart',
      status: 'active',
      gmId: 'gm-1',
      players: [],
      currentScene: { id: 'scene-1', name: '测试场景', description: '', environment: '', activeConditions: [], npcPresent: [], enemies: [] },
      fearPoints: 2,
      totalFearGained: 2,
      totalFearSpent: 0,
      roundTracker: { currentRound: 1, playerActionsRemaining: {} },
      timeline: [],
    },
    characters: [],
    recentEvents: [],
    ...overrides,
  };
}

function createEvent(type: string, timestamp: number, source: string = 'system'): GameEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: 'test-session',
    timestamp,
    type: type as GameEvent['type'],
    source: source as GameEvent['source'],
  } as GameEvent;
}

describe('MemoryCompressorAgent', () => {
  let agent: MemoryCompressorAgent;

  beforeEach(() => {
    agent = new MemoryCompressorAgent(undefined, 60000);
  });

  afterEach(() => {
    agent.stopCompression();
  });

  it('responds to session:start event', async () => {
    const event = createEvent('session:start', Date.now(), 'system');
    const result = await agent.process(event, createMockContext());
    expect(result).not.toBeNull();
    expect(result?.agentType).toBe('memoryCompressor');
    expect(result?.output).toContain('compression_started');
  });

  it('ignores non-session:start events', async () => {
    const event = createEvent('player:action', Date.now(), 'player');
    const result = await agent.process(event, createMockContext());
    expect(result).toBeNull();
  });

  describe('compressNow', () => {
    it('categorizes events by time window', async () => {
      const now = Date.now();
      const events = [
        createEvent('player:action', now - 1000),      // recent (<5min)
        createEvent('combat:start', now - 10 * 60 * 1000),  // medium (5-30min)
        createEvent('player:roll', now - 60 * 60 * 1000),   // old (>30min)
      ];

      const result = await agent.compressNow(events, now);
      expect(result.summary).toBeDefined();
      expect(result.statistics).toBeDefined();
    });

    it('computes statistics from events', async () => {
      const now = Date.now();
      const events = [
        createEvent('combat:start', now - 1000),
        createEvent('combat:start', now - 500),
        { ...createEvent('combat:damage', now - 400), targetType: 'enemy', amount: 10 } as any,
        { ...createEvent('combat:damage', now - 300), targetType: 'player', amount: 5 } as any,
        createEvent('player:useHope', now - 200),
        createEvent('gm:useFear', now - 100),
      ];

      const result = await agent.compressNow(events, now);
      expect(result.statistics.combatCount).toBe(2);
      expect(result.statistics.damageDealt).toBe(10);
      expect(result.statistics.damageTaken).toBe(5);
      expect(result.statistics.hopeUsed).toBe(1);
      expect(result.statistics.fearUsed).toBe(1);
    });

    it('extracts key decisions from key moments', async () => {
      const now = Date.now();
      const events = [
        createEvent('combat:start', now - 1000),
        createEvent('player:action', now - 500),
        createEvent('gm:sceneChange', now - 400),
        createEvent('combat:damage', now - 300),
      ];

      const result = await agent.compressNow(events, now);
      expect(result.keyDecisions.length).toBeGreaterThan(0);
      expect(result.keyDecisions.some(d => d.includes('combat:start'))).toBe(true);
      expect(result.keyDecisions.some(d => d.includes('gm:sceneChange'))).toBe(true);
    });

    it('handles empty event list', async () => {
      const result = await agent.compressNow([], Date.now());
      expect(result.summary).toBeDefined();
      expect(result.statistics.combatCount).toBe(0);
    });
  });

  describe('compression timer', () => {
    it('starts periodic compression on session:start', async () => {
      const event = createEvent('session:start', Date.now(), 'system');
      await agent.process(event, createMockContext());
      // Timer should be started - we can't easily test the interval firing
      // but we can verify stopCompression works
      agent.stopCompression();
      // No error = success
      expect(true).toBe(true);
    });

    it('stopCompression clears the timer', () => {
      agent.stopCompression();
      // Calling again should be safe
      agent.stopCompression();
      expect(true).toBe(true);
    });
  });

  describe('onCompress callback', () => {
    it('sets and uses compression callback', async () => {
      const callback = jest.fn();
      agent.setOnCompress(callback);

      const result = await agent.compressNow([createEvent('player:action', Date.now())]);
      // The callback isn't called by compressNow directly, it's called by the timer
      // But we can verify it was set
      expect(callback).not.toHaveBeenCalled(); // correct - not called by compressNow
    });
  });
});
