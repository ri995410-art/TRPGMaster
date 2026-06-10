import { ImageDirectorAgent } from '../../agents/ImageDirectorAgent';
import type { GameEvent, GameEventType } from '@trpgmaster/shared';
import type { AgentContext, AgentResponse } from '../../core/AgentCoordinator';
import type { AIGateway } from '../../ai/AIGateway';
import type { ImageClient } from '../../image/ImageClient';

describe('ImageDirectorAgent', () => {
  let agent: ImageDirectorAgent;
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
        npcPresent: [],
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
    beforeEach(() => {
      agent = new ImageDirectorAgent();
    });

    it('should handle gm:sceneChange event', async () => {
      const event: GameEvent = {
        id: '1',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'gm:sceneChange',
        source: 'gm',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
      expect(result?.agentType).toBe('imageDirector');
      const output = JSON.parse(result!.output);
      expect(output.prompt).toBeDefined();
      expect(output.negativePrompt).toBeDefined();
      expect(output.category).toBe('scene');
    });

    it('should handle session:start event', async () => {
      const event: GameEvent = {
        id: '2',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'session:start',
        source: 'system',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
      const output = JSON.parse(result!.output);
      expect(output.category).toBe('scene');
    });

    it('should handle image:generate event', async () => {
      const event: GameEvent = {
        id: '3',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'image:generate',
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
      const output = JSON.parse(result!.output);
      expect(output.prompt).toContain('combat');
    });

    it('should return null for unhandled events', async () => {
      const event: GameEvent = {
        id: '5',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'player:roll',
        source: 'player',
      };

      const result = await agent.process(event, mockContext);
      expect(result).toBeNull();
    });

    it('should generate scene prompt with environment details', async () => {
      const event: GameEvent = {
        id: '6',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'gm:sceneChange',
        source: 'gm',
      };

      const result = await agent.process(event, mockContext);
      const output = JSON.parse(result!.output);
      expect(output.prompt).toContain('废弃教堂');
    });
  });

  describe('AI mode (with AIGateway)', () => {
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

      agent = new ImageDirectorAgent(mockGateway);
    });

    it('should use AIGateway when available', async () => {
      mockGateway.sendRequest.mockResolvedValue({
        content: JSON.stringify({
          prompt: 'dark fantasy ruined church with stained glass',
          negativePrompt: 'anime, cartoon, modern',
          styleId: 'drakkenheim',
          category: 'scene',
          relatedEntityId: 'scene-1',
        }),
        agentType: 'imageDirector',
        model: 'nex-agi/Nex-N2-Pro',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        requestId: 'test-1',
      });

      const event: GameEvent = {
        id: '7',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'gm:sceneChange',
        source: 'gm',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
      expect(mockGateway.sendRequest).toHaveBeenCalledTimes(1);
      const output = JSON.parse(result!.output);
      expect(output.prompt).toBe('dark fantasy ruined church with stained glass');
    });

    it('should fall back to template when AI fails', async () => {
      mockGateway.sendRequest.mockRejectedValue(new Error('API error'));

      const event: GameEvent = {
        id: '8',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'gm:sceneChange',
        source: 'gm',
      };

      const result = await agent.process(event, mockContext);
      expect(result).not.toBeNull();
      const output = JSON.parse(result!.output);
      expect(output.prompt).toBeDefined();
    });
  });

  describe('with ImageClient', () => {
    let mockImageClient: jest.Mocked<ImageClient>;

    beforeEach(() => {
      mockImageClient = {
        generate: jest.fn().mockResolvedValue({
          id: 'img-1',
          url: 'placeholder://image-1.png',
          prompt: 'test prompt',
          styleId: 'drakkenheim',
          category: 'scene',
          timestamp: Date.now(),
        }),
        generateBatch: jest.fn(),
        getAvailableStyles: jest.fn(),
        isConfigured: jest.fn().mockReturnValue(false),
      } as unknown as jest.Mocked<ImageClient>;

      agent = new ImageDirectorAgent(undefined, mockImageClient);
    });

    it('should pass generated prompt to ImageClient', async () => {
      const event: GameEvent = {
        id: '9',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'image:generate',
        source: 'gm',
      };

      await agent.process(event, mockContext);
      expect(mockImageClient.generate).toHaveBeenCalled();
    });

    it('should include image:complete event in response when ImageClient returns', async () => {
      const event: GameEvent = {
        id: '10',
        sessionId: 'test-session',
        timestamp: Date.now(),
        type: 'image:generate',
        source: 'gm',
      };

      const result = await agent.process(event, mockContext);
      expect(result?.events).toBeDefined();
      const completeEvent = result?.events?.find(e => e.type === 'image:complete');
      expect(completeEvent).toBeDefined();
    });
  });
});