import type {
  GameEvent,
  RollResultType,
  DamageSeverity,
  Attribute,
} from '@trpgmaster/shared';
import {
  getDamageSeverity,
  getHpChangeFromSeverity,
  calculateThresholds,
  DIFFICULTY_LEVELS,
} from '@trpgmaster/shared';
import { BaseAgent } from './BaseAgent';
import type { AgentContext, AgentResponse } from '../core/AgentCoordinator';

const SYSTEM_PROMPT = `你是匕首之心(DaggerHeart)的规则裁定AI助手。你的职责是：
1. 根据玩家描述的行动，确定使用的属性和难度
2. 解读掷骰结果，判定成功/失败及希望/恐惧
3. 计算伤害等级和生命点变化
4. 提供规则引用和裁定建议

核心规则：
- 二元骰系统：2d12(希望骰+恐惧骰)
- 关键成功：两骰相同 → 自动成功+1希望+清除1压力+攻击时额外伤害
- 希望成功：希望>恐惧且≥难度 → 成功+1希望
- 恐惧成功：恐惧>希望且≥难度 → 成功有代价+GM+1恐惧
- 希望失败：希望>恐惧且<难度 → 失败+1希望
- 恐惧失败：恐惧>希望且<难度 → 失败+GM+1恐惧

优势/劣势d6骰：
- 净优势(优势数>劣势数)：投1d6加到总数
- 净劣势(劣势数>优势数)：投1d6从总数减去
- 两者互相抵消

反应掷骰：
- 使用二元d12但不产生Hope/Fear
- 关键成功时自动成功但不清除压力/不获Hope

伤害阈值：轻度(<重度阈值)=1HP, 重度(≥重度阈值)=2HP, 严重(≥严重阈值)=3HP, 巨额(≥严重阈值×2)=4HP
护甲槽：标记1槽降低一级伤害（每次伤害事件最多用1槽）
护甲双阈值：重度阈值/严重阈值 由护甲基础值+等级+调整值计算

压力系统：
- 压力满时溢出标记HP（每溢出1压力→1HP）
- 标记最后压力槽时自动获得"脆弱"状态

抗性/免疫：
- 抗性：伤害减半（向下取整）
- 免疫：伤害归零

死亡修正（HP=0时选择）：
- 光荣就义：接受死亡，执行一次关键成功的最后行动
- 回避死亡：投希望骰，≤等级→获伤痕(永久失1希望槽)+恢复1HP；>等级→恢复1HP但局势恶化
- 孤注一掷：投二元骰，关键成功→满血满压力；希望>恐惧→恢复希望骰值HP/压力；恐惧≥希望→角色死亡

休整系统：
- 短休：选2项行动，GM获1d4恐惧
- 长休：选2项行动，GM获1d4+玩家数恐惧

难度参考：5=非常简单, 10=简单, 15=普通, 20=困难, 25=非常困难, 30=几乎不可能

请用JSON格式输出裁定结果。`;

export class RulesAgent extends BaseAgent {
  constructor() {
    super({
      agentType: 'rules',
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 2000,
      temperature: 0.1, // Low temperature for consistent rulings
    });
  }

  async process(event: GameEvent, context: AgentContext): Promise<AgentResponse | null> {
    switch (event.type) {
      case 'player:action':
        return this.handlePlayerAction(event, context);
      case 'player:roll':
        return this.handlePlayerRoll(event, context);
      case 'combat:attack':
        return this.handleCombatAttack(event, context);
      default:
        return null;
    }
  }

  private handlePlayerAction(event: GameEvent, context: AgentContext): AgentResponse {
    const actionEvent = event as GameEvent & {
      playerId: string;
      characterId: string;
      action: string;
      attribute?: Attribute;
      difficulty?: number;
    };

    // If GM already set difficulty, use it
    if (actionEvent.attribute && actionEvent.difficulty) {
      return this.createResponse(
        JSON.stringify({
          ruling: 'gm_set',
          attribute: actionEvent.attribute,
          difficulty: actionEvent.difficulty,
          action: actionEvent.action,
        }),
      );
    }

    // Otherwise, suggest attribute and difficulty
    const suggestion = this.suggestDifficulty(actionEvent.action, context);

    return this.createResponse(
      JSON.stringify({
        ruling: 'suggested',
        action: actionEvent.action,
        suggestedAttribute: suggestion.attribute,
        suggestedDifficulty: suggestion.difficulty,
        difficultyLabel: suggestion.label,
        reasoning: suggestion.reasoning,
      }),
    );
  }

  private handlePlayerRoll(event: GameEvent, context: AgentContext): AgentResponse {
    const rollEvent = event as GameEvent & {
      hopeDie: number;
      fearDie: number;
      modifier: number;
      difficulty: number;
      characterId: string;
    };

    const total = rollEvent.hopeDie + rollEvent.fearDie + rollEvent.modifier;
    const result = this.determineRollResult(
      rollEvent.hopeDie,
      rollEvent.fearDie,
      total,
      rollEvent.difficulty,
    );

    return this.createResponse(
      JSON.stringify({
        ruling: 'roll_result',
        hopeDie: rollEvent.hopeDie,
        fearDie: rollEvent.fearDie,
        modifier: rollEvent.modifier,
        total,
        difficulty: rollEvent.difficulty,
        result: result.type,
        resultLabel: result.label,
        success: result.success,
        effects: result.effects,
      }),
      result.events,
    );
  }

  private handleCombatAttack(event: GameEvent, context: AgentContext): AgentResponse {
    const attackEvent = event as GameEvent & {
      attackerId: string;
      attackerType: 'player' | 'enemy';
      targetId: string;
      targetType: 'player' | 'enemy';
      damage?: number;
      hit: boolean;
    };

    if (!attackEvent.hit || attackEvent.damage === undefined) {
      return this.createResponse(
        JSON.stringify({
          ruling: 'attack_miss',
          attackerId: attackEvent.attackerId,
          targetId: attackEvent.targetId,
        }),
      );
    }

    // Calculate damage severity for player targets
    if (attackEvent.targetType === 'player') {
      const character = context.characters.find(c => c.id === attackEvent.targetId);
      if (character) {
        const severity = getDamageSeverity(
          attackEvent.damage,
          character.majorThreshold,
          character.severeThreshold,
        );
        const hpChange = getHpChangeFromSeverity(severity);

        return this.createResponse(
          JSON.stringify({
            ruling: 'damage_calculated',
            damage: attackEvent.damage,
            severity,
            hpChange,
            targetId: attackEvent.targetId,
            thresholds: {
              major: character.majorThreshold,
              severe: character.severeThreshold,
            },
          }),
          [{
            type: 'combat:damage',
            payload: {
              targetId: attackEvent.targetId,
              targetType: 'player',
              amount: attackEvent.damage,
              damageType: 'physical',
              severity,
              hpChange,
              armorSlotUsed: false,
            },
            priority: 'high',
          }],
        );
      }
    }

    return this.createResponse(
      JSON.stringify({
        ruling: 'damage_dealt',
        damage: attackEvent.damage,
        targetId: attackEvent.targetId,
        targetType: attackEvent.targetType,
      }),
    );
  }

  private determineRollResult(
    hopeDie: number,
    fearDie: number,
    total: number,
    difficulty: number,
  ): { type: RollResultType; label: string; success: boolean; effects: string[]; events?: AgentResponse['events'] } {
    const isCritical = hopeDie === fearDie;
    const isSuccess = total >= difficulty;
    const hopeHigher = hopeDie > fearDie;

    if (isCritical) {
      return {
        type: 'criticalSuccess',
        label: '关键成功',
        success: true,
        effects: ['自动成功', '+1希望点', '清除1压力点', '攻击时额外伤害'],
        events: [{
          type: 'combat:heal' as const,
          payload: { resource: 'stress', amount: 1 },
          priority: 'high',
        }],
      };
    }

    if (isSuccess && hopeHigher) {
      return {
        type: 'hopeSuccess',
        label: '希望成功',
        success: true,
        effects: ['成功', '+1希望点'],
      };
    }

    if (isSuccess && !hopeHigher) {
      return {
        type: 'fearSuccess',
        label: '恐惧成功',
        success: true,
        effects: ['成功但有代价', 'GM+1恐惧点'],
      };
    }

    if (!isSuccess && hopeHigher) {
      return {
        type: 'hopeFailure',
        label: '希望失败',
        success: false,
        effects: ['失败', '+1希望点'],
      };
    }

    return {
      type: 'fearFailure',
      label: '恐惧失败',
      success: false,
      effects: ['失败且后果严重', 'GM+1恐惧点'],
    };
  }

  private suggestDifficulty(
    action: string,
    context: AgentContext,
  ): { attribute: Attribute; difficulty: number; label: string; reasoning: string } {
    // Simple keyword-based suggestion; will be enhanced with AI
    const actionLower = action.toLowerCase();

    let attribute: Attribute = 'instinct';
    let difficulty = 15;
    let label = '普通';
    let reasoning = '默认判定';

    // Attribute mapping - use word boundaries to avoid false matches
    if (/跑|跳|闪避|冲刺|攀爬|躲避/.test(actionLower)) {
      attribute = 'agility';
    } else if (/举起|砸碎|推开|拉动|摔投|力量检定/.test(actionLower)) {
      attribute = 'strength';
    } else if (/潜行|隐藏|开锁|解除|巧手|偷窃/.test(actionLower)) {
      attribute = 'finesse';
    } else if (/感知|察觉|追踪|搜索|聆听|侦测/.test(actionLower)) {
      attribute = 'instinct';
    } else if (/说服|魅力|表演|欺骗|威吓|交涉|谈判/.test(actionLower)) {
      attribute = 'presence';
    } else if (/知识|回忆|分析|研究|识别|学问/.test(actionLower)) {
      attribute = 'knowledge';
    }

    // Difficulty adjustment
    if (/简单|轻松|日常/.test(actionLower)) {
      difficulty = 10;
      label = '简单';
    } else if (/困难|危险|紧急/.test(actionLower)) {
      difficulty = 20;
      label = '困难';
    } else if (/几乎不可能|极限|传说/.test(actionLower)) {
      difficulty = 25;
      label = '非常困难';
    }

    // Combat context increases difficulty
    if (context.state.activeCombat) {
      difficulty = Math.min(difficulty + 2, 30);
      reasoning = '战斗中行动，难度+2';
    }

    return { attribute, difficulty, label, reasoning };
  }

}
