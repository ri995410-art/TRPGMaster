import type { GameEvent, GameEventType } from '@trpgmaster/shared';
import { BaseAgent } from './BaseAgent';
import type { AgentContext, AgentResponse } from '../core/AgentCoordinator';
import { AIGateway, type AIRequest } from '../ai/AIGateway';
import type { AgentAIConfig } from '../ai/AgentAIConfig';

const SYSTEM_PROMPT = `你是TRPGMaster的场景氛围助手。你的职责是为GM提供场景节奏和氛围变化的备选建议，而非直接决定场景效果。GM会选择、修改或忽略你的建议。

核心原则：
1. 节奏把控：根据恐惧点数和事件密度调整场景紧张度
2. 环境叙事：场景本身也是一种"角色"，会对事件做出反应
3. 氛围一致性：维持黑暗奇幻的整体基调
4. 动态变化：场景不是静止的背景，而是活的
5. 提供选择：每次提供2个不同方向的备选建议

恐惧点节奏指南：
- 0-2点：平静探索期，适合角色互动和发现
- 3-5点：紧张升级期，环境开始出现异常
- 6-8点：高压危机期，每个行动都带有风险
- 9+点：极限状态，生存成为首要目标

每次提供2个不同方向的备选氛围建议，让GM选择。

输出格式（JSON）：
{
  "pacingSuggestions": [
    { "label": "加强紧张", "content": "环境效果描述A..." },
    { "label": "给予喘息", "content": "环境效果描述B..." }
  ],
  "tensionNote": "紧张度评估和建议"
}`;

const HANDLED_EVENTS: GameEventType[] = [
  'player:roll',
  'gm:useFear',
  'gm:enemyAction',
  'combat:start',
  'input:vision',
  'session:start',
];

export class SceneDirectorAgent extends BaseAgent {
  private aiGateway: AIGateway | null = null;
  protected model: string;

  constructor(aiGateway?: AIGateway, agentAIConfig?: AgentAIConfig) {
    super({
      agentType: 'sceneDirector',
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 1500,
      temperature: 0.6,
    });
    this.aiGateway = aiGateway ?? null;
    this.model = agentAIConfig?.getConfig('sceneDirector').model || 'nex-agi/Nex-N2-Pro';
  }

  async process(event: GameEvent, context: AgentContext): Promise<AgentResponse | null> {
    if (!HANDLED_EVENTS.includes(event.type)) return null;

    if (this.aiGateway) {
      try {
        return await this.processWithAI(event, context);
      } catch {
        // Fall through to fallback
      }
    }

    return this.createResponse(this.formatJSONOutput(this.generateFallbackResponse(event, context)));
  }

  private async processWithAI(event: GameEvent, context: AgentContext): Promise<AgentResponse> {
    const prompt = this.buildScenePrompt(event, context);

    const request: AIRequest = {
      model: this.model,
      messages: [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      agentType: 'sceneDirector',
    };

    const response = await this.aiGateway!.sendRequest(request);

    try {
      const parsed = JSON.parse(response.content);
      return this.createResponse(this.formatJSONOutput(parsed));
    } catch {
      return this.createResponse(response.content);
    }
  }

  private buildScenePrompt(event: GameEvent, context: AgentContext): string {
    const scene = context.state.currentScene;
    const fearPoints = context.state.fearPoints;
    const totalFearGained = context.state.totalFearGained;
    const totalFearSpent = context.state.totalFearSpent;
    const tensionScore = totalFearGained + totalFearSpent;
    const inCombat = !!context.state.activeCombat;

    let prompt = `当前场景：${scene.name}\n`;
    prompt += `环境：${scene.environment}\n`;
    prompt += `描述：${scene.description}\n`;
    prompt += `当前恐惧点：${fearPoints}\n`;
    prompt += `累计获得恐惧点：${totalFearGained}\n`;
    prompt += `累计消耗恐惧点：${totalFearSpent}\n`;
    prompt += `紧张度评分：${tensionScore}\n`;
    prompt += `战斗中：${inCombat ? '是' : '否'}\n`;
    prompt += `在场NPC：${scene.npcPresent.join(', ') || '无'}\n\n`;

    switch (event.type) {
      case 'player:roll':
        prompt += '玩家掷骰了。请提供场景氛围变化的备选建议，根据结果调整节奏。';
        break;
      case 'gm:useFear':
        prompt += 'GM消耗了恐惧点。请提供环境如何因恐惧点消耗而变化的备选建议。';
        break;
      case 'gm:enemyAction':
        prompt += '敌人采取了行动。请提供场景对此反应的备选氛围建议。';
        break;
      case 'combat:start':
        prompt += '战斗开始了。请提供战场初始环境的备选氛围建议。';
        break;
      case 'input:vision':
        prompt += '摄像头捕捉到了视觉信息。请提供场景中可能被注意到的细节的备选描述。';
        break;
      case 'session:start':
        prompt += '会话刚开始。请为初始场景提供环境效果和氛围的备选建议。';
        break;
    }

    return prompt;
  }

  private generateFallbackResponse(event: GameEvent, context: AgentContext): Record<string, unknown> {
    const totalFearGained = context.state.totalFearGained;
    const totalFearSpent = context.state.totalFearSpent;
    const tensionScore = totalFearGained + totalFearSpent;
    const scene = context.state.currentScene;

    switch (event.type) {
      case 'player:roll':
        return {
          pacingSuggestions: [
            { label: '加强紧张', content: `${scene.name}中，空气似乎凝固了一瞬，有什么东西在注视着你们...` },
            { label: '给予喘息', content: `${scene.name}暂时恢复了平静，你们有机会稍作调整。` },
          ],
          tensionNote: this.getTensionNote(tensionScore),
        };

      case 'gm:useFear':
        return {
          pacingSuggestions: [
            { label: '恐惧显现', content: `恐惧的力量涌入${scene.name}，紫色的迷雾变得更加浓厚，空气中弥漫着不安...` },
            { label: '暗影涌动', content: `${scene.name}中的阴影开始不安地蠕动，仿佛有什么即将从中走出...` },
          ],
          tensionNote: '恐惧点消耗增加了场景的危险感',
        };

      case 'gm:enemyAction':
        return {
          pacingSuggestions: [
            { label: '环境共鸣', content: `${scene.name}中的气氛骤然紧张，敌人的行动引发了环境的反应，碎石滚落...` },
            { label: '压抑氛围', content: `敌人的行动让${scene.name}变得更加压抑，空气变得更加沉重...` },
          ],
          tensionNote: this.getTensionNote(tensionScore),
        };

      case 'combat:start':
        return {
          pacingSuggestions: [
            { label: '战场混乱', content: `战斗在${scene.name}中爆发！周围的一切都变成了潜在的威胁，碎石飞溅...` },
            { label: '紧张对峙', content: `${scene.name}中，双方对峙的紧张感达到了顶点，一触即发...` },
          ],
          tensionNote: '战斗开始，紧张度上升',
        };

      case 'input:vision':
        return {
          pacingSuggestions: [
            { label: '细节发现', content: `在${scene.name}中，你注意到一些细节：${scene.description}，似乎有什么不对劲...` },
            { label: '环境观察', content: `你仔细观察${scene.name}，发现了一些之前忽略的细节...` },
          ],
          tensionNote: this.getTensionNote(tensionScore),
        };

      case 'session:start':
        return {
          pacingSuggestions: [
            { label: '氛围渲染', content: `你踏入了${scene.name}，${scene.environment}的气息扑面而来，${scene.description}` },
            { label: '悬念铺垫', content: `${scene.name}的入口处，一道微弱的光从深处闪烁，你注意到墙壁上有新鲜的痕迹...` },
          ],
          tensionNote: '会话开始，初始氛围设置',
        };

      default:
        return {
          pacingSuggestions: [
            { label: '场景推进', content: `${scene.name}中，时间缓缓流逝，世界在你们周围运转...` },
            { label: '环境变化', content: `${scene.name}的环境发生了微妙的变化，似乎有什么即将发生...` },
          ],
          tensionNote: this.getTensionNote(tensionScore),
        };
    }
  }

  private getTensionNote(tensionScore: number): string {
    if (tensionScore >= 9) return '极限状态！每个行动都可能致命';
    if (tensionScore >= 6) return '高压期，维持紧张感但不要过度施压';
    if (tensionScore >= 3) return '紧张升级中，可以引入环境威胁';
    return '平静期，适合角色互动和探索';
  }
}