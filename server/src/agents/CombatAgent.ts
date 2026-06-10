import type { GameEvent, GameEventType } from '@trpgmaster/shared';
import { BaseAgent } from './BaseAgent';
import type { AgentContext, AgentResponse } from '../core/AgentCoordinator';
import { AIGateway, type AIRequest } from '../ai/AIGateway';
import type { AgentAIConfig } from '../ai/AgentAIConfig';

const SYSTEM_PROMPT = `你是TRPGMaster的战斗助手。你的职责是为GM提供敌人行动的备选选项，而非直接决定敌人行动。GM会选择最合适的行动。

核心原则：
1. 流畅战斗：自由流动回合制，无固定先攻
2. 动态威胁：敌人行动应对玩家行为
3. 恐惧点管理：合理使用GM恐惧点增强战斗紧张感
4. 战术多样：不同敌人有不同的战斗风格
5. 提供选择：每次提供3个不同战术方向的备选行动

战斗流程：
1. 玩家行动 → 判定(二元骰) → 结果描述
2. 恐惧结果/失败/恐惧点消耗 → GM行动轮
3. GM行动：从备选中选择敌人行动
4. 回合传递给下一位玩家

DaggerHeart伤害系统：
- 伤害与阈值对比确定等级：轻度(1HP) / 重度(2HP) / 严重(3HP) / 巨额(4HP)
- 护甲槽：标记1槽降低一级伤害（每次伤害最多1槽）
- 压力满→溢出标记HP→自动获得"脆弱"状态
- 抗性：伤害减半；免疫：伤害归零

敌人类型：
- 爪牙(minion)：批量管理，低HP，简单攻击
- 精英(elite)：单独行动，特殊能力，多HP
- Boss：多阶段，恐惧特性，独特机制

GM恐惧点使用(1点)：
- 打断玩家执行GM行动
- 执行额外GM行动
- 聚焦额外敌人
- 使用敌人恐惧特性
- 使用环境恐惧特性

死亡修正（玩家HP=0时选择）：
- 光荣就义：接受死亡，执行最后一次关键成功行动
- 回避死亡：投希望骰，≤等级→获伤痕+恢复1HP
- 孤注一掷：投二元骰，关键成功→满血；恐惧≥希望→角色死亡

休整恐惧代价：
- 短休：GM获1d4恐惧
- 长休：GM获1d4+玩家数恐惧

每次提供3个不同战术方向的备选行动，让GM选择。

输出格式（JSON）：
{
  "enemyOptions": [
    { "label": "攻击最弱者", "content": "行动描述...", "effect": "规则效果", "fearCost": 0 },
    { "label": "特殊能力", "content": "行动描述...", "effect": "规则效果", "fearCost": 1 },
    { "label": "环境互动", "content": "行动描述...", "effect": "规则效果", "fearCost": 0 }
  ],
  "nextIntentPreview": "敌人下一步意图（仅GM可见）"
}`;

const HANDLED_EVENTS: GameEventType[] = [
  'combat:start',
  'combat:attack',
  'combat:damage',
  'gm:useFear',
  'gm:enemyAction',
  'player:deathMove',
];

export class CombatAgent extends BaseAgent {
  private aiGateway: AIGateway | null = null;
  protected model: string;

  constructor(aiGateway?: AIGateway, agentAIConfig?: AgentAIConfig) {
    super({
      agentType: 'combat',
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 2000,
      temperature: 0.6, // Moderate temperature for tactical but varied decisions
    });
    this.aiGateway = aiGateway || null;
    this.model = agentAIConfig?.getConfig('combat').model || 'nex-agi/Nex-N2-Pro';
  }

  async process(event: GameEvent, context: AgentContext): Promise<AgentResponse | null> {
    if (!HANDLED_EVENTS.includes(event.type)) return null;

    const prompt = this.buildCombatPrompt(event, context);

    if (this.aiGateway) {
      try {
        const aiContext = this.aiGateway.buildAgentContext(
          'combat',
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
          agentType: 'combat',
        };

        const response = await this.aiGateway.sendRequest(request);
        return this.createResponse(response.content);
      } catch {
        return this.createResponse(this.generateFallbackResponse(event, context));
      }
    }

    return this.createResponse(this.generateFallbackResponse(event, context));
  }

  private buildCombatPrompt(event: GameEvent, context: AgentContext): string {
    const combat = context.state.activeCombat;
    const fearPoints = context.state.fearPoints;

    let prompt = '';

    if (combat) {
      prompt += `战斗进行中 - 第${combat.round}轮\n`;
      prompt += `存活敌人：${combat.enemies.map(e => `${e.name}(HP:${e.currentHp}/${e.maxHp})`).join(', ')}\n`;
      prompt += `GM恐惧点：${fearPoints}\n\n`;
    }

    switch (event.type) {
      case 'combat:start':
        prompt += '战斗刚刚开始。请提供敌人初始行动的备选建议，包括不同战术方向。';
        break;
      case 'gm:useFear':
        prompt += 'GM消耗了恐惧点。请提供敌人如何利用这个机会的备选行动。';
        break;
      case 'player:deathMove':
        prompt += '有玩家可能要倒下了！请提供敌人逼近的备选行动，营造紧迫感。';
        break;
      case 'combat:attack':
        prompt += '一次攻击发生了。请提供敌人对此反应的备选行动。';
        break;
      case 'combat:damage':
        prompt += '有人受到了伤害。请提供敌人下一步行动的备选建议。';
        break;
      case 'gm:enemyAction':
        prompt += '轮到敌人行动了。请提供敌人行动的备选建议，包括不同战术方向。';
        break;
    }

    return prompt;
  }

  private generateFallbackResponse(event: GameEvent, context: AgentContext): string {
    const combat = context.state.activeCombat;
    const fearPoints = context.state.fearPoints;
    const enemyName = combat && combat.enemies.length > 0 ? combat.enemies[0].name : '敌人';

    switch (event.type) {
      case 'combat:start':
        return JSON.stringify({
          enemyOptions: [
            { label: '正面冲锋', content: `${enemyName}发出战吼，正面冲向队伍！`, effect: '敌人发起近战攻击', fearCost: 0 },
            { label: '包抄侧翼', content: `${enemyName}绕向你们的侧翼，试图形成包围。`, effect: '敌人移动到侧翼位置', fearCost: 0 },
            { label: '威吓压制', content: `${enemyName}展现出惊人的气势，试图震慑你们！`, effect: '对全场进行威吓判定', fearCost: 1 },
          ],
          nextIntentPreview: '最近的敌人将发起攻击',
        });

      case 'gm:useFear':
        if (fearPoints > 0 && combat && combat.enemies.length > 0) {
          return JSON.stringify({
            enemyOptions: [
              { label: '趁虚而入', content: `${enemyName}抓住了你们的破绽，猛然冲了过来！`, effect: '消耗1恐惧点，敌人执行额外攻击', fearCost: 1 },
              { label: '恐惧特性', content: `${enemyName}释放出恐怖的力量，紫色的能量从体内涌出！`, effect: '消耗1恐惧点，使用恐惧特性', fearCost: 1 },
              { label: '聚焦锁定', content: `${enemyName}的目光锁定在一名角色身上，发起了精准攻击。`, effect: '消耗1恐惧点，聚焦攻击', fearCost: 1 },
            ],
            nextIntentPreview: '持续施压',
          });
        }
        return JSON.stringify({
          enemyOptions: [
            { label: '暂时后撤', content: `${enemyName}暂时后退，重新调整姿态。`, effect: '敌人移动到安全位置', fearCost: 0 },
            { label: '防守反击', content: `${enemyName}摆出防御姿态，等待你们的下一步。`, effect: '敌人进入防御状态', fearCost: 0 },
            { label: '呼喊同伴', content: `${enemyName}发出了求援的信号！`, effect: '可能引来增援', fearCost: 0 },
          ],
          nextIntentPreview: '等待时机',
        });

      case 'player:deathMove':
        return JSON.stringify({
          enemyOptions: [
            { label: '致命一击', content: `${enemyName}步步逼近，准备给倒下的角色最后一击！`, effect: '对倒下角色发起攻击', fearCost: 0 },
            { label: '转向他人', content: `${enemyName}无视倒下的人，转向其他还站着的角色。`, effect: '攻击其他角色', fearCost: 0 },
            { label: '嘲弄嘲讽', content: `${enemyName}站在倒下的角色身旁，向其他人发出嘲弄。`, effect: '威吓效果，增加压力', fearCost: 1 },
          ],
          nextIntentPreview: '对虚弱的角色发起攻击',
        });

      default:
        return JSON.stringify({
          enemyOptions: [
            { label: '攻击最弱者', content: `${enemyName}寻找看起来最虚弱的对手发起攻击。`, effect: '对HP最低的角色发起攻击', fearCost: 0 },
            { label: '特殊能力', content: `${enemyName}使用了特殊能力，战场局势瞬间改变！`, effect: '使用敌人特殊能力', fearCost: 1 },
            { label: '环境互动', content: `${enemyName}利用周围环境，推动碎石挡住退路。`, effect: '改变战场环境', fearCost: 0 },
          ],
          nextIntentPreview: '等待弱点暴露',
        });
    }
  }
}