/**
 * IPromptProvider — 可配置 AI prompt 模板接口
 *
 * 将 AIGameMaster.buildSystemPrompt 中硬编码的规则/设定/叙事模式
 * 抽象为可替换的配置，使同一 AI GM 核心可驱动不同 TRPG 系统。
 *
 * 设计原则：
 *   1. 覆盖 buildSystemPrompt 中所有系统专有文本
 *   2. 覆盖 buildSessionZeroPrompt 和 guideCharacterCreation 中的专有文本
 *   3. 通用逻辑（多人协作、安全边界、机械结算提醒）留在 AIGameMaster 中
 *   4. 每个 provider 是纯数据对象，无副作用
 */

/** 叙事模式配置 */
export interface NarrativeMode {
  /** 模式名称（如"开放式提问"） */
  name: string;
  /** 模式描述与示例 */
  description: string;
  /** 出现概率百分比（所有模式之和应为 100） */
  weight: number;
}

/** PromptProvider 配置 — 一个规则系统 + 战役设定的完整 prompt 模板 */
export interface PromptProviderConfig {
  /** 机器可读标识符：'daggerheart' | 'coc' | 'dnd5e' 等 */
  systemId: string;

  /** 人类可读系统名称（如"匕首之心（Daggerheart）"） */
  systemName: string;

  /** 战役标识符（如 'drakkenheim'） */
  campaignId: string;

  /** 战役显示名（如"德拉肯海姆（Drakkenheim）"） */
  campaignName: string;

  /**
   * GM 身份描述 — 替换 buildSystemPrompt 开头的硬编码身份行。
   * 示例："TRPGMaster的AI管家（GM），负责运行一场基于匕首之心（Daggerheart）规则的德拉肯海姆（Drakkenheim）战役。"
   */
  gmIdentity: string;

  /**
   * GM 职责列表 — 替换 buildSystemPrompt 中"你的职责"部分。
   * 每项为 "- **标题**：描述" 格式。
   */
  gmResponsibilities: string[];

  /**
   * 核心规则描述 — 替换 buildSystemPrompt 中"核心规则"和"恐惧点经济"部分。
   * 包含骰子系统、伤害计算、特殊机制等该规则系统独有的规则文本。
   */
  rulesDescription: string;

  /**
   * 设定描述 — 替换 buildSystemPrompt 中"德拉肯海姆设定"部分。
   * 包含战役世界的派系、环境、特殊机制等设定文本。
   */
  settingDescription: string;

  /**
   * 叙事风格描述 — 替换 buildSystemPrompt 中"叙事风格"部分。
   * 描述该系统/战役的叙事基调与风格要求。
   */
  narrativeStyle: string;

  /**
   * 叙事模式列表 — 替换 buildSystemPrompt 中"叙事模式与输出格式"部分。
   * 按权重降序排列，AIGameMaster 会将其格式化为模式 A/B/C/D。
   */
  narrativeModes: NarrativeMode[];

  /**
   * 角色创建引导 — 替换 guideCharacterCreation 中的硬编码步骤提示。
   * key 为步骤编号（从 1 开始），value 为该步骤的引导文本。
   */
  characterCreationSteps: Record<number, string>;

  /**
   * Session Zero 世界观共创引导 — 替换 buildSessionZeroPrompt 中
   * worldbuilding 阶段的硬编码 Drakkenheim 世界观描述和示例问题。
   */
  sessionZeroWorldbuilding: string;

  /**
   * Session Zero 基础身份行 — 替换 buildSessionZeroPrompt 开头的
   * "你是匕首之心（Daggerheart）的AI游戏主持人"。
   */
  sessionZeroIdentity: string;

  /** Build system-specific state summary for AI prompt */
  buildStateSummary?: (context: unknown) => string;
}
