/**
 * TRPGMaster Comprehensive Test Script
 * Simulates a player going through multiple game phases over an extended session.
 * Tests: exploration, social, combat, puzzle, rest, level-up, memory consistency.
 */
import { io } from 'socket.io-client';
import * as fs from 'fs';
import * as path from 'path';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const LOG_DIR = path.join(__dirname, 'output', `session-${new Date().toISOString().slice(0,10)}`);

// Ensure log directory exists
fs.mkdirSync(LOG_DIR, { recursive: true });

// ===== Logging =====
const logFile = path.join(LOG_DIR, `test-run-${Date.now()}.log`);
const jsonLogFile = path.join(LOG_DIR, `test-run-${Date.now()}.json`);

interface LogEntry {
  timestamp: string;
  phase: string;
  round: number;
  direction: 'player' | 'gm' | 'system' | 'error';
  content: string;
  choices?: Array<{ id: string; label: string }>;
  stateChanges?: Record<string, unknown>;
  responseTime?: number;
  tokenUsage?: number;
}

const allLogs: LogEntry[] = [];

function log(phase: string, round: number, direction: LogEntry['direction'], content: string, extra?: Partial<LogEntry>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    phase,
    round,
    direction,
    content: content.substring(0, 2000), // Cap content length
    ...extra,
  };
  allLogs.push(entry);

  const prefix = direction === 'error' ? '❌' : direction === 'system' ? '⚙️' : direction === 'player' ? '🎮' : '📖';
  const line = `[${entry.timestamp}] [${phase}] [R${round}] ${prefix} ${content.substring(0, 200)}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n', 'utf-8');
}

function saveJsonLog() {
  fs.writeFileSync(jsonLogFile, JSON.stringify(allLogs, null, 2), 'utf-8');
}

// ===== Character Data =====
const TEST_CHARACTER = {
  id: `test_char_${Date.now()}`,
  name: '灰烬行者·凯尔',
  classId: 'rogue',
  className: '游荡者',
  ancestryId: 'human',
  ancestryName: '人类',
  communityId: 'underworld',
  level: 1,
  hp: 7,
  maxHp: 7,
  stress: 0,
  maxStress: 3,
  hope: 6,
  maxHope: 6,
  fearPoints: 0,
  evasion: 11,
  armorSlots: 1,
  maxArmorSlots: 1,
  minorThreshold: 3,
  majorThreshold: 6,
  severeThreshold: 9,
  strength: 0,
  agility: 2,
  finesse: 1,
  instinct: 1,
  presence: 0,
  knowledge: -1,
  conditions: [],
  inventory: [],
  domainCards: [],
  experience: 0,
  proficiency: 1,
  traits: ['机敏', '街头智慧'],
  heritage: { id: 'human', name: '人类' },
  class: { id: 'rogue', name: '游荡者' },
  subclass: null,
};

// ===== Test Phases =====
// Each phase has a series of player actions to simulate
const TEST_SCENARIOS = {
  phase1_exploration: [
    '我小心翼翼地走进余烬村，观察周围的环境和建筑',
    '我注意到那口旧井，走近看看里面有什么',
    '我检查井壁上的抓痕，看看能发现什么线索',
    '我想去那座半塌的钟楼看看',
  ],
  phase2_social: [
    '我走向提灯团的守卫，向他们打听这个村子的情况',
    '我询问关于迷雾和翠晶的事情',
    '我想和莉娅·灯痕聊聊，她似乎知道很多',
    '我问莉娅关于封印的事',
  ],
  phase3_combat: [
    '我拔出匕首，准备迎战那只迷雾生物！',
    '我试图从侧面绕过去，寻找它的弱点',
    '我用匕首刺向它的要害部位！',
    '我翻滚躲避它的攻击，然后反击',
  ],
  phase4_puzzle: [
    '我仔细研究地下室发现的信件和碎片',
    '我尝试将碎片按照"声、火、门"的顺序排列',
    '我回忆莉娅告诉我的关于封印的知识，尝试解密',
    '我在旧图书馆里寻找更多线索',
  ],
  phase5_crisis: [
    '迷雾正在逼近！我必须做出选择——是继续探索还是撤退？',
    '我决定冒险深入，看看能不能找到阻止迷雾扩散的方法',
    '我的身体开始感到不适，翠晶的辐射正在影响我',
  ],
  phase6_rest: [
    '我找到一个相对安全的地方休息，恢复体力',
    '我整理一下收集到的物品和线索',
    '我思考接下来该做什么',
  ],
  phase7_deep: [
    '我决定前往城市深处，寻找封印的核心',
    '我遇到了Q-7，这个奇怪的构造体似乎在守护什么',
    '我尝试和Q-7交流，了解它的目的',
  ],
  phase8_memory: [
    '让我回忆一下——我们到目前为止发现了哪些封印？',
    '莉娅之前告诉了我什么重要信息？',
    '我在井里发现了什么？',
    '我们和各个派系的关系如何？',
    '我现在的身体状况怎样？我受了多少伤？',
  ],
  phase9_boss: [
    '我面对最终的守护者，准备决战！',
    '我利用之前发现的封印知识来对抗它',
    '我集中所有力量，发动最后一击！',
  ],
  phase10_worldbuild: [
    '我告诉GM，我认为这座城市曾经有一个被遗忘的地下图书馆',
    '我在战斗中发现了一个隐藏的通道，它通向城市下方',
    '我描述凯尔在过去的经历——他曾经是提灯团的一员，但因为一次失败的任务而离开',
  ],
};

// ===== Main Test Runner =====
async function runTest() {
  log('setup', 0, 'system', '=== TRPGMaster Extended Test Session ===');
  log('setup', 0, 'system', `Server: ${SERVER_URL}`);
  log('setup', 0, 'system', `Character: ${TEST_CHARACTER.name} (${TEST_CHARACTER.className} Lv.${TEST_CHARACTER.level})`);
  log('setup', 0, 'system', `Log file: ${logFile}`);

  // Connect to server
  const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    timeout: 10000,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 3000,
  });

  // State tracking
  let sessionId = '';
  let currentPhase = 'setup';
  let round = 0;
  let gmResponses: Array<{ content: string; choices?: Array<{ id: string; label: string; action?: string }> }> = [];
  let lastGmResponseTime = 0;
  let totalTokensUsed = 0;
  let errorCount = 0;
  let emptyResponseCount = 0;

  // Promise-based helpers
  function waitForGmNarration(timeoutMs = 300000): Promise<{ content: string; choices?: any[] }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('GM narration timeout')), timeoutMs);
      const handler = (msg: any) => {
        clearTimeout(timer);
        socket.off('gm:narrate', handler);
        resolve(msg.payload || msg);
      };
      socket.on('gm:narrate', handler);
    });
  }

  function sendAction(action: string): void {
    round++;
    log(currentPhase, round, 'player', action);
    socket.emit('player:action', {
      type: 'player:action',
      sessionId,
      senderId: socket.id,
      payload: { action },
      timestamp: Date.now(),
    });
  }

  function sendChoice(choiceId: string, choiceText: string): void {
    round++;
    log(currentPhase, round, 'player', `[选择] ${choiceText}`);
    socket.emit('player:choice', {
      type: 'player:choice',
      sessionId,
      senderId: socket.id,
      payload: { choiceId, choiceText },
      timestamp: Date.now(),
    });
  }

  // ===== Setup Connection =====
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => {
      log('setup', 0, 'system', `Connected to server, socket ID: ${socket.id}`);
      resolve();
    });
    socket.on('connect_error', (err) => {
      log('setup', 0, 'error', `Connection error: ${err.message}`);
      reject(err);
    });
    setTimeout(() => reject(new Error('Connection timeout')), 15000);
  });

  // ===== Create Session =====
  await new Promise<void>((resolve, reject) => {
    socket.on('session:created', (msg: any) => {
      sessionId = msg.payload?.sessionId || msg.sessionId || '';
      const code = msg.payload?.code || '';
      log('setup', 0, 'system', `Session created: ${sessionId}, code: ${code}`);
      resolve();
    });

    socket.on('session:joined', (msg: any) => {
      sessionId = msg.payload?.sessionId || msg.sessionId || sessionId;
      log('setup', 0, 'system', `Session joined: ${sessionId}`);
      resolve();
    });

    // Join with character
    socket.emit('session:join', {
      type: 'session:join',
      sessionId: '',
      senderId: `test_player_${Date.now()}`,
      payload: {
        playerId: `test_player_${Date.now()}`,
        role: 'player',
        name: '测试玩家',
        character: TEST_CHARACTER,
      },
      timestamp: Date.now(),
    });

    setTimeout(() => {
      // If no session:created, try session:start directly
      log('setup', 0, 'system', 'No session:created received, proceeding with default session');
      resolve();
    }, 5000);
  });

  // ===== Sync Character =====
  await new Promise<void>((resolve) => {
    // Send character to server
    socket.emit('character:update', {
      type: 'character:update',
      sessionId,
      senderId: socket.id,
      payload: { characterId: TEST_CHARACTER.id, character: TEST_CHARACTER },
      timestamp: Date.now(),
    });

    socket.on('character:update', (msg: any) => {
      log('setup', 0, 'system', `Character synced: ${msg.payload?.character?.name || 'unknown'}`);
      socket.off('character:update');
      resolve();
    });

    setTimeout(resolve, 3000);
  });

  // ===== Start Session =====
  await new Promise<void>((resolve, reject) => {
    const startedHandler = (msg: any) => {
      log('setup', 0, 'system', `Session started, status: ${msg.payload?.status || 'unknown'}`);
      socket.off('session:started', startedHandler);
      resolve();
    };

    const s0Handler = (msg: any) => {
      log('setup', 0, 'system', `Session Zero started, phase: ${msg.payload?.phase || 'unknown'}`);
      socket.off('session:sessionZeroStarted', s0Handler);
      resolve();
    };

    socket.on('session:started', startedHandler);
    socket.on('session:sessionZeroStarted', s0Handler);

    socket.emit('session:start', {
      type: 'session:start',
      sessionId,
      senderId: socket.id,
      payload: {},
      timestamp: Date.now(),
    });

    setTimeout(resolve, 5000);
  });

  // ===== Request Initial Narration =====
  log('setup', 0, 'system', 'Requesting initial scene narration...');
  socket.emit('narration:request', {
    type: 'narration:request',
    sessionId,
    senderId: socket.id,
    payload: {},
    timestamp: Date.now(),
  });

  try {
    const initialNarration = await waitForGmNarration(180000);
    const responseTime = Date.now() - lastGmResponseTime;
    log('setup', 1, 'gm', initialNarration.content, {
      choices: initialNarration.choices,
      responseTime,
    });
    gmResponses.push(initialNarration);
  } catch (err: any) {
    log('setup', 1, 'error', `Initial narration failed: ${err.message}`);
  }

  // ===== Run Test Phases =====
  const phases = Object.entries(TEST_SCENARIOS);

  for (const [phaseName, actions] of phases) {
    currentPhase = phaseName;
    log(phaseName, round, 'system', `\n--- Phase: ${phaseName} ---`);

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const startTime = Date.now();

      // Send player action
      sendAction(action);

      // Wait for GM response
      try {
        const response = await waitForGmNarration(300000); // 5 min timeout for slow model
        const responseTime = Date.now() - startTime;
        lastGmResponseTime = responseTime;

        // Check for empty response
        if (!response.content || response.content.trim().length === 0) {
          emptyResponseCount++;
          log(phaseName, round, 'error', 'Empty GM response! Retrying...');

          // Retry
          sendAction(action);
          try {
            const retryResponse = await waitForGmNarration(300000);
            log(phaseName, round, 'gm', retryResponse.content, {
              choices: retryResponse.choices,
              responseTime: Date.now() - startTime,
            });
            gmResponses.push(retryResponse);
          } catch (retryErr: any) {
            log(phaseName, round, 'error', `Retry also failed: ${retryErr.message}`);
            errorCount++;
          }
        } else {
          log(phaseName, round, 'gm', response.content, {
            choices: response.choices,
            responseTime,
          });
          gmResponses.push(response);

          // If there are choices, sometimes pick one (every other round)
          if (response.choices && response.choices.length > 0 && i % 2 === 0) {
            const choice = response.choices[0]; // Pick first choice
            const choiceStartTime = Date.now();
            sendChoice(choice.id, choice.label || choice.text || 'continue');

            try {
              const choiceResponse = await waitForGmNarration(300000);
              log(phaseName, round, 'gm', choiceResponse.content, {
                choices: choiceResponse.choices,
                responseTime: Date.now() - choiceStartTime,
              });
              gmResponses.push(choiceResponse);
            } catch (choiceErr: any) {
              log(phaseName, round, 'error', `Choice response timeout: ${choiceErr.message}`);
              errorCount++;
            }
          }
        }
      } catch (err: any) {
        errorCount++;
        log(phaseName, round, 'error', `GM response error: ${err.message}`);

        // Wait a bit and try to continue
        await new Promise(r => setTimeout(r, 5000));
      }

      // Save intermediate log every 5 rounds
      if (round % 5 === 0) {
        saveJsonLog();
      }

      // Small delay between actions to avoid overwhelming the AI
      await new Promise(r => setTimeout(r, 2000));
    }

    // Save log after each phase
    saveJsonLog();
    log(phaseName, round, 'system', `Phase ${phaseName} complete. Total rounds: ${round}`);
  }

  // ===== Memory Consistency Check =====
  currentPhase = 'memory_check';
  log('memory_check', round, 'system', '\n=== Memory Consistency Check ===');

  const memoryQuestions = [
    '回顾我们的冒险，我发现了哪些重要物品？',
    '我遇到了哪些NPC？他们分别告诉了我什么？',
    '我目前的HP、压力和希望分别是多少？',
    '我们探索了哪些地点？',
    '关于封印，我了解到了什么？',
  ];

  for (const question of memoryQuestions) {
    const startTime = Date.now();
    sendAction(question);

    try {
      const response = await waitForGmNarration(300000);
      log('memory_check', round, 'gm', response.content, {
        responseTime: Date.now() - startTime,
      });
    } catch (err: any) {
      log('memory_check', round, 'error', `Memory check error: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  // ===== Collaborative Narrative Test =====
  currentPhase = 'collaborative_test';
  log('collaborative_test', round, 'system', '\n=== Collaborative Narrative Test ===');

  const collaborativeActions = [
    '我告诉GM一个关于这座城市的细节：在旧城区的地下，有一条被遗忘的隧道网络，是以前居民用来逃生的',
    '我描述凯尔在井边发现的一个古老符号——这是他师父曾经教过他的暗语标记',
    '我认为迷雾中应该有某种规律，它似乎在月圆之夜会减弱',
  ];

  for (const action of collaborativeActions) {
    const startTime = Date.now();
    sendAction(action);

    try {
      const response = await waitForGmNarration(300000);
      log('collaborative_test', round, 'gm', response.content, {
        responseTime: Date.now() - startTime,
      });
    } catch (err: any) {
      log('collaborative_test', round, 'error', `Collaborative test error: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  // ===== State Change Verification =====
  currentPhase = 'state_verification';
  log('state_verification', round, 'system', '\n=== State Change Verification ===');

  // Force a combat scenario to test state changes
  const combatActions = [
    '一只变异老鼠突然从暗处扑来！我拔出匕首迎战',
    '我被老鼠咬了一口！这很疼',
    '我用尽全力刺死了老鼠，但我感到精疲力竭',
  ];

  for (const action of combatActions) {
    const startTime = Date.now();
    sendAction(action);

    try {
      const response = await waitForGmNarration(300000);
      log('state_verification', round, 'gm', response.content, {
        responseTime: Date.now() - startTime,
      });
    } catch (err: any) {
      log('state_verification', round, 'error', `State verification error: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  // ===== Generate Report =====
  log('report', round, 'system', '\n=== Test Session Report ===');

  const report = {
    testDate: new Date().toISOString(),
    totalRounds: round,
    totalErrors: errorCount,
    emptyResponses: emptyResponseCount,
    totalGmResponses: gmResponses.length,
    phasesCompleted: phases.length,
    characterName: TEST_CHARACTER.name,
    serverUrl: SERVER_URL,
    model: 'nex-agi/Nex-N2-Pro',
  };

  log('report', round, 'system', JSON.stringify(report, null, 2));

  // Save final logs
  saveJsonLog();

  // Write summary report
  const reportPath = path.join(LOG_DIR, `test-report-${Date.now()}.md`);
  const reportContent = generateReport(report, allLogs, gmResponses);
  fs.writeFileSync(reportPath, reportContent, 'utf-8');
  log('report', round, 'system', `Report saved to: ${reportPath}`);

  // Disconnect
  socket.disconnect();
  log('report', round, 'system', 'Test session complete. Disconnected from server.');
}

function generateReport(report: any, logs: LogEntry[], responses: any[]): string {
  const avgResponseTime = logs
    .filter(l => l.responseTime)
    .reduce((sum, l) => sum + (l.responseTime || 0), 0) / (logs.filter(l => l.responseTime).length || 1);

  const phaseStats = Object.entries(
    logs.reduce((acc, l) => {
      if (l.direction === 'gm') {
        acc[l.phase] = (acc[l.phase] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>)
  ).map(([phase, count]) => `| ${phase} | ${count} |`).join('\n');

  const errorLogs = logs.filter(l => l.direction === 'error');
  const stateChangeLogs = logs.filter(l => l.content.includes('[STATE]'));

  return `# TRPGMaster Extended Test Report

**Test Date**: ${report.testDate}
**Total Rounds**: ${report.totalRounds}
**Model**: ${report.model}
**Server**: ${report.serverUrl}

---

## Summary

| Metric | Value |
|--------|-------|
| Total Rounds | ${report.totalRounds} |
| GM Responses | ${report.totalGmResponses} |
| Errors | ${report.totalErrors} |
| Empty Responses | ${report.emptyResponses} |
| Avg Response Time | ${Math.round(avgResponseTime / 1000)}s |

## Phase Breakdown

| Phase | GM Responses |
|-------|-------------|
${phaseStats}

## Errors

${errorLogs.length === 0 ? 'No errors encountered.' : errorLogs.map(e => `- [${e.phase}] R${e.round}: ${e.content}`).join('\n')}

## State Changes Detected

${stateChangeLogs.length === 0 ? 'No [STATE] markers detected in responses.' : stateChangeLogs.map(s => `- [${s.phase}] R${s.round}: ${s.content.substring(0, 100)}`).join('\n')}

## Memory Consistency

See the \`memory_check\` phase in the JSON log for detailed responses.

## Collaborative Narrative

See the \`collaborative_test\` phase in the JSON log for how the AI handled player-created world details.

---

*Generated by TRPGMaster test script*
`;
}

// Run
runTest().catch(err => {
  console.error('Test failed:', err);
  fs.appendFileSync(logFile, `\nFATAL ERROR: ${err.message}\n`, 'utf-8');
  saveJsonLog();
  process.exit(1);
});
