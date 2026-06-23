/**
 * FileSessionStore - 单测
 * 验证：历史追加/读取/上限、回合锁互斥/队列/TTL自动释放
 */
import { FileSessionStore } from '../../core/FileSessionStore';
import type { HistoryEntry } from '../../core/SessionStore';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeEntry(role: HistoryEntry['role'], content: string): HistoryEntry {
  return { id: `msg_${Date.now()}_${Math.random()}`, role, content, timestamp: Date.now() };
}

function makeStore(): { store: FileSessionStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'fsstore-test-'));
  const store = new FileSessionStore(dir);
  return { store, dir };
}

describe('FileSessionStore — 历史', () => {
  test('追加和读取历史', async () => {
    const { store, dir } = makeStore();
    try {
      await store.appendHistory('s1', makeEntry('player', '我攻击'));
      await store.appendHistory('s1', makeEntry('narrator', 'GM叙事'));
      const history = await store.getHistory('s1');
      expect(history.length).toBe(2);
      expect(history[0].role).toBe('player');
      expect(history[1].role).toBe('narrator');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('不同 sessionId 隔离', async () => {
    const { store, dir } = makeStore();
    try {
      await store.appendHistory('s1', makeEntry('player', 's1消息'));
      await store.appendHistory('s2', makeEntry('player', 's2消息'));
      const h1 = await store.getHistory('s1');
      const h2 = await store.getHistory('s2');
      expect(h1.length).toBe(1);
      expect(h2.length).toBe(1);
      expect(h1[0].content).toBe('s1消息');
      expect(h2[0].content).toBe('s2消息');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('limit 参数截取最近条目', async () => {
    const { store, dir } = makeStore();
    try {
      for (let i = 0; i < 10; i++) {
        await store.appendHistory('s1', makeEntry('player', `msg${i}`));
      }
      const history = await store.getHistory('s1', 3);
      expect(history.length).toBe(3);
      expect(history[0].content).toBe('msg7');
      expect(history[2].content).toBe('msg9');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('超过 120 条自动截断', async () => {
    const { store, dir } = makeStore();
    try {
      for (let i = 0; i < 130; i++) {
        await store.appendHistory('s1', makeEntry('player', `msg${i}`));
      }
      const history = await store.getHistory('s1');
      expect(history.length).toBe(120);
      expect(history[0].content).toBe('msg10'); // First 10 trimmed
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('空会话返回空数组', async () => {
    const { store, dir } = makeStore();
    try {
      const history = await store.getHistory('nonexistent');
      expect(history).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('FileSessionStore — 回合锁', () => {
  test('首个获取立即成功', async () => {
    const { store, dir } = makeStore();
    try {
      const acquired = await store.acquireTurnLock('s1', 5000);
      expect(acquired).toBe(true);
      await store.releaseTurnLock('s1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('互斥：持有期间第二个请求等待', async () => {
    const { store, dir } = makeStore();
    try {
      await store.acquireTurnLock('s1', 5000);

      let secondAcquired = false;
      const secondPromise = store.acquireTurnLock('s1', 5000).then(result => {
        secondAcquired = true;
        return result;
      });

      // Give it a moment — second should NOT have resolved yet
      await new Promise(r => setTimeout(r, 50));
      expect(secondAcquired).toBe(false);

      // Release the first lock
      await store.releaseTurnLock('s1');

      // Now the second should resolve
      const result = await secondPromise;
      expect(result).toBe(false); // false = had to wait
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('释放后唤醒 FIFO 队列', async () => {
    const { store, dir } = makeStore();
    try {
      await store.acquireTurnLock('s1', 5000);

      const order: number[] = [];

      const p2 = store.acquireTurnLock('s1', 5000).then(() => { order.push(2); });
      const p3 = store.acquireTurnLock('s1', 5000).then(() => { order.push(3); });

      await new Promise(r => setTimeout(r, 20));

      // Release first — should wake p2
      await store.releaseTurnLock('s1');
      await p2;
      expect(order).toEqual([2]);

      // Release second — should wake p3
      await store.releaseTurnLock('s1');
      await p3;
      expect(order).toEqual([2, 3]);

      await store.releaseTurnLock('s1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('不同 sessionId 的锁互不影响', async () => {
    const { store, dir } = makeStore();
    try {
      const a1 = await store.acquireTurnLock('s1', 5000);
      const a2 = await store.acquireTurnLock('s2', 5000);
      expect(a1).toBe(true);
      expect(a2).toBe(true);

      await store.releaseTurnLock('s1');
      await store.releaseTurnLock('s2');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('TTL 过期后自动释放', async () => {
    const { store, dir } = makeStore();
    try {
      await store.acquireTurnLock('s1', 100); // 100ms TTL

      // After TTL, a new acquire should succeed
      await new Promise(r => setTimeout(r, 150));
      const acquired = await store.acquireTurnLock('s1', 5000);
      expect(acquired).toBe(true);

      await store.releaseTurnLock('s1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
