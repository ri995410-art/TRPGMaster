/**
 * 会话状态持久化
 * 将游戏会话数据写入 session_data.json，服务器重启后恢复
 *
 * 安全措施:
 * - 写入前创建 .bak 备份
 * - 使用 copyFileSync + unlinkSync 替代 renameSync（Windows 兼容）
 * - 损坏数据自动从备份恢复
 * - 版本迁移路径
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from 'fs';
import type { Character, GameEvent, GameEventType, SessionStatus, CampaignState, SpotlightState, SafetyState, CombatState } from '@trpgmaster/shared';

const SESSION_DATA_FILE = 'session_data.json';
const BACKUP_FILE = 'session_data.json.bak';
const CURRENT_VERSION = 1;

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
  campaignState: CampaignState;
  adventureMessages: PersistedAdventureMessage[];
  shortRestsSinceLong: number;
  spotlightState?: SpotlightState;
  safetyState?: SafetyState;
  activeCombat?: CombatState;
  createdAt: number;
}

// ===== 持久化文件顶层结构 =====

export interface PersistedSessionData {
  version: number;
  defaultSessionId: string;
  sessions: Record<string, PersistedSession>;
}

// ===== Version Migration =====

function migrateData(data: PersistedSessionData): PersistedSessionData {
  // Future: add migration steps here
  // e.g., if (data.version === 1) { ... migrate to v2 ...; data.version = 2; }
  return data;
}

// ===== Core Functions =====

function tryParseFile(filePath: string): PersistedSessionData | null {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as PersistedSessionData;
    if (!data || !data.sessions || typeof data.version !== 'number') {
      console.warn(`[SessionPersistence] Invalid structure in ${filePath}, ignoring`);
      return null;
    }
    if (data.version > CURRENT_VERSION) {
      console.warn(`[SessionPersistence] Future version ${data.version} in ${filePath}, attempting load`);
    }
    return migrateData(data);
  } catch (err) {
    console.error(`[SessionPersistence] Failed to parse ${filePath}:`, err);
    return null;
  }
}

/**
 * 从文件加载持久化的会话数据
 * 主文件失败时自动尝试从备份恢复
 */
export function loadSessionData(): PersistedSessionData | null {
  // Try main file first
  const mainData = tryParseFile(SESSION_DATA_FILE);
  if (mainData) {
    console.log(`[SessionPersistence] Loaded ${Object.keys(mainData.sessions).length} session(s) from ${SESSION_DATA_FILE}`);
    return mainData;
  }

  // Main file failed — try backup
  console.warn(`[SessionPersistence] Main file failed, trying backup ${BACKUP_FILE}`);
  const backupData = tryParseFile(BACKUP_FILE);
  if (backupData) {
    console.log(`[SessionPersistence] Recovered ${Object.keys(backupData.sessions).length} session(s) from backup`);
    // Restore backup as main file
    try {
      copyFileSync(BACKUP_FILE, SESSION_DATA_FILE);
      console.log('[SessionPersistence] Backup restored as main file');
    } catch (err) {
      console.error('[SessionPersistence] Failed to restore backup as main file:', err);
    }
    return backupData;
  }

  console.error('[SessionPersistence] Both main and backup files are invalid or missing');
  return null;
}

/**
 * Windows-safe file replacement: copy new to target, then delete temp.
 * Unlike renameSync, this works on Windows when the target file exists.
 */
function safeReplaceFile(tmpFile: string, targetFile: string): void {
  copyFileSync(tmpFile, targetFile);
  try { unlinkSync(tmpFile); } catch { /* ignore cleanup failure */ }
}

/**
 * 保存会话数据到文件
 * - 先备份当前文件到 .bak
 * - 写入到 .tmp 临时文件
 * - 用 safeReplaceFile 替换主文件（Windows 兼容）
 */
export function saveSessionData(data: PersistedSessionData): void {
  try {
    // Step 1: Back up current main file if it exists
    if (existsSync(SESSION_DATA_FILE)) {
      try {
        copyFileSync(SESSION_DATA_FILE, BACKUP_FILE);
      } catch (err) {
        console.warn('[SessionPersistence] Failed to create backup before save:', err);
        // Continue — backup failure shouldn't prevent saving
      }
    }

    // Step 2: Write to temp file
    data.version = CURRENT_VERSION;
    const tmp = SESSION_DATA_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');

    // Step 3: Replace main file (Windows-safe)
    safeReplaceFile(tmp, SESSION_DATA_FILE);
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
      unlinkSync(SESSION_DATA_FILE);
    }
    if (existsSync(BACKUP_FILE)) {
      unlinkSync(BACKUP_FILE);
    }
    if (existsSync(SESSION_DATA_FILE + '.tmp')) {
      unlinkSync(SESSION_DATA_FILE + '.tmp');
    }
    console.log('[SessionPersistence] Session data files removed');
  } catch (err) {
    console.error('[SessionPersistence] Failed to clear session data:', err);
  }
}
