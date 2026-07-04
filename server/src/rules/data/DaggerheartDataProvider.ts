/**
 * DaggerheartDataProvider — Daggerheart 规则系统的数据提供者
 *
 * 包装现有 daggerheartData 为 IDataProvider 实现。
 * 内部使用 Map 缓存敌人 ID/名称查找，避免每次线性扫描。
 */

import type { IDataProvider, GameDataCollection } from '../IDataProvider';
import { daggerheartData } from './daggerheart/index';

export class DaggerheartDataProvider implements IDataProvider {
  readonly systemId = 'daggerheart';

  /** 敌人 ID → 敌人数据 的缓存 Map */
  private enemyByIdMap: Map<string, any> | null = null;

  /** 敌人 名称(name/nameEn/id) → 敌人数据 的缓存 Map */
  private enemyByNameMap: Map<string, any> | null = null;

  loadData(): GameDataCollection {
    return daggerheartData as unknown as GameDataCollection;
  }

  getEnemies(): any[] {
    return daggerheartData.enemies;
  }

  getEnemyById(id: string): any | undefined {
    if (!this.enemyByIdMap) {
      this.enemyByIdMap = new Map();
      for (const e of daggerheartData.enemies) {
        this.enemyByIdMap.set(e.id, e);
      }
    }
    return this.enemyByIdMap.get(id);
  }

  getEnemyByName(name: string): any | undefined {
    if (!this.enemyByNameMap) {
      this.enemyByNameMap = new Map();
      for (const e of daggerheartData.enemies) {
        this.enemyByNameMap.set(e.name, e);
        if (e.nameEn) this.enemyByNameMap.set(e.nameEn, e);
        // id 也作为 fallback key
        this.enemyByNameMap.set(e.id, e);
      }
    }
    return this.enemyByNameMap.get(name);
  }

  getWeapons(): any[] {
    return daggerheartData.weapons;
  }

  getArmor(): any[] {
    return daggerheartData.armor;
  }

  getClasses(): any[] {
    return daggerheartData.classes;
  }

  getSubclasses(): any[] {
    return daggerheartData.subclasses;
  }

  getAncestries(): any[] {
    return daggerheartData.ancestries;
  }

  getCommunities(): any[] {
    return daggerheartData.communities;
  }

  getDomainCards(): any[] {
    return daggerheartData.domains;
  }

  getLoot(): any[] {
    return daggerheartData.loot;
  }

  getConsumables(): any[] {
    return daggerheartData.consumables;
  }

  getScars(): any[] {
    return daggerheartData.scars;
  }
}
