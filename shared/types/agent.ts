import type { Character, EnemyStatBlock, Faction, NPC } from './character';
import type { SessionState, TimelineEntry } from './events';
import type { RuleSystemId, WeaponData, ArmorData, ClassData } from './rules';

// ===== Agent Types =====

export interface AgentMessage {
  agentType: string;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface AgentContext {
  sessionId: string;
  sessionState: SessionState;
  relevantHistory: TimelineEntry[];
  worldLore: WorldLore;
  ruleSystemData: RuleSystemData;
}

export interface AgentResponse {
  agentType: string;
  output: string;
  events?: AgentGeneratedEvent[];
  tokenUsage?: number;
}

export interface AgentGeneratedEvent {
  type: string;
  payload: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high' | 'critical';
}

// ===== World Lore =====

export interface WorldLore {
  campaignId: string;
  campaignName: string;
  overview: string;
  themes: string[];
  locations: LocationData[];
  factions: Faction[];
  npcs: NPC[];
  customRules: string[];
  timeline: CampaignTimelineEntry[];
}

export interface LocationData {
  id: string;
  name: string;
  description: string;
  parentLocationId?: string;
  dangerLevel: 'safe' | 'low' | 'moderate' | 'high' | 'extreme';
  features: string[];
  connections: string[]; // connected location IDs
  explorationTimer?: number; // Drakkenheim: exploration countdown
  hazeLevel?: 'none' | 'light' | 'moderate' | 'heavy';
}

export interface CampaignTimelineEntry {
  id: string;
  era: string;
  yearOffset: number; // years before campaign start
  description: string;
}

// ===== Rule System Data =====

export interface RuleSystemData {
  id: RuleSystemId;
  name: string;
  version: string;
  classes: ClassData[];
  weapons: WeaponData[];
  armor: ArmorData[];
  enemies: EnemyStatBlock[];
  randomTables: RandomTable[];
  conditions: ConditionData[];
}

export interface RandomTable {
  id: string;
  name: string;
  dice: string; // e.g. "1d20", "1d6"
  entries: RandomTableEntry[];
}

export interface RandomTableEntry {
  range: [number, number]; // [min, max]
  result: string;
  subtable?: string; // reference to another table
}

export interface ConditionData {
  id: string;
  name: string;
  description: string;
  clearCondition: string;
}

// ===== Image Types =====

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt: string;
  style: ImageStyle;
  referenceImageId?: string;
  width: number;
  height: number;
}

export interface ImageStyle {
  id: string;
  name: string;
  basePrompt: string;
  characterPromptTemplate: string;
  scenePromptTemplate: string;
  negativePrompt: string;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  styleId: string;
  category: 'character' | 'scene' | 'item' | 'map';
  relatedEntityId?: string;
  timestamp: number;
}

// ===== Novel Types =====

export interface NovelRequest {
  sessionId: string;
  playerId: string;
  characterId: string;
  perspective: 'firstPerson' | 'thirdPerson';
  style: NovelStyle;
}

export interface NovelStyle {
  genre: string;
  tone: string;
  pov: 'firstPerson' | 'thirdPerson';
  language: 'zh' | 'en';
}

export interface NovelChapter {
  chapterNumber: number;
  title: string;
  content: string;
  keyMoments: string[];
  imageUrl?: string;
}

export interface Novel {
  id: string;
  sessionId: string;
  playerId: string;
  characterId: string;
  characterName: string;
  title: string;
  chapters: NovelChapter[];
  generatedAt: number;
}
