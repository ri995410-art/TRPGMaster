/**
 * Loot resolver — generates post-combat loot and scene search results
 * Uses loot.json and consumables.json catalogs with dice-roll selection
 */
import lootData from './data/daggerheart/loot.json';
import consumablesData from './data/daggerheart/consumables.json';
import type { LootResult } from '@trpgmaster/shared';
import { rollDualD12 } from './systems/DaggerHeartRules';

/** Simple dN roll */
function rollD(n: number): number {
  return Math.floor(Math.random() * n) + 1;
}

/** Roll for post-combat loot based on difficulty tier */
export function rollLootTable(difficulty: number, tier: number = 1): LootResult {
  const items: LootResult['items'] = [];
  const gold: LootResult['gold'] = { coins: 0, handfuls: 0, bags: 0, chests: 0 };

  // Number of items scales with difficulty
  const itemCount = difficulty >= 20 ? 2 : 1;

  // Roll for consumables (1 per combat, tier-based)
  const consumablePool = (consumablesData as any[]).filter((c: any) => {
    if (tier >= 3) return true;
    if (tier >= 2) return c.rarity !== 'rare';
    return c.rarity === 'common';
  });

  for (let i = 0; i < itemCount; i++) {
    // 50% chance loot item, 50% chance consumable
    if (Math.random() < 0.5 && (lootData as any[]).length > 0) {
      const roll = rollD(Math.min((lootData as any[]).length, 20));
      const entry = (lootData as any[]).find((l: any) => l.roll === roll);
      if (entry) {
        items.push({
          id: entry.id,
          name: entry.name,
          description: entry.description,
          category: 'treasure',
          quantity: 1,
        });
      }
    } else if (consumablePool.length > 0) {
      const idx = Math.floor(Math.random() * consumablePool.length);
      const entry = consumablePool[idx];
      items.push({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        category: 'consumable',
        quantity: 1,
      });
    }
  }

  // Gold reward scales with difficulty
  const coinRoll = rollD(difficulty >= 20 ? 20 : difficulty >= 15 ? 12 : 6);
  gold.coins = coinRoll;

  return { items, gold };
}

/** Roll for scene search results (smaller loot) */
export function rollSceneSearchLoot(): LootResult {
  const items: LootResult['items'] = [];
  const gold: LootResult['gold'] = { coins: 0, handfuls: 0, bags: 0, chests: 0 };

  // Scene search gives fewer items
  if (Math.random() < 0.4) {
    // 40% chance to find a consumable
    const pool = (consumablesData as any[]).filter((c: any) => c.rarity === 'common');
    if (pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      const entry = pool[idx];
      items.push({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        category: 'consumable',
        quantity: 1,
      });
    }
  }

  // Small gold find
  gold.coins = rollD(4);

  return { items, gold };
}
