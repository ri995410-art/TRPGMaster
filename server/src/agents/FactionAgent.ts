import type { GameEvent, GameEventType } from '@trpgmaster/shared';
import { BaseAgent } from './BaseAgent';
import type { AgentContext, AgentResponse } from '../core/AgentCoordinator';
import { AIGateway, type AIRequest } from '../ai/AIGateway';
import type { AgentAIConfig } from '../ai/AgentAIConfig';

const SYSTEM_PROMPT = `你是TRPGMaster的派系管理Agent。你负责追踪和管理游戏中的派系关系和政治动态。

核心原则：
1. 派系有自身利益：每个派系有自己的目标和行动逻辑
2. 行动有后果：玩家的行为会影响与所有派系的关系
3. 信息流通：派系会知道玩家做了什么，并做出反应
4. 政治张力：派系之间的冲突是故事的重要推动力

德拉肯海姆五大派系：
1. 覆影明灯(hooded-lanterns)：收复城市的军队残余，务实但疲惫
2. 女王的弟兄们(queens-men)：盗贼联盟，利用混乱积累力量
3. 白银骑士团(silver-order)：狂热净化者，与一切超自然邪恶为敌
4. 天火信众(falling-fire)：宗教异端，视妄质为救赎之路
5. 紫晶学院(amethyst-academy)：魔法学者，研究妄质的魔法潜能

关系等级(1-8)：
1-2：敌对（会主动攻击）
3-4：不信任（需要证明诚意）
5-6：友好（愿意合作）
7-8：盟友（提供关键援助）

派系反应指南：
当玩家采取行动时，思考：
- 谁会知道这件事？
- 这对各派系有什么影响？
- 哪个派系会采取行动？
- 行动的时间点是什么？

输出格式（JSON）：
{
  "affectedFactions": [
    {
      "factionId": "派系ID",
      "relationChange": 0,
      "newRelation": 0,
      "reason": "变化原因"
    }
  ],
  "factionActions": [
    {
      "factionId": "派系ID",
      "action": "派系采取的行动",
      "consequence": "后果描述"
    }
  ],
  "politicalTension": "当前政治紧张度描述"
}`;

const HANDLED_EVENTS: GameEventType[] = [
  'faction:relationChange',
  'player:action',
  'gm:award',
  'player:rest',
  'session:resume',
];

// Faction keywords that might trigger faction reactions
const FACTION_KEYWORDS = {
  'hooded-lanterns': ['覆影明灯', '军队', '收复', '巡逻', '情报', '佩特拉'],
  'queens-men': ['盗贼女王', '弟兄们', '盗贼', '走私', '偷窃', '地下'],
  'silver-order': ['白银骑士', '净化', '神圣', '邪恶', '超自然', '马歇尔'],
  'falling-fire': ['天火', '信众', '救赎', '妄质', '仪式', '卢克蕾蒂亚'],
  'amethyst-academy': ['紫晶', '学院', '魔法', '研究', '瑞薇', '符文'],
};

export class FactionAgent extends BaseAgent {
  private aiGateway: AIGateway | null = null;
  protected model: string;

  constructor(aiGateway?: AIGateway, agentAIConfig?: AgentAIConfig) {
    super({
      agentType: 'faction',
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 1500,
      temperature: 0.5, // Lower temperature for consistent faction tracking
    });
    this.aiGateway = aiGateway || null;
    this.model = agentAIConfig?.getConfig('faction').model || 'nex-agi/Nex-N2-Pro';
  }

  async process(event: GameEvent, context: AgentContext): Promise<AgentResponse | null> {
    if (!HANDLED_EVENTS.includes(event.type)) return null;

    const prompt = this.buildFactionPrompt(event, context);

    if (this.aiGateway) {
      try {
        const aiContext = this.aiGateway.buildAgentContext(
          'faction',
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
          agentType: 'faction',
        };

        const response = await this.aiGateway.sendRequest(request);
        return this.createResponse(response.content);
      } catch {
        return this.createResponse(this.generateFallbackResponse(event, context));
      }
    }

    return this.createResponse(this.generateFallbackResponse(event, context));
  }

  private buildFactionPrompt(event: GameEvent, context: AgentContext): string {
    // Get current faction relations
    const factionRelations = context.characters.reduce((map, char) => {
      return { ...map, ...char.factionRelations };
    }, {} as Record<string, number>);

    let prompt = `当前派系关系：\n`;
    for (const [faction, relation] of Object.entries(factionRelations)) {
      prompt += `- ${faction}: ${relation}/8\n`;
    }
    prompt += `\n`;

    switch (event.type) {
      case 'faction:relationChange':
        prompt += '派系关系发生了变化。请分析这个变化对各派系的影响，以及可能引发的连锁反应。';
        break;
      case 'player:action':
        prompt += '玩家执行了一个行动。请分析这个行动可能对哪些派系产生影响，以及这些派系的可能反应。';
        // Try to detect faction-relevant actions
        const actionStr = JSON.stringify(event);
        for (const [faction, keywords] of Object.entries(FACTION_KEYWORDS)) {
          if (keywords.some(kw => actionStr.includes(kw))) {
            prompt += `\n注意：这个行动可能涉及${faction}派系。`;
          }
        }
        break;
      case 'gm:award':
        prompt += 'GM给予了奖励。请分析这个奖励对派系关系的可能影响。';
        break;
      case 'player:rest':
        prompt += '玩家进行了休整。在休整期间，各派系可能采取行动推进他们的目标。请描述这些行动。';
        break;
      case 'session:resume':
        prompt += '会话恢复了。请总结在暂停期间各派系的动态和变化。';
        break;
    }

    return prompt;
  }

  private generateFallbackResponse(event: GameEvent, context: AgentContext): string {
    switch (event.type) {
      case 'faction:relationChange':
        return JSON.stringify({
          affectedFactions: [{
            factionId: 'unknown',
            relationChange: 0,
            newRelation: 0,
            reason: '需要更具体的信息来计算关系变化',
          }],
          factionActions: [],
          politicalTension: '各派系正在密切关注局势发展',
        });

      case 'player:action':
        return JSON.stringify({
          affectedFactions: [],
          factionActions: [{
            factionId: 'hooded-lanterns',
            action: '覆影明灯的侦察兵注意到了你们的行动',
            consequence: '他们可能在未来主动接触你们',
          }],
          politicalTension: '废墟中的势力平衡微妙地变化着',
        });

      case 'player:rest':
        return JSON.stringify({
          affectedFactions: [],
          factionActions: [
            {
              factionId: 'queens-men',
              action: '盗贼女王的人在暗中活动',
              consequence: '走私路线可能发生了变化',
            },
            {
              factionId: 'silver-order',
              action: '白银骑士团加强了巡逻',
              consequence: '某些区域的危险程度可能增加',
            },
          ],
          politicalTension: '休整期间，各派系都没有闲着',
        });

      default:
        return JSON.stringify({
          affectedFactions: [],
          factionActions: [],
          politicalTension: '暂时平静，但暗流涌动',
        });
    }
  }
}