/**
 * buildWorldLore - 单测：加载 JSON 数据构建 WorldLore（任务 2.2）
 */
import { buildWorldLore } from '../../campaign/buildWorldLore';

describe('buildWorldLore（任务 2.2）', () => {
  const lore = buildWorldLore();

  test('campaignId 为 drakkenheim', () => {
    expect(lore.campaignId).toBe('drakkenheim');
  });

  test('campaignName 非空', () => {
    expect(lore.campaignName).toBeTruthy();
  });

  test('overview 非空', () => {
    expect(lore.overview.length).toBeGreaterThan(10);
  });

  test('themes 非空', () => {
    expect(lore.themes.length).toBeGreaterThan(0);
  });

  test('tone 为 dark', () => {
    expect(lore.tone).toBe('dark');
  });

  test('factions 有 5 个派系', () => {
    expect(lore.factions).toHaveLength(5);
  });

  test('每个 faction 有 name/ideology/boons', () => {
    for (const f of lore.factions) {
      expect(f.name).toBeTruthy();
      expect(f.ideology).toBeTruthy();
      expect(f.boons.length).toBeGreaterThan(0);
    }
  });

  test('locations 有 10 个地点', () => {
    expect(lore.locations).toHaveLength(10);
  });

  test('location 的 dangerLevel 为字符串枚举（非数字）', () => {
    const validLevels = ['safe', 'low', 'moderate', 'high', 'extreme'];
    for (const loc of lore.locations) {
      expect(validLevels).toContain(loc.dangerLevel);
    }
  });

  test('location 的 hazeLevel 有效', () => {
    const validHaze = ['none', 'light', 'moderate', 'heavy'];
    for (const loc of lore.locations) {
      if (loc.hazeLevel) {
        expect(validHaze).toContain(loc.hazeLevel);
      }
    }
  });

  test('npcs 有 9 个 NPC', () => {
    expect(lore.npcs).toHaveLength(9);
  });

  test('NPC 的 factionId 为 undefined 而非 null', () => {
    for (const npc of lore.npcs) {
      if (npc.factionId !== undefined) {
        expect(npc.factionId).not.toBeNull();
      }
    }
  });

  test('customRules 非空', () => {
    expect(lore.customRules.length).toBeGreaterThan(0);
  });

  test('timeline 为空数组', () => {
    expect(lore.timeline).toEqual([]);
  });
});
