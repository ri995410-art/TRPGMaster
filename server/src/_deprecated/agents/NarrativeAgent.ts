import type { GameEvent, GameEventType } from '@trpgmaster/shared';
import { BaseAgent } from './BaseAgent';
import type { AgentContext, AgentResponse } from '../core/AgentCoordinator';
import { AIGateway, type AIRequest } from '../ai/AIGateway';
import type { AgentAIConfig } from '../ai/AgentAIConfig';

const SYSTEM_PROMPT = `你是TRPGMaster的叙事助手。你的职责是为GM提供场景描述的备选建议，而非直接决定场景内容。GM会选择、修改或忽略你的建议。

核心原则：
1. 虚构优先：叙事驱动机制，先描述后判定
2. 展示而非讲述：用感官细节和行动来展现世界
3. 失败推进故事：失败不是"无事发生"，而是新的复杂情况
4. 让玩家成为英雄：描述他们的行动如何影响世界
5. 提供多样性：每个建议应该有不同的侧重点和氛围

每次提供3个不同风格的备选建议，让GM选择最合适的一个。

输出格式（JSON）：
{
  "options": [
    { "label": "氛围渲染", "content": "侧重环境氛围的场景描述..." },
    { "label": "角色聚焦", "content": "侧重角色感受和互动的描述..." },
    { "label": "悬念铺垫", "content": "带暗示和伏笔的描述..." }
  ],
  "mood": "氛围关键词",
  "pacingNote": "节奏建议"
}

风格：黑暗奇幻、废墟探索、派系冲突，保持中文文学性但避免过度修饰`;

const HANDLED_EVENTS: GameEventType[] = [
  'player:action',
  'gm:sceneChange',
  'gm:narrate',
  'scene:transition',
  'input:vision',
  'combat:end',
];

export class NarrativeAgent extends BaseAgent {
  private aiGateway: AIGateway | null = null;
  protected model: string;

  constructor(aiGateway?: AIGateway, agentAIConfig?: AgentAIConfig) {
    super({
      agentType: 'narrative',
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 3000,
      temperature: 0.8, // Higher temperature for creative narrative
    });
    this.aiGateway = aiGateway || null;
    this.model = agentAIConfig?.getConfig('narrative').model || 'nex-agi/Nex-N2-Pro';
  }

  async process(event: GameEvent, context: AgentContext): Promise<AgentResponse | null> {
    if (!HANDLED_EVENTS.includes(event.type)) return null;

    const prompt = this.buildNarrativePrompt(event, context);

    if (this.aiGateway) {
      try {
        const aiContext = this.aiGateway.buildAgentContext(
          'narrative',
          {
            sessionId: context.sessionId,
            recentEvents: context.recentEvents.map(e => ({
              type: e.type,
              summary: `[${e.type}]`,
              timestamp: e.timestamp,
            })),
            currentState: context.state as unknown as Record<string, unknown>,
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
          agentType: 'narrative',
        };

        const response = await this.aiGateway.sendRequest(request);
        return this.createResponse(response.content);
      } catch (error) {
        // Fallback to template-based response
        return this.createResponse(this.generateFallbackResponse(event, context));
      }
    }

    // No AI gateway: generate template-based response
    return this.createResponse(this.generateFallbackResponse(event, context));
  }

  private buildNarrativePrompt(event: GameEvent, context: AgentContext): string {
    const sceneName = context.state.currentScene.name;
    const fearPoints = context.state.fearPoints;
    const inCombat = !!context.state.activeCombat;

    let prompt = `当前场景：${sceneName}\n`;
    prompt += `GM恐惧点：${fearPoints}\n`;
    prompt += `战斗中：${inCombat ? '是' : '否'}\n\n`;

    switch (event.type) {
      case 'gm:sceneChange':
        prompt += 'GM切换了场景。请描述新场景的氛围、环境和可能的事件。';
        break;
      case 'player:action':
        prompt += '玩家执行了一个行动。请描述行动的结果和对场景的影响。';
        break;
      case 'scene:transition':
        prompt += '场景正在过渡。请描述过渡过程和新场景的开场。';
        break;
      case 'combat:end':
        prompt += '战斗结束了。请描述战斗后的场景、角色的状态和接下来的可能行动。';
        break;
      case 'input:vision':
        prompt += '摄像头捕捉到了新的视觉信息。请根据当前场景描述你看到的内容。';
        break;
      default:
        prompt += '请继续推进当前场景的叙事。';
    }

    return prompt;
  }

  private generateFallbackResponse(event: GameEvent, context: AgentContext): string {
    const scene = context.state.currentScene.name;

    switch (event.type) {
      case 'gm:sceneChange':
        return JSON.stringify({
          options: [
            { label: '氛围渲染', content: `场景切换至${scene}。紫色的迷雾从破碎的窗户中涌入，空气中弥漫着腐朽的气息...` },
            { label: '角色聚焦', content: `你们踏入了${scene}。脚下碎石发出咯吱声响，同伴们警惕地环顾四周...` },
            { label: '悬念铺垫', content: `${scene}的入口处，一道微弱的紫光从深处闪烁。你注意到墙壁上有新鲜的抓痕...` },
          ],
          mood: '紧张',
          pacingNote: '维持',
        });

      case 'player:action':
        return JSON.stringify({
          options: [
            { label: '积极回应', content: `在${scene}中，你的行动产生了强烈的回响。周围的环境随之发生变化...` },
            { label: '谨慎推进', content: `你的行动引起了微妙的反应。有什么东西在暗处注视着你们...` },
            { label: '意外转折', content: `行动的结果出乎意料。原本看似简单的事情，现在变得复杂起来...` },
          ],
          mood: '紧张',
          pacingNote: '加速',
        });

      case 'combat:end':
        return JSON.stringify({
          options: [
            { label: '喘息时刻', content: `战斗的余波在${scene}中渐渐平息。你们喘息着检查彼此的伤势...` },
            { label: '发现线索', content: `硝烟散去，你们发现敌人身上带着一封密信，上面有奇怪的印章...` },
            { label: '新的威胁', content: `战斗虽然结束，但你注意到远处还有更多阴影在移动...` },
          ],
          mood: '疲惫但警觉',
          pacingNote: '放缓',
        });

      default:
        return JSON.stringify({
          options: [
            { label: '场景推进', content: `${scene}中，故事继续。时间流逝，世界在你们周围缓缓运转...` },
            { label: '环境变化', content: `${scene}的环境发生了微妙的变化，似乎有什么即将发生...` },
            { label: 'NPC出现', content: `一个身影从${scene}的阴影中走出，目光审视着你们...` },
          ],
          mood: '平静',
          pacingNote: '维持',
        });
    }
  }
}