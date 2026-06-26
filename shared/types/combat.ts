import type { DamageSeverity, RollResultType, Attribute } from './rules';

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
  // 命中后的伤害（未命中则全 0 / none）
  damageRolled: number;
  hpLossToTarget: number;        // 敌人：直接扣 HP；玩家目标：经严重度换算
  severity: DamageSeverity;      // 仅对"目标是玩家"有意义
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

/** AI 通过结构化通道声明的 GM 机械效果（非玩家主动行动的伤害来源） */
export interface GmEffect {
  type: 'damageToPlayer' | 'stressToPlayer' | 'enemyAttack' | 'enemyHp' | 'spendFear'
    | 'addEnemy' | 'startCombat' | 'endCombat' | 'setDifficulty' | 'addItem';
  targetId?: string;             // 玩家 id / 敌人 id
  enemyId?: string;
  amount?: number;               // 伤害值 / 压力值 / 恐惧值 / 难度值
  source?: string;               // "毒雾陷阱" 等，仅供叙事
  enemyStatBlockId?: string;    // addEnemy: 敌人 stat block ID
  enemyName?: string;           // addEnemy: 可选自定义名称
  itemName?: string;            // addItem: 物品名称
  itemDescription?: string;     // addItem: 物品描述
  itemCategory?: string;        // addItem: 物品分类
  goldCoins?: number;           // addItem: 发现的金币
}

/** AI 从叙事中提取的场景角色 */
export interface SceneCharacter {
  id: string;
  name: string;
  type: 'enemy' | 'npc' | 'ally';
  statBlockId?: string;
  description?: string;
}
