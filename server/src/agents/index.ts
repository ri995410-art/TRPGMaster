/**
 * Agent module exports — deprecated agents have been moved to _deprecated/agents/
 * All GM functionality is now handled by AIGameMaster (see ../ai/AIGameMaster.ts)
 */

// Re-export AIGameMaster as the unified agent
export { AIGameMaster } from '../ai/AIGameMaster';
export type { AIGMConfig } from '../ai/AIGameMaster';
