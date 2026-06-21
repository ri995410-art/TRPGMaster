import type { GameEvent, GameEventType } from '@trpgmaster/shared';
import { BaseAgent } from './BaseAgent';
import type { AgentContext, AgentResponse } from '../core/AgentCoordinator';
import { AIGateway, type AIRequest } from '../ai/AIGateway';
import type { AgentAIConfig } from '../ai/AgentAIConfig';

const SYSTEM_PROMPT = `你是TRPGMaster的记忆压缩Agent。你的职责是将长时间跑团的事件历史压缩为简洁摘要。

压缩规则：
1. 关键时刻（战斗开始/结束、角色死亡、场景切换、派系变化）必须完整保留
2. 最近5分钟内的事件保留原文
3. 5-30分钟的事件压缩为简短摘要，保留关键决策和结果
4. 30分钟以上的事件只保留统计信息和重大转折点

输出格式（JSON）：
{
  "summary": "本轮压缩摘要",
  "keyDecisions": ["关键决策1", "关键决策2"],
  "statistics": {
    "combatCount": 0,
    "damageDealt": 0,
    "damageTaken": 0,
    "hopeUsed": 0,
    "fearUsed": 0
  }
}`;

const HANDLED_EVENTS: GameEventType[] = ['session:start'];

interface CompressionResult {
  summary: string;
  keyDecisions: string[];
  statistics: {
    combatCount: number;
    damageDealt: number;
    damageTaken: number;
    hopeUsed: number;
    fearUsed: number;
  };
}

export class MemoryCompressorAgent extends BaseAgent {
  private aiGateway: AIGateway | null = null;
  private compressionTimer: ReturnType<typeof setInterval> | null = null;
  private compressionInterval: number;
  private onCompress: ((result: CompressionResult) => void) | null = null;
  protected model: string;

  constructor(aiGateway?: AIGateway, intervalMs = 30 * 60 * 1000, agentAIConfig?: AgentAIConfig) {
    super({
      agentType: 'memoryCompressor',
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 2000,
      temperature: 0.3,
    });
    this.aiGateway = aiGateway || null;
    this.compressionInterval = intervalMs;
    this.model = agentAIConfig?.getConfig('memoryCompressor').model || 'nex-agi/Nex-N2-Pro';
  }

  setOnCompress(callback: (result: CompressionResult) => void): void {
    this.onCompress = callback;
  }

  async process(event: GameEvent, context: AgentContext): Promise<AgentResponse | null> {
    if (!HANDLED_EVENTS.includes(event.type)) return null;

    if (event.type === 'session:start') {
      this.startPeriodicCompression(context);
      return this.createResponse(JSON.stringify({ status: 'compression_started', interval: this.compressionInterval }));
    }

    return null;
  }

  async compressNow(events: GameEvent[], now = Date.now()): Promise<CompressionResult> {
    const { recent, medium, old } = this.categorizeEvents(events, now);

    const statistics = this.computeStatistics(events);

    if (this.aiGateway && (medium.length > 0 || old.length > 0)) {
      try {
        const prompt = this.buildCompressionPrompt(recent, medium, old, statistics);
        const aiContext = this.aiGateway.buildAgentContext(
          'memoryCompressor',
          {
            sessionId: 'compress',
            recentEvents: [],
            currentState: {},
          },
          200000,
        );

        const request: AIRequest = {
          model: this.model,
          messages: [
            ...aiContext.messages,
            { role: 'user', content: prompt },
          ],
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          agentType: 'memoryCompressor',
        };

        const response = await this.aiGateway.sendRequest(request);
        const parsed = JSON.parse(response.content) as CompressionResult;
        return { ...parsed, statistics };
      } catch {
        return this.fallbackCompress(events, statistics);
      }
    }

    return this.fallbackCompress(events, statistics);
  }

  stopCompression(): void {
    if (this.compressionTimer) {
      clearInterval(this.compressionTimer);
      this.compressionTimer = null;
    }
  }

  private startPeriodicCompression(context: AgentContext): void {
    this.stopCompression();
    this.compressionTimer = setInterval(() => {
      this.compressNow(context.recentEvents).then(result => {
        if (this.onCompress) {
          this.onCompress(result);
        }
      }).catch(err => {
        console.error('Memory compression error:', err);
      });
    }, this.compressionInterval);
  }

  private categorizeEvents(events: GameEvent[], now: number): {
    recent: GameEvent[];
    medium: GameEvent[];
    old: GameEvent[];
  } {
    const fiveMinAgo = now - 5 * 60 * 1000;
    const thirtyMinAgo = now - 30 * 60 * 1000;

    const recent = events.filter(e => e.timestamp >= fiveMinAgo);
    const medium = events.filter(e => e.timestamp >= thirtyMinAgo && e.timestamp < fiveMinAgo);
    const old = events.filter(e => e.timestamp < thirtyMinAgo);

    return { recent, medium, old };
  }

  private computeStatistics(events: GameEvent[]): CompressionResult['statistics'] {
    let combatCount = 0;
    let damageDealt = 0;
    let damageTaken = 0;
    let hopeUsed = 0;
    let fearUsed = 0;

    for (const event of events) {
      switch (event.type) {
        case 'combat:start':
          combatCount++;
          break;
        case 'combat:damage': {
          const dmg = event as GameEvent & { targetType?: string; amount?: number };
          if (dmg.targetType === 'enemy' && dmg.amount) damageDealt += dmg.amount;
          if (dmg.targetType === 'player' && dmg.amount) damageTaken += dmg.amount;
          break;
        }
        case 'player:useHope':
          hopeUsed++;
          break;
        case 'gm:useFear':
          fearUsed++;
          break;
      }
    }

    return { combatCount, damageDealt, damageTaken, hopeUsed, fearUsed };
  }

  private buildCompressionPrompt(
    recent: GameEvent[],
    medium: GameEvent[],
    old: GameEvent[],
    statistics: CompressionResult['statistics'],
  ): string {
    let prompt = '请压缩以下事件历史：\n\n';

    if (recent.length > 0) {
      prompt += `=== 最近5分钟（${recent.length}个事件，保留原文）===\n`;
      prompt += recent.map(e => `[${e.type}] ${e.source}`).join('\n');
      prompt += '\n\n';
    }

    if (medium.length > 0) {
      prompt += `=== 5-30分钟前（${medium.length}个事件，需压缩）===\n`;
      prompt += medium.map(e => `[${e.type}] ${e.source}`).join('\n');
      prompt += '\n\n';
    }

    if (old.length > 0) {
      prompt += `=== 30分钟以上（${old.length}个事件，只保留统计）===\n`;
      prompt += `战斗次数: ${statistics.combatCount}\n`;
      prompt += `造成伤害: ${statistics.damageDealt}\n`;
      prompt += `承受伤害: ${statistics.damageTaken}\n`;
      prompt += '\n';
    }

    return prompt;
  }

  private fallbackCompress(events: GameEvent[], statistics: CompressionResult['statistics']): CompressionResult {
    const keyDecisions = events
      .filter(e => this.isKeyMoment(e))
      .map(e => `[${e.type}] at ${new Date(e.timestamp).toLocaleTimeString('zh-CN')}`);

    return {
      summary: `压缩了${events.length}个事件。战斗${statistics.combatCount}次，造成${statistics.damageDealt}伤害，承受${statistics.damageTaken}伤害。`,
      keyDecisions,
      statistics,
    };
  }

  private isKeyMoment(event: GameEvent): boolean {
    const keyTypes: GameEventType[] = [
      'combat:start',
      'combat:end',
      'player:deathMove',
      'gm:sceneChange',
      'faction:relationChange',
      'campaign:corruptionChange',
      'campaign:milestone',
    ];
    return keyTypes.includes(event.type);
  }
}
