// ===== 通用 RPG 基类类型 =====
//
// 这些类型提取了跨规则系统（Daggerheart、CoC、D&D 5e 等）的通用概念。
// 各规则系统的专有类型应 extends 这些基类，添加系统特有字段。
//
// 设计原则：
//   1. 只包含绝大多数 TRPG 系统共有的字段
//   2. 不强行统一差异过大的概念（如 Daggerheart 的 stress/hope vs D&D 的 spell slots）
//   3. 使用 [key: string]: unknown 或泛型允许扩展

import type { CharacterRelationship, AdventureSummary } from './character';

// ===== 通用角色基类 =====

export interface GameCharacter {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  inventory: unknown[];
}

// ===== 角色核心身份（跨规则持久） =====

export interface CharacterCore {
  id: string;
  name: string;
  level: number;
  backstory: string;
  personalQuest: string;
  relationships: CharacterRelationship[];
  adventureSummaries: AdventureSummary[];
  /** 已有角色数据的规则系统映射: systemId → systemCharacterId */
  systemVersions: Record<string, string>;
}

// ===== 规则特有角色数据信封 =====

export interface SystemCharacter<T = Record<string, unknown>> {
  /** 指向 CharacterCore.id */
  coreId: string;
  /** 规则系统标识: 'daggerheart' | 'coc' | ... */
  systemId: string;
  /** 规则特有数据 */
  systemData: T;
  /** 通用字段：各系统含义不同但都存在 */
  hp: number;
  maxHp: number;
  inventory: unknown[];
}

// ===== 角色创建步骤定义 =====

export type CreationStepRenderer =
  | 'select-one'         // 单选（职业/种族/护甲等）
  | 'multi-select'       // 多选（领域卡/技能等）
  | 'attribute-allocate' // 属性分配（DH: +2/+1/+1/0/0/-1）
  | 'text-input'         // 文本输入（背景/名字等）
  | 'resource-preview'   // 资源预览（只读展示计算结果）
  | 'connection-list';   // 人际关系列表

export interface CreationStepDef {
  /** 机器可读步骤ID: 'class' | 'occupation' | ... */
  id: string;
  /** 显示标签: '职业' | 'Occupation' | ... */
  label: string;
  /** 步骤描述 */
  description: string;
  /** 此步骤收集的数据键 */
  dataKey: string;
  /** 依赖的前置步骤ID */
  dependsOn?: string[];
  /** 是否可选 */
  optional?: boolean;
  /** 渲染器类型，前端据此选择UI组件 */
  renderer: CreationStepRenderer;
  /** 渲染器额外配置 */
  rendererConfig?: Record<string, unknown>;
}

export interface CreationFlowDef {
  systemId: string;
  steps: CreationStepDef[];
}

// ===== 通用骰子结果 =====

/** 通用掷骰结果基类 */
export interface DiceRollResult {
  total: number;
  success: boolean;
  description: string;
}

// ===== 通用检定结果类型 =====

/** 通用检定结果分类（各系统可扩展） */
export type BaseRollOutcome = 'success' | 'failure';

// ===== 通用战役/场景状态 =====

export interface GameCampaignState {
  campaignId: string;
  currentLocation: string;
  currentChapter: string;
  visitedLocations?: string[];
  factionRelations?: Record<string, number>;
}
