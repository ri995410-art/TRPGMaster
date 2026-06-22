/**
 * Focused test for [STATE] marker generation
 * Tests combat scenarios where state changes should occur
 */
import { io } from 'socket.io-client';
import * as fs from 'fs';
import * as path from 'path';

const SERVER_URL = 'http://localhost:3000';
const LOG_DIR = path.join('D:', 'TRPGMaster - 副本', 'test-logs', `session-${new Date().toISOString().slice(0,10)}`);
fs.mkdirSync(LOG_DIR, { recursive: true });

const logFile = path.join(LOG_DIR, `state-test-${Date.now()}.log`);

function log(msg: string) {
  console.log(msg);
  fs.appendFileSync(logFile, msg + '\n', 'utf-8');
}

const TEST_CHARACTER = {
  id: `test_char_state_${Date.now()}`,
  name: '灰烬行者·凯尔',
  classId: 'rogue',
  className: '游荡者',
  ancestryId: 'human',
  ancestryName: '人类',
  communityId: 'underworld',
  level: 1,
  hp: 7, maxHp: 7,
  stress: 0, maxStress: 3,
  hope: 6, maxHope: 6,
  fearPoints: 0,
  evasion: 11,
  armorSlots: 1, maxArmorSlots: 1,
  minorThreshold: 3, majorThreshold: 6, severeThreshold: 9,
  strength: 0, agility: 2, finesse: 1, instinct: 1, presence: 0, knowledge: -1,
  conditions: [],
  inventory: [],
  domainCards: [],
  experience: 0, proficiency: 1,
  traits: ['机敏', '街头智慧'],
  heritage: { id: 'human', name: '人类' },
  class: { id: 'rogue', name: '游荡者' },
  subclass: null,
};

// Combat-focused actions to trigger [STATE] markers
const COMBAT_ACTIONS = [
  '我在探索地下通道时，突然遭遇了一只变异骷髅！它向我扑来，我拔出匕首迎战',
  '骷髅的骨爪划过我的肩膀，我感到剧痛，但我没有退缩，继续反击',
  '我用匕首刺中骷髅的头骨，它发出尖啸，但我也被它反震的力量震退，感到手臂发麻',
  '我决定冒险进攻，全力一击！骷髅被击碎了，但我已经精疲力竭，伤口在流血',
  '战斗结束后，我在角落休息，处理伤口，恢复一些体力',
  '我感到内心充满了希望，因为我在骷髅的残骸中发现了一张地图',
];

async function runTest() {
  log('=== [STATE] Marker Focused Test ===');

  const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    timeout: 10000,
    reconnection: true,
  });

  let sessionId = '';

  // Connect
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => { log(`Connected: ${socket.id}`); resolve(); });
    socket.on('connect_error', (err) => { log(`Error: ${err.message}`); reject(err); });
    setTimeout(() => reject(new Error('Timeout')), 15000);
  });

  // Join session
  await new Promise<void>((resolve) => {
    socket.on('session:created', (msg: any) => { sessionId = msg.payload?.sessionId || ''; log(`Session: ${sessionId}`); resolve(); });
    socket.on('session:joined', (msg: any) => { sessionId = msg.payload?.sessionId || sessionId; log(`Joined: ${sessionId}`); resolve(); });
    socket.emit('session:join', {
      type: 'session:join', sessionId: '', senderId: `state_test_${Date.now()}`,
      payload: { playerId: `state_test_${Date.now()}`, role: 'player', name: '状态测试', character: TEST_CHARACTER },
      timestamp: Date.now(),
    });
    setTimeout(resolve, 5000);
  });

  // Start session
  await new Promise<void>((resolve) => {
    socket.on('session:started', () => { log('Session started'); resolve(); });
    socket.on('session:sessionZeroStarted', () => { log('Session Zero started'); resolve(); });
    socket.emit('session:start', { type: 'session:start', sessionId, senderId: socket.id, payload: {}, timestamp: Date.now() });
    setTimeout(resolve, 5000);
  });

  // Wait for initial narration
  await new Promise<void>((resolve) => {
    const handler = (msg: any) => { log(`Initial: ${(msg.payload?.content || '').substring(0, 100)}...`); socket.off('gm:narrate', handler); resolve(); };
    socket.on('gm:narrate', handler);
    socket.emit('narration:request', { type: 'narration:request', sessionId, senderId: socket.id, payload: {}, timestamp: Date.now() });
    setTimeout(resolve, 180000);
  });

  // Run combat actions
  let stateMarkersFound = 0;
  let totalResponses = 0;

  for (const action of COMBAT_ACTIONS) {
    log(`\n--- Player: ${action} ---`);

    socket.emit('player:action', {
      type: 'player:action', sessionId, senderId: socket.id,
      payload: { action }, timestamp: Date.now(),
    });

    const response = await new Promise<any>((resolve) => {
      const handler = (msg: any) => { socket.off('gm:narrate', handler); resolve(msg.payload || msg); };
      socket.on('gm:narrate', handler);
      setTimeout(() => { socket.off('gm:narrate', handler); resolve(null); }, 300000);
    });

    if (response) {
      totalResponses++;
      const content = response.content || '';
      const hasState = content.includes('[STATE]');
      if (hasState) stateMarkersFound++;

      log(`GM Response (${content.length} chars):`);
      log(`  Preview: ${content.substring(0, 150)}...`);
      log(`  [STATE] found: ${hasState ? 'YES ✅' : 'NO ❌'}`);

      // Show [STATE] lines if present
      const stateLines = content.split('\n').filter((l: string) => l.trim().startsWith('[STATE'));
      if (stateLines.length > 0) {
        log(`  State lines: ${stateLines.join(' | ')}`);
      }
    } else {
      log('  No response (timeout)');
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  // Summary
  log('\n=== Test Summary ===');
  log(`Total responses: ${totalResponses}`);
  log(`[STATE] markers found: ${stateMarkersFound}/${totalResponses} (${Math.round(stateMarkersFound/totalResponses*100)}%)`);
  log(stateMarkersFound > 0 ? '✅ [STATE] marker system IS WORKING!' : '❌ [STATE] markers still not working');

  socket.disconnect();
}

runTest().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
