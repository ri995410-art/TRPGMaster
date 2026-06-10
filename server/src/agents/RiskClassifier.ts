import type { AgentType, RiskLevel } from '@trpgmaster/shared';

const AGENT_RISK_LEVELS: Record<AgentType, RiskLevel> = {
  rules: 'L0',            // Rule rulings: fully automatic
  narrative: 'L2',         // Scene descriptions: 3 options + timeout auto-send
  npc: 'L2',               // NPC dialogue: 3 options + timeout auto-send
  combat: 'L2',            // Combat actions: 3 options + timeout auto-send
  sceneDirector: 'L1',     // Atmosphere effects: auto-send + undo
  imageDirector: 'L3',     // Image generation: needs confirmation
  faction: 'L2',           // Faction events: 3 options + timeout
  novel: 'L4',             // Novel generation: fully background
  memoryCompressor: 'L4',  // Memory compression: fully background
  intentParser: 'L4',      // Intent parsing: fully background
  unified: 'L2',           // Unified agent: 3 options + timeout auto-send
};

export function classifyRisk(agentType: AgentType): RiskLevel {
  return AGENT_RISK_LEVELS[agentType] ?? 'L3';
}

// Type labels for player-facing messages
const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  rules: '[规则]',
  narrative: '[场景]',
  npc: '[NPC]',
  combat: '[战斗]',
  sceneDirector: '[环境]',
  imageDirector: '[图片]',
  faction: '[派系]',
  novel: '',
  memoryCompressor: '',
  intentParser: '',
  unified: '[助手]',
};

export function getTypeLabel(agentType: AgentType, extra?: string): string {
  const base = AGENT_TYPE_LABELS[agentType] ?? '';
  if (agentType === 'npc' && extra) {
    return `[NPC:${extra}]`;
  }
  return base;
}

// Auto-send timeout for L2 suggestions (milliseconds)
export const L2_AUTO_SEND_TIMEOUT = 10_000;

// Undo window for L1 auto-sent messages (milliseconds)
export const L1_UNDO_WINDOW = 30_000;
