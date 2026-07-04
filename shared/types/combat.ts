import type { DamageSeverity, RollResultType, Attribute, DomainType } from './rules';

// ===== 玩家意图声明系统 =====

/** 玩家意图类型——驱动规则引擎选择正确的结算路径 */
export type PlayerIntentType =
  | 'attack'       // 攻击敌人（→ 规则引擎掷骰+伤害）
  | 'cast'         // 施放域卡法术（→ 消耗Hope+域卡效果）
  | 'defend'       // 防御/格挡（→ 护甲槽或反应掷骰）
  | 'move'         // 移动/定位（→ 叙事效果，可能触发反应）
  | 'interact'     // 与物体/环境互动（→ 属性检定）
  | 'rest'         // 休整（→ 休整系统结算）
  | 'useFeature'   // 使用种族/职业/社区特性
  | 'socialize'    // 社交互动（→ 风度检定）
  | 'explore'      // 探索/感知（→ 本能/知识检定）
  | 'freeform';    // 自由行动（→ AI处理，无结构化结算）

/** 玩家意图声明——结构化的行动表达 */
export interface PlayerIntent {
  type: PlayerIntentType;
  /** 自由文本描述（玩家输入的原话） */
  description: string;
  /** 攻击目标（attack/cast） */
  targetId?: string;
  /** 使用的属性 */
  attribute?: Attribute;
  /** 难度覆盖（由GM或场景设定） */
  difficulty?: number;
  /** 使用的域卡ID（cast） */
  domainCardId?: string;
  /** 使用的特性ID（useFeature） */
  featureId?: string;
  /** 使用的特性类型 */
  featureType?: 'domainCard' | 'classFeature' | 'ancestryFeature' | 'communityFeature';
  /** 优势来源数 */
  advantage?: number;
  /** 劣势来源数 */
  disadvantage?: number;
}

/** 玩家发起的带上下文行动声明（掷骰+行动描述一体化） */
export interface RollDeclaration {
  action: string;              // 玩家描述的行动
  attribute?: Attribute;       // 驱动检定的属性
  difficulty: number;          // 难度（默认 15）
  advantage?: number;
  disadvantage?: number;
  domainCardId?: string;       // 伴随使用的领域卡
  featureId?: string;          // 伴随使用的特性
  featureType?: 'domainCard' | 'classFeature' | 'ancestryFeature' | 'communityFeature';
  intent?: PlayerIntent;       // 结构化意图（可选，向后兼容）
}

/** 后端结算的行动掷骰结果 */
export interface RollResolution {
  outcome: RollResultType;
  success: boolean;
  isCritical: boolean;
  hopeDie: number;
  fearDie: number;
  total: number;
  difficulty: number;
  modifier: number;
  hopeGain: number;
  fearGain: number;
  stressCleared: number;
  canTakeFreeAction: boolean;
  narrationHint: string;
}

/** 一次需要掷骰的行动声明（攻击 / 属性检定） */
export interface ActionDeclaration {
  kind: 'attack' | 'check';
  attackerId: string;            // 发起者（玩家 playerId 或敌人 id）
  targetId?: string;             // 攻击目标（敌人 id 或玩家 id）
  trait?: string;               // 用于检定的属性（agility/strength…），决定 modifier
  difficulty: number;            // 攻击=目标 evasion；检定=GM 设定难度
  // 骰子：客户端掷好传入；省略则后端代掷
  hopeDie?: number;
  fearDie?: number;
  advantage?: number;            // 优势 d6 数
  disadvantage?: number;
}

/** 后端结算的攻击结果（纯数据，未写状态） */
export interface AttackResolution {
  outcome: RollResultType;       // criticalSuccess / hopeSuccess / fearSuccess / hopeFailure / fearFailure
  success: boolean;
  isCritical: boolean;
  hopeDie: number;
  fearDie: number;
  total: number;
  difficulty: number;
  hopeGain: number;              // 给发起者（玩家）
  fearGain: number;              // 给 GM 恐惧池
  stressCleared: number;         // 关键成功时清除的压力点
  canTakeFreeAction: boolean;    // 关键成功时可执行免费行动
  // 命中后的伤害（未命中则全 0 / none）
  damageRolled: number;
  hpLossToTarget: number;        // 经严重度换算的HP标记数（1/2/3）；minion例外=maxHp
  severity: DamageSeverity;      // 对敌人和玩家均适用
  minionsExtraDefeated?: number; // 杂兵额外击败数（溢出伤害/阈值）
  /** Rules: Ch2 "隐藏" — hidden condition auto-clears after attacking or being attacked */
  hiddenAutoCleared?: boolean;
  /** Rules: Ch2 "掷骰结果总表" — fear success: target can mark 1 stress to react */
  fearSuccessReactionAvailable?: boolean;
  /** Rules: Ch2 "施法掷骰" — hope success + cast intent: can mark 1 stress to give 1 hope to ally */
  hopeSuccessCastAvailable?: boolean;
  narrationHint: string;         // 给 AI 的紧凑事实摘要（中文）
}

/** 对某个角色施加伤害的结算（陷阱 / 敌袭 / 环境，目标是玩家） */
export interface DamageResolution {
  rawDamage: number;
  severityBeforeArmor: DamageSeverity;
  severityAfterArmor: DamageSeverity;
  armorSlotsSpent: number;
  hpLoss: number;
  stressGain: number;
  narrationHint: string;
}

/** 敌人攻击玩家角色的结算结果 */
export interface EnemyAttackResolution {
  enemyId: string;
  enemyName: string;
  attackName: string;
  targetId: string;
  /** d20 attack roll result */
  attackRoll: number;
  /** Attack modifier from enemy data */
  attackModifier: number;
  /** Total attack roll (d20 + modifier) */
  attackTotal: number;
  /** Target's evasion value */
  targetEvasion: number;
  /** Whether the attack hit */
  attackHit: boolean;
  /** Raw damage (0 if miss, after resistance if hit) */
  rawDamage: number;
  /** HP marks lost by player */
  hpLoss: number;
  /** Severity tier */
  severity: DamageSeverity;
  /** Armor slots spent */
  armorSlotsSpent: number;
  /** Stress damage (includes below-threshold stress) */
  stressDamage: number;
  /** Condition applied */
  conditionApplied?: string;
  conditionDuration?: number;
  /** Fear cost spent */
  fearCost: number;
  /** Fear success reaction available */
  fearSuccessReactionAvailable: boolean;
  /** Narrative hint */
  narrationHint: string;
}

/**
 * AI 通过结构化通道声明的 GM 环境效果
 *
 * 设计原则：规则引擎已处理的（伤害、压力、敌人攻击、恐惧花费、治疗）
 * 不再由 AI 提取，AI 只补充规则引擎无法预知的环境效果。
 *
 * 保留的 6 种效果类型：
 * - addEnemy: 新敌人出现（规则引擎无法预知）
 * - startCombat: 战斗开始（GM 决策）
 * - endCombat: 战斗结束（GM 决策）
 * - setSceneName: 场景转换（叙事决策）
 * - addItem: 物品/战利品发现
 * - setDifficulty: 场景难度调整
 */
export interface GmEffect {
  type: 'addEnemy' | 'startCombat' | 'endCombat' | 'setSceneName' | 'addItem' | 'setDifficulty';
  targetId?: string;             // 玩境目标
  amount?: number;               // 难度值 / 金币数
  source?: string;               // "毒雾陷阱" 等，仅供叙事
  enemyStatBlockId?: string;    // addEnemy: 敌人 stat block ID（必须，不再依赖正则匹配名称）
  enemyName?: string;           // addEnemy: 可选自定义名称
  itemName?: string;            // addItem: 物品名称
  itemDescription?: string;     // addItem: 物品描述
  itemCategory?: string;        // addItem: 物品分类
  goldCoins?: number;           // addItem: 发现的金币
  sceneName?: string;           // setSceneName: 新场景名
}

/** AI 从叙事中提取的场景角色 */
export interface SceneCharacter {
  id: string;
  name: string;
  type: 'enemy' | 'npc' | 'ally';
  statBlockId?: string;
  description?: string;
}
