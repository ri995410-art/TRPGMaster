import { SceneDirectorAgent } from '../../agents/SceneDirectorAgent';
import type { GameEvent, GameEventType } from '@trpgmaster/shared';
import type { AgentContext, AgentResponse } from '../../core/AgentCoordinator';
import type { AIGateway } from '../../ai/AIGateway';

describe('SceneDirectorAgent', () => {
  const mockContext: AgentContext = {
    sessionId: 'test-session',
    state: {
      sessionId: 'test-session',
      ruleSystem: 'daggerheart',
      status: 'active',
      gmId: 'gm-1',
      players: [],
      currentScene: {
        id: 'scene-1',
        name: '废弃教堂',
        description: '破碎的彩色玻璃散落在地',
        locationId: 'loc-1',
        environment: '阴森',
        activeConditions: [],
        npcPresent: ['老祭司'],
        enemies: [],
      },
      fearPoints: 3,
      totalFearGained: 3,
      totalFearSpent: 0,
      roundTracker: { currentRound: 1, playerActionsRemaining: {} },
      timeline: [],
    } as AgentContext['state'],
    characters: [],
    recentEvents: [],
  };

  describe('fallback mode (no AIGateway)', () => {
    let agent: SceneDirectorAgent;

    beforeEach(() => {
      agent = new SceneDirectorAgent();
    });

    it('should handle player:roll event', async () => {
      const event: GameEvent = {
        id: '1',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'player:roll',
        source: 'player',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
      expect(result?.agentType).toBe('sceneDirector');
    });

    it('should handle gm:useFear event', async () => {
      const event: GameEvent = {
        id: '2',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'gm:useFear',
        source: 'gm',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
      const output = JSON.parse(result!.output);
      expect(output.pacingSuggestions).toBeDefined();
      expect(output.pacingSuggestions.length).toBeGreaterThanOrEqual(2);
      expect(output.tensionNote).toBeDefined();
    });

    it('should handle gm:enemyAction event', async () => {
      const event: GameEvent = {
        id: '3',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'gm:enemyAction',
        source: 'gm',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
    });

    it('should handle combat:start event', async () => {
      const event: GameEvent = {
        id: '4',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'combat:start',
        source: 'system',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
    });

    it('should handle session:start event', async () => {
      const event: GameEvent = {
        id: '5',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'session:start',
        source: 'system',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
      const output = JSON.parse(result!.output);
      expect(output.pacingSuggestions).toBeDefined();
      expect(output.tensionNote).toBeDefined();
    });

    it('should handle input:vision event', async () => {
      const event: GameEvent = {
        id: '6',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'input:vision',
        source: 'player',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
      const output = JSON.parse(result!.output);
      expect(output.pacingSuggestions).toBeDefined();
      expect(output.tensionNote).toBeDefined();
    });

    it('should return null for unhandled events', async () => {
      const event: GameEvent = {
        id: '7',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'player:dialogue',
        source: 'player',
      };

      const result = await agent.process(event, mockContext);
      expect(result).toBeNull();
    });

    it('should provide pacing advice based on fear points', async () => {
      const highFearContext = { ...mockContext, state: { ...mockContext.state, fearPoints: 8, totalFearGained: 8, totalFearSpent: 1 } } as AgentContext;
      const event: GameEvent = {
        id: '8',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'player:roll',
        source: 'player',
      };

      const result = await agent.process(event, highFearContext);
      const output = JSON.parse(result!.output);
      expect(output.pacingSuggestions).toBeDefined();
      expect(output.tensionNote).toBeDefined();
    });
  });

  describe('AI mode (with AIGateway)', () => {
    let agent: SceneDirectorAgent;
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

      agent = new SceneDirectorAgent(mockGateway);
    });

    it('should use AIGateway when available', async () => {
      mockGateway.sendRequest.mockResolvedValue({
        content: JSON.stringify({
          pacingSuggestions: [
            { label: '加强紧张', content: '紫色迷雾变得更加浓厚' },
            { label: '给予喘息', content: '暂时恢复了平静' },
          ],
          tensionNote: '恐惧点较高，建议增加紧张事件',
        }),
        agentType: 'sceneDirector',
        model: 'nex-agi/Nex-N2-Pro',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        requestId: 'test-1',
      });

      const event: GameEvent = {
        id: '9',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'gm:useFear',
        source: 'gm',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
      expect(mockGateway.sendRequest).toHaveBeenCalledTimes(1);
    });

    it('should fall back to template when AI fails', async () => {
      mockGateway.sendRequest.mockRejectedValue(new Error('API error'));

      const event: GameEvent = {
        id: '10',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'combat:start',
        source: 'system',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
      const output = JSON.parse(result!.output);
      expect(output.pacingSuggestions).toBeDefined();
      expect(output.tensionNote).toBeDefined();
    });
  });
});