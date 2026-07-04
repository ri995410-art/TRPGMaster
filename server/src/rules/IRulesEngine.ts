/**
 * IRulesEngine — 通用规则引擎接口
 *
 * 所有 TRPG 规则系统（Daggerheart、CoC、D&D 5e 等）的公共契约。
 * 设计原则：
 *   1. 足够通用：CoC（百分位骰/理智/技能制）和 D&D 5e（d20/AC/法术位）可实现
 *   2. 不过度抽象：保留各系统的特有返回结构，不强行统一为 lowest-common-denominator
 *   3. 纯函数：无副作用、无 I/O，便于测试
 *
 * 对于特定系统的扩展功能（如 Daggerheart 的二元骰细节、CoC 的理智检定），
 * 消费方应通过 systemId 判断后窄化类型，或使用各系统 RulesEngine 子接口。
 */

import type {
  Character,
  RollResult,
  DamageSeverity,
  DeathMoveResult,
  RestType,
  ShortRestAction,
  LongRestAction,
  RestResult,
  ConditionInstance,
  Resistance,
  DamageType,
  DamageDie,
  Tier,
  CharacterCore,
  SystemCharacter,
  CreationFlowDef,
} from '@trpgmaster/shared';

// ===== 通用结果类型 =====

/** 通用角色验证结果 */
export interface CharacterValidationResult {
  valid: boolean;
  errors: string[];
}

/** 通用伤害结算结果（各系统可扩展） */
export interface DamageResult {
  /** 原始伤害值 */
  rawDamage: number;
  /** 最终 HP 损失 */
  hpLoss: number;
  /** 伤害等级（如适用） */
  severity?: DamageSeverity;
  /** 叙事提示 */
  narrationHint: string;
}

/** 通用攻击结算结果（各系统可扩展） */
export interface AttackResult {
  success: boolean;
  damageRolled: number;
  hpLossToTarget: number;
  narrationHint: string;
  /** 原始掷骰结果，供 UI 展示 */
  rollResult?: RollResult;
}

/** 通用升级选项 */
export interface LevelUpOption {
  type: string;
  label: string;
  description: string;
  slotCost: number;
  available: boolean;
  reason?: string;
  data?: Record<string, unknown>;
}

/** 通用升级结果 */
export interface LevelUpResult {
  success: boolean;
  character?: Character;
  errors: string[];
  tierChanged: boolean;
  oldTier: number;
  newTier: number;
}

// ===== 规则引擎接口 =====

export interface IRulesEngine {
  /** 机器可读标识符：'daggerheart' | 'coc' | 'dnd5e' 等 */
  readonly systemId: string;

  /** 人类可读名称 */
  readonly systemName: string;

  /** 该系统的最大角色等级（Daggerheart=10, D&D 5e=20, CoC 无上限用 Infinity） */
  readonly maxLevel: number;

  // ===== 骰子与检定 =====

  /**
   * 执行一次核心检定掷骰
   * @param modifier   属性/技能调整值
   * @param difficulty 目标难度
   * @param options    系统特定选项（优势/劣势、骰子类型等）
   */
  rollCheck(modifier: number, difficulty: number, options?: Record<string, unknown>): RollResult;

  // ===== 角色验证 =====

  /**
   * 验证角色数据在该规则系统下的合法性
   * @param data 角色数据（可能不完整）
   */
  validateCharacter(data: unknown): CharacterValidationResult;

  // ===== 伤害与治疗 =====

  /**
   * 结算伤害：原始伤害 → 该系统特有的伤害映射 → 通用 DamageResult
   * @param rawDamage 原始伤害数值
   * @param defender  防御者角色（用于读取阈值/AC/护甲等）
   */
  resolveDamage(rawDamage: number, defender: Character): DamageResult;

  /**
   * 将伤害结果应用到角色，返回更新后的角色（纯函数，不修改原对象）
   * @param character 受伤角色
   * @param result    伤害结果
   */
  applyDamage(character: Character, result: DamageResult): Character;

  // ===== 战斗 =====

  /**
   * 计算攻击的难度/目标值
   * Daggerheart → 闪避值; D&D 5e → AC; CoC → 对抗技能值
   */
  getAttackDifficulty(attacker: Character, defender: { evasion?: number; armorClass?: number; [key: string]: unknown }): number;

  // ===== 休息/恢复 =====

  /**
   * 执行休息
   * @param type     短休/长休
   * @param character 角色当前状态
   * @param actions  休息时选择的活动
   * @param context  系统特定上下文（如 Daggerheart 的 shortRestsSinceLong）
   */
  executeRest(type: RestType, character: Character, actions: (ShortRestAction | LongRestAction)[], context?: Record<string, unknown>): RestResult;

  // ===== 死亡/濒死 =====

  /**
   * 处理角色的死亡行动/死亡豁免
   * @param character 角色数据
   * @param moveType  死亡行动类型
   * @param dice      掷骰结果（如适用）
   */
  handleDeath(character: Character, moveType: string, dice?: Record<string, number>): DeathMoveResult;

  /**
   * 获取该系统可用的死亡行动类型列表
   */
  getDeathMoveTypes(): string[];

  // ===== 升级 =====

  /**
   * 获取升级可用选项
   * @param character 角色当前数据
   * @param newLevel  目标等级
   */
  getLevelUpOptions(character: Character, newLevel: number): LevelUpOption[];

  /**
   * 应用升级选择
   * @param character 角色当前数据
   * @param newLevel  目标等级
   * @param choices   玩家选择的升级选项
   */
  applyLevelUp(character: Character, newLevel: number, choices: Record<string, unknown>): LevelUpResult;

  // ===== 状态/条件 =====

  /**
   * 添加状态到角色
   * @param conditions 当前状态列表
   * @param condition  要添加的状态
   */
  addCondition(conditions: ConditionInstance[], condition: ConditionInstance): ConditionInstance[];

  /**
   * 移除状态
   * @param conditions    当前状态列表
   * @param conditionName 要移除的状态名称
   */
  removeCondition(conditions: ConditionInstance[], conditionName: string): ConditionInstance[];

  /**
   * 回合结束时推进临时状态
   * @param conditions 当前状态列表
   */
  tickConditions(conditions: ConditionInstance[]): { updated: ConditionInstance[]; expired: string[] };

  // ===== 抗性/免疫 =====

  /**
   * 应用抗性/免疫到伤害
   * @param damage      原始伤害
   * @param damageType  伤害类型
   * @param resistances 角色抗性列表
   */
  applyResistance(damage: number, damageType: DamageType, resistances: Resistance[]): { finalDamage: number; resisted: boolean; immune: boolean };

  // ===== 阈值计算（Daggerheart 特有，但通用接口保留） =====

  /**
   * 计算伤害阈值
   * 仅对有阈值系统的规则集有意义（Daggerheart）；
   * D&D 5e / CoC 可返回固定值或 throw
   */
  calculateThresholds?(params: Record<string, number>): { minor: number; major: number; severe: number };

  // ===== 角色创建 =====

  /**
   * 返回此规则系统的角色创建流程定义
   * 前端据此动态渲染创建向导
   */
  getCreationFlow(): CreationFlowDef;

  /**
   * 验证某步骤的创建数据
   * @param stepId 步骤ID
   * @param data   当前已收集的创建数据
   */
  validateCreationStep(stepId: string, data: Record<string, unknown>): Record<string, string[]>;

  /**
   * 从创建数据构建规则特有角色
   * @param core          跨规则核心身份（新角色时部分字段为空）
   * @param creationData  创建向导收集的数据
   */
  buildCharacter(core: CharacterCore, creationData: Record<string, unknown>): SystemCharacter;
}
