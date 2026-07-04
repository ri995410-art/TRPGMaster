/**
 * DataProviderRegistry — 数据提供者注册表与工厂
 *
 * 通过 systemId 获取对应的 IDataProvider 实例。
 * 默认注册 daggerheart provider；未来可注册 coc、dnd5e 等。
 * 模式与 RulesEngineFactory 一致。
 */

import type { IDataProvider } from './IDataProvider';
import { DaggerheartDataProvider } from './data/DaggerheartDataProvider';

const providers = new Map<string, IDataProvider>();

// 注册默认 provider
const daggerheartProvider = new DaggerheartDataProvider();
providers.set(daggerheartProvider.systemId, daggerheartProvider);

/**
 * 根据 systemId 获取数据提供者实例
 * @throws 如果 systemId 未注册
 */
export function getDataProvider(systemId: string): IDataProvider {
  const provider = providers.get(systemId);
  if (!provider) {
    const available = Array.from(providers.keys()).join(', ');
    throw new Error(`Unknown data provider: "${systemId}". Available: ${available}`);
  }
  return provider;
}

/**
 * 注册新的数据提供者（供插件/模组使用）
 * 如果 systemId 已存在则覆盖
 */
export function registerDataProvider(provider: IDataProvider): void {
  providers.set(provider.systemId, provider);
}

/**
 * 列出所有已注册的数据提供者 systemId
 */
export function listDataProviders(): string[] {
  return Array.from(providers.keys());
}

/**
 * 检查某个 systemId 是否已注册
 */
export function hasDataProvider(systemId: string): boolean {
  return providers.has(systemId);
}
