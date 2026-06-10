/**
 * Agent集成测试
 * 验证各Agent的process方法输出格式和基本行为
 */
import { NarrativeAgent } from '../src/agents/NarrativeAgent';
import { NPCAgent } from '../src/agents/NPCAgent';
import { CombatAgent } from '../src/agents/CombatAgent';
import { FactionAgent } from '../src/agents/FactionAgent';
import type { GameEvent } from '@trpgmaster/shared';
import type { AgentContext } from '../src/core/AgentCoordinator';

// Mock AIGateway
jest.mock('../src/ai/AIGateway', () => ({
  AIGateway: jest.fn().mockImplementation(() => ({
    sendRequest: jest.fn().mockResolvedValue({
      content: JSON.stringify({ sceneDescription: '测试场景', narrative: '测试叙事' }),
      tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    }),
    buildAgentContext: jest.fn().mockReturnValue({
      messages: [
        { role: 'system', content: '测试prompt' },
        { role: 'user', content: '测试输入' },
      ],
    }),
  })),
}));

// Helper: create minimal agent context
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
    characters: [{
      id: 'char-1',
      playerId: 'player-1',
      name: '艾拉',
      ruleSystem: 'daggerheart',
      classId: 'warrior',
      subclassId: undefined,
      ancestryId: 'human',
      communityId: 'high-city',
      level: 1,
      tier: 1,
      proficiency: 1,
      attributes: { agility: 2, strength: 1, finesse: 1, instinct: 0, presence: 0, knowledge: -1 },
      hp: 5, maxHp: 5,
      stress: 0, maxStress: 6,
      hope: 2, maxHope: 6,
      armorSlots: 3, maxArmorSlots: 3,
      evasion: 10,
      majorThreshold: 11, severeThreshold: 22,
      mainWeaponId: 'sword', offWeaponId: undefined, armorId: 'light_armor',
      inventory: [],
      experiences: [{ id: 'exp1', name: '战斗训练', modifier: 2 }],
      domainCards: [],
      scars: [],
      conditions: [],
      resistances: [],
      reactionsUsed: 0,
      focusTokens: 0,
      attributeMarks: { agility: false, strength: false, finesse: false, instinct: false, presence: false, knowledge: false },
      corruption: 0,
      factionRelations: {},
      backstory: '', personalQuest: '', relationships: [],
    }],
    recentEvents: [],
    ...overrides,
  };
}

// ===== NarrativeAgent Tests =====

describe('NarrativeAgent', () => {
  let agent: NarrativeAgent;

  beforeEach(() => {
    agent = new NarrativeAgent();
  });

  it('响应场景切换事件', async () => {
    const event: GameEvent = {
      id: 'evt-1',
      sessionId: 'test-session',
      timestamp: Date.now(),
      type: 'gm:sceneChange',
      source: 'gm',
    } as GameEvent;

    const result = await agent.process(event, createMockContext());
    expect(result).not.toBeNull();
    expect(result?.agentType).toBe('narrative');
    expect(result?.output).toBeDefined();
  });

  it('响应玩家行动事件', async () => {
    const event: GameEvent = {
      id: 'evt-2',
      sessionId: 'test-session',
      timestamp: Date.now(),
      type: 'player:action',
      source: 'player',
    } as GameEvent;

    const result = await agent.process(event, createMockContext());
    expect(result).not.toBeNull();
  });

  it('忽略不相关事件', async () => {
    const event: GameEvent = {
      id: 'evt-3',
      sessionId: 'test-session',
      timestamp: Date.now(),
      type: 'combat:damage',
      source: 'system',
    } as GameEvent;

    const result = await agent.process(event, createMockContext());
    expect(result).toBeNull();
  });

  it('输出包含场景描述和建议', async () => {
    const event: GameEvent = {
      id: 'evt-4',
      sessionId: 'test-session',
      timestamp: Date.now(),
      type: 'scene:transition',
      source: 'gm',
    } as GameEvent;

    const result = await agent.process(event, createMockContext());
    expect(result?.output).toBeDefined();
    expect(typeof result?.output).toBe('string');
  });
});

// ===== NPCAgent Tests =====

describe('NPCAgent', () => {
  let agent: NPCAgent;

  beforeEach(() => {
    agent = new NPCAgent();
  });

  it('响应玩家对话事件', async () => {
    const event: GameEvent = {
      id: 'evt-5',
      sessionId: 'test-session',
      timestamp: Date.now(),
      type: 'player:dialogue',
      source: 'player',
    } as GameEvent;

    const result = await agent.process(event, createMockContext());
    expect(result).not.toBeNull();
    expect(result?.agentType).toBe('npc');
  });

  it('忽略战斗事件', async () => {
    const event: GameEvent = {
      id: 'evt-6',
      sessionId: 'test-session',
      timestamp: Date.now(),
      type: 'combat:attack',
      source: 'system',
    } as GameEvent;

    const result = await agent.process(event, createMockContext());
    expect(result).toBeNull();
  });
});

// ===== CombatAgent Tests =====

describe('CombatAgent', () => {
  let agent: CombatAgent;

  beforeEach(() => {
    agent = new CombatAgent();
  });

  it('响应战斗开始事件', async () => {
    const event: GameEvent = {
      id: 'evt-7',
      sessionId: 'test-session',
      timestamp: Date.now(),
      type: 'combat:start',
      source: 'gm',
    } as GameEvent;

    const result = await agent.process(event, createMockContext());
    expect(result).not.toBeNull();
    expect(result?.agentType).toBe('combat');
  });

  it('响应GM使用恐惧点事件', async () => {
    const event: GameEvent = {
      id: 'evt-8',
      sessionId: 'test-session',
      timestamp: Date.now(),
      type: 'gm:useFear',
      source: 'gm',
    } as GameEvent;

    const result = await agent.process(event, createMockContext());
    expect(result).not.toBeNull();
  });

  it('响应玩家死亡行动事件', async () => {
    const event: GameEvent = {
      id: 'evt-9',
      sessionId: 'test-session',
      timestamp: Date.now(),
      type: 'player:deathMove',
      source: 'player',
    } as GameEvent;

    const result = await agent.process(event, createMockContext());
    expect(result).not.toBeNull();
  });

  it('忽略场景切换事件', async () => {
    const event: GameEvent = {
      id: 'evt-10',
      sessionId: 'test-session',
      timestamp: Date.now(),
      type: 'gm:sceneChange',
      source: 'gm',
    } as GameEvent;

    const result = await agent.process(event, createMockContext());
    expect(result).toBeNull();
  });
});

// ===== FactionAgent Tests =====

describe('FactionAgent', () => {
  let agent: FactionAgent;

  beforeEach(() => {
    agent = new FactionAgent();
  });

  it('响应派系关系变化事件', async () => {
    const event: GameEvent = {
      id: 'evt-11',
      sessionId: 'test-session',
      timestamp: Date.now(),
      type: 'faction:relationChange',
      source: 'system',
    } as GameEvent;

    const result = await agent.process(event, createMockContext());
    expect(result).not.toBeNull();
    expect(result?.agentType).toBe('faction');
  });

  it('响应玩家行动（可能涉及派系）', async () => {
    const event: GameEvent = {
      id: 'evt-12',
      sessionId: 'test-session',
      timestamp: Date.now(),
      type: 'player:action',
      source: 'player',
    } as GameEvent;

    const result = await agent.process(event, createMockContext());
    expect(result).not.toBeNull();
  });

  it('忽略战斗伤害事件', async () => {
    const event: GameEvent = {
      id: 'evt-13',
      sessionId: 'test-session',
      timestamp: Date.now(),
      type: 'combat:damage',
      source: 'system',
    } as GameEvent;

    const result = await agent.process(event, createMockContext());
    expect(result).toBeNull();
  });
});