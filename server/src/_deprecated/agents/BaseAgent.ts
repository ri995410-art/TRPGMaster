import type { GameEvent, AgentType } from '@trpgmaster/shared';
import type { AgentContext, AgentResponse } from '../core/AgentCoordinator';

export interface AgentConfig {
  agentType: AgentType;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
}

export interface StreamChunk {
  agentType: AgentType;
  chunk: string;
  done: boolean;
}

export abstract class BaseAgent {
  readonly agentType: AgentType;
  protected systemPrompt: string;
  protected maxTokens: number;
  protected temperature: number;

  constructor(config: AgentConfig) {
    this.agentType = config.agentType;
    this.systemPrompt = config.systemPrompt;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;
  }

  abstract process(event: GameEvent, context: AgentContext): Promise<AgentResponse | null>;

  async processStream(
    _event: GameEvent,
    _context: AgentContext,
    _onChunk: (chunk: StreamChunk) => void,
  ): Promise<AgentResponse | null> {
    return this.process(_event, _context);
  }

  protected buildPrompt(event: GameEvent, context: AgentContext): string {
    const compressedEvents = this.compressRecentEvents(context.recentEvents);

    return [
      this.systemPrompt,
      '',
      '--- 当前状态 ---',
      `场景: ${context.state.currentScene.name}`,
      `GM恐惧点: ${context.state.fearPoints}`,
      `战斗中: ${context.state.activeCombat ? '是' : '否'}`,
      '',
      '--- 角色状态 ---',
      ...context.characters.map(c =>
        `${c.name}: HP ${c.hp}/${c.maxHp}, 压力 ${c.stress}/${c.maxStress}, 希望 ${c.hope}/${c.maxHope}`
      ),
      '',
      '--- 最近事件 ---',
      compressedEvents,
      '',
      '--- 触发事件 ---',
      `类型: ${event.type}`,
      `来源: ${event.source}`,
      JSON.stringify(event, null, 2),
    ].join('\n');
  }

  protected compressRecentEvents(events: GameEvent[], maxEvents = 20): string {
    if (events.length <= maxEvents) {
      return events.map(e => `[${e.type}] from ${e.source}`).join('\n');
    }
    const older = events.length - maxEvents;
    const recent = events.slice(-maxEvents);
    return `(更早的${older}个事件已压缩)\n` + recent.map(e => `[${e.type}] from ${e.source}`).join('\n');
  }

  protected formatJSONOutput(data: unknown): string {
    try {
      return JSON.stringify(data);
    } catch {
      return JSON.stringify({ error: '输出序列化失败', raw: String(data) });
    }
  }

  protected createResponse(output: string, events?: AgentResponse['events']): AgentResponse {
    return {
      agentType: this.agentType,
      output,
      events,
    };
  }
}
