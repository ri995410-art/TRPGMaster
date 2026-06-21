import { NovelAgent } from '../../agents/NovelAgent';
import type { GameEvent } from '@trpgmaster/shared';
import type { AgentContext, AgentResponse } from '../../core/AgentCoordinator';
import type { AIGateway } from '../../ai/AIGateway';

describe('NovelAgent', () => {
  const mockContext: AgentContext = {
    sessionId: 'test-session',
    state: {
      sessionId: 'test-session',
      ruleSystem: 'daggerheart',
      status: 'ended',
      gmId: 'gm-1',
      players: [
        { playerId: 'p1', name: '战士艾拉', characterId: 'char-1', connected: true, isActing: false },
        { playerId: 'p2', name: '法师凯恩', characterId: 'char-2', connected: true, isActing: false },
      ],
      currentScene: {
        id: 'scene-1',
        name: '德拉肯海姆城门',
        description: '破败的城门矗立在紫色迷雾中',
        locationId: 'loc-1',
        environment: '阴森',
        activeConditions: [],
        npcPresent: [],
        enemies: [],
      },
      fearPoints: 5,
      totalFearGained: 5,
      totalFearSpent: 0,
      roundTracker: { currentRound: 3, playerActionsRemaining: {} },
      timeline: [
        { id: 't1', timestamp: Date.now() - 3600000, eventType: 'session:start', summary: '会话开始', isKeyMoment: false },
        { id: 't2', timestamp: Date.now() - 3000000, eventType: 'combat:start', summary: '战斗开始', isKeyMoment: true },
        { id: 't3', timestamp: Date.now() - 1800000, eventType: 'combat:end', summary: '战斗结束', isKeyMoment: true },
        { id: 't4', timestamp: Date.now() - 600000, eventType: 'session:end', summary: '会话结束', isKeyMoment: false },
      ],
    } as AgentContext['state'],
    characters: [
      { id: 'char-1', name: '艾拉', class: '战士', level: 3, hp: 25, maxHp: 30, stress: 2, hope: 3, armorSlots: 2, maxArmorSlots: 3, experiences: [], weapons: [], armor: null, domains: [], backstory: '来自北方部族的战士', ancestry: '兽人', community: '边境哨站' } as any,
      { id: 'char-2', name: '凯恩', class: '法师', level: 3, hp: 18, maxHp: 22, stress: 4, hope: 1, armorSlots: 0, maxArmorSlots: 1, experiences: [], weapons: [], armor: null, domains: [], backstory: '被学院驱逐的法师', ancestry: '精灵', community: '学者社区' } as any,
    ],
    recentEvents: [],
  };

  describe('fallback mode (no AIGateway)', () => {
    let agent: NovelAgent;

    beforeEach(() => {
      agent = new NovelAgent();
    });

    it('should handle session:end event', async () => {
      const event: GameEvent = {
        id: '1',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'session:end',
        source: 'system',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
      expect(result?.agentType).toBe('novel');
    });

    it('should generate novel outline for each player', async () => {
      const event: GameEvent = {
        id: '2',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'session:end',
        source: 'system',
      };

      const result = await agent.process(event, mockContext);
      const output = JSON.parse(result!.output);
      expect(output.outlines).toBeDefined();
      expect(output.outlines.length).toBe(2);
      expect(output.outlines[0].characterId).toBe('char-1');
      expect(output.outlines[1].characterId).toBe('char-2');
    });

    it('should include key moments in novel outline', async () => {
      const event: GameEvent = {
        id: '3',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'session:end',
        source: 'system',
      };

      const result = await agent.process(event, mockContext);
      const output = JSON.parse(result!.output);
      expect(output.outlines[0].keyMoments).toBeDefined();
      expect(output.outlines[0].keyMoments.length).toBeGreaterThan(0);
    });

    it('should generate chapters from timeline', async () => {
      const event: GameEvent = {
        id: '4',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'session:end',
        source: 'system',
      };

      const result = await agent.process(event, mockContext);
      const output = JSON.parse(result!.output);
      expect(output.outlines[0].chapters).toBeDefined();
      expect(output.outlines[0].chapters.length).toBeGreaterThan(0);
    });

    it('should return null for non-session:end events', async () => {
      const event: GameEvent = {
        id: '5',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'player:action',
        source: 'player',
      };

      const result = await agent.process(event, mockContext);
      expect(result).toBeNull();
    });

    it('should handle empty timeline', async () => {
      const emptyContext = { ...mockContext, state: { ...mockContext.state, timeline: [] } } as AgentContext;
      const event: GameEvent = {
        id: '6',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'session:end',
        source: 'system',
      };

      const result = await agent.process(event, emptyContext);
      expect(result).not.toBeNull();
      const output = JSON.parse(result!.output);
      expect(output.outlines.length).toBe(2);
    });
  });

  describe('AI mode (with AIGateway)', () => {
    let agent: NovelAgent;
    let mockGateway: jest.Mocked<AIGateway>;

    beforeEach(() => {
      mockGateway = {
        sendRequest: jest.fn(),
        sendRequestSafe: jest.fn(),
        sendStreamRequest: jest.fn(),
        buildAgentContext: jest.fn(),
        estimateTokenCount: jest.fn().mockReturnValue(100),
        getStats: jest.fn(),
        getActiveRequestCount: jest.fn(),
      } as unknown as jest.Mocked<AIGateway>;

      agent = new NovelAgent(mockGateway);
    });

    it('should use AIGateway for novel generation', async () => {
      mockGateway.sendRequest.mockResolvedValue({
        content: JSON.stringify({
          title: '艾拉的德拉肯海姆之旅',
          summary: '战士艾拉踏入被诅咒的城市...',
          chapters: [
            { title: '城门之前', summary: '艾拉站在破败的城门前', content: '紫色迷雾缭绕...' },
          ],
          keyMoments: ['战斗开始', '战斗结束'],
        }),
        agentType: 'novel',
        model: 'nex-agi/Nex-N2-Pro',
        tokenUsage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        finishReason: 'stop',
        requestId: 'test-1',
      });

      const event: GameEvent = {
        id: '7',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'session:end',
        source: 'system',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
      expect(mockGateway.sendRequest).toHaveBeenCalled();
      const output = JSON.parse(result!.output);
      expect(output.outlines[0].title).toBe('艾拉的德拉肯海姆之旅');
    });

    it('should fall back to template when AI fails', async () => {
      mockGateway.sendRequest.mockRejectedValue(new Error('API error'));

      const event: GameEvent = {
        id: '8',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'session:end',
        source: 'system',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
      const output = JSON.parse(result!.output);
      expect(output.outlines.length).toBe(2);
    });

    it('should handle partial AI failure (one character succeeds, one fails)', async () => {
      mockGateway.sendRequest
        .mockResolvedValueOnce({
          content: JSON.stringify({
            title: '艾拉的旅程',
            summary: '故事摘要',
            chapters: [],
            keyMoments: [],
          }),
          agentType: 'novel',
          model: 'nex-agi/Nex-N2-Pro',
          tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          finishReason: 'stop',
          requestId: 'test-2',
        })
        .mockRejectedValueOnce(new Error('API error for second character'));

      const event: GameEvent = {
        id: '9',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'session:end',
        source: 'system',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
      const output = JSON.parse(result!.output);
      expect(output.outlines.length).toBe(2);
      expect(output.outlines[0].title).toBe('艾拉的旅程');
      // Second should be fallback
      expect(output.outlines[1].title).toBeDefined();
    });
  });

  describe('novel:generate event', () => {
    let agent: NovelAgent;

    beforeEach(() => {
      agent = new NovelAgent();
    });

    it('should handle novel:generate event for manual generation', async () => {
      const event: GameEvent = {
        id: '10',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'novel:generate',
        source: 'gm',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
    });
  });
});