import type { AIMessage } from '@trpgmaster/shared';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, unlinkSync, renameSync } from 'fs';
import { join } from 'path';
import type { SessionStore, HistoryEntry } from './SessionStore';

const DEFAULT_HISTORY_LIMIT = 120;

// ===== Turn Lock internals =====

interface TurnLockState {
  holder: string;          // Unique lock holder ID
  acquiredAt: number;      // Date.now() when acquired
  ttlMs: number;           // Auto-release after this
  timer: ReturnType<typeof setTimeout>;  // TTL auto-release timer
}

interface WaitingLock {
  holderId: string;
  resolve: (immediate: boolean) => void;
}

/**
 * FileSessionStore — default SessionStore implementation for single-process.
 * History lives in memory and write-throughs to per-session JSON files.
 * Turn lock uses in-process FIFO queue.
 */
export class FileSessionStore implements SessionStore {
  private history: Map<string, HistoryEntry[]>;
  private turnLocks: Map<string, TurnLockState>;
  private waitingQueues: Map<string, WaitingLock[]>;
  private dataDir: string;

  constructor(dataDir?: string) {
    this.history = new Map();
    this.turnLocks = new Map();
    this.waitingQueues = new Map();
    this.dataDir = dataDir || 'session_history';

    // Ensure data directory exists
    try {
      mkdirSync(this.dataDir, { recursive: true });
    } catch {
      // Directory may already exist
    }
  }

  // ===== History =====

  async appendHistory(sessionId: string, entry: HistoryEntry): Promise<void> {
    const entries = this.history.get(sessionId) || [];
    entries.push(entry);
    // Keep last 120 entries in memory
    if (entries.length > DEFAULT_HISTORY_LIMIT) {
      this.history.set(sessionId, entries.slice(-DEFAULT_HISTORY_LIMIT));
    } else {
      this.history.set(sessionId, entries);
    }
    // Write-through to file
    this.persistHistory(sessionId);
  }

  async getHistory(sessionId: string, limit: number = DEFAULT_HISTORY_LIMIT): Promise<HistoryEntry[]> {
    let entries = this.history.get(sessionId);
    if (!entries) {
      // Try loading from file
      entries = this.loadHistoryFromDisk(sessionId);
      if (entries.length > 0) {
        this.history.set(sessionId, entries);
      }
    }
    return entries.slice(-limit);
  }

  // ===== Turn Lock =====

  async acquireTurnLock(sessionId: string, ttlMs: number): Promise<boolean> {
    // Check if existing lock has expired (safety net)
    this.expireIfStale(sessionId);

    const existing = this.turnLocks.get(sessionId);
    if (!existing) {
      // Lock is free — acquire immediately
      const holderId = `lock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const timer = setTimeout(() => this.forceRelease(sessionId, holderId), ttlMs);
      timer.unref(); // Don't keep process alive for TTL timer
      this.turnLocks.set(sessionId, {
        holder: holderId,
        acquiredAt: Date.now(),
        ttlMs,
        timer,
      });
      return true;
    }

    // Lock is held — wait in queue
    return new Promise<boolean>((resolve) => {
      const queue = this.waitingQueues.get(sessionId) || [];
      queue.push({ holderId: existing.holder, resolve });
      this.waitingQueues.set(sessionId, queue);
    });
  }

  async releaseTurnLock(sessionId: string): Promise<void> {
    const lock = this.turnLocks.get(sessionId);
    if (!lock) return;

    clearTimeout(lock.timer);
    this.turnLocks.delete(sessionId);

    // Wake the next waiter in the FIFO queue
    const queue = this.waitingQueues.get(sessionId);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) {
        this.waitingQueues.delete(sessionId);
      }

      // The next waiter acquires the lock
      const holderId = `lock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const timer = setTimeout(() => this.forceRelease(sessionId, holderId), lock.ttlMs);
      timer.unref();
      this.turnLocks.set(sessionId, {
        holder: holderId,
        acquiredAt: Date.now(),
        ttlMs: lock.ttlMs,
        timer,
      });

      // Resolve the waiter's promise — false because it had to wait
      next.resolve(false);
    }
  }

  // ===== Private helpers =====

  private expireIfStale(sessionId: string): void {
    const lock = this.turnLocks.get(sessionId);
    if (!lock) return;
    if (Date.now() - lock.acquiredAt > lock.ttlMs) {
      clearTimeout(lock.timer);
      this.turnLocks.delete(sessionId);
    }
  }

  private forceRelease(sessionId: string, expectedHolder: string): void {
    const lock = this.turnLocks.get(sessionId);
    if (lock && lock.holder === expectedHolder) {
      this.turnLocks.delete(sessionId);
      // Wake next waiter
      const queue = this.waitingQueues.get(sessionId);
      if (queue && queue.length > 0) {
        const next = queue.shift()!;
        if (queue.length === 0) this.waitingQueues.delete(sessionId);
        const holderId = `lock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newTtl = lock.ttlMs;
        const timer = setTimeout(() => this.forceRelease(sessionId, holderId), newTtl);
        timer.unref();
        this.turnLocks.set(sessionId, {
          holder: holderId,
          acquiredAt: Date.now(),
          ttlMs: newTtl,
          timer,
        });
        next.resolve(false);
      }
    }
  }

  private persistHistory(sessionId: string): void {
    try {
      const entries = this.history.get(sessionId);
      if (!entries) return;
      const filePath = join(this.dataDir, `${sessionId}_history.json`);
      const bakPath = filePath + '.bak';
      // Back up current file before overwriting
      if (existsSync(filePath)) {
        try { copyFileSync(filePath, bakPath); } catch { /* ignore */ }
      }
      const tmpPath = `${filePath}.tmp.${process.pid}`;
      writeFileSync(tmpPath, JSON.stringify(entries), 'utf-8');
      try {
        renameSync(tmpPath, filePath); // POSIX atomic, same-drive atomic on Windows
      } catch (e) {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
        throw e;
      }
    } catch {
      // Write failure is non-critical — data is still in memory
    }
  }

  private loadHistoryFromDisk(sessionId: string): HistoryEntry[] {
    const filePath = join(this.dataDir, `${sessionId}_history.json`);
    try {
      if (!existsSync(filePath)) return [];
      const raw = readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as HistoryEntry[];
    } catch {
      // Main file corrupted — try backup
      const bakPath = filePath + '.bak';
      try {
        if (!existsSync(bakPath)) return [];
        const raw = readFileSync(bakPath, 'utf-8');
        const entries = JSON.parse(raw) as HistoryEntry[];
        // Restore backup
        copyFileSync(bakPath, filePath);
        return entries;
      } catch {
        return [];
      }
    }
  }
}
