/**
 * AIGameMasterPool — per-session AI GM instance pool
 *
 * Each session may use a different rules system (daggerheart, coc, dnd5e, …),
 * which requires a different PromptProvider. This pool lazily creates
 * AIGameMaster instances per session, injecting the correct provider via
 * RulesEngineFactory.getPromptProvider(systemId).
 */
import { AIGameMaster } from './AIGameMaster';
import type { AIGMConfig } from './AIGameMaster';
import type { SessionStore } from '../core/SessionStore';
import { getPromptProvider } from '../rules/RulesEngineFactory';
import { buildWorldLore } from '../campaign/buildWorldLore';
import type { WorldLore } from '@trpgmaster/shared';

export class AIGameMasterPool {
  private instances: Map<string, AIGameMaster> = new Map();
  private baseConfig: Omit<AIGMConfig, 'promptProvider'>;
  private sessionStore: SessionStore;
  private worldLore: WorldLore | null;

  constructor(baseConfig: AIGMConfig, sessionStore: SessionStore) {
    const { promptProvider: _, ...rest } = baseConfig;
    this.baseConfig = rest;
    this.sessionStore = sessionStore;
    this.worldLore = null;
  }

  setWorldLore(lore: WorldLore): void {
    this.worldLore = lore;
    // Apply to all existing instances
    for (const gm of this.instances.values()) {
      gm.setWorldLore(lore);
    }
  }

  getOrCreate(sessionId: string, systemId: string): AIGameMaster | undefined {
    let gm = this.instances.get(sessionId);
    if (gm) return gm;

    try {
      const promptProvider = getPromptProvider(systemId);
      const config = { ...this.baseConfig, promptProvider } as AIGMConfig;
      gm = new AIGameMaster(config, this.sessionStore);
      if (this.worldLore) gm.setWorldLore(this.worldLore);
      this.instances.set(sessionId, gm);
      return gm;
    } catch (err) {
      console.error(`[AIGameMasterPool] Failed to create GM for session ${sessionId} (systemId: ${systemId}):`, err);
      return undefined;
    }
  }

  dispose(sessionId: string): void {
    this.instances.delete(sessionId);
  }

  /** Clear all instances (used during AI hot-reload) */
  clear(): void {
    this.instances.clear();
  }

  /** Update base config and clear instances so they're recreated on next access */
  updateConfig(newConfig: AIGMConfig): void {
    const { promptProvider: _, ...rest } = newConfig;
    this.baseConfig = rest;
    this.clear();
  }
}
