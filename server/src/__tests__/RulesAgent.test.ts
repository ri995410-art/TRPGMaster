import { RulesAgent } from '../agents/RulesAgent';
import type { GameEvent, SessionState } from '@trpgmaster/shared';
import type { AgentContext } from '../core/AgentCoordinator';

function createEvent(
  type: GameEvent['type'],
  overrides: Record<string, unknown> = {},
): GameEvent {
  return {
    id: 'test_event',
    sessionId: 'test_session',
    timestamp: Date.now(),
    type,
    source: 'player',
    ...overrides,
  } as GameEvent;
}

function createMockContext(): AgentContext {
  return {
    sessionId: 'test_session',
    state: {
      sessionId: 'test_session',
      ruleSystem: 'daggerheart',
      status: 'active',
      gmId: 'gm_1',
      players: [],
      currentScene: {
        id: 'scene_1',
        name: '测试场景',
        description: '这是一个测试场景',
        environment: '',
        activeConditions: [],
        npcPresent: [],
        enemies: [],
      },
      fearPoints: 0,
      totalFearGained: 0,
      totalFearSpent: 0,
      roundTracker: {
        currentRound: 1,
        playerActionsRemaining: {},
      },
      timeline: [],
    } as SessionState,
    characters: [],
    recentEvents: [],
  };
}

describe('RulesAgent', () => {
  let agent: RulesAgent;

  beforeEach(() => {
    agent = new RulesAgent();
  });

  describe('agent type', () => {
    it('has correct agent type', () => {
      expect(agent.agentType).toBe('rules');
    });
  });

  describe('player:action handling', () => {
    it('suggests agility for movement actions', async () => {
      const event = createEvent('player:action', {
        action: '角色在废墟中冲刺穿过走廊',
        characterId: 'c1',
        playerId: 'p1',
      });

      const context = createMockContext();
      const response = await agent.process(event, context);

      expect(response).not.toBeNull();
      const output = JSON.parse(response!.output);
      expect(output.suggestedAttribute).toBe('agility');
    });

    it('suggests strength for physical actions', async () => {
      const event = createEvent('player:action', {
        action: '角色用力砸碎一扇木门',
        characterId: 'c1',
        playerId: 'p1',
      });

      const context = createMockContext();
      const response = await agent.process(event, context);

      const output = JSON.parse(response!.output);
      expect(output.suggestedAttribute).toBe('strength');
    });

    it('suggests finesse for stealth actions', async () => {
      const event = createEvent('player:action', {
        action: '角色潜行穿过守卫',
        characterId: 'c1',
        playerId: 'p1',
      });

      const context = createMockContext();
      const response = await agent.process(event, context);

      const output = JSON.parse(response!.output);
      expect(output.suggestedAttribute).toBe('finesse');
    });

    it('suggests presence for social actions', async () => {
      const event = createEvent('player:action', {
        action: '角色说服城门守卫让他们通过',
        characterId: 'c1',
        playerId: 'p1',
      });

      const context = createMockContext();
      const response = await agent.process(event, context);

      const output = JSON.parse(response!.output);
      expect(output.suggestedAttribute).toBe('presence');
    });

    it('suggests knowledge for intellectual actions', async () => {
      const event = createEvent('player:action', {
        action: '角色回忆关于德拉肯海姆的历史知识',
        characterId: 'c1',
        playerId: 'p1',
      });

      const context = createMockContext();
      const response = await agent.process(event, context);

      const output = JSON.parse(response!.output);
      expect(output.suggestedAttribute).toBe('knowledge');
    });

    it('uses GM-set difficulty when provided', async () => {
      const event = createEvent('player:action', {
        action: '角色攻击敌人',
        characterId: 'c1',
        playerId: 'p1',
        attribute: 'strength',
        difficulty: 18,
      });

      const context = createMockContext();
      const response = await agent.process(event, context);

      const output = JSON.parse(response!.output);
      expect(output.ruling).toBe('gm_set');
      expect(output.attribute).toBe('strength');
      expect(output.difficulty).toBe(18);
    });
  });

  describe('player:roll handling', () => {
    it('correctly identifies critical success (doubles)', async () => {
      const event = createEvent('player:roll', {
        hopeDie: 7,
        fearDie: 7,
        modifier: 0,
        difficulty: 15,
        characterId: 'c1',
      });

      const context = createMockContext();
      const response = await agent.process(event, context);

      const output = JSON.parse(response!.output);
      expect(output.result).toBe('criticalSuccess');
      expect(output.success).toBe(true);
      expect(output.total).toBe(14);
    });

    it('correctly identifies hope success', async () => {
      const event = createEvent('player:roll', {
        hopeDie: 10,
        fearDie: 5,
        modifier: 2,
        difficulty: 15,
        characterId: 'c1',
      });

      const context = createMockContext();
      const response = await agent.process(event, context);

      const output = JSON.parse(response!.output);
      expect(output.result).toBe('hopeSuccess');
      expect(output.success).toBe(true);
      expect(output.total).toBe(17);
    });

    it('correctly identifies fear success', async () => {
      const event = createEvent('player:roll', {
        hopeDie: 3,
        fearDie: 12,
        modifier: 2,
        difficulty: 15,
        characterId: 'c1',
      });

      const context = createMockContext();
      const response = await agent.process(event, context);

      const output = JSON.parse(response!.output);
      expect(output.result).toBe('fearSuccess');
      expect(output.success).toBe(true);
      expect(output.total).toBe(17);
    });

    it('correctly identifies hope failure', async () => {
      const event = createEvent('player:roll', {
        hopeDie: 8,
        fearDie: 3,
        modifier: 0,
        difficulty: 15,
        characterId: 'c1',
      });

      const context = createMockContext();
      const response = await agent.process(event, context);

      const output = JSON.parse(response!.output);
      expect(output.result).toBe('hopeFailure');
      expect(output.success).toBe(false);
      expect(output.total).toBe(11);
    });

    it('correctly identifies fear failure', async () => {
      const event = createEvent('player:roll', {
        hopeDie: 2,
        fearDie: 9,
        modifier: 0,
        difficulty: 15,
        characterId: 'c1',
      });

      const context = createMockContext();
      const response = await agent.process(event, context);

      const output = JSON.parse(response!.output);
      expect(output.result).toBe('fearFailure');
      expect(output.success).toBe(false);
      expect(output.total).toBe(11);
    });

    it('includes modifier in total calculation', async () => {
      const event = createEvent('player:roll', {
        hopeDie: 5,
        fearDie: 10,
        modifier: 3,
        difficulty: 15,
        characterId: 'c1',
      });

      const context = createMockContext();
      const response = await agent.process(event, context);

      const output = JSON.parse(response!.output);
      expect(output.total).toBe(18); // 5 + 10 + 3
      expect(output.result).toBe('fearSuccess');
    });
  });

  describe('combat:attack handling', () => {
    it('calculates damage severity for player target', async () => {
      const event = createEvent('combat:attack', {
        attackerId: 'enemy_1',
        attackerType: 'enemy',
        targetId: 'c1',
        targetType: 'player',
        hit: true,
        damage: 15,
      });

      const context = createMockContext();
      const char = {
        id: 'c1',
        name: '战士',
        majorThreshold: 13,
        severeThreshold: 26,
        hp: 7, maxHp: 7,
        stress: 0, maxStress: 7,
        hope: 2, maxHope: 6,
        armorSlots: 3, maxArmorSlots: 3,
      } as any;
      context.characters = [char];

      const response = await agent.process(event, context);

      const output = JSON.parse(response!.output);
      expect(output.ruling).toBe('damage_calculated');
      expect(output.severity).toBe('major'); // 15 >= 13 but < 26
      expect(output.hpChange).toBe(2);
    });

    it('returns miss response when attack misses', async () => {
      const event = createEvent('combat:attack', {
        attackerId: 'c1',
        attackerType: 'player',
        targetId: 'enemy_1',
        targetType: 'enemy',
        hit: false,
      });

      const context = createMockContext();
      const response = await agent.process(event, context);

      const output = JSON.parse(response!.output);
      expect(output.ruling).toBe('attack_miss');
    });
  });

  describe('unhandled event types', () => {
    it('returns null for unhandled event types', async () => {
      const event = createEvent('session:start');
      const context = createMockContext();

      const response = await agent.process(event, context);
      expect(response).toBeNull();
    });
  });
});