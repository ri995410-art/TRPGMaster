// 事件常量 - 简化为单人AI GM系统
import type { GameEventType } from '../types/events';

export const GAME_EVENTS = {
  // 玩家行动
  PLAYER_ACTION: 'player:action',
  PLAYER_DIALOGUE: 'player:dialogue',
  PLAYER_ROLL: 'player:roll',
  PLAYER_USE_HOPE: 'player:useHope',
  PLAYER_USE_EXPERIENCE: 'player:useExperience',
  PLAYER_REST: 'player:rest',
  PLAYER_DEATH_MOVE: 'player:deathMove',
  PLAYER_SWAP_DOMAIN_CARD: 'player:swapDomainCard',

  // AI GM 行动
  GM_NARRATE: 'gm:narrate',
  GM_SCENE_CHANGE: 'gm:sceneChange',
  GM_USE_FEAR: 'gm:useFear',
  GM_ENEMY_ACTION: 'gm:enemyAction',
  GM_RULING: 'gm:ruling',
  GM_SET_DIFFICULTY: 'gm:setDifficulty',
  GM_AWARD: 'gm:award',
  GM_TRIGGER_COUNTDOWN: 'gm:triggerCountdown',

  // 战斗事件
  COMBAT_START: 'combat:start',
  COMBAT_END: 'combat:end',
  COMBAT_ATTACK: 'combat:attack',
  COMBAT_DAMAGE: 'combat:damage',
  COMBAT_HEAL: 'combat:heal',
  COMBAT_CONDITION_APPLY: 'combat:conditionApply',
  COMBAT_CONDITION_REMOVE: 'combat:conditionRemove',
  COMBAT_ENEMY_DEFEATED: 'combat:enemyDefeated',
  COMBAT_FOCUS: 'combat:focus',

  // 场景事件
  SCENE_DESCRIBE: 'scene:describe',
  SCENE_TRANSITION: 'scene:transition',
  SCENE_ENVIRONMENT_CHANGE: 'scene:environmentChange',

  // 战役事件
  SESSION_START: 'session:start',
  SESSION_END: 'session:end',
  SESSION_PAUSE: 'session:pause',
  SESSION_RESUME: 'session:resume',
  CAMPAIGN_MILESTONE: 'campaign:milestone',
  CAMPAIGN_LEVEL_UP: 'campaign:levelUp',
  FACTION_RELATION_CHANGE: 'faction:relationChange',
  FACTION_ACTION: 'faction:action',
  FACTION_MISSION_COMPLETE: 'faction:missionComplete',

  // 德拉肯海姆特殊事件
  DRAKKENHEIM_CONTAMINATION: 'drakkenheim:contamination',
  DRAKKENHEIM_HAZE_EFFECT: 'drakkenheim:hazeEffect',
  DRAKKENHEIM_DELERIUM_FOUND: 'drakkenheim:deleriumFound',
  DRAKKENHEIM_SEAL_FOUND: 'drakkenheim:sealFound',
} as const;

// AI GM处理的事件类型映射
export const AIGM_EVENT_SUBSCRIPTIONS: GameEventType[] = [
  GAME_EVENTS.PLAYER_ACTION,
  GAME_EVENTS.PLAYER_DIALOGUE,
  GAME_EVENTS.PLAYER_ROLL,
  GAME_EVENTS.PLAYER_USE_HOPE,
  GAME_EVENTS.PLAYER_USE_EXPERIENCE,
  GAME_EVENTS.PLAYER_REST,
  GAME_EVENTS.PLAYER_DEATH_MOVE,
  GAME_EVENTS.COMBAT_START,
  GAME_EVENTS.COMBAT_END,
  GAME_EVENTS.COMBAT_ATTACK,
  GAME_EVENTS.COMBAT_DAMAGE,
  GAME_EVENTS.FACTION_RELATION_CHANGE,
  GAME_EVENTS.FACTION_ACTION,
  GAME_EVENTS.SESSION_START,
  GAME_EVENTS.SESSION_END,
  GAME_EVENTS.DRAKKENHEIM_CONTAMINATION,
  GAME_EVENTS.DRAKKENHEIM_HAZE_EFFECT,
  GAME_EVENTS.DRAKKENHEIM_DELERIUM_FOUND,
];

// 规则引擎处理的事件（纯机制判定）
export const RULE_ENGINE_SUBSCRIPTIONS: GameEventType[] = [
  GAME_EVENTS.PLAYER_ROLL,
  GAME_EVENTS.COMBAT_ATTACK,
  GAME_EVENTS.COMBAT_DAMAGE,
  GAME_EVENTS.COMBAT_HEAL,
  GAME_EVENTS.PLAYER_USE_HOPE,
  GAME_EVENTS.PLAYER_USE_EXPERIENCE,
  GAME_EVENTS.PLAYER_DEATH_MOVE,
  GAME_EVENTS.PLAYER_REST,
  GAME_EVENTS.PLAYER_SWAP_DOMAIN_CARD,
  GAME_EVENTS.CAMPAIGN_LEVEL_UP,
];