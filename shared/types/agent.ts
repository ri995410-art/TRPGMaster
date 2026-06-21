import type { Character, EnemyStatBlock, Faction, NPC } from './character';
import type { SessionState, TimelineEntry, CampaignState, AIMessage } from './events';
import type { WeaponData, ArmorData, ClassData, SubclassData, AncestryData, CommunityData, DomainType } from './rules';

// ===== AI 管家类型 =====

// AI 管家上下文
export interface AIGMContext {
  sessionId: string;
  sessionState: SessionState;
  recentHistory: TimelineEntry[];
  worldLore: WorldLore;
  character: Character;          // 保留向后兼容（单人模式）
  characters?: Character[];      // 多人模式：队伍所有角色
  activePlayerId?: string;       // 当前行动玩家ID
  activePlayerName?: string;     // 当前行动玩家名
}

// AI 管家响应
export interface AIGMResponse {
  message: AIMessage;
  events?: AIGMGeneratedEvent[];
  stateChanges?: Partial<SessionState>;
  tokenUsage?: number;
}

export interface AIGMGeneratedEvent {
  type: string;
  payload: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high' | 'critical';
}

// ===== 世界设定 =====

export interface WorldLore {
  campaignId: string;
  campaignName: string;
  overview: string;
  themes: string[];
  tone: string;           // 'dark' | 'heroic' | 'balanced'
  locations: LocationData[];
  factions: Faction[];
  npcs: NPC[];
  customRules: string[];
  timeline: CampaignTimelineEntry[];
}

export interface LocationData {
  id: string;
  name: string;
  nameEn?: string;
  description: string;
  parentLocationId?: string;
  dangerLevel: 'safe' | 'low' | 'moderate' | 'high' | 'extreme';
  features: string[];
  connections: string[];
  explorationTimer?: number;
  hazeLevel?: 'none' | 'light' | 'moderate' | 'heavy';
  contaminationRisk?: number;  // 0-5, 污染风险等级
  deleriumPresence?: 'none' | 'trace' | 'moderate' | 'abundant';
}

export interface CampaignTimelineEntry {
  id: string;
  era: string;
  yearOffset: number;
  description: string;
}

// ===== 规则系统数据 =====

export interface RuleSystemData {
  id: 'daggerheart';
  name: string;
  version: string;
  classes: ClassData[];
  subclasses: SubclassData[];
  ancestries: AncestryData[];
  communities: CommunityData[];
  weapons: WeaponData[];
  armor: ArmorData[];
  enemies: EnemyStatBlock[];
  randomTables: RandomTable[];
}

export interface RandomTable {
  id: string;
  name: string;
  dice: string;
  entries: RandomTableEntry[];
}

export interface RandomTableEntry {
  range: [number, number];
  result: string;
  subtable?: string;
}

// ===== 德拉肯海姆特有类型 =====

// 污染等级
export type ContaminationLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// 污染效果
export interface ContaminationEffect {
  level: ContaminationLevel;
  name: string;
  description: string;
  mechanicalEffect: string;
}

// 翠晶数据
export interface DeleriumData {
  id: string;
  type: 'fragment' | 'shard' | 'crystal' | 'vein';
  value: number;             // 金币价值
  contaminationRisk: number; // 暴露污染的风险
  magicalPotency: number;    // 魔法效能等级
  description: string;
}

// 德拉肯海姆封印
export interface SealOfDrakkenheim {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  location: string;
  holder?: string;           // 当前持有者
  powers: string[];
  isFound: boolean;
}

// 圣维特鲁维奥圣物
export interface RelicOfSaintVitruvio {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  powers: string[];
  isFound: boolean;
}
