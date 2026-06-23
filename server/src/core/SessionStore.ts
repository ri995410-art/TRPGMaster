import type { AIMessage } from '@trpgmaster/shared';

/**
 * History entry stored in SessionStore.
 * Extends AIMessage with a sessionId scope for per-session persistence.
 */
export interface HistoryEntry {
  id: string;
  role: AIMessage['role'];
  content: string;
  timestamp: number;
  npcName?: string;
  npcId?: string;
}

/**
 * SessionStore — abstraction over session history and turn locking.
 * AIGameMaster reads/writes history through this interface instead of
 * its own in-memory Map, enabling:
 *   1. Process restart without losing conversation history
 *   2. Turn lock for multi-player concurrent safety
 *   3. Future Redis backend for horizontal scaling
 */
export interface SessionStore {
  /**
   * Append a history entry for a session.
   */
  appendHistory(sessionId: string, entry: HistoryEntry): Promise<void>;

  /**
   * Get recent history entries for a session, most recent last.
   * @param limit Max entries to return (default 120)
   */
  getHistory(sessionId: string, limit?: number): Promise<HistoryEntry[]>;

  /**
   * Acquire the turn lock for a session.
   * Returns true if the lock was acquired immediately.
   * If the lock is held, the returned Promise resolves when the lock
   * is released and this caller is next in the FIFO queue.
   * @param ttlMs Auto-release after this duration (safety net)
   */
  acquireTurnLock(sessionId: string, ttlMs: number): Promise<boolean>;

  /**
   * Release the turn lock for a session.
   * Triggers the next waiter in the queue, if any.
   */
  releaseTurnLock(sessionId: string): Promise<void>;
}
