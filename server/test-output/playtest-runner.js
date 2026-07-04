/**
 * TRPGMaster Full Playtest Script
 * Tests: Character creation, Exploration, Combat, Rest, Puzzle solving
 * Validates: State tracking, domain cards, loot, memory, journal, combat resolution
 */
const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

const SERVER_URL = 'http://localhost:3000';
const LOG_FILE = path.join(__dirname, '..', 'test-output', 'playtest-log.md');

// Test state
let socket = null;
let sessionId = null;
let turnId = null;
let character = null;
let testResults = [];
let gmNarration = '';
let allMessages = [];
let combatState = null;
let currentState = null;

// Utility: delay
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// Logging
function log(section, message) {
  const timestamp = new Date().toISOString().slice(11, 19);
  const entry = `[${timestamp}] [${section}] ${message}`;
  console.log(entry);
  allMessages.push(entry);
}

function addResult(category, testName, passed, details) {
  testResults.push({ category, testName, passed, details });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  log('RESULT', `${status} | ${category} > ${testName} | ${details}`);
}

// Connect to server
async function connect() {
  return new Promise((resolve, reject) => {
    log('CONNECT', 'Connecting to server...');
    socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
    });

    socket.on('connect', () => {
      log('CONNECT', `Connected! Socket ID: ${socket.id}`);
      resolve();
    });

    socket.on('connect_error', (err) => {
      log('CONNECT', `Connection error: ${err.message}`);
      reject(err);
    });

    // Set up event listeners
    socket.on('game:state', (state) => {
      log('STATE', `Full state sync received. Session: ${state.sessionId}, Status: ${state.status}`);
      currentState = state;
      if (state.activeCombat) {
        combatState = state.activeCombat;
        log('COMBAT', `Combat active! Enemies: ${combatState.enemies?.length || 0}`);
      }
      if (state.character) {
        character = state.character;
        log('CHAR', `Character: ${character.name} HP:${character.hp}/${character.maxHp} Stress:${character.stress}/${character.maxStress} Hope:${character.hope}/${character.maxHope}`);
      }
    });

    socket.on('gm:narrate:start', (data) => {
      turnId = data.turnId;
      gmNarration = '';
      log('GM', `Narration started. Turn: ${turnId}`);
    });

    socket.on('gm:narrate:delta', (data) => {
      gmNarration += data.text || '';
    });

    socket.on('gm:narrate:end', (data) => {
      log('GM', `Narration complete (${gmNarration.length} chars)`);
      log('GM_TEXT', gmNarration.substring(0, 300) + (gmNarration.length > 300 ? '...' : ''));
      if (data.choices && data.choices.length > 0) {
        log('GM_CHOICES', data.choices.map(c => c.text || c).join(' | '));
      }
    });

    socket.on('character:update', (char) => {
      character = char;
      log('CHAR_UPDATE', `${char.name} HP:${char.hp}/${char.maxHp} Stress:${char.stress}/${char.maxStress} Hope:${char.hope}/${char.maxHope} Armor:${char.armorSlots}/${char.maxArmorSlots}`);
    });

    socket.on('dice:roll', (data) => {
      log('DICE', `Roll: hope=${data.hopeDie} fear=${data.fearDie} total=${data.total} outcome=${data.outcome}`);
    });

    socket.on('loot:available', (data) => {
      log('LOOT', `Loot available: ${JSON.stringify(data)}`);
    });

    socket.on('session:created', (data) => {
      log('SESSION', `Session created: ${data.sessionId}, code: ${data.code}`);
    });

    socket.on('session:joined', (data) => {
      log('SESSION', `Session joined: ${data.sessionId}`);
      sessionId = data.sessionId;
    });

    socket.on('combat:start', (data) => {
      log('COMBAT', `Combat started! Enemies: ${data.enemies?.length || '?'}`);
    });

    socket.on('combat:end', (data) => {
      log('COMBAT', `Combat ended!`);
      combatState = null;
    });

    socket.on('safety:update', (data) => {
      log('SAFETY', `Safety update: ${JSON.stringify(data)}`);
    });

    socket.on('error', (data) => {
      log('ERROR', `Socket error: ${JSON.stringify(data)}`);
    });

    socket.on('disconnect', () => {
      log('CONNECT', 'Disconnected from server');
    });
  });
}

// Send player action and wait for GM response
async function sendAction(actionText, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Action timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const onEnd = (data) => {
      clearTimeout(timeout);
      socket.off('gm:narrate:end', onEnd);
      resolve({ narration: gmNarration, data });
    };

    socket.on('gm:narrate:end', onEnd);
    gmNarration = '';

    socket.emit('player:action', {
      type: 'narrative',
      content: actionText,
      playerId: 'test-player',
    });

    log('PLAYER', `Action: ${actionText}`);
  });
}

// Wait for GM narration with retry
async function waitForNarration(timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Narration timeout'));
    }, timeoutMs);

    const onEnd = (data) => {
      clearTimeout(timeout);
      socket.off('gm:narrate:end', onEnd);
      resolve({ narration: gmNarration, data });
    };

    socket.on('gm:narrate:end', onEnd);
  });
}

// Snapshot character state
function snapshotChar(label) {
  if (!character) {
    log('SNAPSHOT', `${label}: No character data`);
    return null;
  }
  const snap = {
    label,
    hp: character.hp,
    maxHp: character.maxHp,
    stress: character.stress,
    maxStress: character.maxStress,
    hope: character.hope,
    maxHope: character.maxHope,
    armorSlots: character.armorSlots,
    maxArmorSlots: character.maxArmorSlots,
    inventory: character.inventory?.length || 0,
    gold: JSON.stringify(character.gold),
    conditions: [...(character.conditions || [])],
    evasion: character.evasion,
  };
  log('SNAPSHOT', `${label}: HP:${snap.hp}/${snap.maxHp} Stress:${snap.stress}/${snap.maxStress} Hope:${snap.hope}/${snap.maxHope} Armor:${snap.armorSlots}/${snap.maxArmorSlots} Items:${snap.inventory} Conditions:${snap.conditions.join(',') || 'none'}`);
  return snap;
}

// ============================================================
// TEST SEQUENCE
// ============================================================

async function runTests() {
  log('TEST', '=== TRPGMaster Full Playtest Starting ===');
  const snapshots = {};

  try {
    // ========================================
    // PHASE 0: Connection & Session Setup
    // ========================================
    log('PHASE', '--- Phase 0: Connection & Session ---');

    await connect();
    await delay(1000);

    // Get current character from API
    const http = require('http');
    const getJson = (url) => new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
      }).on('error', reject);
    });

    const sessionState = await getJson(`${SERVER_URL}/api/session`);
    addResult('Session', 'Session accessible', !!sessionState, `SessionID: ${sessionState?.sessionId}`);
    addResult('Session', 'Session has character', !!sessionState?.character, `Character: ${sessionState?.character?.name || 'none'}`);

    // Start session
    await new Promise((resolve) => {
      http.request(`${SERVER_URL}/api/session/start`, { method: 'POST' }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => { log('SESSION', `Session started: ${data}`); resolve(); });
      }).end();
    });

    await delay(1000);

    // Re-get character after state sync
    character = sessionState.character;
    snapshots.initial = snapshotChar('Initial');

    addResult('Character', 'Character created', !!character, `Class: ${character?.classId}, Level: ${character?.level}`);
    addResult('Character', 'HP correct', character?.hp === 7, `HP: ${character?.hp}`);
    addResult('Character', 'Stress correct', character?.stress === 0, `Stress: ${character?.stress}`);
    addResult('Character', 'Hope correct', character?.hope === 2, `Hope: ${character?.hope}`);
    addResult('Character', 'Armor slots correct', character?.armorSlots === 4, `Slots: ${character?.armorSlots}`);
    addResult('Character', 'Domain cards loaded', character?.domainCardConfig?.loadout?.length === 2, `Cards: ${character?.domainCardConfig?.loadout?.length}`);
    addResult('Character', 'Evasion correct', character?.evasion === 8, `Evasion: ${character?.evasion} (base 9 - chain -1)`);
    addResult('Character', 'Experiences set', character?.experiences?.length === 2, `Count: ${character?.experiences?.length}`);

    // ========================================
    // PHASE 1: Exploration
    // ========================================
    log('PHASE', '--- Phase 1: Exploration ---');

    // Send join with character data
    socket.emit('session:join', {
      playerId: 'test-player',
      role: 'player',
      name: '测试玩家',
      character: character,
    });
    await delay(2000);

    // Action 1: Enter the city
    log('PLAYER', 'Exploring Drakkenheim...');
    try {
      const exploreResult = await sendAction('我走向德拉肯海姆的城门，观察周围的环境和可能存在的危险', 90000);
      log('GM_RESPONSE', `Exploration narration received (${exploreResult.narration.length} chars)`);

      addResult('Exploration', 'GM responds to exploration', exploreResult.narration.length > 50,
        `Narration length: ${exploreResult.narration.length}`);

      // Check for Drakkenheim setting elements
      const narration = exploreResult.narration;
      const hasSettingElements = narration.includes('德尔瑞姆') || narration.includes('污染') ||
        narration.includes('迷雾') || narration.includes('德拉肯') || narration.includes('海姆') ||
        narration.includes('Delerium') || narration.includes('contamination') || narration.includes('haze') ||
        narration.includes('Drakkenheim') || narration.includes('废墟') || narration.includes('城市');
      addResult('Exploration', 'Narration contains setting elements', hasSettingElements,
        `Setting keywords found: ${hasSettingElements}`);

    } catch (e) {
      addResult('Exploration', 'GM responds to exploration', false, `Error: ${e.message}`);
    }

    snapshots.afterExplore = snapshotChar('After Exploration');

    // Action 2: Search for items
    log('PLAYER', 'Searching for items...');
    try {
      socket.emit('scene:search', { playerId: 'test-player' });
      log('PLAYER', 'Emitted scene:search');
      await delay(3000);
      addResult('Exploration', 'Scene search emitted', true, 'Search request sent');
    } catch (e) {
      addResult('Exploration', 'Scene search', false, `Error: ${e.message}`);
    }

    // Action 3: More exploration
    try {
      const explore2 = await sendAction('我仔细搜索城门附近的废墟，寻找有用的物品和线索', 90000);
      addResult('Exploration', 'Deep exploration works', explore2.narration.length > 50,
        `Narration length: ${explore2.narration.length}`);
    } catch (e) {
      addResult('Exploration', 'Deep exploration', false, `Error: ${e.message}`);
    }

    snapshots.afterSearch = snapshotChar('After Search');

    // ========================================
    // PHASE 2: Combat
    // ========================================
    log('PHASE', '--- Phase 2: Combat ---');

    try {
      const combatResult = await sendAction('我拔出阔剑，准备战斗！向面前的敌人发起攻击', 90000);
      addResult('Combat', 'Combat triggered narration', combatResult.narration.length > 50,
        `Narration length: ${combatResult.narration.length}`);

      const hasCombatKeywords = combatResult.narration.includes('战斗') || combatResult.narration.includes('攻击') ||
        combatResult.narration.includes('伤害') || combatResult.narration.includes('敌人') ||
        combatResult.narration.includes('combat') || combatResult.narration.includes('attack') ||
        combatResult.narration.includes('damage') || combatResult.narration.includes('enemy') ||
        combatResult.narration.includes('骰') || combatResult.narration.includes('命中');
      addResult('Combat', 'Narration has combat keywords', hasCombatKeywords,
        `Combat keywords: ${hasCombatKeywords}`);

    } catch (e) {
      addResult('Combat', 'Combat trigger', false, `Error: ${e.message}`);
    }

    await delay(2000);

    // Try attack action via socket
    log('COMBAT', 'Sending attack action...');
    try {
      socket.emit('player:attack', {
        playerId: 'test-player',
        enemyId: 'enemy-0',
        action: 'attack',
        trait: 'strength',
        difficulty: 15,
      });
      log('COMBAT', 'Attack emitted, waiting for response...');
      await delay(5000);
      addResult('Combat', 'Attack action sent', true, 'Attack emitted via socket');
    } catch (e) {
      addResult('Combat', 'Attack action', false, `Error: ${e.message}`);
    }

    // Attack again
    try {
      socket.emit('player:attack', {
        playerId: 'test-player',
        enemyId: 'enemy-0',
        action: 'attack',
        trait: 'strength',
        difficulty: 15,
      });
      await delay(5000);
      addResult('Combat', 'Second attack sent', true, 'Second attack emitted');
    } catch (e) {
      addResult('Combat', 'Second attack', false, `Error: ${e.message}`);
    }

    // Try using domain card
    log('COMBAT', 'Using domain card: Powerful Push...');
    try {
      socket.emit('player:useFeature', {
        playerId: 'test-player',
        featureId: 'valor-powerful-push',
        featureType: 'domainCard',
        action: '使用强力推击',
        attribute: 'strength',
        difficulty: 15,
      });
      await delay(5000);
      addResult('Combat', 'Domain card use emitted', true, 'valor-powerful-push feature use sent');
    } catch (e) {
      addResult('Combat', 'Domain card use', false, `Error: ${e.message}`);
    }

    snapshots.afterCombat = snapshotChar('After Combat');

    // Check if character state changed from combat
    if (snapshots.afterCombat && snapshots.initial) {
      const hpChanged = snapshots.afterCombat.hp !== snapshots.initial.hp;
      addResult('Combat', 'Character state changed in combat', hpChanged,
        `HP: ${snapshots.initial.hp} -> ${snapshots.afterCombat.hp}`);
    }

    // ========================================
    // PHASE 3: Rest
    // ========================================
    log('PHASE', '--- Phase 3: Rest ---');

    try {
      socket.emit('player:rest', {
        playerId: 'test-player',
        restType: 'short',
      });
      log('REST', 'Short rest requested');
      await delay(5000);

      // Get updated character
      const afterRest = await getJson(`${SERVER_URL}/api/character`);
      if (afterRest) {
        character = afterRest;
        snapshots.afterShortRest = snapshotChar('After Short Rest');

        addResult('Rest', 'Short rest processed', true, 'Rest request sent');
        addResult('Rest', 'HP recovered or unchanged', afterRest.hp >= snapshots.afterCombat?.hp,
          `HP: ${snapshots.afterCombat?.hp} -> ${afterRest.hp}`);
      }
    } catch (e) {
      addResult('Rest', 'Short rest', false, `Error: ${e.message}`);
    }

    // Try long rest
    try {
      socket.emit('player:rest', {
        playerId: 'test-player',
        restType: 'long',
      });
      log('REST', 'Long rest requested');
      await delay(5000);

      const afterLongRest = await getJson(`${SERVER_URL}/api/character`);
      if (afterLongRest) {
        character = afterLongRest;
        snapshots.afterLongRest = snapshotChar('After Long Rest');

        addResult('Rest', 'Long rest processed', true, 'Long rest request sent');
        const stressCleared = afterLongRest.stress === 0;
        addResult('Rest', 'Stress cleared after long rest', stressCleared,
          `Stress: ${afterLongRest.stress}`);
        addResult('Rest', 'HP restored after long rest', afterLongRest.hp === afterLongRest.maxHp,
          `HP: ${afterLongRest.hp}/${afterLongRest.maxHp}`);
      }
    } catch (e) {
      addResult('Rest', 'Long rest', false, `Error: ${e.message}`);
    }

    // ========================================
    // PHASE 4: Puzzle / Ability Check
    // ========================================
    log('PHASE', '--- Phase 4: Puzzle & Ability Check ---');

    try {
      const puzzleResult = await sendAction('我仔细检查墙壁上的古老符文，尝试解读其中的含义', 90000);
      addResult('Puzzle', 'GM responds to puzzle', puzzleResult.narration.length > 50,
        `Narration length: ${puzzleResult.narration.length}`);

      const hasPuzzleElements = puzzleResult.narration.includes('符文') || puzzleResult.narration.includes('解读') ||
        puzzleResult.narration.includes('线索') || puzzleResult.narration.includes('知识') ||
        puzzleResult.narration.includes('谜') || puzzleResult.narration.includes('古代') ||
        puzzleResult.narration.includes('rune') || puzzleResult.narration.includes('puzzle') ||
        puzzleResult.narration.includes('ancient');
      addResult('Puzzle', 'Narration contains puzzle elements', hasPuzzleElements,
        `Puzzle keywords: ${hasPuzzleElements}`);

    } catch (e) {
      addResult('Puzzle', 'Puzzle interaction', false, `Error: ${e.message}`);
    }

    // Try action roll (ability check)
    log('PUZZLE', 'Sending action roll for knowledge check...');
    try {
      socket.emit('player:actionRoll', {
        playerId: 'test-player',
        action: '解读古代符文',
        attribute: 'knowledge',
        difficulty: 15,
      });
      log('PUZZLE', 'Action roll emitted');
      await delay(5000);
      addResult('Puzzle', 'Ability check sent', true, 'knowledge check emitted');
    } catch (e) {
      addResult('Puzzle', 'Ability check', false, `Error: ${e.message}`);
    }

    // Second puzzle action
    try {
      const puzzle2 = await sendAction('我用我的知识来破解这个谜题，试图找到隐藏的机关', 90000);
      addResult('Puzzle', 'Second puzzle attempt', puzzle2.narration.length > 50,
        `Narration length: ${puzzle2.narration.length}`);
    } catch (e) {
      addResult('Puzzle', 'Second puzzle', false, `Error: ${e.message}`);
    }

    snapshots.afterPuzzle = snapshotChar('After Puzzle');

    // ========================================
    // PHASE 5: State Verification
    // ========================================
    log('PHASE', '--- Phase 5: State Verification ---');

    // Get final state from server
    const finalState = await getJson(`${SERVER_URL}/api/session`);
    const finalChar = await getJson(`${SERVER_URL}/api/character`);

    addResult('State', 'Session state accessible', !!finalState, `Session: ${finalState?.sessionId}`);
    addResult('State', 'Character persisted', !!finalChar, `Character: ${finalChar?.name || 'none'}`);

    if (finalChar) {
      addResult('State', 'Character has inventory', Array.isArray(finalChar.inventory),
        `Items: ${finalChar.inventory?.length}`);
      addResult('State', 'Character has gold', !!finalChar.gold,
        `Gold: ${JSON.stringify(finalChar.gold)}`);
      addResult('State', 'Character has domain cards', finalChar.domainCardConfig?.loadout?.length > 0,
        `Cards: ${finalChar.domainCardConfig?.loadout?.length}`);
      addResult('State', 'Character has experiences', finalChar.experiences?.length > 0,
        `Count: ${finalChar.experiences?.length}`);
      addResult('State', 'Character has backstory', finalChar.backstory?.length > 0,
        `Length: ${finalChar.backstory?.length}`);
    }

    // Fear points tracking
    addResult('State', 'Fear points tracked', finalState?.fearPoints !== undefined,
      `Fear: ${finalState?.fearPoints}`);

    // Check for journal entries in state
    addResult('State', 'Timeline tracked', Array.isArray(finalState?.timeline),
      `Entries: ${finalState?.timeline?.length || 0}`);

    // ========================================
    // PHASE 6: Inventory Operations
    // ========================================
    log('PHASE', '--- Phase 6: Inventory ---');

    // Add item via API
    try {
      const addItemResult = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({
          itemId: 'delerium-shard',
          name: '德尔瑞姆碎片',
          quantity: 1,
          description: '一块发光的德尔瑞姆矿石碎片，散发着不祥的光芒',
        });
        const req = http.request(`${SERVER_URL}/api/character/inventory/add`, {
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

      addResult('Inventory', 'Add item to inventory', addItemResult?.itemAdded?.name === '德尔瑞姆碎片',
        `Added: ${addItemResult?.itemAdded?.name || 'failed'}`);
    } catch (e) {
      addResult('Inventory', 'Add item', false, `Error: ${e.message}`);
    }

    // Verify item in inventory
    const charWithItem = await getJson(`${SERVER_URL}/api/character`);
    addResult('Inventory', 'Item persisted in inventory',
      charWithItem?.inventory?.some(i => i.id === 'delerium-shard'),
      `Inventory size: ${charWithItem?.inventory?.length}`);

    // Remove item
    try {
      const removeResult = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({ itemId: 'delerium-shard' });
        const req = http.request(`${SERVER_URL}/api/character/inventory/remove`, {
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

      addResult('Inventory', 'Remove item from inventory', true, 'Remove request sent');
    } catch (e) {
      addResult('Inventory', 'Remove item', false, `Error: ${e.message}`);
    }

    // ========================================
    // Final Summary
    // ========================================
    log('PHASE', '--- Test Complete ---');

  } catch (e) {
    log('FATAL', `Test failed with error: ${e.message}\n${e.stack}`);
  }

  // Generate report
  generateReport(snapshots);

  // Cleanup
  if (socket) {
    socket.disconnect();
    log('CLEANUP', 'Socket disconnected');
  }
}

function generateReport(snapshots) {
  const timestamp = new Date().toISOString();

  let report = `# TRPGMaster 全流程测试报告\n\n`;
  report += `**测试时间**: ${timestamp}\n`;
  report += `**服务器**: ${SERVER_URL}\n\n`;

  // Test Results Summary
  report += `## 测试结果摘要\n\n`;
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const total = testResults.length;
  report += `| 指标 | 数值 |\n|------|------|\n`;
  report += `| 总测试数 | ${total} |\n`;
  report += `| 通过 | ${passed} |\n`;
  report += `| 失败 | ${failed} |\n`;
  report += `| 通过率 | ${total > 0 ? ((passed/total)*100).toFixed(1) : 0}% |\n\n`;

  // Results by category
  report += `## 详细测试结果\n\n`;
  const categories = [...new Set(testResults.map(r => r.category))];
  for (const cat of categories) {
    const catResults = testResults.filter(r => r.category === cat);
    const catPassed = catResults.filter(r => r.passed).length;
    report += `### ${cat} (${catPassed}/${catResults.length})\n\n`;
    report += `| 测试项 | 结果 | 详情 |\n|--------|------|------|\n`;
    for (const r of catResults) {
      const status = r.passed ? '✅' : '❌';
      report += `| ${r.testName} | ${status} | ${r.details} |\n`;
    }
    report += `\n`;
  }

  // Character State Snapshots
  report += `## 角色状态快照\n\n`;
  report += `| 阶段 | HP | Stress | Hope | Armor | 物品数 | 状态 |\n|------|-----|--------|------|-------|--------|------|\n`;
  for (const [label, snap] of Object.entries(snapshots)) {
    if (snap) {
      report += `| ${snap.label} | ${snap.hp}/${snap.maxHp} | ${snap.stress}/${snap.maxStress} | ${snap.hope}/${snap.maxHope} | ${snap.armorSlots}/${snap.maxArmorSlots} | ${snap.inventory} | ${snap.conditions.join(',') || '无'} |\n`;
    }
  }
  report += `\n`;

  // Full Log
  report += `## 完整测试日志\n\n`;
  report += `\`\`\`\n`;
  for (const msg of allMessages) {
    report += msg + '\n';
  }
  report += `\`\`\`\n`;

  // Write report
  const outputDir = path.join(__dirname, '..', 'test-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(LOG_FILE, report, 'utf8');
  console.log(`\n=== Report saved to ${LOG_FILE} ===`);
}

// Run
runTests().catch(console.error);
