import type { GameEvent, GameEventType } from '@trpgmaster/shared';
import { BaseAgent } from './BaseAgent';
import type { AgentContext, AgentResponse } from '../core/AgentCoordinator';
import { AIGateway, type AIRequest } from '../ai/AIGateway';
import type { AgentAIConfig } from '../ai/AgentAIConfig';

const SYSTEM_PROMPT = `你是TRPGMaster的NPC对话助手。你的职责是为GM提供NPC回应的备选选项，而非直接扮演NPC。GM会选择最合适的回应。

核心原则：
1. 角色一致性：每个NPC有独特的性格、动机和说话方式
2. 有自己的目标：NPC不是被动的信息提供者，他们有自己的议程
3. 动态关系：NPC对玩家的态度会根据互动改变
4. 多维度：即使是敌人也可以有令人同情的一面

每次提供3个不同语气的备选对话选项，让GM选择。

德拉肯海姆关键NPC：
- 瑞薇：紫晶学院研究员，对妄质既恐惧又着迷
- 佩特拉·朗：覆影明灯情报官，寻找被俘弟弟
- 西奥多·马歇尔：白银骑士团团长，狂热但正义
- 盗贼女王：神秘莫测的地下世界统治者
- 卢克蕾蒂亚：天火信众领袖，宗教狂热但内心挣扎

社交冲突机制：
- NPC有压力槽（通常4-6个）
- 成功的社交行动：标记1压力
- 填满压力槽：说服成功
- 失败或冒犯：推进倒计时

输出格式（JSON）：
{
  "npcName": "NPC名称",
  "dialogueOptions": [
    { "label": "友好", "content": "NPC友好的回应台词..." },
    { "label": "谨慎", "content": "NPC谨慎的回应台词..." },
    { "label": "敌意", "content": "NPC敌意的回应台词..." }
  ],
  "internalThought": "NPC的内心想法（仅GM可见）",
  "pressureNote": "社交压力槽状态"
}`;

const HANDLED_EVENTS: GameEventType[] = [
  'player:dialogue',
  'player:action',
  'gm:narrate',
];

export class NPCAgent extends BaseAgent {
  private aiGateway: AIGateway | null = null;
  protected model: string;

  constructor(aiGateway?: AIGateway, agentAIConfig?: AgentAIConfig) {
    super({
      agentType: 'npc',
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 2000,
      temperature: 0.75,
    });
    this.aiGateway = aiGateway || null;
    this.model = agentAIConfig?.getConfig('npc').model || 'nex-agi/Nex-N2-Pro';
  }

  async process(event: GameEvent, context: AgentContext): Promise<AgentResponse | null> {
    if (!HANDLED_EVENTS.includes(event.type)) return null;

    const prompt = this.buildNPCPrompt(event, context);

    if (this.aiGateway) {
      try {
        const aiContext = this.aiGateway.buildAgentContext(
          'npc',
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
          agentType: 'npc',
        };

        const response = await this.aiGateway.sendRequest(request);
        return this.createResponse(response.content);
      } catch {
        return this.createResponse(this.generateFallbackResponse(event, context));
      }
    }

    return this.createResponse(this.generateFallbackResponse(event, context));
  }

  private buildNPCPrompt(event: GameEvent, context: AgentContext): string {
    const npcsPresent = context.state.currentScene.npcPresent;
    let prompt = `当前场景NPC：${npcsPresent.length > 0 ? npcsPresent.join(', ') : '无特定NPC'}\n\n`;

    switch (event.type) {
      case 'player:dialogue':
        prompt += '玩家正在与NPC对话。请以NPC的身份回应，保持角色一致性。';
        break;
      case 'player:action':
        prompt += '玩家执行了一个行动，NPC可能对此有反应。请描述NPC的反应。';
        break;
      case 'gm:narrate':
        prompt += 'GM正在叙述场景。请补充NPC在此场景中的行为和对话。';
        break;
    }

    return prompt;
  }

  private generateFallbackResponse(event: GameEvent, context: AgentContext): string {
    const npcsPresent = context.state.currentScene.npcPresent;
    const npcName = npcsPresent.length > 0 ? npcsPresent[0] : '陌生人';

    return JSON.stringify({
      npcName,
      dialogueOptions: [
        { label: '友好', content: '嗯，你们看起来不像本地人。有什么我能帮忙的吗？' },
        { label: '谨慎', content: '...你们是谁？在这里做什么？' },
        { label: '敌意', content: '我不和陌生人说话。走开。' },
      ],
      internalThought: '这些人值得关注...不知道他们是什么来头。',
      pressureNote: '压力槽: 0/4',
    });
  }
}