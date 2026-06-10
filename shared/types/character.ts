import type {
  Attribute,
  Condition,
  DamageType,
  DamageSeverity,
  DomainType,
  RuleSystemId,
} from './rules';

// Player role in the session
export type PlayerRole = 'gm' | 'player';

// Ancestry feature with structured data
export interface AncestryFeature {
  name: string;
  description: string;
  type: 'trait' | 'action' | 'passive';
}

// Character ancestry (race)
export interface Ancestry {
  id: string;
  name: string;
  nameEn: string;
  features: string[];
  modifiers?: Partial<Record<Attribute, number>>; // Attribute bonuses
  structuredFeatures?: AncestryFeature[];
}

// Community feature with structured data
export interface CommunityFeature {
  name: string;
  description: string;
  modifier?: { attribute: Attribute; value: number };
}

// Character community
export interface Community {
  id: string;
  name: string;
  nameEn: string;
  feature: string;
  structuredFeatures?: CommunityFeature[];
}

// Experience (background skill)
export interface Experience {
  id: string;
  name: string;
  modifier: number; // +2 or +1
}

// Domain card (ability/spell/grimoire)
export interface DomainCard {
  id: string;
  name: string;
  nameEn: string;
  domain: DomainType;
  level: number;
  type: 'ability' | 'spell' | 'grimoire';
  cost: string; // e.g. "1压力" or "2希望"
  recallCost: number; // Lightning marks to recall (typically 1-3)
  description: string;
  effect: string;
}

// Scar (permanent damage from death saves)
export interface Scar {
  id: string;
  name: string;
  description: string;
  lostHopeSlot: boolean;
}

// Inventory item
export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  description?: string;
  equipped: boolean;
}

// Resistance / immunity to damage types
export interface Resistance {
  damageType: DamageType;
  mode: 'resistance' | 'immunity'; // resistance = half damage, immunity = no damage
}

// Corruption level (Drakkenheim-specific)
export type CorruptionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Character state (full character sheet)
export interface Character {
  id: string;
  playerId: string;
  name: string;
  ruleSystem: RuleSystemId;

  // Identity
  classId: string;
  subclassId?: string;
  ancestryId: string;
  secondAncestryId?: string; // Mixed ancestry (混血): second ancestry
  mixedAncestryFeature1?: string; // Feature picked from first ancestry
  mixedAncestryFeature2?: string; // Feature picked from second ancestry
  communityId: string;

  // Level & tier
  level: number;
  tier: number; // 1=Lv1, 2=Lv2-4, 3=Lv5-7, 4=Lv8-10
  proficiency: number; // 1-6, affects damage dice count

  // Attributes
  attributes: Record<Attribute, number>;
  attributeMarks: Record<Attribute, boolean>; // marked attributes (used for certain features)

  // Resources
  hp: number;
  maxHp: number;
  stress: number;
  maxStress: number;
  hope: number;
  maxHope: number;
  armorSlots: number;
  maxArmorSlots: number;

  // Thresholds
  evasion: number;
  majorThreshold: number;
  severeThreshold: number;
  massiveThreshold?: number;

  // Equipment
  mainWeaponId: string;
  offWeaponId?: string;
  armorId: string;
  inventory: InventoryItem[];

  // Features
  experiences: Experience[];
  domainCards: DomainCard[];
  scars: Scar[];

  // Conditions
  conditions: Condition[];

  // Resistances / immunities
  resistances: Resistance[];

  // Combat tracking
  reactionsUsed: number; // reactions used this round
  focusTokens: number; // focus tokens accumulated

  // Campaign-specific
  corruption: CorruptionLevel;
  factionRelations: Record<string, number>; // factionId -> relation (1-8)

  // Story
  backstory: string;
  personalQuest: string;
  relationships: CharacterRelationship[];
}

export interface CharacterRelationship {
  targetCharacterId: string;
  description: string;
}

// Derived tier from level
export function getTier(level: number): number {
  if (level <= 1) return 1;
  if (level <= 4) return 2;
  if (level <= 7) return 3;
  return 4;
}

// Calculate damage thresholds
// Official: major = armorBase + level, severe = armorBase * 2 + level
export function calculateThresholds(
  armorBase: number,
  armorBaseSevere: number,
  level: number,
  modifiers: number = 0
): { major: number; severe: number; massive?: number } {
  const major = armorBase + level + modifiers;
  const severe = armorBaseSevere + level + modifiers;
  const massive = severe * 2; // massive = double severe
  return { major, severe, massive };
}

// Determine damage severity
export function getDamageSeverity(
  damage: number,
  majorThreshold: number,
  severeThreshold: number
): DamageSeverity {
  if (damage >= severeThreshold * 2) return 'massive';
  if (damage >= severeThreshold) return 'severe';
  if (damage >= majorThreshold) return 'major';
  return 'minor';
}

// Get hp/stress change from damage severity
export function getHpChangeFromSeverity(severity: DamageSeverity): number {
  switch (severity) {
    case 'minor': return 1;
    case 'major': return 2;
    case 'severe': return 3;
    case 'critical': return 3; // deprecated alias for 'severe'
    case 'massive': return 4;
  }
}

// Enemy/NPC stat block
export interface EnemyStatBlock {
  id: string;
  name: string;
  nameEn: string;
  type: 'minion' | 'elite' | 'boss';
  difficulty: number; // target number for players to hit
  evasion: number; // target for GM to roll against
  hp: number;
  stress: number;
  attackBonus: number;
  attackDamage: string; // e.g. "2d8+3"
  attackAttribute: Attribute;
  attackDistance: string;
  features: EnemyFeature[];
  fearCost: number; // fear point cost to activate special
  loot?: string;
  description?: string;
}

export interface EnemyFeature {
  name: string;
  type: 'action' | 'fear' | 'passive' | 'reaction';
  cost: number; // fear points, 0 for passive
  description: string;
}

// Faction data
export interface Faction {
  id: string;
  name: string;
  nameEn: string;
  leader: string;
  lieutenant: string;
  baseLocation: string;
  agenda: string;
  relationRange: [number, number]; // [min, max] default relation range
}

// NPC data
export interface NPC {
  id: string;
  name: string;
  factionId?: string;
  role: string;
  personality: string;
  motivation: string;
  secrets: string[];
  stressSlots: number; // for social conflicts
  currentStress: number;
}
