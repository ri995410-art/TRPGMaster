/**
 * 会话状态持久化
 * 将游戏会话数据写入 session_data.json，服务器重启后恢复
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import type { Character, GameEvent, GameEventType, SessionStatus, CampaignChapter, SpotlightState, SafetyState } from '@trpgmaster/shared';

const SESSION_DATA_FILE = 'session_data.json';

// ===== 冒险消息（与客户端 AdventureMessage 对齐）=====

export interface PersistedAdventureMessage {
  id: string;
  role: 'player' | 'narrator' | 'npc' | 'system';
  content: string;
  timestamp: number;
  npcName?: string;
  npcId?: string;
  choices?: Array<{ id: string; text: string; action?: string }>;
}

// ===== 持久化的单个会话 =====

export interface PersistedSession {
  sessionId: string;
  code: string;
  status: SessionStatus;
  currentScene: {
    id: string;
    name: string;
    description: string;
    environment: string;
  };
  fearPoints: number;
  totalFearGained: number;
  totalFearSpent: number;
  character: Character | null;
  characters: Character[];
  players: Array<{
    id: string;
    name: string;
    characterName?: string;
    characterId?: string;
    joinedAt: number;
  }>;
  hostPlayerId?: string;
  timeline: Array<{
    id: string;
    timestamp: number;
    eventType: GameEventType;
    summary: string;
    isKeyMoment: boolean;
    data?: Record<string, unknown>;
  }>;
  campaignState: {
    campaignId: 'drakkenheim';
    currentLocation: string;
    visitedLocations: string[];
    factionRelations: Record<string, number>;
    personalQuestProgress: Record<string, unknown>;
    factionQuestProgress: Record<string, unknown>;
    contaminationLevel: number;
    deleriumCollected: number;
    sealsFound: string[];
    currentChapter: CampaignChapter;
    hazeExpansion: number;
    narrativeFlags: Record<string, boolean>;
  };
  adventureMessages: PersistedAdventureMessage[];
  shortRestsSinceLong: number;
  spotlightState?: SpotlightState;
  safetyState?: SafetyState;
  createdAt: number;
}

// ===== 持久化文件顶层结构 =====

export interface PersistedSessionData {
  version: number;
  defaultSessionId: string;
  sessions: Record<string, PersistedSession>;
}

/**
 * 从文件加载持久化的会话数据
 */
export function loadSessionData(): PersistedSessionData | null {
  try {
    if (!existsSync(SESSION_DATA_FILE)) return null;
    const raw = readFileSync(SESSION_DATA_FILE, 'utf-8');
    const data = JSON.parse(raw) as PersistedSessionData;
    if (!data || !data.sessions || data.version !== 1) {
      console.warn('[SessionPersistence] Invalid session data file, ignoring');
      return null;
    }
    console.log(`[SessionPersistence] Loaded ${Object.keys(data.sessions).length} session(s) from ${SESSION_DATA_FILE}`);
    return data;
  } catch (err) {
    console.error('[SessionPersistence] Failed to load session data:', err);
    return null;
  }
}

/**
 * 保存会话数据到文件
 */
export function saveSessionData(data: PersistedSessionData): void {
  try {
    const tmp = SESSION_DATA_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    renameSync(tmp, SESSION_DATA_FILE);
  } catch (err) {
    console.error('[SessionPersistence] Failed to save session data:', err);
  }
}

/**
 * 删除持久化文件（用于重置）
 */
export function clearSessionData(): void {
  try {
    if (existsSync(SESSION_DATA_FILE)) {
      const { unlinkSync } = require('fs');
      unlinkSync(SESSION_DATA_FILE);
      console.log('[SessionPersistence] Session data file removed');
    }
  } catch {
    // Ignore
  }
}
