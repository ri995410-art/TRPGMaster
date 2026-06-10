import { IntentParser, type ParseContext } from '../../input/IntentParser';
import type { ParsedIntent } from '@trpgmaster/shared';
import type { AIGateway } from '../../ai/AIGateway';

describe('IntentParser', () => {
  let parser: IntentParser;
  const defaultContext: ParseContext = {
    ruleSystem: 'daggerheart',
  };

  describe('fallback mode (no AIGateway) — safe default', () => {
    beforeEach(() => {
      parser = new IntentParser();
    });

    describe('command detection (fast path)', () => {
      it('should detect command for "/roll 2d6"', async () => {
        const result = await parser.parseIntent('/roll 2d6', defaultContext);
        expect(result.intentType).toBe('command');
        expect(result.confidence).toBe(1.0);
      });

      it('should detect command for "/help"', async () => {
        const result = await parser.parseIntent('/help', defaultContext);
        expect(result.intentType).toBe('command');
      });

      it('should extract command name and args', async () => {
        const result = await parser.parseIntent('/roll 2d6+3', defaultContext);
        expect(result.attributes).toHaveProperty('command', 'roll');
        expect(result.attributes).toHaveProperty('args', '2d6+3');
      });
    });

    describe('safe fallback — returns action', () => {
      it('should return action for any non-command input when AI is unavailable', async () => {
        const result = await parser.parseIntent('攻击哥布林', defaultContext);
        expect(result.intentType).toBe('action');
        expect(result.confidence).toBe(0.3);
      });

      it('should return action for dialogue-like input', async () => {
        const result = await parser.parseIntent('告诉村长我们找到了线索', defaultContext);
        expect(result.intentType).toBe('action');
      });

      it('should return action for unrecognized input', async () => {
        const result = await parser.parseIntent('我想做点什么', defaultContext);
        expect(result.intentType).toBe('action');
      });

      it('should include ruleSystem in attributes', async () => {
        const result = await parser.parseIntent('攻击敌人', defaultContext);
        expect(result.attributes).toHaveProperty('ruleSystem', 'daggerheart');
      });

      it('should preserve rawInput', async () => {
        const result = await parser.parseIntent('攻击哥布林', defaultContext);
        expect(result.rawInput).toBe('攻击哥布林');
      });
    });

    describe('edge cases', () => {
      it('should handle empty string', async () => {
        const result = await parser.parseIntent('', defaultContext);
        expect(result.intentType).toBe('unknown');
        expect(result.confidence).toBe(0);
      });

      it('should handle whitespace-only input', async () => {
        const result = await parser.parseIntent('   ', defaultContext);
        expect(result.intentType).toBe('unknown');
      });

      it('should handle special characters', async () => {
        const result = await parser.parseIntent('@#$%^&*()', defaultContext);
        expect(result.intentType).toBe('action');
        expect(result.rawInput).toBe('@#$%^&*()');
      });
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

      parser = new IntentParser(mockGateway);
    });

    it('should use AIGateway when available', async () => {
      mockGateway.sendRequest.mockResolvedValue({
        content: JSON.stringify({
          intentType: 'combat_action',
          confidence: 0.95,
          attributes: { target: '哥布林', action: '攻击' },
          rawInput: '攻击哥布林',
        }),
        agentType: 'intentParser',
        model: 'nex-agi/Nex-N2-Pro',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        requestId: 'test-1',
      });

      const result = await parser.parseIntent('攻击哥布林', defaultContext);
      expect(result.intentType).toBe('combat_action');
      expect(result.confidence).toBe(0.95);
      expect(mockGateway.sendRequest).toHaveBeenCalledTimes(1);
    });

    it('should classify character introduction correctly via AI', async () => {
      mockGateway.sendRequest.mockResolvedValue({
        content: JSON.stringify({
          intentType: 'character_introduction',
          confidence: 0.9,
          attributes: {},
          rawInput: '我叫晨星格里西亚',
        }),
        agentType: 'intentParser',
        model: 'nex-agi/Nex-N2-Pro',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        requestId: 'test-2',
      });

      const result = await parser.parseIntent('我叫晨星格里西亚，我的妹妹是钻石格里西亚。她是一名神使，使用圣光来攻击敌人', defaultContext);
      expect(result.intentType).toBe('character_introduction');
    });

    it('should pass context to AI prompt including character_introduction guidance', async () => {
      mockGateway.sendRequest.mockResolvedValue({
        content: JSON.stringify({
          intentType: 'action',
          confidence: 0.8,
          attributes: {},
          rawInput: 'test',
        }),
        agentType: 'intentParser',
        model: 'nex-agi/Nex-N2-Pro',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        requestId: 'test-3',
      });

      const contextWithScene: ParseContext = {
        ruleSystem: 'daggerheart',
        currentScene: '黑暗森林',
        characterClass: '战士',
      };

      await parser.parseIntent('我看看周围', contextWithScene);
      expect(mockGateway.sendRequest).toHaveBeenCalledTimes(1);

      const call = mockGateway.sendRequest.mock.calls[0][0];
      const systemMsg = call.messages.find((m: { role: string }) => m.role === 'system');
      expect(systemMsg?.content).toContain('character_introduction');
    });

    it('should fall back to safe default (action) when AI returns invalid JSON', async () => {
      mockGateway.sendRequest.mockResolvedValue({
        content: 'not valid json',
        agentType: 'intentParser',
        model: 'nex-agi/Nex-N2-Pro',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        requestId: 'test-4',
      });

      const result = await parser.parseIntent('攻击哥布林', defaultContext);
      expect(result.intentType).toBe('action');
      expect(result.confidence).toBe(0.3);
    });

    it('should fall back to safe default (action) when AI request fails', async () => {
      mockGateway.sendRequest.mockRejectedValue(new Error('API error'));

      const result = await parser.parseIntent('攻击哥布林', defaultContext);
      expect(result.intentType).toBe('action');
      expect(result.confidence).toBe(0.3);
    });

    it('should fall back to safe default (action) when AI returns invalid intentType', async () => {
      mockGateway.sendRequest.mockResolvedValue({
        content: JSON.stringify({
          intentType: 'invalid_type',
          confidence: 0.9,
          attributes: {},
          rawInput: 'test',
        }),
        agentType: 'intentParser',
        model: 'nex-agi/Nex-N2-Pro',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        requestId: 'test-5',
      });

      const result = await parser.parseIntent('攻击哥布林', defaultContext);
      expect(result.intentType).toBe('action');
    });
  });
});