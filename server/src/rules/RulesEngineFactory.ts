/**
 * RulesEngineFactory — 规则引擎注册表与工厂
 *
 * 通过 systemId 获取对应的 IRulesEngine 实例。
 * 默认注册 daggerheart 引擎；未来可注册 coc、dnd5e 等。
 */
import type { IRulesEngine } from './IRulesEngine';
import { daggerHeartRules } from './systems/DaggerHeartRules';
import type { PromptProviderConfig } from '../ai/IPromptProvider';
import { daggerheartPromptProvider } from '../ai/prompt-providers';

const engines = new Map<string, IRulesEngine>();
const promptProviders = new Map<string, PromptProviderConfig>();

// 注册默认引擎
engines.set(daggerHeartRules.systemId, daggerHeartRules);
promptProviders.set(daggerheartPromptProvider.systemId, daggerheartPromptProvider);

/**
 * 根据 systemId 获取规则引擎实例
 * @throws 如果 systemId 未注册
 */
export function getRulesEngine(systemId: string): IRulesEngine {
  const engine = engines.get(systemId);
  if (!engine) {
    const available = Array.from(engines.keys()).join(', ');
    throw new Error(`Unknown rules system: "${systemId}". Available: ${available}`);
  }
  return engine;
}

/**
 * 根据 systemId 获取对应的 PromptProviderConfig
 * @throws 如果 systemId 未注册
 */
export function getPromptProvider(systemId: string): PromptProviderConfig {
  const provider = promptProviders.get(systemId);
  if (!provider) {
    const available = Array.from(promptProviders.keys()).join(', ');
    throw new Error(`Unknown prompt provider: "${systemId}". Available: ${available}`);
  }
  return provider;
}

/**
 * 注册新的规则引擎（供插件/模组使用）
 * 如果 systemId 已存在则覆盖
 */
export function registerRulesEngine(engine: IRulesEngine): void {
  engines.set(engine.systemId, engine);
}

/**
 * 注册新的 PromptProvider（供插件/模组使用）
 * 如果 systemId 已存在则覆盖
 */
export function registerPromptProvider(provider: PromptProviderConfig): void {
  promptProviders.set(provider.systemId, provider);
}

/**
 * 列出所有已注册的规则系统
 */
export function listRulesSystems(): Array<{ systemId: string; systemName: string; maxLevel: number }> {
  return Array.from(engines.values()).map(e => ({
    systemId: e.systemId,
    systemName: e.systemName,
    maxLevel: e.maxLevel,
  }));
}

/**
 * 检查某个 systemId 是否已注册
 */
export function hasRulesEngine(systemId: string): boolean {
  return engines.has(systemId);
}
