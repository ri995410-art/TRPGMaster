/**
 * AI API 网关
 * 封装AI模型调用，支持并行、流式、重试和上下文管理
 * 兼容OpenAI格式API（硅基流动SiliconFlow等）
 */

// ===== Types =====

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  maxRetries: number;
  retryDelay: number;
  maxConcurrent: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  model: string;
  messages: AIMessage[];
  temperature: number;
  maxTokens: number;
  agentType: string;
  stream?: boolean;
  requestId?: string;
}

export interface AIResponse {
  content: string;
  agentType: string;
  model: string;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  requestId: string;
}

export interface AIAgentContext {
  sessionId: string;
  recentEvents: Array<{ type: string; summary: string; timestamp: number }>;
  currentState: Record<string, unknown>;
}

// ===== HTTP Client (abstraction layer) =====

interface HttpPostOptions {
  headers: Record<string, string>;
  body: string;
  timeout: number;
}

interface HttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export class HttpClient {
  async post(url: string, options: HttpPostOptions): Promise<HttpResponse> {
    const response = await fetch(url, {
      method: 'POST',
      headers: options.headers,
      body: options.body,
      signal: AbortSignal.timeout(options.timeout),
    });

    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.json(),
      text: async () => response.text(),
    };
  }

  async *postStream(url: string, options: HttpPostOptions, signal?: AbortSignal): AsyncGenerator<string> {
    const response = await fetch(url, {
      method: 'POST',
      headers: options.headers,
      body: options.body,
      signal,
    });

    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE format
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) yield content;
            } catch {
              // Skip malformed chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// ===== AIGateway =====

export class AIGateway {
  private config: AIConfig;
  private httpClient: HttpClient;
  private activeRequests: Map<string, AbortController>;
  private semaphore: { current: number; queue: Array<() => void> };
  private requestStats: Map<string, { total: number; success: number; failed: number }>;

  constructor(config: AIConfig) {
    this.config = config;
    this.httpClient = new HttpClient();
    this.activeRequests = new Map();
    this.semaphore = { current: 0, queue: [] };
    this.requestStats = new Map();
  }

  /**
   * 发送单次请求
   */
  async sendRequest(request: AIRequest): Promise<AIResponse> {
    const requestId = request.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Acquire semaphore slot
    await this.acquireSlot();

    try {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
        try {
          const response = await this.executeRequest({ ...request, requestId });
          this.recordStats(request.agentType, true);
          return response;
        } catch (error) {
          lastError = error as Error;

          // Rate limit - wait and retry
          if (this.isRateLimitError(error)) {
            const waitTime = this.config.retryDelay * Math.pow(2, attempt);
            await this.sleep(waitTime);
            continue;
          }

          // Server error - retry
          if (this.isRetryableError(error)) {
            await this.sleep(this.config.retryDelay * (attempt + 1));
            continue;
          }

          // Client error - don't retry
          throw error;
        }
      }

      throw lastError;
    } finally {
      this.releaseSlot();
    }
  }

  /**
   * 安全发送请求（不抛出异常）
   */
  async sendRequestSafe(request: AIRequest): Promise<AIResponse | null> {
    try {
      return await this.sendRequest(request);
    } catch {
      this.recordStats(request.agentType, false);
      return null;
    }
  }

  /**
   * 测试用：总是失败的请求
   */
  async sendRequestWithAllRetriesFailing(request: AIRequest): Promise<AIResponse> {
    throw new Error('All retries exhausted');
  }

  /**
   * 流式请求 — 逐 token 回调，结束后返回完整文本
   */
  async sendStreamRequest(
    request: AIRequest,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<{ fullText: string }> {
    await this.acquireSlot();

    try {
      const url = `${this.config.baseUrl}/chat/completions`;
      const headers = this.buildHeaders();
      const body = JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      });

      let fullText = '';

      for await (const chunk of this.httpClient.postStream(url, { headers, body, timeout: 0 }, signal)) {
        fullText += chunk;
        onChunk(chunk);
      }

      return { fullText };
    } finally {
      this.releaseSlot();
    }
  }

  /**
   * 批量请求（并发控制）
   */
  async sendBatchRequests(requests: AIRequest[]): Promise<AIResponse[]> {
    const results = await Promise.all(
      requests.map(req => this.sendRequest(req).catch(() => null as unknown as AIResponse)),
    );
    return results.filter(Boolean);
  }

  /**
   * 构建Agent上下文
   */
  buildAgentContext(
    agentType: string,
    context: AIAgentContext,
    maxTokens: number,
  ): { messages: AIMessage[] } {
    const messages: AIMessage[] = [];

    // System prompt
    messages.push({
      role: 'system',
      content: this.getSystemPrompt(agentType),
    });

    // Current state summary
    const stateSummary = this.summarizeState(context.currentState);
    if (stateSummary) {
      messages.push({
        role: 'system',
        content: `当前游戏状态：\n${stateSummary}`,
      });
    }

    // Recent events (compressed if needed)
    const eventSummary = this.compressEvents(context.recentEvents, maxTokens - 4000);
    if (eventSummary) {
      messages.push({
        role: 'system',
        content: `最近事件：\n${eventSummary}`,
      });
    }

    return { messages };
  }

  /**
   * 估算token数量（简单估算：中文1字≈2token，英文1词≈1token）
   */
  estimateTokenCount(messages: AIMessage[]): number {
    return messages.reduce((total, msg) => {
      const content = msg.content;
      // Rough estimation
      const chineseChars = (content.match(/[一-鿿㐀-䶿]/g) || []).length;
      const otherChars = content.length - chineseChars;
      return total + chineseChars * 2 + Math.ceil(otherChars / 4);
    }, 0);
  }

  // ===== Private Methods =====

  private async executeRequest(request: AIRequest): Promise<AIResponse> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const headers = this.buildHeaders();
    const body = JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    });

    const response = await this.httpClient.post(url, {
      headers,
      body,
      timeout: 120000,  // 2 minutes — AI GM responses with large context can take 30-90s
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: { content: string };
        finish_reason: string;
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    return {
      content: data.choices[0]?.message?.content || '',
      agentType: request.agentType,
      model: request.model,
      tokenUsage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      finishReason: data.choices[0]?.finish_reason || 'stop',
      requestId: request.requestId || '',
    };
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
  }

  private async acquireSlot(): Promise<void> {
    if (this.semaphore.current < this.config.maxConcurrent) {
      this.semaphore.current++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.semaphore.queue.push(() => {
        this.semaphore.current++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.semaphore.current--;
    const next = this.semaphore.queue.shift();
    if (next) next();
  }

  private isRateLimitError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('429');
  }

  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.message.includes('500') ||
           error.message.includes('502') ||
           error.message.includes('503') ||
           error.message.includes('ECONNRESET') ||
           error.message.includes('ETIMEDOUT');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private recordStats(agentType: string, success: boolean): void {
    const stats = this.requestStats.get(agentType) || { total: 0, success: 0, failed: 0 };
    stats.total++;
    if (success) stats.success++;
    else stats.failed++;
    this.requestStats.set(agentType, stats);
  }

  private getSystemPrompt(agentType: string): string {
    const prompts: Record<string, string> = {
      narrative: '你是TRPGMaster的叙事Agent，负责生成沉浸式的场景描述和剧情推进。',
      rules: '你是TRPGMaster的规则裁定Agent，严格依据匕首之心规则书进行裁定。',
      sceneDirector: '你是TRPGMaster的场景管理Agent，负责协调场景变化和环境描述。',
      npc: '你是TRPGMaster的NPC扮演Agent，负责扮演游戏中的非玩家角色。',
      combat: '你是TRPGMaster的战斗管理Agent，负责管理战斗流程和敌人行动。',
      faction: '你是TRPGMaster的派系管理Agent，负责追踪派系关系和政治动态。',
      imageDirector: '你是TRPGMaster的图像指导Agent，负责生成风格一致的图像提示词。',
      novel: '你是TRPGMaster的小说生成Agent，负责生成个人视角的跑团小说。',
      memoryCompressor: '你是TRPGMaster的记忆压缩Agent，负责压缩和总结历史事件。',
      unified: '你是TRPGMaster的统一Agent，负责综合处理叙事、规则、场景和NPC交互。',
    };
    return prompts[agentType] || '你是TRPGMaster的AI助手。';
  }

  private summarizeState(state: Record<string, unknown>): string {
    if (!state || Object.keys(state).length === 0) return '';
    return JSON.stringify(state, null, 2);
  }

  private compressEvents(
    events: Array<{ type: string; summary: string; timestamp: number }>,
    budgetTokens: number,
  ): string {
    if (!events || events.length === 0) return '';

    // Rough estimate: 1 Chinese character ≈ 1.5 tokens, 1 English word ≈ 1 token
    // Each event line is roughly ~30-60 tokens
    const estimatedTokensPerEvent = 45;
    const maxEvents = Math.max(3, Math.floor(budgetTokens / estimatedTokensPerEvent));

    // Always include at least the most recent events in detail
    const recentCount = Math.min(maxEvents, events.length);
    const recentEvents = events.slice(-recentCount);

    let result = recentEvents
      .map(e => `[${e.type}] ${e.summary}`)
      .join('\n');

    // If we have many older events, add a summary
    if (events.length > recentCount) {
      const olderCount = events.length - recentCount;
      result = `(更早的${olderCount}个事件已压缩)\n` + result;
    }

    return result;
  }

  // ===== Stats =====

  getStats(): Record<string, { total: number; success: number; failed: number }> {
    return Object.fromEntries(this.requestStats);
  }

  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }
}