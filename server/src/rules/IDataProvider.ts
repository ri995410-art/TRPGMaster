/**
 * IDataProvider — 通用游戏数据提供者接口
 *
 * 各规则系统（Daggerheart、CoC、D&D 5e 等）的游戏数据通过此接口统一访问。
 * 通过 DataProviderRegistry 注册和获取实例，实现动态数据加载。
 */

export interface GameDataCollection {
  weapons: any[];
  armor: any[];
  classes: any[];
  subclasses: any[];
  ancestries: any[];
  communities: any[];
  domains: any[];             // Daggerheart 领域卡数据
  enemies: any[];
  loot: any[];
  consumables: any[];
  scars?: any[];            // Daggerheart 专有，可选
  [key: string]: any[] | undefined;  // 允许扩展
}

export interface IDataProvider {
  /** 机器可读标识符：'daggerheart' | 'coc' | 'dnd5e' 等 */
  readonly systemId: string;

  /** 加载并返回该系统的全部游戏数据 */
  loadData(): GameDataCollection;

  /** 获取敌人列表 */
  getEnemies(): any[];

  /** 按 ID 获取敌人数据（内部使用 Map 缓存，O(1) 查找） */
  getEnemyById(id: string): any | undefined;

  /** 按名称（name / nameEn / id）查找敌人数据 */
  getEnemyByName(name: string): any | undefined;

  /** 获取武器列表 */
  getWeapons(): any[];

  /** 获取护甲列表 */
  getArmor(): any[];

  /** 获取职业列表 */
  getClasses(): any[];

  /** 获取子职业列表 */
  getSubclasses(): any[];

  /** 获取血统列表 */
  getAncestries(): any[];

  /** 获取社区列表 */
  getCommunities(): any[];

  /** 获取领域卡列表（系统专有，可能为空） */
  getDomainCards(): any[];

  /** 获取战利品列表 */
  getLoot(): any[];

  /** 获取消耗品列表 */
  getConsumables(): any[];

  /** 获取伤疤列表（系统专有，可能为空） */
  getScars(): any[];
}
