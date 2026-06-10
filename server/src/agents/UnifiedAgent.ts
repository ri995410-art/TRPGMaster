import type { GameEvent, GameEventType } from '@trpgmaster/shared';
import { BaseAgent } from './BaseAgent';
import type { AgentContext, AgentResponse } from '../core/AgentCoordinator';
import { AIGateway, type AIRequest } from '../ai/AIGateway';
import type { AgentAIConfig } from '../ai/AgentAIConfig';

const SYSTEM_PROMPT = `你是TRPGMaster的统一GM助手。你同时具备叙事、NPC扮演、战斗裁决和规则判定的能力，根据当前上下文自主判断需要哪种响应。

核心原则：
1. 辅助GM而非替代GM：提供备选建议，GM做最终决定
2. 上下文感知：根据当前场景、角色状态和最近事件判断响应类型
3. 不重复响应：如果已有其他Agent（如规则Agent、场景导演）处理了同一事件，你不需要再处理
4. 一次只做一件事：不要同时既叙事又扮演NPC又裁决战斗，选择最需要的那个

响应策略：
- 玩家自我介绍/描述角色 → 简短回应，认可角色并融入场景
- 玩家与NPC对话 → 以NPC身份回应
- 玩家描述行动（非战斗）→ 叙事描述行动结果
- 战斗相关行动 → 提供敌人应对备选
- 场景探索/互动 → 环境描述和互动结果
- GM叙述请求 → 场景氛围描述

匕首之心核心规则：
- 二元骰系统：2d12(希望骰+恐惧骰)
- 关键成功：两骰相同 → 自动成功+1希望+清除1压力+额外伤害
- 希望成功：希望>恐惧且≥难度 → 成功+1希望
- 恐惧成功：恐惧>希望且≥难度 → 成功有代价+GM+1恐惧
- 难度参考：5=非常简单, 10=简单, 15=普通, 20=困难, 25=非常困难
- 优势/劣势d6：净优势+1d6，净劣势-1d6，互相抵消
- 反应掷骰：二元d12但不产生Hope/Fear
- 伤害阈值：轻度1HP/重度2HP/严重3HP/巨额4HP
- 护甲槽：标记1槽降低一级伤害
- 压力满→溢出HP→自动脆弱
- 抗性减半，免疫归零
- 死亡修正：光荣就义/回避死亡/孤注一掷

每次提供2-3个不同方向的备选建议，让GM选择。

输出格式（JSON）：
{
  "responseType": "narrative|npc_dialogue|combat|scene|ruling",
  "options": [
    { "label": "选项标签", "content": "具体的响应内容..." }
  ],
  "mood": "氛围关键词（可选）",
  "internalNote": "GM参考信息（可选，仅GM可见）"
}

风格：黑暗奇幻、德拉肯海姆废墟探索、派系冲突`;

const HANDLED_EVENTS: GameEventType[] = [
  'player:action',
  'player:dialogue',
  'combat:start',
  'combat:attack',
  'gm:sceneChange',
  'gm:narrate',
];

export class UnifiedAgent extends BaseAgent {
  private aiGateway: AIGateway | null = null;
  protected model: string;

  constructor(aiGateway?: AIGateway, agentAIConfig?: AgentAIConfig) {
    super({
      agentType: 'unified',
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 3000,
      temperature: 0.7,
    });
    this.aiGateway = aiGateway || null;
    this.model = agentAIConfig?.getConfig('unified').model || 'nex-agi/Nex-N2-Pro';
  }

  async process(event: GameEvent, context: AgentContext): Promise<AgentResponse | null> {
    if (!HANDLED_EVENTS.includes(event.type)) return null;

    const prompt = this.buildUnifiedPrompt(event, context);

    if (this.aiGateway) {
      try {
        const aiContext = this.aiGateway.buildAgentContext(
          'unified',
          {
            sessionId: context.sessionId,
            recentEvents: context.recentEvents.map(e => ({
              type: e.type,
              summary: this.summarizeEvent(e),
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
          agentType: 'unified',
        };

        const response = await this.aiGateway.sendRequest(request);
        return this.createResponse(response.content);
      } catch (error) {
        return this.createResponse(this.generateFallbackResponse(event, context));
      }
    }

    return this.createResponse(this.generateFallbackResponse(event, context));
  }

  private summarizeEvent(event: GameEvent): string {
    const e = event as GameEvent & Record<string, unknown>;
    switch (event.type) {
      case 'player:action': return `玩家行动：${e.action || ''}`;
      case 'player:dialogue': return `玩家对话：${e.dialogue || ''}`;
      case 'gm:narrate': return `GM叙述：${e.description || ''}`;
      case 'gm:sceneChange': return `场景切换：${e.sceneName || ''}`;
      case 'combat:start': return '战斗开始';
      case 'combat:attack': return `攻击：${e.attackerId || ''} → ${e.targetId || ''}`;
      default: return `[${event.type}]`;
    }
  }

  private buildUnifiedPrompt(event: GameEvent, context: AgentContext): string {
    const scene = context.state.currentScene;
    const characters = context.characters;
    const fearPoints = context.state.fearPoints;
    const inCombat = !!context.state.activeCombat;

    let prompt = `当前场景：${scene.name}\n`;
    prompt += `环境：${scene.environment}\n`;
    prompt += `GM恐惧点：${fearPoints}\n`;
    prompt += `战斗中：${inCombat ? '是' : '否'}\n\n`;

    // Character info
    if (characters.length > 0) {
      prompt += `在场角色：\n`;
      for (const char of characters) {
        prompt += `- ${char.name}（${char.classId}）：HP ${char.hp}/${char.maxHp}，压力 ${char.stress}/${char.maxStress}\n`;
      }
      prompt += '\n';
    }

    // Recent events for context
    const recentEvents = context.recentEvents.slice(-6);
    if (recentEvents.length > 0) {
      prompt += `最近的剧情事件：\n`;
      for (const ev of recentEvents) {
        prompt += `- ${this.summarizeEvent(ev)}\n`;
      }
      prompt += '\n';
    }

    // Event-specific prompt
    const e = event as GameEvent & Record<string, unknown>;
    switch (event.type) {
      case 'player:action':
        prompt += `玩家行动：${e.action || ''}\n`;
        prompt += `请根据这个行动提供响应建议。如果是角色介绍，给予简短的场景接纳；如果是探索行动，描述互动结果；如果是战斗行动，提供敌人应对。`;
        break;
      case 'player:dialogue':
        prompt += `玩家对话：${e.dialogue || ''}\n`;
        prompt += `请以NPC身份提供回应选项。如果场景中没有明确NPC，可以以环境反应或旁白方式回应。`;
        break;
      case 'gm:sceneChange':
        prompt += 'GM切换了场景。请描述新场景的氛围、环境和角色们的初印象。';
        break;
      case 'gm:narrate':
        prompt += 'GM正在叙述。请补充场景细节或提供后续发展建议。';
        break;
      case 'combat:start':
        prompt += '战斗开始了。请描述战斗开场并提供敌人首轮行动的备选建议。';
        break;
      case 'combat:attack':
        prompt += `攻击事件：${e.attackerId || ''} 攻击 ${e.targetId || ''}\n`;
        prompt += '请提供敌人应对的备选行动。';
        break;
      default:
        prompt += '请根据当前上下文提供合适的响应建议。';
    }

    return prompt;
  }

  private generateFallbackResponse(event: GameEvent, context: AgentContext): string {
    const scene = context.state.currentScene.name;

    switch (event.type) {
      case 'player:action': {
        const e = event as GameEvent & Record<string, unknown>;
        return JSON.stringify({
          responseType: 'narrative',
          options: [
            { label: '场景反应', content: `在${scene}中，你的行动引起了周围环境的微妙变化...` },
            { label: '角色互动', content: `同伴们注意到了你的举动，交换了一下眼神...` },
            { label: '意外发现', content: `你的行动揭示了一些之前未被注意到的细节...` },
          ],
        });
      }
      case 'player:dialogue': {
        const e = event as GameEvent & Record<string, unknown>;
        return JSON.stringify({
          responseType: 'npc_dialogue',
          options: [
            { label: '友好回应', content: `一个声音从阴影中传来："有意思..."` },
            { label: '谨慎回应', content: `周围安静了片刻，然后有人低声回应...` },
            { label: '神秘暗示', content: `空气中似乎有什么东西对你的话语产生了反应...` },
          ],
        });
      }
      case 'combat:start':
        return JSON.stringify({
          responseType: 'combat',
          options: [
            { label: '凶猛进攻', content: `敌人发出怒吼，朝你们冲来！` },
            { label: '战术包围', content: `敌人分散开来，试图包围你们...` },
            { label: '威慑展示', content: `领头的敌人展示了它的力量，试图震慑你们...` },
          ],
        });
      default:
        return JSON.stringify({
          responseType: 'scene',
          options: [
            { label: '场景推进', content: `${scene}中，故事继续发展...` },
            { label: '环境变化', content: `${scene}的环境发生了微妙的变化...` },
          ],
        });
    }
  }
}
