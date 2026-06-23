/**
 * StateManager - 单测：HP/压力/希望的 clamping 和溢出逻辑（任务 1.3）
 * 验证 applyStateChanges 现在复用的 StateManager 方法行为正确
 */
import { StateManager } from '../../core/StateManager';
import type { Player, Character } from '@trpgmaster/shared';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1', name: 'TestChar',
    hp: 10, maxHp: 10, stress: 0, maxStress: 3, hope: 2, maxHope: 3,
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

describe('StateManager — clamping 和溢出（任务 1.3）', () => {
  describe('updateCharacterHp', () => {
    it('正常扣减 HP', () => {
      const sm = setupStateManagerWithCharacter();
      sm.updateCharacterHp(-3);
      expect(sm.getCharacter().hp).toBe(7);
    });

    it('HP 不能低于 0', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ hp: 2, maxHp: 10 }));
      sm.updateCharacterHp(-5);
      expect(sm.getCharacter().hp).toBe(0);
    });

    it('HP 不能超过 maxHp', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ hp: 9, maxHp: 10 }));
      sm.updateCharacterHp(5);
      expect(sm.getCharacter().hp).toBe(10);
    });

    it('恢复 HP 到 maxHp', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ hp: 5, maxHp: 10 }));
      sm.updateCharacterHp(5);
      expect(sm.getCharacter().hp).toBe(10);
    });
  });

  describe('updateCharacterStress', () => {
    it('正常增加压力', () => {
      const sm = setupStateManagerWithCharacter();
      sm.updateCharacterStress(2);
      expect(sm.getCharacter().stress).toBe(2);
    });

    it('压力不能低于 0', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ stress: 1, maxStress: 3 }));
      sm.updateCharacterStress(-3);
      expect(sm.getCharacter().stress).toBe(0);
    });

    it('压力不能超过 maxStress（截断到 maxStress）', () => {
      const sm = setupStateManagerWithCharacter();
      sm.updateCharacterStress(5);
      expect(sm.getCharacter().stress).toBe(3);
    });

    it('压力溢出到 HP', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ hp: 10, maxHp: 10, stress: 2, maxStress: 3 }));
      sm.updateCharacterStress(3);
      // stress=2+3=5, overflow=5-3=2, stress capped at 3, HP=10-2=8
      expect(sm.getCharacter().stress).toBe(3);
      expect(sm.getCharacter().hp).toBe(8);
    });

    it('压力大幅溢出，HP 仍不低于 0', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ hp: 2, maxHp: 10, stress: 2, maxStress: 3 }));
      sm.updateCharacterStress(10);
      // stress=2+10=12, overflow=12-3=9, HP=2-9→clamped to 0
      expect(sm.getCharacter().stress).toBe(3);
      expect(sm.getCharacter().hp).toBe(0);
    });

    it('减少压力不触发溢出', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ stress: 2, maxStress: 3, hp: 10 }));
      sm.updateCharacterStress(-1);
      expect(sm.getCharacter().stress).toBe(1);
      expect(sm.getCharacter().hp).toBe(10);
    });
  });

  describe('updateCharacterHope', () => {
    it('正常增加希望', () => {
      const sm = setupStateManagerWithCharacter();
      sm.updateCharacterHope(1);
      expect(sm.getCharacter().hope).toBe(3);
    });

    it('希望不能超过 maxHope', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ hope: 3, maxHope: 3 }));
      sm.updateCharacterHope(1);
      expect(sm.getCharacter().hope).toBe(3);
    });

    it('希望不能低于 0', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ hope: 1, maxHope: 3 }));
      sm.updateCharacterHope(-3);
      expect(sm.getCharacter().hope).toBe(0);
    });
  });

  describe('addFearPoints / spendFearPoints', () => {
    it('增加恐惧点', () => {
      const sm = setupStateManagerWithCharacter();
      sm.addFearPoints(3);
      const state = sm.getState();
      expect(state.fearPoints).toBe(3);
      expect(state.totalFearGained).toBe(3);
    });

    it('消耗恐惧点', () => {
      const sm = setupStateManagerWithCharacter();
      sm.addFearPoints(5);
      const result = sm.spendFearPoints(3);
      expect(result).toBe(true);
      expect(sm.getState().fearPoints).toBe(2);
      expect(sm.getState().totalFearSpent).toBe(3);
    });

    it('恐惧点不足时消耗失败', () => {
      const sm = setupStateManagerWithCharacter();
      sm.addFearPoints(2);
      const result = sm.spendFearPoints(5);
      expect(result).toBe(false);
      expect(sm.getState().fearPoints).toBe(2);
    });
  });

  describe('updateCharacterArmorSlots（任务 4.1）', () => {
    it('使用护甲槽', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ armorSlots: 3, maxArmorSlots: 3 }));
      sm.updateCharacterArmorSlots(true);
      expect(sm.getCharacter().armorSlots).toBe(2);
    });

    it('恢复护甲槽', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ armorSlots: 1, maxArmorSlots: 3 }));
      sm.updateCharacterArmorSlots(false);
      expect(sm.getCharacter().armorSlots).toBe(2);
    });

    it('护甲槽不能低于0', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ armorSlots: 0, maxArmorSlots: 3 }));
      sm.updateCharacterArmorSlots(true);
      expect(sm.getCharacter().armorSlots).toBe(0);
    });

    it('护甲槽不能超过maxArmorSlots', () => {
      const sm = setupStateManagerWithCharacter(makeCharacter({ armorSlots: 3, maxArmorSlots: 3 }));
      sm.updateCharacterArmorSlots(false);
      expect(sm.getCharacter().armorSlots).toBe(3);
    });
  });

  describe('addPlayer（任务 4.1）', () => {
    it('添加新玩家', () => {
      const sm = new StateManager('test-session');
      sm.addPlayer({ id: 'p1', name: 'Player1', character: makeCharacter(), isConnected: true, joinedAt: Date.now() });
      expect(sm.getPlayers().length).toBe(1);
    });

    it('更新已存在的玩家', () => {
      const sm = new StateManager('test-session');
      sm.addPlayer({ id: 'p1', name: 'Player1', character: makeCharacter({ name: 'CharA' }), isConnected: true, joinedAt: Date.now() });
      sm.addPlayer({ id: 'p1', name: 'Player1-updated', character: makeCharacter({ name: 'CharB' }), isConnected: true, joinedAt: Date.now() });
      expect(sm.getPlayers().length).toBe(1);
      expect(sm.getPlayers()[0].name).toBe('Player1-updated');
      expect(sm.getCharacter().name).toBe('CharB');
    });

    it('backward compat — first player syncs to state.character', () => {
      const sm = new StateManager('test-session');
      sm.addPlayer({ id: 'p1', name: 'Player1', character: makeCharacter({ name: 'FirstChar' }), isConnected: true, joinedAt: Date.now() });
      expect(sm.getCharacter().name).toBe('FirstChar');
    });
  });

  describe('startSession（任务 4.1）', () => {
    it('单人玩家直接进入 active', () => {
      const sm = setupStateManagerWithCharacter();
      sm.startSession();
      expect(sm.getState().status).toBe('active');
    });

    it('多人玩家进入 sessionZero', () => {
      const sm = new StateManager('test-session');
      sm.addPlayer({ id: 'p1', name: 'Player1', character: makeCharacter(), isConnected: true, joinedAt: Date.now() });
      sm.addPlayer({ id: 'p2', name: 'Player2', character: makeCharacter({ name: 'Char2', id: 'char-2' }), isConnected: true, joinedAt: Date.now() });
      sm.startSession();
      expect(sm.getState().status).toBe('sessionZero');
      expect(sm.getState().sessionZeroPhase).toBe('safety');
    });
  });

  describe('getTensionLevel（任务 4.1）', () => {
    it('low: total < 3', () => {
      const sm = setupStateManagerWithCharacter();
      sm.addFearPoints(2);
      expect(sm.getTensionLevel()).toBe('low');
    });

    it('medium: total >= 3', () => {
      const sm = setupStateManagerWithCharacter();
      sm.addFearPoints(3);
      expect(sm.getTensionLevel()).toBe('medium');
    });

    it('high: total >= 6', () => {
      const sm = setupStateManagerWithCharacter();
      sm.addFearPoints(4);
      sm.spendFearPoints(1);
      // totalFearGained + totalFearSpent = 4 + 1 = 5 → medium, need 6
      sm.addFearPoints(2);
      // totalFearGained = 6, totalFearSpent = 1, total = 7 → high
      expect(sm.getTensionLevel()).toBe('high');
    });

    it('critical: total >= 9', () => {
      const sm = setupStateManagerWithCharacter();
      sm.addFearPoints(9);
      expect(sm.getTensionLevel()).toBe('critical');
    });
  });

  describe('addAdventureMessage（任务 4.1）', () => {
    it('消息上限 500', () => {
      const sm = setupStateManagerWithCharacter();
      for (let i = 0; i < 510; i++) {
        sm.addAdventureMessage({ id: `msg_${i}`, role: 'narrator', content: `msg ${i}`, timestamp: Date.now() });
      }
      const messages = sm.getAdventureMessages();
      expect(messages.length).toBe(500);
      // Last 500 messages kept
      expect(messages[0].id).toBe('msg_10');
    });
  });

  describe('toPersisted + loadFromPersisted（任务 4.1）', () => {
    it('round-trip preserves key state', () => {
      const sm = setupStateManagerWithCharacter();
      sm.addFearPoints(5);
      sm.spendFearPoints(2);
      sm.startSession();

      const persisted = sm.toPersisted('TEST-CODE');

      const sm2 = new StateManager('new-session');
      sm2.loadFromPersisted(persisted);

      const state2 = sm2.getState();
      expect(state2.sessionId).toBe(persisted.sessionId);
      expect(state2.fearPoints).toBe(3);
      expect(state2.totalFearGained).toBe(5);
      expect(state2.totalFearSpent).toBe(2);
      expect(state2.status).toBe('active');
      expect(state2.players.length).toBe(1);
      // All players start disconnected after restore
      expect(state2.players[0].isConnected).toBe(false);
    });
  });
});
