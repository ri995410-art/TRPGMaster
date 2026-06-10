// Event type constants for type-safe event bus usage
import type { GameEventType, AgentType } from '../types/events';

export const GAME_EVENTS = {
  // Player actions
  PLAYER_ACTION: 'player:action',
  PLAYER_DIALOGUE: 'player:dialogue',
  PLAYER_ROLL: 'player:roll',
  PLAYER_USE_HOPE: 'player:useHope',
  PLAYER_USE_EXPERIENCE: 'player:useExperience',
  PLAYER_REST: 'player:rest',
  PLAYER_DEATH_MOVE: 'player:deathMove',

  // GM actions
  GM_SCENE_CHANGE: 'gm:sceneChange',
  GM_USE_FEAR: 'gm:useFear',
  GM_ENEMY_ACTION: 'gm:enemyAction',
  GM_RULING: 'gm:ruling',
  GM_NARRATE: 'gm:narrate',
  GM_AWARD: 'gm:award',

  // Combat events
  COMBAT_START: 'combat:start',
  COMBAT_END: 'combat:end',
  COMBAT_ATTACK: 'combat:attack',
  COMBAT_DAMAGE: 'combat:damage',
  COMBAT_HEAL: 'combat:heal',
  COMBAT_CONDITION_APPLY: 'combat:conditionApply',
  COMBAT_CONDITION_REMOVE: 'combat:conditionRemove',
  COMBAT_ENEMY_DEFEATED: 'combat:enemyDefeated',

  // Scene events
  SCENE_DESCRIBE: 'scene:describe',
  SCENE_TRANSITION: 'scene:transition',
  SCENE_ENVIRONMENT_CHANGE: 'scene:environmentChange',

  // System events
  SESSION_START: 'session:start',
  SESSION_END: 'session:end',
  SESSION_PAUSE: 'session:pause',
  SESSION_RESUME: 'session:resume',
  AGENT_OUTPUT: 'agent:output',
  AGENT_REQUEST: 'agent:request',

  // Faction events
  FACTION_RELATION_CHANGE: 'faction:relationChange',
  FACTION_ACTION: 'faction:action',

  // Campaign events
  CAMPAIGN_MILESTONE: 'campaign:milestone',
  CAMPAIGN_CORRUPTION_CHANGE: 'campaign:corruptionChange',

  // Input events
  INPUT_VOICE: 'input:voice',
  INPUT_VISION: 'input:vision',
  INPUT_TEXT: 'input:text',
  INPUT_PARSED: 'input:parsed',

  // Image events
  IMAGE_GENERATE: 'image:generate',
  IMAGE_COMPLETE: 'image:complete',

  // Novel events
  NOVEL_GENERATE: 'novel:generate',
  NOVEL_COMPLETE: 'novel:complete',
} as const;

// Agent subscription mapping: which agents listen to which events
export const AGENT_SUBSCRIPTIONS: Record<AgentType, GameEventType[]> = {
  narrative: [
    GAME_EVENTS.PLAYER_ACTION,
    GAME_EVENTS.GM_SCENE_CHANGE,
    GAME_EVENTS.GM_NARRATE,
    GAME_EVENTS.SCENE_TRANSITION,
    GAME_EVENTS.INPUT_VISION,
    GAME_EVENTS.COMBAT_END,
  ],
  rules: [
    GAME_EVENTS.PLAYER_ACTION,
    GAME_EVENTS.PLAYER_ROLL,
    GAME_EVENTS.GM_RULING,
    GAME_EVENTS.COMBAT_ATTACK,
    GAME_EVENTS.PLAYER_USE_EXPERIENCE,
    GAME_EVENTS.PLAYER_USE_HOPE,
  ],
  sceneDirector: [
    GAME_EVENTS.PLAYER_ROLL,
    GAME_EVENTS.GM_USE_FEAR,
    GAME_EVENTS.GM_ENEMY_ACTION,
    GAME_EVENTS.COMBAT_START,
    GAME_EVENTS.INPUT_VISION,
    GAME_EVENTS.SESSION_START,
  ],
  npc: [
    GAME_EVENTS.PLAYER_DIALOGUE,
    GAME_EVENTS.PLAYER_ACTION,
    GAME_EVENTS.GM_NARRATE,
  ],
  combat: [
    GAME_EVENTS.COMBAT_START,
    GAME_EVENTS.COMBAT_ATTACK,
    GAME_EVENTS.COMBAT_DAMAGE,
    GAME_EVENTS.GM_USE_FEAR,
    GAME_EVENTS.GM_ENEMY_ACTION,
    GAME_EVENTS.PLAYER_DEATH_MOVE,
  ],
  faction: [
    GAME_EVENTS.FACTION_RELATION_CHANGE,
    GAME_EVENTS.PLAYER_ACTION,
    GAME_EVENTS.GM_AWARD,
    GAME_EVENTS.PLAYER_REST,
    GAME_EVENTS.SESSION_RESUME,
  ],
  imageDirector: [
    GAME_EVENTS.GM_SCENE_CHANGE,
    GAME_EVENTS.SESSION_START,
    GAME_EVENTS.IMAGE_GENERATE,
    GAME_EVENTS.COMBAT_START,
  ],
  novel: [
    GAME_EVENTS.SESSION_END,
    GAME_EVENTS.NOVEL_GENERATE,
  ],
  memoryCompressor: [
    GAME_EVENTS.SESSION_START,
  ],
  intentParser: [
    GAME_EVENTS.INPUT_TEXT,
    GAME_EVENTS.INPUT_VOICE,
    GAME_EVENTS.INPUT_VISION,
  ],
  unified: [
    GAME_EVENTS.PLAYER_ACTION,
    GAME_EVENTS.PLAYER_DIALOGUE,
    GAME_EVENTS.COMBAT_START,
    GAME_EVENTS.COMBAT_ATTACK,
    GAME_EVENTS.GM_SCENE_CHANGE,
    GAME_EVENTS.GM_NARRATE,
  ],
};

// Event priority for conflict resolution
export const EVENT_PRIORITY: Record<AgentType, number> = {
  rules: 100,
  combat: 80,
  sceneDirector: 60,
  narrative: 40,
  npc: 30,
  faction: 20,
  imageDirector: 10,
  novel: 5,
  memoryCompressor: 1,
  intentParser: 50,
  unified: 45,
};
