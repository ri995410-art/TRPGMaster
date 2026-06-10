/**
 * AI Gateway 测试
 * 定义GLM5.1 API网关的行为规范
 */
import { AIGateway, AIRequest } from '../src/ai/AIGateway';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function mockSuccessResponse(content: string) {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    }),
    text: async () => '',
    body: null,
  });
}

function mockErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({ error: 'test error' }),
    text: async () => `API error ${status}: test error`,
    body: null,
  };
}

describe('AIGateway - GLM5.1 API网关', () => {
  let gateway: AIGateway;

  beforeEach(() => {
    mockFetch.mockReset();
    gateway = new AIGateway({
      apiKey: 'test-key',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      defaultModel: 'glm-5.1',
      maxRetries: 3,
      retryDelay: 10,
      maxConcurrent: 5,
    });
  });

  describe('单次请求', () => {
    it('发送请求并返回完整响应', async () => {
      mockSuccessResponse('场景描述文本');

      const request: AIRequest = {
        model: 'glm-5.1',
        messages: [
          { role: 'system', content: '你是叙事Agent' },
          { role: 'user', content: '描述一个场景' },
        ],
        temperature: 0.7,
        maxTokens: 2000,
        agentType: 'narrative',
      };

      const response = await gateway.sendRequest(request);
      expect(response.content).toBe('场景描述文本');
      expect(response.agentType).toBe('narrative');
      expect(response.tokenUsage).toBeDefined();
      expect(response.tokenUsage.totalTokens).toBe(150);
    });

    it('API失败时自动重试', async () => {
      // First call: 500 error, second call: success
      mockFetch
        .mockResolvedValueOnce(mockErrorResponse(500))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'retry success' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          }),
          text: async () => '',
          body: null,
        });

      const request: AIRequest = {
        model: 'glm-5.1',
        messages: [{ role: 'user' as const, content: 'test' }],
        temperature: 0.1,
        maxTokens: 100,
        agentType: 'rules',
      };

      const response = await gateway.sendRequest(request);
      expect(response.content).toBe('retry success');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('超过重试次数后抛出错误', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(500));

      const request: AIRequest = {
        model: 'glm-5.1',
        messages: [{ role: 'user' as const, content: 'test' }],
        temperature: 0.1,
        maxTokens: 100,
        agentType: 'rules',
      };

      await expect(gateway.sendRequest(request)).rejects.toThrow();
    });
  });

  describe('并发控制', () => {
    it('最多5个并发请求', async () => {
      mockSuccessResponse('test response');

      const requests: AIRequest[] = Array.from({ length: 10 }, (_, i) => ({
        model: 'glm-5.1',
        messages: [{ role: 'user' as const, content: `test ${i}` }],
        temperature: 0.5,
        maxTokens: 100,
        agentType: 'narrative',
      }));

      const responses = await gateway.sendBatchRequests(requests);
      expect(responses).toHaveLength(10);
      responses.forEach(r => expect(r).toBeDefined());
    });
  });

  describe('上下文管理', () => {
    it('构建Agent上下文，控制在200k以内', () => {
      const context = gateway.buildAgentContext(
        'narrative',
        { sessionId: 'test', recentEvents: [], currentState: {} },
        200000,
      );

      expect(context.messages).toBeDefined();
      expect(context.messages.length).toBeGreaterThan(0);
      expect(context.messages[0].role).toBe('system');
    });

    it('压缩历史事件以适应上下文窗口', () => {
      const manyEvents = Array.from({ length: 500 }, (_, i) => ({
        type: 'player:action',
        summary: `事件 ${i}: 玩家做了某事`,
        timestamp: Date.now() - i * 60000,
      }));

      const context = gateway.buildAgentContext(
        'narrative',
        { sessionId: 'test', recentEvents: manyEvents, currentState: {} },
        200000,
      );

      const totalTokens = gateway.estimateTokenCount(context.messages);
      expect(totalTokens).toBeLessThan(200000);
    });
  });

  describe('错误处理', () => {
    it('网络错误返回null而非抛出', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const request: AIRequest = {
        model: 'glm-5.1',
        messages: [{ role: 'user' as const, content: 'test' }],
        temperature: 0.1,
        maxTokens: 100,
        agentType: 'rules',
      };

      const response = await gateway.sendRequestSafe(request);
      expect(response).toBeNull();
    });

    it('Rate limit错误等待后重试', async () => {
      mockFetch
        .mockResolvedValueOnce(mockErrorResponse(429))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'rate limit retry success' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          }),
          text: async () => '',
          body: null,
        });

      const request: AIRequest = {
        model: 'glm-5.1',
        messages: [{ role: 'user' as const, content: 'test' }],
        temperature: 0.1,
        maxTokens: 100,
        agentType: 'rules',
      };

      const response = await gateway.sendRequest(request);
      expect(response.content).toBe('rate limit retry success');
    });
  });
});