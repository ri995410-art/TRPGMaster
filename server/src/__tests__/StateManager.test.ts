import { StateManager } from '../core/StateManager';
import type { Character, CorruptionLevel } from '@trpgmaster/shared';

function createMockCharacter(id: string = 'char_1', overrides: Partial<Character> = {}): Character {
  return {
    id,
    playerId: `player_${id}`,
    name: `角色${id}`,
    ruleSystem: 'daggerheart',
    classId: 'warrior',
    subclassId: undefined,
    ancestryId: 'human',
    communityId: 'high_city',
    level: 1,
    tier: 1,
    proficiency: 1,
    attributes: {
      agility: 0,
      strength: 2,
      finesse: 1,
      instinct: 1,
      presence: 0,
      knowledge: -1,
    },
    hp: 7,
    maxHp: 7,
    stress: 0,
    maxStress: 7,
    hope: 2,
    maxHope: 6,
    armorSlots: 3,
    maxArmorSlots: 3,
    evasion: 10,
    majorThreshold: 11,
    severeThreshold: 22,
    mainWeaponId: 'sword',
    offWeaponId: undefined,
    armorId: 'light_armor',
    inventory: [],
    experiences: [
      { id: 'exp1', name: '战场老兵', modifier: 2 },
      { id: 'exp2', name: '酒吧格斗', modifier: 2 },
      { id: 'exp3', name: '城门守卫', modifier: 1 },
    ],
    domainCards: [],
    scars: [],
    conditions: [],
    resistances: [],
    reactionsUsed: 0,
    focusTokens: 0,
    attributeMarks: {
      agility: false,
      strength: false,
      finesse: false,
      instinct: false,
      presence: false,
      knowledge: false,
    },
    corruption: 0,
    factionRelations: {},
    backstory: '',
    personalQuest: '',
    relationships: [],
    ...overrides,
  };
}

describe('StateManager', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager('test_session', 'gm_1', 'daggerheart');
  });

  describe('initial state', () => {
    it('creates session in setup status', () => {
      const state = stateManager.getState();
      expect(state.status).toBe('setup');
      expect(state.sessionId).toBe('test_session');
      expect(state.gmId).toBe('gm_1');
      expect(state.ruleSystem).toBe('daggerheart');
      expect(state.fearPoints).toBe(0);
      expect(state.totalFearGained).toBe(0);
      expect(state.totalFearSpent).toBe(0);
      expect(state.players).toHaveLength(0);
    });
  });

  describe('session lifecycle', () => {
    it('starts session and sets status to active', () => {
      stateManager.startSession();
      expect(stateManager.getState().status).toBe('active');
      expect(stateManager.getState().roundTracker.currentRound).toBe(1);
    });

    it('pauses session', () => {
      stateManager.startSession();
      stateManager.pauseSession();
      expect(stateManager.getState().status).toBe('paused');
    });

    it('resumes session', () => {
      stateManager.startSession();
      stateManager.pauseSession();
      stateManager.resumeSession();
      expect(stateManager.getState().status).toBe('active');
    });

    it('ends session', () => {
      stateManager.startSession();
      stateManager.endSession();
      expect(stateManager.getState().status).toBe('ended');
    });
  });

  describe('character management', () => {
    it('sets and retrieves character', () => {
      const char = createMockCharacter('c1');
      stateManager.setCharacter(char);

      expect(stateManager.getCharacter('c1')).toEqual(char);
      expect(stateManager.getAllCharacters()).toHaveLength(1);
    });

    it('updates character HP', () => {
      const char = createMockCharacter('c1', { hp: 7, maxHp: 7 });
      stateManager.setCharacter(char);

      stateManager.updateCharacterHp('c1', -2);
      expect(stateManager.getCharacter('c1')!.hp).toBe(5);
    });

    it('does not allow HP below 0', () => {
      const char = createMockCharacter('c1', { hp: 2, maxHp: 7 });
      stateManager.setCharacter(char);

      stateManager.updateCharacterHp('c1', -10);
      expect(stateManager.getCharacter('c1')!.hp).toBe(0);
    });

    it('does not allow HP above maxHp', () => {
      const char = createMockCharacter('c1', { hp: 5, maxHp: 7 });
      stateManager.setCharacter(char);

      stateManager.updateCharacterHp('c1', 10);
      expect(stateManager.getCharacter('c1')!.hp).toBe(7);
    });

    it('returns false for non-existent character', () => {
      expect(stateManager.updateCharacterHp('nonexistent', -1)).toBe(false);
    });

    it('updates character stress', () => {
      const char = createMockCharacter('c1', { stress: 3, maxStress: 7 });
      stateManager.setCharacter(char);

      stateManager.updateCharacterStress('c1', -2);
      expect(stateManager.getCharacter('c1')!.stress).toBe(1);
    });

    it('updates character hope', () => {
      const char = createMockCharacter('c1', { hope: 2, maxHope: 6 });
      stateManager.setCharacter(char);

      stateManager.updateCharacterHope('c1', 2);
      expect(stateManager.getCharacter('c1')!.hope).toBe(4);
    });

    it('does not allow hope above maxHope', () => {
      const char = createMockCharacter('c1', { hope: 4, maxHope: 6 });
      stateManager.setCharacter(char);

      stateManager.updateCharacterHope('c1', 5);
      expect(stateManager.getCharacter('c1')!.hope).toBe(6);
    });

    it('transfers overflow stress to HP damage', () => {
      const char = createMockCharacter('c1', { hp: 7, maxHp: 7, stress: 6, maxStress: 7 });
      stateManager.setCharacter(char);

      // Adding 3 stress when max is 7: overflow by 2
      stateManager.updateCharacterStress('c1', 3);
      expect(stateManager.getCharacter('c1')!.stress).toBe(7);
      expect(stateManager.getCharacter('c1')!.hp).toBe(5); // 7 - 2 overflow
    });

    it('updates character corruption', () => {
      const char = createMockCharacter('c1', { corruption: 0 });
      stateManager.setCharacter(char);

      stateManager.updateCharacterCorruption('c1', 3);
      expect(stateManager.getCharacter('c1')!.corruption).toBe(3);
    });

    it('updates armor slots (mark used)', () => {
      const char = createMockCharacter('c1', { armorSlots: 3, maxArmorSlots: 3 });
      stateManager.setCharacter(char);

      stateManager.updateCharacterArmorSlots('c1', true);
      expect(stateManager.getCharacter('c1')!.armorSlots).toBe(2);
    });

    it('does not mark armor slots when already 0', () => {
      const char = createMockCharacter('c1', { armorSlots: 0, maxArmorSlots: 3 });
      stateManager.setCharacter(char);

      stateManager.updateCharacterArmorSlots('c1', true);
      expect(stateManager.getCharacter('c1')!.armorSlots).toBe(0);
    });

    it('restores armor slots', () => {
      const char = createMockCharacter('c1', { armorSlots: 1, maxArmorSlots: 3 });
      stateManager.setCharacter(char);

      stateManager.updateCharacterArmorSlots('c1', false);
      expect(stateManager.getCharacter('c1')!.armorSlots).toBe(2);
    });
  });

  describe('GM resources', () => {
    it('adds fear points', () => {
      stateManager.addFearPoints(3);
      expect(stateManager.getState().fearPoints).toBe(3);
    });

    it('spends fear points', () => {
      stateManager.addFearPoints(5);
      const result = stateManager.spendFearPoints(2);

      expect(result).toBe(true);
      expect(stateManager.getState().fearPoints).toBe(3);
    });

    it('fails to spend more fear than available', () => {
      stateManager.addFearPoints(2);
      const result = stateManager.spendFearPoints(5);

      expect(result).toBe(false);
      expect(stateManager.getState().fearPoints).toBe(2);
    });

    it('tracks total fear gained and spent', () => {
      stateManager.addFearPoints(5);
      stateManager.spendFearPoints(2);
      stateManager.addFearPoints(3);
      stateManager.spendFearPoints(1);

      expect(stateManager.getState().fearPoints).toBe(5); // 5 - 2 + 3 - 1
      expect(stateManager.getState().totalFearGained).toBe(8); // 5 + 3
      expect(stateManager.getState().totalFearSpent).toBe(3); // 2 + 1
    });

    it('calculates tension level', () => {
      expect(stateManager.getTensionLevel()).toBe('low'); // 0 + 0 = 0

      stateManager.addFearPoints(2);
      expect(stateManager.getTensionLevel()).toBe('low'); // 2 + 0 = 2

      stateManager.addFearPoints(2);
      expect(stateManager.getTensionLevel()).toBe('medium'); // 4 + 0 = 4

      stateManager.addFearPoints(3);
      expect(stateManager.getTensionLevel()).toBe('high'); // 7 + 0 = 7

      stateManager.spendFearPoints(4);
      expect(stateManager.getTensionLevel()).toBe('critical'); // 7 + 4 = 11
    });
  });

  describe('player management', () => {
    it('adds and removes players', () => {
      stateManager.addPlayer({
        playerId: 'p1',
        name: '玩家1',
        connected: true,
        characterId: 'c1',
        isActing: false,
      });

      expect(stateManager.getState().players).toHaveLength(1);

      stateManager.removePlayer('p1');
      expect(stateManager.getState().players).toHaveLength(0);
    });

    it('sets player connection state', () => {
      stateManager.addPlayer({
        playerId: 'p1',
        name: '玩家1',
        connected: true,
        characterId: 'c1',
        isActing: false,
      });

      stateManager.setPlayerConnected('p1', false);
      expect(stateManager.getState().players[0].connected).toBe(false);
    });
  });

  describe('combat management', () => {
    it('starts combat with enemies', () => {
      stateManager.startCombat([
        {
          id: 'enemy_1',
          statBlockId: 'bandit',
          name: '强盗',
          currentHp: 10,
          maxHp: 10,
          currentStress: 0,
          maxStress: 3,
          conditions: [],
          isFocused: false,
        },
      ]);

      expect(stateManager.getCombatState()).toBeDefined();
      expect(stateManager.getCombatState()!.enemies).toHaveLength(1);
    });

    it('ends combat', () => {
      stateManager.startCombat([]);
      stateManager.endCombat();

      expect(stateManager.getCombatState()).toBeUndefined();
    });

    it('updates enemy HP in combat', () => {
      stateManager.startCombat([
        {
          id: 'enemy_1',
          statBlockId: 'bandit',
          name: '强盗',
          currentHp: 10,
          maxHp: 10,
          currentStress: 0,
          maxStress: 3,
          conditions: [],
          isFocused: false,
        },
      ]);

      stateManager.updateCombatEnemyHp('enemy_1', -3);
      expect(stateManager.getCombatState()!.enemies[0].currentHp).toBe(7);
    });

    it('removes enemy from combat', () => {
      stateManager.startCombat([
        {
          id: 'enemy_1',
          statBlockId: 'bandit',
          name: '强盗',
          currentHp: 10,
          maxHp: 10,
          currentStress: 0,
          maxStress: 3,
          conditions: [],
          isFocused: false,
        },
      ]);

      stateManager.removeCombatEnemy('enemy_1');
      expect(stateManager.getCombatState()!.enemies).toHaveLength(0);
    });
  });

  describe('exploration timer (Drakkenheim)', () => {
    it('sets exploration timer', () => {
      stateManager.setExplorationTimer(4);
      expect(stateManager.getState().explorationTimer).toBe(4);
    });

    it('decrements exploration timer', () => {
      stateManager.setExplorationTimer(3);
      const result = stateManager.decrementExplorationTimer();

      expect(result).toBe(2);
      expect(stateManager.getState().explorationTimer).toBe(2);
    });

    it('does not decrement below 0', () => {
      stateManager.setExplorationTimer(0);
      const result = stateManager.decrementExplorationTimer();

      expect(result).toBe(0);
    });
  });

  describe('timeline', () => {
    it('adds timeline entries', () => {
      stateManager.addTimelineEntry({
        id: 'tl_1',
        timestamp: Date.now(),
        eventType: 'combat:start',
        summary: '战斗开始',
        isKeyMoment: true,
      });

      expect(stateManager.getState().timeline).toHaveLength(1);
    });

    it('retrieves key moments', () => {
      stateManager.addTimelineEntry({
        id: 'tl_1',
        timestamp: Date.now(),
        eventType: 'combat:start',
        summary: '战斗开始',
        isKeyMoment: true,
      });
      stateManager.addTimelineEntry({
        id: 'tl_2',
        timestamp: Date.now(),
        eventType: 'player:action',
        summary: '玩家行动',
        isKeyMoment: false,
      });

      expect(stateManager.getKeyMoments()).toHaveLength(1);
    });
  });

  describe('snapshot', () => {
    it('returns complete snapshot', () => {
      const char = createMockCharacter('c1');
      stateManager.setCharacter(char);

      const snapshot = stateManager.getSnapshot();
      expect(snapshot.state).toBeDefined();
      expect(snapshot.characters).toHaveLength(1);
      expect(snapshot.timestamp).toBeDefined();
    });
  });

  describe('change notification', () => {
    it('notifies listeners on state change', () => {
      const listener = jest.fn();
      stateManager.onChange('test', listener);

      stateManager.startSession();

      expect(listener).toHaveBeenCalled();
    });
  });
});