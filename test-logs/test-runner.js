/**
 * TRPGMaster 6-Hour Deep Test Runner
 * Simulates a player through combat, exploration, puzzle-solving, leveling up
 * Tests: history persistence, long-conversation consistency, state updates, memory
 */

const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const http = require('http');

const SERVER_URL = 'http://localhost:3000';
const LOG_DIR = __dirname;

let testState = {
  roundNumber: 0,
  totalActions: 0,
  gmResponses: [],
  errors: [],
  stateSnapshots: [],
  startTime: Date.now(),
  responseTimes: [],
  choicesReceived: 0,
  choicesMissing: 0,
  consistencyIssues: [],
};

let logFile = path.join(LOG_DIR, 'full-test-log.md');
let stateFile = path.join(LOG_DIR, 'test-state.json');

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

function logSection(title) {
  const separator = '='.repeat(60);
  const line = `\n${separator}\n## ${title}\n${separator}\n`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

function logGMResponse(content, choices, roundNum) {
  const choiceStr = choices && choices.length > 0
    ? choices.map(c => `  - [${c.id}] ${c.label}`).join('\n')
    : '  (无选项)';
  const entry = `\n### 回合 ${roundNum} - GM响应\n\`\`\`\n${content}\n\`\`\`\n**可选行动:**\n${choiceStr}\n`;
  fs.appendFileSync(logFile, entry + '\n');
}

function saveState() {
  fs.writeFileSync(stateFile, JSON.stringify(testState, null, 2));
}

function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('HTTP timeout')), 5000);
    http.get(`${SERVER_URL}${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timeout);
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Player action sequence - designed to test all game aspects
const ACTION_PHASES = [
  {
    name: 'Phase 1: 初始探索 (Exploration)',
    actions: [
      '我是一名刚到达余烬村的冒险者。我环顾四周，了解这个村庄的情况。',
      '我走向村中央的井，仔细查看那些抓痕和井里的情况。',
      '我去东侧的谷仓看看，那些拖拽痕迹通向哪里？',
      '我沿着车辙路走一小段，看看路上那些翠晶碎片。',
      '我回到村里，找一个人问问这里发生了什么事。',
    ]
  },
  {
    name: 'Phase 2: NPC互动与派系 (Social/Faction)',
    actions: [
      '我寻找提灯团的成员，想了解他们的立场。',
      '我向提灯团的成员打听关于迷雾和井里爬出来的东西的情报。',
      '我询问关于德拉肯海姆城内的情况，那里有什么危险？',
      '我想了解其他派系的态度，白银骑士团和紫晶学院在做什么？',
      '我尝试与提灯团建立友好关系，提供我的帮助。',
    ]
  },
  {
    name: 'Phase 3: 战斗 (Combat)',
    actions: [
      '我听到谷仓里传来异响，我拔出武器小心翼翼地进去查看。',
      '如果有敌人在里面，我准备战斗！我先观察它的弱点。',
      '我发动攻击，瞄准它的要害！',
      '敌人反击了！我尝试闪避并进行反击。',
      '战斗结束后，我检查战利品和周围环境。',
    ]
  },
  {
    name: 'Phase 4: 探索与解密 (Exploration/Puzzle)',
    actions: [
      '我在谷仓深处发现了一个隐藏的地下室入口，我下去探索。',
      '地下室里有奇怪的符文和机关，我仔细研究它们。',
      '我尝试解读这些符文的含义，它们似乎和翠晶有关。',
      '我发现了一个需要特定顺序触碰的符文阵，我根据线索尝试解开它。',
      '符文阵打开了，里面有一个古老的箱子和一封褪色的信。',
    ]
  },
  {
    name: 'Phase 5: 污染与危机 (Contamination/Crisis)',
    actions: [
      '我打开箱子，但有一股绿色的雾气涌出，我可能被污染了！',
      '我感觉身体有些异样，检查自己的污染等级。',
      '迷雾开始变浓了，我需要尽快找到一个安全的地方。',
      '我在迷雾中前进，试图找到回到余烬村的路上。',
      '我遇到了一个受伤的冒险者，我尝试帮助他。',
    ]
  },
  {
    name: 'Phase 6: 休息与恢复 (Rest/Recovery)',
    actions: [
      '我找到一个相对安全的地方，决定进行一次短休。',
      '短休时我选择：清理伤口和恢复希望点。',
      '我和受伤的冒险者交谈，了解他为什么会在这里。',
      '休息后我检查自己的状态，准备继续前进。',
      '我决定前往德拉肯海姆城内探索。',
    ]
  },
  {
    name: 'Phase 7: 深入探索 (Deep Exploration)',
    actions: [
      '我进入德拉肯海姆城内，描述我看到的景象。',
      '我发现了一座部分坍塌的教堂，进去探索。',
      '教堂内有派系的标志，似乎是某个派系的前哨站。',
      '我在教堂内发现了关于德拉肯海姆封印的线索。',
      '我继续深入城市，朝城堡的方向前进。',
    ]
  },
  {
    name: 'Phase 8: 记忆测试 (Memory Consistency Test)',
    actions: [
      '回忆一下我到目前为止遇到的所有NPC，他们分别说了什么？',
      '我之前在井里发现了什么？那个铜牌上写了什么？',
      '我在谷仓地下室找到了什么信件？信上说了什么？',
      '我的污染等级现在是多少？我有什么异常症状？',
      '我和哪个派系的关系最好？为什么？',
    ]
  },
  {
    name: 'Phase 9: Boss战 (Boss Combat)',
    actions: [
      '城堡入口有一个巨大的被污染的生物挡住了去路，我准备战斗！',
      '我观察这个生物的弱点，寻找攻击的最佳时机。',
      '我发动全力一击！希望骰和恐惧骰，我需要好结果！',
      'Boss反击了，我被击中，检查我的伤害和状态。',
      '我坚持不懈，继续攻击，利用之前获得的线索和道具。',
      '战斗结束了！我检查战利品和周围环境。',
    ]
  },
  {
    name: 'Phase 10: 结局与总结 (Ending)',
    actions: [
      '我在城堡深处发现了德拉肯海姆封印，我尝试理解它的含义。',
      '我决定如何处理这个封印，是摧毁它还是利用它？',
      '无论结果如何，我回到余烬村，向那里的人报告我的发现。',
      '我总结一下这次冒险的收获和损失。',
      '我对未来的冒险有什么计划？',
    ]
  },
];

// Retry logic for timeouts
function sendActionWithRetry(socket, sessionId, playerId, action, maxRetries) {
  maxRetries = maxRetries || 3;
  return new Promise(async (resolve, reject) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await new Promise((res, rej) => {
          const timeout = setTimeout(() => {
            socket.off('gm:narrate', handler);
            rej(new Error('Response timeout (120s)'));
          }, 120000);

          const handler = (msg) => {
            clearTimeout(timeout);
            socket.off('gm:narrate', handler);
            res(msg);
          };

          socket.on('gm:narrate', handler);

          socket.emit('player:action', {
            type: 'player:action',
            sessionId: sessionId,
            senderId: playerId,
            payload: { action: action },
            timestamp: Date.now(),
          });
        });
        resolve(result);
        return;
      } catch (err) {
        log('  ⚠ Attempt ' + attempt + '/' + maxRetries + ' failed: ' + err.message);
        if (attempt === maxRetries) {
          reject(err);
          return;
        }
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  });
}

async function runTest() {
  // Initialize log
  fs.writeFileSync(logFile, '# TRPGMaster 6小时深度测试日志\n\n开始时间: ' + new Date().toISOString() + '\n模型: nex-agi/Nex-N2-Pro\n服务器: ' + SERVER_URL + '\n\n');

  log('连接服务器...');

  const socket = io(SERVER_URL, {
    transports: ['websocket'],
    timeout: 10000,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 3000,
  });

  let sessionId = '';
  let playerId = 'deep_test_player';

  // Wait for connection
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 15000);
    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  log('已连接');

  // Join session
  const stateMsg = await new Promise((resolve) => {
    const handler = (msg) => {
      socket.off('game:state', handler);
      resolve(msg);
    };
    socket.on('game:state', handler);
    socket.emit('session:join', {
      type: 'session:join',
      sessionId: '',
      senderId: playerId,
      payload: { playerId: playerId, role: 'player', name: '深度测试者' },
      timestamp: Date.now(),
    });
  });

  sessionId = stateMsg.payload.state.sessionId;
  const character = stateMsg.payload.state.character;

  log('会话ID: ' + sessionId);
  log('角色: ' + (character ? character.name + ' (' + character.classId + ' Lv.' + character.level + ')' : '无角色'));
  log('HP: ' + (character ? character.hp + '/' + character.maxHp : 'N/A') + ', 压力: ' + (character ? character.stress + '/' + character.maxStress : 'N/A') + ', 希望: ' + (character ? character.hope + '/' + character.maxHope : 'N/A'));

  // Save initial state snapshot
  testState.stateSnapshots.push({
    round: 0,
    time: Date.now(),
    hp: character ? character.hp : null,
    maxHp: character ? character.maxHp : null,
    stress: character ? character.stress : null,
    hope: character ? character.hope : null,
    fearPoints: stateMsg.payload.state.fearPoints,
    contaminationLevel: stateMsg.payload.state.campaignState ? stateMsg.payload.state.campaignState.contaminationLevel : null,
    factionRelations: stateMsg.payload.state.campaignState ? stateMsg.payload.state.campaignState.factionRelations : null,
  });

  // Run through all phases
  for (const phase of ACTION_PHASES) {
    logSection(phase.name);

    for (const action of phase.actions) {
      testState.roundNumber++;
      testState.totalActions++;

      log('\n### 回合 ' + testState.roundNumber + ' - 玩家行动\n> ' + action);

      const startTime = Date.now();

      try {
        const response = await sendActionWithRetry(socket, sessionId, playerId, action);
        const responseTime = Date.now() - startTime;
        testState.responseTimes.push(responseTime);

        const content = response.payload.content;
        const choices = response.payload.choices;

        if (choices && choices.length > 0) {
          testState.choicesReceived++;
        } else {
          testState.choicesMissing++;
        }

        logGMResponse(content, choices, testState.roundNumber);

        testState.gmResponses.push({
          round: testState.roundNumber,
          action: action.substring(0, 50),
          responseLength: content.length,
          hasChoices: !!choices && choices.length > 0,
          choiceCount: choices ? choices.length : 0,
          responseTime: responseTime,
          timestamp: Date.now(),
        });

        log('  ✓ 响应时间: ' + responseTime + 'ms | 内容长度: ' + content.length + ' | 选项: ' + (choices ? choices.length : 0));

      } catch (err) {
        testState.errors.push({
          round: testState.roundNumber,
          action: action.substring(0, 50),
          error: err.message,
          timestamp: Date.now(),
        });
        log('  ✗ 错误: ' + err.message);
      }

      // Save state periodically
      if (testState.totalActions % 5 === 0) {
        saveState();
        const avg = testState.responseTimes.length > 0
          ? Math.round(testState.responseTimes.reduce(function(a, b) { return a + b; }, 0) / testState.responseTimes.length)
          : 0;
        log('  [状态已保存] 总行动: ' + testState.totalActions + ', 平均响应: ' + avg + 'ms');
      }

      // Brief pause between actions to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));
    }

    // After each phase, capture a state snapshot via HTTP
    try {
      const httpState = await httpGet('/api/session');

      testState.stateSnapshots.push({
        round: testState.roundNumber,
        time: Date.now(),
        phase: phase.name,
        hp: httpState.character ? httpState.character.hp : null,
        maxHp: httpState.character ? httpState.character.maxHp : null,
        stress: httpState.character ? httpState.character.stress : null,
        hope: httpState.character ? httpState.character.hope : null,
        fearPoints: httpState.fearPoints,
        contaminationLevel: httpState.campaignState ? httpState.campaignState.contaminationLevel : null,
        factionRelations: httpState.campaignState ? httpState.campaignState.factionRelations : null,
        currentLocation: httpState.campaignState ? httpState.campaignState.currentLocation : null,
      });

      log('  [阶段快照] HP:' + (httpState.character ? httpState.character.hp + '/' + httpState.character.maxHp : 'N/A') + ' 压力:' + (httpState.character ? httpState.character.stress : 'N/A') + ' 希望:' + (httpState.character ? httpState.character.hope : 'N/A') + ' 恐惧点:' + httpState.fearPoints);
    } catch (e) {
      log('  [快照失败] ' + e.message);
    }

    saveState();

    // Longer pause between phases
    log('\n--- 阶段完成，暂停10秒 ---\n');
    await new Promise(r => setTimeout(r, 10000));
  }

  // Final report
  logSection('测试报告');
  const totalDuration = Date.now() - testState.startTime;
  const minutes = Math.floor(totalDuration / 60000);
  const seconds = Math.floor((totalDuration % 60000) / 1000);
  const avgResponse = testState.responseTimes.length > 0
    ? Math.round(testState.responseTimes.reduce(function(a, b) { return a + b; }, 0) / testState.responseTimes.length)
    : 0;
  const minResponse = testState.responseTimes.length > 0 ? Math.min.apply(null, testState.responseTimes) : 0;
  const maxResponse = testState.responseTimes.length > 0 ? Math.max.apply(null, testState.responseTimes) : 0;

  const errorList = testState.errors.length > 0
    ? testState.errors.map(function(e) { return '- 回合' + e.round + ': ' + e.error + ' (行动: "' + e.action + '")'; }).join('\n')
    : '无错误';

  const snapshotList = testState.stateSnapshots.map(function(s, i) {
    return '  ' + i + '. 回合' + s.round + ' [' + (s.phase || '初始') + '] HP:' + s.hp + '/' + s.maxHp + ' 压力:' + s.stress + ' 希望:' + s.hope + ' 恐惧:' + s.fearPoints + ' 污染:' + s.contaminationLevel;
  }).join('\n');

  const report = '\n### 基本统计\n'
    + '- 总时长: ' + minutes + '分' + seconds + '秒\n'
    + '- 总回合数: ' + testState.roundNumber + '\n'
    + '- 总行动数: ' + testState.totalActions + '\n'
    + '- 错误数: ' + testState.errors.length + '\n'
    + '- 平均响应时间: ' + avgResponse + 'ms\n'
    + '- 最快响应: ' + minResponse + 'ms\n'
    + '- 最慢响应: ' + maxResponse + 'ms\n'
    + '- 选项正确出现: ' + testState.choicesReceived + '/' + (testState.choicesReceived + testState.choicesMissing) + '\n\n'
    + '### 错误列表\n' + errorList + '\n\n'
    + '### 状态变化轨迹\n' + snapshotList + '\n\n'
    + '### 一致性检查\n' + (testState.consistencyIssues.length > 0 ? testState.consistencyIssues.map(function(i) { return '- ' + i; }).join('\n') : '暂无一致性检查结果（需手动审查日志）') + '\n';

  fs.appendFileSync(logFile, report);
  log(report);

  saveState();

  // Test persistence: disconnect and reconnect
  logSection('持久化测试: 断开重连');
  log('断开连接...');
  socket.disconnect();

  await new Promise(r => setTimeout(r, 3000));

  log('重新连接...');
  const socket2 = io(SERVER_URL, {
    transports: ['websocket'],
    timeout: 10000,
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Reconnection timeout')), 15000);
    socket2.on('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  log('已重新连接');

  const rejoinState = await new Promise((resolve) => {
    const handler = (msg) => {
      socket2.off('game:state', handler);
      resolve(msg);
    };
    socket2.on('game:state', handler);
    socket2.emit('session:rejoin', {
      type: 'session:rejoin',
      sessionId: sessionId,
      senderId: playerId,
      payload: { playerId: playerId, name: '深度测试者' },
      timestamp: Date.now(),
    });
  });

  const rejoinedChar = rejoinState.payload.state.character;
  const rejoinedMessages = rejoinState.payload.adventureMessages;

  log('重连后角色: ' + (rejoinedChar ? rejoinedChar.name + ' HP:' + rejoinedChar.hp + '/' + rejoinedChar.maxHp : 'N/A'));
  log('重连后冒险消息数: ' + (rejoinedMessages ? rejoinedMessages.length : 0));
  log('测试期间发送了 ' + testState.totalActions + ' 个行动，应有对应数量的消息');

  // Send one more action after reconnect to verify AI remembers context
  logSection('重连后记忆测试');

  try {
    const memoryResponse = await sendActionWithRetry(socket2, sessionId, playerId, '回顾一下我们的冒险到现在发生了什么？简要总结重要事件。');
    logGMResponse(memoryResponse.payload.content, memoryResponse.payload.choices, testState.roundNumber + 1);
    log('重连后AI记忆测试: 响应长度 ' + memoryResponse.payload.content.length);
  } catch (err) {
    log('重连后记忆测试失败: ' + err.message);
  }

  socket2.disconnect();

  logSection('测试完成');
  log('完整日志已保存到: ' + logFile);
  log('测试状态已保存到: ' + stateFile);

  process.exit(0);
}

runTest().catch(function(err) {
  console.error('Fatal error:', err);
  fs.appendFileSync(logFile, '\n\n!!! FATAL ERROR: ' + err.message + ' !!!\n');
  process.exit(1);
});
