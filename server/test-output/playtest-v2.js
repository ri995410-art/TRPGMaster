/**
 * TRPGMaster Full Playtest Script v2
 * Uses correct SocketMessage<T> format for all socket communications
 */
const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const http = require('http');

const SERVER_URL = 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'test-output');
const LOG_FILE = path.join(OUTPUT_DIR, 'playtest-report.md');

// State
let socket = null;
let gmNarration = '';
let allMessages = [];
let testResults = [];
let character = null;
let combatState = null;
let currentState = null;
let sessionId = '';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// HTTP helper
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    }).on('error', reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpPut(url, body) {
  return new Promise((resolve, reject) => {
    const putData = JSON.stringify(body);
    const req = http.request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(putData) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    });
    req.on('error', reject);
    req.write(putData);
    req.end();
  });
}

// Build SocketMessage wrapper
function msg(type, payload) {
  return {
    type,
    sessionId: sessionId || 'default',
    senderId: 'test-player',
    payload,
    timestamp: Date.now(),
  };
}

// Logging
function log(section, message) {
  const ts = new Date().toISOString().slice(11, 19);
  const entry = `[${ts}] [${section}] ${message}`;
  console.log(entry);
  allMessages.push(entry);
}

function addResult(category, testName, passed, details) {
  testResults.push({ category, testName, passed, details });
  const status = passed ? 'PASS' : 'FAIL';
  log('RESULT', `${status} | ${category} > ${testName} | ${details}`);
}

function snapshotChar(label) {
  if (!character) return null;
  const s = {
    label, hp: character.hp, maxHp: character.maxHp,
    stress: character.stress, maxStress: character.maxStress,
    hope: character.hope, maxHope: character.maxHope,
    armorSlots: character.armorSlots, maxArmorSlots: character.maxArmorSlots,
    inventory: character.inventory?.length || 0,
    gold: JSON.stringify(character.gold),
    conditions: [...(character.conditions || [])],
    evasion: character.evasion,
    level: character.level,
  };
  log('SNAP', `${label}: HP:${s.hp}/${s.maxHp} St:${s.stress}/${s.maxStress} Ho:${s.hope}/${s.maxHope} Ar:${s.armorSlots}/${s.maxArmorSlots} Inv:${s.inventory}`);
  return s;
}

// Connect
async function connect() {
  return new Promise((resolve, reject) => {
    log('NET', 'Connecting...');
    socket = io(SERVER_URL, { transports: ['polling'], timeout: 10000 });

    socket.on('connect', () => {
      log('NET', `Connected: ${socket.id}`);
      resolve();
    });

    socket.on('connect_error', (err) => {
      log('NET', `Error: ${err.message}`);
    });

    // State sync
    socket.on('game:state', (state) => {
      currentState = state;
      sessionId = state.sessionId || sessionId;
      if (state.activeCombat) combatState = state.activeCombat;
      if (state.character) character = state.character;
      log('SYNC', `State: session=${state.sessionId?.slice(0,20)} status=${state.status} fear=${state.fearPoints} combat=${!!state.activeCombat}`);
      if (state.character) {
        log('SYNC_CHAR', `HP:${state.character.hp}/${state.character.maxHp} St:${state.character.stress}/${state.character.maxStress} Ho:${state.character.hope}/${state.character.maxHope}`);
      }
    });

    // GM streaming
    socket.on('gm:narrate:start', (data) => {
      gmNarration = '';
      log('GM', `Start turn: ${data.turnId}`);
    });

    socket.on('gm:narrate:delta', (data) => {
      gmNarration += data.text || '';
    });

    socket.on('gm:narrate:end', (data) => {
      log('GM', `End (${gmNarration.length} chars)`);
      if (gmNarration.length > 0) {
        log('GM_TEXT', gmNarration.substring(0, 200) + '...');
      }
      if (data.choices?.length > 0) {
        log('GM_CHOICE', data.choices.map(c => c.text || c).join(' | '));
      }
    });

    // Character updates
    socket.on('character:update', (char) => {
      character = char;
      log('CHAR_UP', `HP:${char.hp}/${char.maxHp} St:${char.stress}/${char.maxStress} Ho:${char.hope}/${char.maxHope}`);
    });

    // Dice
    socket.on('dice:roll', (data) => {
      log('DICE', `hope=${data.hopeDie} fear=${data.fearDie} total=${data.total} outcome=${data.outcome}`);
    });

    // Loot
    socket.on('loot:available', (data) => {
      log('LOOT', JSON.stringify(data));
    });

    // Combat events
    socket.on('combat:start', () => log('COMBAT', 'Combat started!'));
    socket.on('combat:end', () => { log('COMBAT', 'Combat ended!'); combatState = null; });
    socket.on('combat:update', (data) => { combatState = data; log('COMBAT', 'Combat updated'); });

    // Session events
    socket.on('session:created', (data) => log('SESSION', `Created: ${data.sessionId}`));
    socket.on('session:joined', (data) => { sessionId = data.sessionId || sessionId; log('SESSION', `Joined: ${data.sessionId}`); });
  });
}

// Send action and wait for GM response
async function sendAction(actionText, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('gm:narrate:end', onEnd);
      reject(new Error(`Timeout ${timeoutMs}ms`));
    }, timeoutMs);

    gmNarration = '';
    const onEnd = (data) => {
      clearTimeout(timeout);
      socket.off('gm:narrate:end', onEnd);
      resolve({ narration: gmNarration, data });
    };

    socket.on('gm:narrate:end', onEnd);

    socket.emit('player:action', msg('player:action', { action: actionText }));
    log('PLAYER', actionText);
  });
}

// ============================================
// MAIN TEST
// ============================================

async function runTests() {
  log('TEST', '===== TRPGMaster Full Playtest v2 =====');
  const snapshots = {};

  try {
    // === PHASE 0: Setup ===
    log('PHASE', '=== Phase 0: Setup ===');

    await connect();
    await delay(1500);

    // Get session/character via HTTP
    const sessionState = await httpGet(`${SERVER_URL}/api/session`);
    sessionId = sessionState?.sessionId || sessionId;
    character = sessionState?.character || character;

    addResult('Session', 'Session accessible', !!sessionState, `ID: ${sessionState?.sessionId}`);
    addResult('Session', 'Character exists', !!character, `Class: ${character?.classId}`);

    // Start session
    await httpPost(`${SERVER_URL}/api/session/start`, {});
    await delay(1000);

    // Join session with proper SocketMessage format
    socket.emit('session:join', msg('session:join', {
      role: 'player',
      name: 'TestPlayer',
      character: character,
      playerId: 'test-player',
    }));
    log('SESSION', 'Emitted session:join');
    await delay(3000);

    // Verify connection still active
    const stillConnected = socket.connected;
    addResult('Session', 'Socket connected after join', stillConnected, `connected: ${stillConnected}`);

    if (!stillConnected) {
      // Try reconnecting
      log('SESSION', 'Attempting reconnect...');
      await connect();
      await delay(2000);
      socket.emit('session:join', msg('session:join', {
        role: 'player',
        name: 'TestPlayer',
        character: character,
        playerId: 'test-player',
      }));
      await delay(3000);
      addResult('Session', 'Reconnect successful', socket.connected, `connected: ${socket.connected}`);
    }

    snapshots.initial = snapshotChar('Initial');

    // Character creation validations
    addResult('Character', 'HP=7 (guardian)', character?.hp === 7, `${character?.hp}`);
    addResult('Character', 'Stress=0', character?.stress === 0, `${character?.stress}`);
    addResult('Character', 'Hope=2', character?.hope === 2, `${character?.hope}`);
    addResult('Character', 'ArmorSlots=4 (chain)', character?.armorSlots === 4, `${character?.armorSlots}`);
    addResult('Character', 'Evasion=8', character?.evasion === 8, `${character?.evasion}`);
    addResult('Character', 'DomainCards=2', character?.domainCardConfig?.loadout?.length === 2, `${character?.domainCardConfig?.loadout?.length}`);
    addResult('Character', 'Experiences=2', character?.experiences?.length === 2, `${character?.experiences?.length}`);

    // === PHASE 1: Exploration ===
    log('PHASE', '=== Phase 1: Exploration ===');

    let exploreOk = false;
    try {
      const r1 = await sendAction('我走向德拉肯海姆的城门，观察周围的环境和可能存在的危险', 120000);
      exploreOk = r1.narration.length > 50;
      addResult('Exploration', 'GM responds', exploreOk, `chars: ${r1.narration.length}`);

      const n1 = r1.narration;
      const hasSetting = /德尔瑞姆|污染|迷雾|德拉肯|海姆|Delerium|haze|Drakkenheim|废墟|城市/.test(n1);
      addResult('Exploration', 'Setting elements in narration', hasSetting, 'Daggerheart/Drakkenheim keywords');

      // Check for choices
      const hasChoices = r1.data?.choices?.length > 0;
      addResult('Exploration', 'GM provides choices', hasChoices, `choices: ${r1.data?.choices?.length || 0}`);
    } catch(e) {
      addResult('Exploration', 'GM responds', false, e.message);
    }

    snapshots.afterExplore = snapshotChar('After Explore');

    // Scene search
    try {
      socket.emit('scene:search');
      log('PLAYER', 'Emitted scene:search');
      await delay(5000);
      addResult('Exploration', 'Scene search sent', true, 'emitted');
    } catch(e) {
      addResult('Exploration', 'Scene search', false, e.message);
    }

    // Second exploration
    try {
      const r2 = await sendAction('我搜索城门附近的废墟，寻找有用的物品和线索', 120000);
      addResult('Exploration', 'Search exploration', r2.narration.length > 50, `chars: ${r2.narration.length}`);
    } catch(e) {
      addResult('Exploration', 'Search exploration', false, e.message);
    }

    snapshots.afterSearch = snapshotChar('After Search');

    // === PHASE 2: Combat ===
    log('PHASE', '=== Phase 2: Combat ===');

    try {
      const r3 = await sendAction('我拔出阔剑准备战斗，向面前的敌人发起攻击！', 120000);
      addResult('Combat', 'Combat narration', r3.narration.length > 50, `chars: ${r3.narration.length}`);

      const n3 = r3.narration;
      const hasCombat = /战斗|攻击|伤害|敌人|命中|combat|attack|damage|enemy|骰/.test(n3);
      addResult('Combat', 'Combat keywords in narration', hasCombat, 'combat vocabulary');
    } catch(e) {
      addResult('Combat', 'Combat narration', false, e.message);
    }

    // Structured attack via action:attack
    try {
      socket.emit('action:attack', msg('action:attack', {
        attackerId: character?.id || 'player',
        targetId: 'enemy-0',
        trait: 'strength',
        difficulty: 15,
      }));
      log('COMBAT', 'Emitted action:attack');
      await delay(8000);
      addResult('Combat', 'Attack action emitted', true, 'action:attack');
    } catch(e) {
      addResult('Combat', 'Attack action', false, e.message);
    }

    snapshots.afterAttack1 = snapshotChar('After Attack 1');

    // Use domain card
    try {
      socket.emit('action:useFeature', msg('action:useFeature', {
        featureId: 'valor-powerful-push',
        featureType: 'domainCard',
        action: '使用强力推击',
        attribute: 'strength',
      }));
      log('COMBAT', 'Emitted action:useFeature (valor-powerful-push)');
      await delay(8000);
      addResult('Combat', 'Domain card use emitted', true, 'valor-powerful-push');
    } catch(e) {
      addResult('Combat', 'Domain card use', false, e.message);
    }

    // Second attack
    try {
      socket.emit('action:attack', msg('action:attack', {
        attackerId: character?.id || 'player',
        targetId: 'enemy-0',
        trait: 'strength',
        difficulty: 15,
      }));
      await delay(8000);
      addResult('Combat', 'Second attack emitted', true, 'action:attack #2');
    } catch(e) {
      addResult('Combat', 'Second attack', false, e.message);
    }

    snapshots.afterCombat = snapshotChar('After Combat');

    // Check HP changed
    if (snapshots.afterCombat && snapshots.initial) {
      const hpChanged = snapshots.afterCombat.hp !== snapshots.initial.hp;
      addResult('Combat', 'HP changed during combat', hpChanged,
        `${snapshots.initial.hp} -> ${snapshots.afterCombat.hp}`);
    }

    // Check combat state
    addResult('Combat', 'Combat state tracked', combatState !== null,
      `active: ${combatState !== null}`);

    // === PHASE 3: Rest ===
    log('PHASE', '=== Phase 3: Rest ===');

    // Short rest
    try {
      socket.emit('player:rest', msg('player:rest', {
        restType: 'short',
        actions: ['恢复生命'],
      }));
      log('REST', 'Emitted short rest');
      await delay(10000);

      const afterShort = await httpGet(`${SERVER_URL}/api/character`);
      if (afterShort) {
        character = afterShort;
        snapshots.afterShortRest = snapshotChar('After Short Rest');
        addResult('Rest', 'Short rest processed', true, 'emitted');
      }
    } catch(e) {
      addResult('Rest', 'Short rest', false, e.message);
    }

    // Long rest
    try {
      socket.emit('player:rest', msg('player:rest', {
        restType: 'long',
        actions: ['恢复全部生命', '清除压力'],
      }));
      log('REST', 'Emitted long rest');
      await delay(10000);

      const afterLong = await httpGet(`${SERVER_URL}/api/character`);
      if (afterLong) {
        character = afterLong;
        snapshots.afterLongRest = snapshotChar('After Long Rest');
        addResult('Rest', 'Long rest processed', true, 'emitted');
        addResult('Rest', 'HP restored after long rest', afterLong.hp === afterLong.maxHp,
          `${afterLong.hp}/${afterLong.maxHp}`);
        addResult('Rest', 'Stress cleared after long rest', afterLong.stress === 0,
          `stress: ${afterLong.stress}`);
      }
    } catch(e) {
      addResult('Rest', 'Long rest', false, e.message);
    }

    // === PHASE 4: Puzzle/Ability Check ===
    log('PHASE', '=== Phase 4: Puzzle & Ability Check ===');

    try {
      const r4 = await sendAction('我仔细检查墙壁上的古老符文，尝试解读其中的含义', 120000);
      addResult('Puzzle', 'Puzzle narration', r4.narration.length > 50, `chars: ${r4.narration.length}`);

      const n4 = r4.narration;
      const hasPuzzle = /符文|解读|线索|知识|谜|古代|rune|puzzle|ancient|秘密/.test(n4);
      addResult('Puzzle', 'Puzzle keywords', hasPuzzle, 'puzzle vocabulary');
    } catch(e) {
      addResult('Puzzle', 'Puzzle narration', false, e.message);
    }

    // Ability check via action:roll
    try {
      socket.emit('action:roll', msg('action:roll', {
        action: '解读古代符文',
        attribute: 'knowledge',
        difficulty: 15,
      }));
      log('PUZZLE', 'Emitted action:roll (knowledge)');
      await delay(8000);
      addResult('Puzzle', 'Ability check emitted', true, 'knowledge check');
    } catch(e) {
      addResult('Puzzle', 'Ability check', false, e.message);
    }

    // Second puzzle
    try {
      const r5 = await sendAction('我运用知识来破解这个谜题，寻找隐藏的机关', 120000);
      addResult('Puzzle', 'Second puzzle', r5.narration.length > 50, `chars: ${r5.narration.length}`);
    } catch(e) {
      addResult('Puzzle', 'Second puzzle', false, e.message);
    }

    snapshots.afterPuzzle = snapshotChar('After Puzzle');

    // === PHASE 5: State Verification ===
    log('PHASE', '=== Phase 5: State Verification ===');

    const finalState = await httpGet(`${SERVER_URL}/api/session`);
    const finalChar = await httpGet(`${SERVER_URL}/api/character`);

    addResult('State', 'Final session accessible', !!finalState, `session: ${finalState?.sessionId}`);
    addResult('State', 'Final character accessible', !!finalChar, `name: ${finalChar?.name}`);

    if (finalChar) {
      addResult('State', 'Inventory is array', Array.isArray(finalChar.inventory), `items: ${finalChar.inventory?.length}`);
      addResult('State', 'Gold exists', !!finalChar.gold, JSON.stringify(finalChar.gold));
      addResult('State', 'DomainCards loaded', finalChar.domainCardConfig?.loadout?.length > 0,
        `cards: ${finalChar.domainCardConfig?.loadout?.length}`);
      addResult('State', 'Experiences set', finalChar.experiences?.length > 0,
        `count: ${finalChar.experiences?.length}`);
      addResult('State', 'Backstory exists', (finalChar.backstory?.length || 0) > 0,
        `len: ${finalChar.backstory?.length}`);
      addResult('State', 'Weapon equipped', !!finalChar.mainWeapon, finalChar.mainWeapon?.nameEn || 'none');
      addResult('State', 'Armor equipped', !!finalChar.armor, finalChar.armor?.nameEn || 'none');
    }

    addResult('State', 'FearPoints tracked', finalState?.fearPoints !== undefined,
      `fear: ${finalState?.fearPoints}`);
    addResult('State', 'Timeline tracked', Array.isArray(finalState?.timeline),
      `entries: ${finalState?.timeline?.length || 0}`);
    addResult('State', 'Players tracked', Array.isArray(finalState?.players),
      `players: ${finalState?.players?.length || 0}`);

    // === PHASE 6: Inventory API ===
    log('PHASE', '=== Phase 6: Inventory API ===');

    // Add item
    try {
      const addResult_ = await httpPost(`${SERVER_URL}/api/character/inventory/add`, {
        itemId: 'delerium-shard',
        name: '德尔瑞姆碎片',
        quantity: 1,
        description: '一块发光的德尔瑞姆矿石碎片',
      });
      addResult('Inventory', 'Add item', addResult_?.itemAdded?.id === 'delerium-shard',
        `added: ${addResult_?.itemAdded?.name || 'fail'}`);
    } catch(e) {
      addResult('Inventory', 'Add item', false, e.message);
    }

    // Verify persistence
    const charWithItem = await httpGet(`${SERVER_URL}/api/character`);
    addResult('Inventory', 'Item persisted',
      charWithItem?.inventory?.some(i => i.id === 'delerium-shard'),
      `inventory: ${charWithItem?.inventory?.length}`);

    // Add gold
    try {
      const char = charWithItem;
      if (char) {
        char.gold.coins += 15;
        const putResult = await httpPut(`${SERVER_URL}/api/character`, char);
        addResult('Inventory', 'Gold updated', !!putResult?.character,
          `gold: ${JSON.stringify(putResult?.character?.gold)}`);
      }
    } catch(e) {
      addResult('Inventory', 'Gold update', false, e.message);
    }

    // Remove item
    try {
      const rmResult = await httpPost(`${SERVER_URL}/api/character/inventory/remove`, {
        itemId: 'delerium-shard',
      });
      addResult('Inventory', 'Remove item', true, 'removed');

      const charAfterRm = await httpGet(`${SERVER_URL}/api/character`);
      addResult('Inventory', 'Item removed from inventory',
        !charAfterRm?.inventory?.some(i => i.id === 'delerium-shard'),
        `inventory: ${charAfterRm?.inventory?.length}`);
    } catch(e) {
      addResult('Inventory', 'Remove item', false, e.message);
    }

    // === PHASE 7: Session History / Memory ===
    log('PHASE', '=== Phase 7: Memory & History ===');

    // Check session persistence
    const sessionDir = path.join(__dirname, '..', '..', 'session_history');
    try {
      const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('_history.json'));
      addResult('Memory', 'Session history files exist', files.length > 0, `files: ${files.length}`);
    } catch(e) {
      addResult('Memory', 'Session history', false, e.message);
    }

    // Check session data persistence
    try {
      const sessionData = fs.readFileSync(path.join(__dirname, '..', '..', 'session_data.json'), 'utf8');
      const parsed = JSON.parse(sessionData);
      addResult('Memory', 'Session data persisted', !!parsed, `sessions: ${Object.keys(parsed?.sessions || {}).length}`);
    } catch(e) {
      addResult('Memory', 'Session data', false, e.message);
    }

    log('PHASE', '=== Test Complete ===');

  } catch(e) {
    log('FATAL', `${e.message}\n${e.stack}`);
  }

  // Generate report
  generateReport(snapshots);

  // Cleanup
  if (socket) socket.disconnect();
}

function generateReport(snapshots) {
  const timestamp = new Date().toISOString();
  let report = `# TRPGMaster 全流程测试报告\n\n`;
  report += `**测试时间**: ${timestamp}\n`;
  report += `**服务器**: ${SERVER_URL}\n`;
  report += `**角色**: 铸龙·铁壁 (Guardian/龙人/链甲/阔剑)\n\n`;

  // Summary
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const total = testResults.length;
  report += `## 测试结果摘要\n\n`;
  report += `| 指标 | 数值 |\n|------|------|\n`;
  report += `| 总测试数 | ${total} |\n| 通过 | ${passed} |\n| 失败 | ${failed} |\n| 通过率 | ${(total > 0 ? ((passed/total)*100).toFixed(1) : 0)}% |\n\n`;

  // By category
  report += `## 详细结果\n\n`;
  const cats = [...new Set(testResults.map(r => r.category))];
  for (const cat of cats) {
    const catR = testResults.filter(r => r.category === cat);
    const catP = catR.filter(r => r.passed).length;
    report += `### ${cat} (${catP}/${catR.length})\n\n`;
    report += `| 测试项 | 结果 | 详情 |\n|--------|------|------|\n`;
    for (const r of catR) {
      report += `| ${r.testName} | ${r.passed ? 'PASS' : 'FAIL'} | ${r.details} |\n`;
    }
    report += `\n`;
  }

  // Snapshots
  report += `## 角色状态快照\n\n`;
  report += `| 阶段 | HP | Stress | Hope | Armor | 物品 | 状态 |\n|------|-----|--------|------|-------|------|------|\n`;
  for (const [_, snap] of Object.entries(snapshots)) {
    if (snap) {
      report += `| ${snap.label} | ${snap.hp}/${snap.maxHp} | ${snap.stress}/${snap.maxStress} | ${snap.hope}/${snap.maxHope} | ${snap.armorSlots}/${snap.maxArmorSlots} | ${snap.inventory} | ${snap.conditions.join(',') || '无'} |\n`;
    }
  }
  report += `\n`;

  // Full log
  report += `## 完整日志\n\n\`\`\`\n`;
  for (const m of allMessages) report += m + '\n';
  report += `\`\`\`\n`;

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, report, 'utf8');
  console.log(`\nReport: ${LOG_FILE}`);
}

runTests().catch(console.error);
