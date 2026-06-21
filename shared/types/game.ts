// 游戏状态类型 - 单人全自动AI TRPG

import type { Character, Faction, NPC, EnemyStatBlock, Gold } from './character';
import type { Attribute, DamageType, DamageSeverity, ConditionInstance, DomainType, Tier, Distance } from './rules';
import type { SessionState, SceneState, CombatState, CampaignState, AIMessage, AIChoice, Countdown } from './events';

// ===== 游戏阶段 =====

export type GamePhase =
  | 'mainMenu'           // 主菜单
  | 'characterCreation'  // 角色创建
  | 'sessionZero'        // 第零场
  | 'exploration'        // 探索
  | 'dialogue'           // 对话（NPC交互）
  | 'combat'             // 战斗
  | 'rest'               // 休整
  | 'levelUp'            // 升级
  | 'deathMove'          // 死亡行动
  | 'camp'               // 营地（余烬村等安全区域）
  | 'transition';        // 场景过渡

// ===== 存档数据 =====

export interface SaveData {
  version: string;
  savedAt: number;
  sessionState: SessionState;
  gamePhase: GamePhase;
  messageHistory: AIMessage[];
  lastLocation: string;
}

// ===== 德拉肯海姆地点 =====

export interface DrakkenheimLocation {
  id: string;
  name: string;
  nameEn: string;
  type: 'village' | 'outerCity' | 'innerCity' | 'stronghold' | 'castle' | 'crater';
  district?: string;
  description: string;
  dangerLevel: number;          // 1-5
  hazeLevel: 'none' | 'light' | 'moderate' | 'heavy';
  contaminationRisk: number;    // 0-5
  deleriumPresence: 'none' | 'trace' | 'moderate' | 'abundant';
  encounters: EncounterTable[];
  npcs: string[];               // NPC IDs
  connections: string[];        // 连接的地点ID
  features: string[];
  explored: boolean;
  keyEventsCompleted: string[];
}

export interface EncounterTable {
  id: string;
  trigger: 'random' | 'firstVisit' | 'milestone';
  probability: number;          // 0-1
  enemies?: string[];           // EnemyStatBlock IDs
  narrative?: string;
  factionPresence?: string[];   // Faction IDs
}

// ===== 德拉肯海姆5派系 =====

export type DrakkenheimFactionId =
  | 'hoodedLanterns'      // 提灯团
  | 'queensMen'           // 女王之仆
  | 'silverOrder'         // 白银骑士团
  | 'fallingFire'         // 陨火信徒
  | 'amethystAcademy';    // 紫晶学院

export const DRAKKENHEIM_FACTION_LABELS: Record<DrakkenheimFactionId, string> = {
  hoodedLanterns: '提灯团',
  queensMen: '女王之仆',
  silverOrder: '白银骑士团',
  fallingFire: '陨火信徒',
  amethystAcademy: '紫晶学院',
};

// 派系关系等级
export type FactionRelationLevel =
  | 'hostile'    // 敌对 (1-2)
  | 'unfriendly' // 不友好 (3-4)
  | 'neutral'    // 中立 (5-6)
  | 'friendly'   // 友好 (7-8)
  | 'allied';    // 同盟 (9-10)

export function getFactionRelationLevel(relation: number): FactionRelationLevel {
  if (relation <= 2) return 'hostile';
  if (relation <= 4) return 'unfriendly';
  if (relation <= 6) return 'neutral';
  if (relation <= 8) return 'friendly';
  return 'allied';
}

// ===== 德拉肯海姆个人任务 =====

export interface PersonalQuest {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  motivation: string;
  milestones: string[];
  reward: 'abilityScoreImprovement' | 'bonusFeat';
  relatedFactions: DrakkenheimFactionId[];
  relatedLocations: string[];
}

// ===== 德拉肯海姆怪物（扩展） =====

export interface DrakkenheimMonster extends EnemyStatBlock {
  contaminationType?: 'haze' | 'delerium' | 'magical';
  isLegendary?: boolean;
  lairLocation?: string;
  lootTable?: string;
}
