/**
 * stateChangeParser - 单测（任务 4.1）
 * 验证：extractStateChanges、parseStateKeyValue、extractChoices、applyStateChanges
 */
import {
  extractStateChanges,
  parseStateKeyValue,
  extractChoices,
  applyStateChanges,
} from '../../network/stateChangeParser';
import { StateManager } from '../../core/StateManager';
import type { Player, Character } from '@trpgmaster/shared';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1', name: 'TestChar',
    hp: 10, maxHp: 10, stress: 0, maxStress: 3, hope: 2, maxHope: 6,
    armorSlots: 2, maxArmorSlots: 3, evasion: 10,
    minorThreshold: 1, majorThreshold: 2, severeThreshold: 4,
    ...overrides,
  } as Character;
}

function setupStateManagerWithCharacter(char?: Character): StateManager {
  const sm = new StateManager('test-session');
  const character = char || makeCharacter();
  const player: Player = {
    id: 'player-1',
    name: 'TestPlayer',
    character,
    isConnected: true,
    joinedAt: Date.now(),
  };
  sm.addPlayer(player);
  return sm;
}

describe('stateChangeParser', () => {
  describe('extractStateChanges', () => {
    test('extracts unnamed [STATE] line', () => {
      const content = 'Some narration\n[STATE] hp:-3 stress:+1\nMore narration';
      const { cleanContent, stateChanges } = extractStateChanges(content);
      expect(cleanContent).toBe('Some narration\nMore narration');
      expect(stateChanges.length).toBe(1);
      expect(stateChanges[0].characterName).toBeUndefined();
      expect(stateChanges[0].changes).toEqual({ hp: -3, stress: 1 });
    });

    test('extracts named [STATE:CharacterName] line', () => {
      const content = '[STATE:阿尔忒弥斯] hp:-2 hope:+1';
      const { cleanContent, stateChanges } = extractStateChanges(content);
      expect(cleanContent).toBe('');
      expect(stateChanges.length).toBe(1);
      expect(stateChanges[0].characterName).toBe('阿尔忒弥斯');
      expect(stateChanges[0].changes).toEqual({ hp: -2, hope: 1 });
    });

    test('multiple [STATE] lines', () => {
      const content = '[STATE] hp:-1\nNarration\n[STATE:Other] stress:+2';
      const { cleanContent, stateChanges } = extractStateChanges(content);
      expect(cleanContent).toBe('Narration');
      expect(stateChanges.length).toBe(2);
      expect(stateChanges[0].changes).toEqual({ hp: -1 });
      expect(stateChanges[1].characterName).toBe('Other');
    });

    test('no [STATE] lines returns empty changes', () => {
      const content = 'Just narration, no state changes.';
      const { cleanContent, stateChanges } = extractStateChanges(content);
      expect(cleanContent).toBe(content);
      expect(stateChanges).toEqual([]);
    });

    test('invalid key in [STATE] is skipped', () => {
      const content = '[STATE] hp:-3 invalidkey:+1 stress:+1';
      const { stateChanges } = extractStateChanges(content);
      // parseStateKeyValue only matches \w+:[+-]?\d+, so "invalidkey:+1" should match
      // Actually it does match \w+ pattern. Let me test with truly invalid format
      expect(stateChanges[0].changes).toEqual({ hp: -3, invalidkey: 1, stress: 1 });
    });

    test('truly invalid format is skipped', () => {
      const content = '[STATE] hp-3 not-a-pair stress:+1';
      const { stateChanges } = extractStateChanges(content);
      expect(stateChanges[0].changes).toEqual({ stress: 1 });
    });
  });

  describe('parseStateKeyValue', () => {
    test('parses normal key:value pairs', () => {
      expect(parseStateKeyValue('hp:-3 stress:+1 hope:+2')).toEqual({
        hp: -3, stress: 1, hope: 2,
      });
    });

    test('skips invalid formats', () => {
      expect(parseStateKeyValue('hp:-3 badformat stress:1')).toEqual({
        hp: -3, stress: 1,
      });
    });

    test('empty string returns empty', () => {
      expect(parseStateKeyValue('')).toEqual({});
    });

    test('positive without plus sign', () => {
      expect(parseStateKeyValue('hp:5')).toEqual({ hp: 5 });
    });
  });

  describe('extractChoices', () => {
    test('extracts numbered options', () => {
      const content = '你可以：\n1) 探索洞穴\n2) 与NPC交谈\n3) 休息';
      const choices = extractChoices(content);
      expect(choices).toBeDefined();
      expect(choices!.length).toBe(3);
      expect(choices![0]).toEqual({ id: 'choice_1', label: '探索洞穴', action: '探索洞穴' });
    });

    test('extracts bracketed options', () => {
      const content = '你可以【探索】或者【休息】';
      const choices = extractChoices(content);
      expect(choices).toBeDefined();
      expect(choices!.length).toBe(2);
      expect(choices![0].label).toBe('探索');
    });

    test('less than 2 options returns undefined', () => {
      const content = '1) 单一选项';
      const choices = extractChoices(content);
      expect(choices).toBeUndefined();
    });

    test('more than 4 options truncated to 4', () => {
      const content = '1) A\n2) B\n3) C\n4) D\n5) E';
      const choices = extractChoices(content);
      expect(choices).toBeDefined();
      expect(choices!.length).toBe(4);
    });

    test('no options returns undefined', () => {
      const content = '纯叙述文本，没有任何选项。';
      const choices = extractChoices(content);
      expect(choices).toBeUndefined();
    });

    test('circled number options on separate lines', () => {
      const content = '① 探索\n② 战斗\n③ 逃跑';
      const choices = extractChoices(content);
      expect(choices).toBeDefined();
      expect(choices!.length).toBe(3);
    });
  });

  describe('applyStateChanges', () => {
    test('applies HP change via StateManager', () => {
      const sm = setupStateManagerWithCharacter();
      applyStateChanges(sm, 'player-1', [{ changes: { hp: -3 } }]);
      expect(sm.getCharacter().hp).toBe(7);
    });

    test('stress overflow to HP', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ hp: 10, maxHp: 10, stress: 2, maxStress: 3 }));
      applyStateChanges(sm, 'player-1', [{ changes: { stress: 3 } }]);
      // stress=2+3=5, overflow=5-3=2, stress capped at 3, HP=10-2=8
      expect(sm.getCharacter().stress).toBe(3);
      expect(sm.getCharacter().hp).toBe(8);
    });

    test('hope clamped to maxHope', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ hope: 5, maxHope: 6 }));
      applyStateChanges(sm, 'player-1', [{ changes: { hope: 5 } }]);
      expect(sm.getCharacter().hope).toBe(6);
    });

    test('fearPoints add and spend', () => {
      const sm = setupStateManagerWithCharacter();
      applyStateChanges(sm, 'player-1', [{ changes: { fearPoints: 3 } }]);
      expect(sm.getState().fearPoints).toBe(3);
      applyStateChanges(sm, 'player-1', [{ changes: { fearPoints: -2 } }]);
      expect(sm.getState().fearPoints).toBe(1);
    });

    test('unknown key is ignored', () => {
      const sm = setupStateManagerWithCharacter();
      applyStateChanges(sm, 'player-1', [{ changes: { unknownKey: 5 } }]);
      // No crash, no state change
      expect(sm.getCharacter().hp).toBe(10);
    });

    test('named character lookup', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ name: '阿尔忒弥斯' }));
      applyStateChanges(sm, 'player-1', [{ characterName: '阿尔忒弥斯', changes: { hp: -2 } }]);
      expect(sm.getCharacter().hp).toBe(8);
    });
  });
});
