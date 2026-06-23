/**
 * TRPGMaster 长时间会话一致性测试
 * 模拟真实玩家与 AI GM 进行长时间交互，验证：
 * 1. 历史保存规划是否合理
 * 2. 对话模型长程一贯性
 * 3. [STATE] 标记实时状态更新
 * 4. 历史记忆能力（50条窗口+120条存储上限下）
 *
 * 用法: node test-endurance.mjs [SERVER_URL]
 * 默认: http://localhost:3000
 */

import { io } from 'socket.io-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_URL = process.argv[2] || process.env.SERVER_URL || 'http://localhost:3000';
const LOG_DIR = path.join(__dirname, 'test-output');

fs.mkdirSync(LOG_DIR, { recursive: true });

const TEST_ID = Date.now();
const logFile = path.join(LOG_DIR, `endurance-test-${TEST_ID}.log`);
const jsonLogFile = path.join(LOG_DIR, `endurance-test-${TEST_ID}.json`);

// ===== Logging =====

const allLogs = [];

function log(phase, round, direction, content, extra) {
  if (!extra) extra = {};
  const entry = {
    timestamp: new Date().toISOString(),
    phase,
    round,
    direction,
    content: String(content).substring(0, 4000),
    ...extra,
  };
  allLogs.push(entry);

  const icons = { player: '🎮', gm: '📖', system: '⚙️', error: '❌', state: '📊' };
  const icon = icons[direction] || '•';
  const line = `[${entry.timestamp}] [${phase}] [R${round}] ${icon} ${String(content).substring(0, 300)}`;
  console.log(line);
  try { fs.appendFileSync(logFile, line + '\n', 'utf-8'); } catch {}
}

function saveJsonLog() {
  try { fs.writeFileSync(jsonLogFile, JSON.stringify(allLogs, null, 2), 'utf-8'); } catch {}
}

// ===== [STATE] marker parser =====

function extractStateMarkers(text) {
  const markers = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[STATE')) {
      markers.push(trimmed);
    }
  }
  return markers;
}

function parseStateKeyValue(text) {
  const changes = {};
  const pairs = text.trim().split(/\s+/);
  for (const pair of pairs) {
    const match = pair.match(/^(\w+):([+-]?\d+)$/);
    if (match) {
      changes[match[1]] = parseInt(match[2], 10);
    }
  }
  return changes;
}

function parseAllStateMarkers(markers) {
  const allChanges = [];
  for (const marker of markers) {
    const namedMatch = marker.match(/^\[STATE:(\S+)\]\s*(.+)$/);
    const unnamedMatch = marker.match(/^\[STATE\]\s*(.+)$/);
    if (namedMatch) {
      allChanges.push({ target: namedMatch[1], changes: parseStateKeyValue(namedMatch[2]) });
    } else if (unnamedMatch) {
      allChanges.push({ target: 'self', changes: parseStateKeyValue(unnamedMatch[2]) });
    }
  }
  return allChanges;
}

// ===== Test Character =====

const PLAYER_ID = `endurance_player_${TEST_ID}`;
const CHARACTER_ID = `endurance_char_${TEST_ID}`;

const TEST_CHARACTER = {
  id: CHARACTER_ID,
  name: '灰烬行者·凯尔',
  classId: 'rogue',
  className: '游荡者',
  subclassId: null,
  subclassName: null,
  ancestryId: 'human',
  ancestryName: '人类',
  communityId: 'underworld',
  communityName: '地下世界',
  level: 1,
  tier: 1,
  hp: 7,
  maxHp: 7,
  stress: 0,
  maxStress: 3,
  hope: 6,
  maxHope: 6,
  evasion: 11,
  armorSlots: 1,
  maxArmorSlots: 1,
  minorThreshold: 3,
  majorThreshold: 6,
  severeThreshold: 9,
  attributes: {
    strength: 0,
    agility: 2,
    finesse: 1,
    instinct: 1,
    presence: 0,
    knowledge: -1,
  },
  attributeMarks: { strength: 0, agility: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 },
  proficiency: 1,
  experience: 2,
  conditions: [],
  resistances: [],
  inventory: [],
  gold: 10,
  domainCardConfig: { loadout: [], vault: [] },
  experiences: [
    { name: '街头求生', value: 2 },
    { name: '暗影潜行', value: 1 },
  ],
  scars: [],
  reactionsUsed: {},
  mainWeapon: { id: 'dagger', name: '匕首', damageDie: 'd4', damageCount: 1, range: 'melee', traits: ['轻量', '灵巧'] },
  offWeapon: null,
  armor: { id: 'leather', name: '皮甲', thresholdBonus: 1, evasionPenalty: 0, slots: 1 },
  backstory: '凯尔曾是提灯团的一员，但在一次深入迷雾的探险中失去了战友。他独自幸存，带着内疚和一枚破损的提灯团徽章离开了组织。如今他重返德拉克海姆，寻找救赎。',
  personalQuest: '找回在迷雾中失散的战友遗物',
  relationships: [],
};

// ===== Test Scenarios =====

const TEST_SCENARIOS = [
  {
    phase: '01_explore_ember_village',
    label: '探索·余烬村',
    actions: [
      '我终于来到了德拉克海姆。迷雾笼罩着这座废墟之城，我站在余烬村的入口，打量着周围。破败的建筑、灰蒙蒙的天空，远处隐约可见的钟楼。我深吸一口气，迈步走了进去。',
      '我沿着主街慢慢走着，观察两旁的建筑。大多数已经坍塌或被迷雾侵蚀，但我注意到有一口古井——井沿上刻着奇怪的符文，井口散发着微弱的光芒。我走近查看。',
      '我仔细检查井壁上的符文。这些符文和我在提灯团时学过的一些标记相似，但又不完全一样。我用手指轻轻触碰其中一个符号，同时注意井底有什么动静。',
      '古井旁边有一栋还算完好的石屋，门半掩着。我小心翼翼地推门进去，看看里面有什么。注意不要触发任何陷阱。',
      '石屋里的书架上有些古书，我翻阅一下看有没有关于这些符文或封印的记载。',
      '我在石屋的地下室发现了一面破碎的镜子和一些信件碎片。我仔细收集这些线索，尤其是信件中提到的内容。',
    ],
  },
  {
    phase: '02_social_hooded_lanterns',
    label: '社交·提灯团',
    actions: [
      '我走出石屋，看到街角有提灯团的巡逻队。一个穿着皮甲、手持提灯的守卫注意到了我。我主动走上前去，展示我那枚破损的提灯团徽章，说："我曾经也是提灯团的人。"',
      '守卫打量了我一番，带我去了他们的据点。在那里我见到了莉娅·灯痕——一个经验丰富的提灯团军官，脸上有一道旧伤疤。我向她询问德拉克海姆近来的情况，尤其是迷雾和翠晶的变化。',
      '我进一步询问莉娅关于城市中那些封印的事——我在古井上看到了奇怪的符文，似乎和某种封印有关。莉娅知道些什么吗？',
      '莉娅似乎对我有所保留。我坦诚地告诉她我来德拉克海姆的原因——寻找失散战友的遗物，并试图弥补过去的错误。我问她，提灯团是否需要帮助？',
      '在据点里我还注意到了一个沉默的年轻人，一直在擦拭一把长剑。我试着和他攀谈，了解他是谁。',
      '离开据点前，我询问莉娅接下来我该去哪里探索。余烬村之外还有什么值得注意的地方？她有没有什么建议或委托？',
    ],
  },
  {
    phase: '03_combat_mist_creature',
    label: '战斗·迷雾生物',
    actions: [
      '我离开提灯团据点，沿着一条通往城市边缘的小巷前进。突然，一团浓稠的迷雾从墙角的裂缝中涌出，伴随着令人毛骨悚然的嘶嘶声——一只迷雾生物正朝我逼近！我拔出匕首，摆出防御姿态。',
      '迷雾生物发出刺耳的尖啸，向我扑来！我试图闪避它的攻击——用敏捷来躲避它的利爪。',
      '它的利爪擦过我的肩膀，我感到一阵刺痛！但我抓住机会，用匕首刺向它朦胧的身躯！',
      '迷雾生物挣扎着反击，我翻滚到一侧躲避，然后从侧面再次攻击！我集中精神，寻找它形体中的核心。',
      '我找到了——迷雾生物的中心有一颗微弱的翠晶核心！我全力以赴刺向那个核心！',
      '迷雾生物在痛苦中消散了，翠晶碎片散落一地。我喘着粗气，检查自己的伤势，然后小心翼翼地收集那些翠晶碎片。',
    ],
  },
  {
    phase: '04_short_rest',
    label: '短休',
    actions: [
      '战斗结束后，我在附近找了一个还算干燥的门廊坐下休息。我需要处理伤口，恢复一些体力。',
      '我用水壶里的水清洗伤口，然后简单包扎。同时整理一下装备，恢复一点信心。',
      '休息片刻后，我回想着刚才的战斗。那只迷雾生物的翠晶核心……这意味着什么？我站起身来，准备继续探索。',
    ],
  },
  {
    phase: '05_puzzle_seal_fragments',
    label: '解密·封印碎片',
    actions: [
      '我回到石屋的地下室，把新收集的翠晶碎片和之前发现的破碎镜子放在一起。我发现碎片的边缘和镜子背面的凹槽似乎能对应——这不是普通的镜子，而是某种封印装置的一部分！',
      '我尝试将翠晶碎片嵌入镜子背面的凹槽。需要按照特定的顺序——我记得井壁符文似乎暗示了一种排列方式。让我回忆一下……',
      '碎片嵌入了！镜面开始泛起微光，但还不够完整。根据石屋书架上古书的记载，似乎还需要一种"声音"来激活封印。我在地下室里搜索，看看有没有关于这种声音的线索。',
      '我在信件碎片中找到了一段话："当三声低吟回响于井，封印之镜将照见真实。"三声低吟？难道是那口古井？我带着碎片回到古井旁边。',
      '我在古井旁尝试发出三声低沉的吟唱，同时将封印之镜对准井口。让我看看会发生什么。',
      '封印之镜映出了井底——不，它映出的是另一个层面！井底之下似乎有一条通道，而镜中隐约显现出一扇门的轮廓。这是一个重大发现！但我还需要更多信息才能继续。',
    ],
  },
  {
    phase: '06_explore_outer_city',
    label: '深入·外城',
    actions: [
      '我决定向城市深处前进。余烬村之外，迷雾更加浓厚，建筑也更加残破。我沿着一条被碎石半掩的道路前进，时刻保持警惕。',
      '外城区的街道更加混乱，到处是被翠晶侵蚀的痕迹。我看到一栋半坍塌的钟楼——就是我从村口远远看到的那座。我决定进去看看。',
      '钟楼内部弥漫着灰色的粉尘。楼梯大部分还完好，我小心翼翼地向上攀登。每上一层，透过破窗望去，迷雾的景象都更加壮观而可怖。',
      '在钟楼的顶层，我发现了一架已经锈蚀的大钟，以及一个观察哨位。哨位上有旧望远镜和一本巡逻日志——提灯团留下的！日志记录了什么？',
      '巡逻日志上记录了外城区不同方位的迷雾浓度变化，以及一些"异常事件"——有人在夜间听到井底传来声音，有人看到封印之镜自行发光。这些和我之前的发现吻合！',
      '离开钟楼时，我注意到迷雾似乎在变浓。根据巡逻日志，我还有大约4个回合的安全时间。我快速返回内城方向，寻找下一个探索目标。',
    ],
  },
  {
    phase: '07_combat_elite',
    label: '战斗·精英敌人',
    actions: [
      '我正在外城区的一条窄巷中快速移动，突然前方出现了一个高大的身影——一个翠晶骷髅战士！它的骨架上嵌满了闪烁的翠晶碎片，手持一柄翠晶长剑。这不是普通的迷雾生物，这是精英级的威胁！',
      '翠晶骷髅战士举剑向我劈来！我急忙翻滚躲避，同时评估它的弱点——那些翠晶碎片之间的缝隙似乎是其结构的薄弱点。',
      '我未能完全躲开，长剑在我肋下划出一道伤口！但我忍着疼痛，用匕首精准地刺向它胸口翠晶碎片间的缝隙！',
      '骷髅战士发出翠晶共振的嗡鸣，身上的碎片开始脉冲式闪光——它在蓄力！我必须打断它，否则会释放强力攻击！我全力进攻！',
      '我的连续攻击打断了它的蓄力，但自己也付出了代价——它的反击让我又添新伤，压力也在不断累积。我调整呼吸，准备做最后一搏。',
      '我抓住它攻击的间隙，用尽全力将匕首插入它头骨中最大的翠晶——那颗核心碎裂了！骷髅战士崩解成碎片散落一地。我勉强站稳，感到浑身伤痕累累。',
    ],
  },
  {
    phase: '08_long_rest',
    label: '长休',
    actions: [
      '我已经精疲力竭，必须彻底休息。我找到一处提灯团标记过的安全屋——门上有提灯团的暗号，我用旧日学到的开锁方法进去。这里有基本的补给和一张还算干净的床。我准备进行长休。',
      '在长休中，我仔细处理了所有伤口，吃了些干粮，并且将收集到的翠晶碎片和封印之镜妥善保管。我还需要思考下一步——那些巡逻日志上的信息，以及莉娅告诉我的，都指向城市更深处。但我的身体状况能支撑继续深入吗？',
      '经过充分休息，我感觉好多了。我整理思绪，回顾目前的发现：古井的符文、封印之镜、井底的通道、钟楼的巡逻日志，还有提灯团提供的信息。所有线索都指向一个结论——封印的核心在城市更深处。我准备好继续前进了。',
    ],
  },
  {
    phase: '09_memory_check',
    label: '记忆检查',
    actions: [
      '让我回顾一下目前的冒险。首先——我在余烬村的那口古井里发现了什么？井壁上有什么特殊的东西？',
      '莉娅·灯痕之前告诉了我什么关于封印的重要信息？她对我是什么态度？',
      '我在第一场战斗中——和迷雾生物的那场——受了多少伤？是怎么受的伤？',
      '我和提灯团的关系如何？他们对我这个前成员是什么看法？',
      '我在石屋地下室发现的封印碎片是什么样的？那个破碎的镜子有什么特别之处？',
      '我目前的身体状况怎样？HP、压力、希望分别是多少？',
      '到目前为止，我一共经历了几场战斗？分别是对手是什么？',
      '我现在身上有哪些物品和线索？我收集了哪些重要发现？',
    ],
  },
  {
    phase: '10_collaborative_final',
    label: '协作叙事·终战',
    actions: [
      '我想告诉GM一个关于这座城市的设定——根据我的了解和发现，我认为在旧城区的地下，存在一条被遗忘的隧道网络。这些隧道是德拉克海姆陷落前居民用来逃生的，现在可能被迷雾生物占据，但也可能通向封印的核心。',
      '我描述凯尔对这条隧道网络的感知——他曾在提灯团时听说过关于"回声走廊"的传闻，那是一条据说能直达城市心脏的秘密通道。井底显现的那扇门，可能就是回声走廊的入口。',
      '我认为迷雾应该有某种周期性的变化——根据钟楼巡逻日志的记录和我的观察，迷雾似乎在某种条件下会减弱。也许是声音？封印碎片对声音有反应，那迷雾是否也受声音影响？',
      '我决定回到古井，利用封印之镜和三声低吟打开井底的通道，进入"回声走廊"。这是我的选择。',
      '回声走廊里阴冷而潮湿，墙壁上刻满了古旧的符文，和我之前见过的类似。我沿着通道前进，迷雾在这里反而稀薄了——也许这些符文有驱散迷雾的力量？',
      '通道的尽头，我来到了一个巨大的地下空间。中央矗立着一座翠晶祭坛，周围环绕着五根石柱——每根石柱上都有一个凹槽，对应五个派系的徽记。这就是封印的核心！但祭坛旁有一个守护者——一个由翠晶和暗影构成的巨大存在，它正在注视着我。',
      '最终决战！守护者向我发动了攻击——它操控翠晶碎片如暴雨般袭来。我必须利用之前收集的所有知识和物品：封印之镜可以反射翠晶能量，井底符文的知识帮助我理解守护者的弱点。我发起冲锋！',
      '我举起封印之镜对准守护者，同时吟唱在古井和石屋中学到的符文咒语。翠晶能量在镜面上折射，守护者发出痛苦的共鸣——它的核心正在碎裂！我用匕首给予最后一击，将封印之镜嵌入祭坛的中央凹槽。一道光芒绽放，封印重新激活！',
    ],
  },
];

// ===== Statistics =====

const stats = {
  totalRounds: 0,
  totalErrors: 0,
  totalTimeouts: 0,
  totalRetries: 0,
  emptyResponses: 0,
  totalGmResponses: 0,
  stateMarkersFound: 0,
  stateMarkersParsed: 0,
  stateMarkerDetails: [],
  responseTimes: [],
  characterSnapshots: [],
  phaseResponseCounts: {},
  startTime: Date.now(),
};

// ===== Main Test Runner =====

async function runTest() {
  log('setup', 0, 'system', '=== TRPGMaster 长时间会话一致性测试 ===');
  log('setup', 0, 'system', `Server: ${SERVER_URL}`);
  log('setup', 0, 'system', `Character: ${TEST_CHARACTER.name} (${TEST_CHARACTER.className} Lv.${TEST_CHARACTER.level})`);
  log('setup', 0, 'system', `Log dir: ${LOG_DIR}`);
  log('setup', 0, 'system', `Test ID: ${TEST_ID}`);

  // ===== Connect =====
  const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    timeout: 15000,
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 30000,
  });

  let sessionId = '';
  let round = 0;
  let currentPhase = 'setup';
  let lastCharacterState = null;

  // Track game:state events for character state
  socket.on('game:state', (msg) => {
    try {
      const state = msg.payload?.state || msg.state || msg;
      const char = state.character || (state.characters && state.characters[0]);
      if (char) {
        lastCharacterState = {
          hp: char.hp,
          maxHp: char.maxHp,
          stress: char.stress,
          maxStress: char.maxStress,
          hope: char.hope,
          maxHope: char.maxHope,
          fearPoints: state.fearPoints ?? char.fearPoints ?? 0,
          level: char.level,
          conditions: char.conditions || [],
        };
      }
    } catch {}
  });

  // Also track character:update
  socket.on('character:update', (msg) => {
    try {
      const char = msg.payload?.character;
      if (char) {
        lastCharacterState = {
          hp: char.hp,
          maxHp: char.maxHp,
          stress: char.stress,
          maxStress: char.maxStress,
          hope: char.hope,
          maxHope: char.maxHope,
          fearPoints: lastCharacterState?.fearPoints ?? 0,
          level: char.level,
          conditions: char.conditions || [],
        };
      }
    } catch {}
  });

  // ===== Promise helpers =====

  function connectAsync() {
    return new Promise((resolve, reject) => {
      socket.on('connect', () => {
        log('setup', 0, 'system', `Connected: ${socket.id}`);
        resolve();
      });
      socket.on('connect_error', (err) => {
        log('setup', 0, 'error', `Connection error: ${err.message}`);
        reject(err);
      });
      setTimeout(() => reject(new Error('Connection timeout after 30s')), 30000);
    });
  }

  function waitForStreamEnd(timeoutMs) {
    if (!timeoutMs) timeoutMs = 360000;
    return new Promise((resolve, reject) => {
      let accumulatedText = '';
      let turnId = null;

      const timer = setTimeout(() => {
        socket.off('gm:narrate:start', onStart);
        socket.off('gm:narrate:delta', onDelta);
        socket.off('gm:narrate:end', onEnd);
        socket.off('gm:narrate', onLegacy);
        reject(new Error(`Stream timeout after ${timeoutMs / 1000}s`));
      }, timeoutMs);

      function onStart(msg) {
        const p = msg.payload || msg;
        turnId = p.turnId;
      }

      function onDelta(msg) {
        const p = msg.payload || msg;
        accumulatedText += (p.text || '');
      }

      function onEnd(msg) {
        clearTimeout(timer);
        socket.off('gm:narrate:start', onStart);
        socket.off('gm:narrate:delta', onDelta);
        socket.off('gm:narrate:end', onEnd);
        socket.off('gm:narrate', onLegacy);
        const p = msg.payload || msg;
        resolve({
          fullText: p.fullText || accumulatedText,
          choices: p.choices || [],
          error: p.error || false,
          turnId: p.turnId || turnId,
        });
      }

      function onLegacy(msg) {
        clearTimeout(timer);
        socket.off('gm:narrate:start', onStart);
        socket.off('gm:narrate:delta', onDelta);
        socket.off('gm:narrate:end', onEnd);
        socket.off('gm:narrate', onLegacy);
        const p = msg.payload || msg;
        resolve({
          fullText: p.content || accumulatedText,
          choices: p.choices || [],
          error: false,
          turnId: null,
        });
      }

      socket.on('gm:narrate:start', onStart);
      socket.on('gm:narrate:delta', onDelta);
      socket.on('gm:narrate:end', onEnd);
      socket.on('gm:narrate', onLegacy);
    });
  }

  function sendAction(action) {
    round++;
    stats.totalRounds = round;
    log(currentPhase, round, 'player', action);

    socket.emit('player:action', {
      type: 'player:action',
      sessionId,
      senderId: PLAYER_ID,
      payload: { action },
      timestamp: Date.now(),
    });
  }

  async function sendActionAndWait(action, maxRetries) {
    if (maxRetries === undefined) maxRetries = 3;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          log(currentPhase, round, 'system', `Retry attempt ${attempt}/${maxRetries} for: ${action.substring(0, 80)}...`);
          stats.totalRetries++;
          await sleep(10000);
        }

        sendAction(action);
        const response = await waitForStreamEnd(360000);

        const responseTimeMs = Date.now() - startTime;
        stats.responseTimes.push(responseTimeMs);

        if (response.error) {
          log(currentPhase, round, 'error', `GM error response: ${response.fullText.substring(0, 200)}`, { retryAttempt: attempt });
          if (attempt < maxRetries) continue;
          stats.totalErrors++;
          return { success: false, content: response.fullText, error: true };
        }

        if (!response.fullText || response.fullText.trim().length === 0) {
          log(currentPhase, round, 'error', 'Empty GM response', { retryAttempt: attempt });
          stats.emptyResponses++;
          if (attempt < maxRetries) continue;
          return { success: false, content: '', error: true };
        }

        stats.totalGmResponses++;
        stats.phaseResponseCounts[currentPhase] = (stats.phaseResponseCounts[currentPhase] || 0) + 1;

        // Extract [STATE] markers
        const stateMarkers = extractStateMarkers(response.fullText);
        const parsedStates = parseAllStateMarkers(stateMarkers);

        if (stateMarkers.length > 0) {
          stats.stateMarkersFound += stateMarkers.length;
          stats.stateMarkersParsed += parsedStates.length;
          stats.stateMarkerDetails.push({
            phase: currentPhase,
            round,
            markers: stateMarkers,
            parsed: parsedStates,
          });
        }

        // Clean content (remove [STATE] lines)
        const cleanContent = response.fullText
          .split('\n')
          .filter(line => !line.trim().startsWith('[STATE'))
          .join('\n')
          .trim();

        // Log GM response
        const logExtra = { responseTimeMs, characterState: lastCharacterState };
        if (stateMarkers.length > 0) logExtra.stateMarkers = stateMarkers;
        if (response.choices && response.choices.length > 0) logExtra.choices = response.choices;
        log(currentPhase, round, 'gm', cleanContent, logExtra);

        // Log state changes separately
        if (parsedStates.length > 0) {
          log(currentPhase, round, 'state', `State changes: ${JSON.stringify(parsedStates)}`);
        }

        return {
          success: true,
          content: cleanContent,
          stateMarkers,
          parsedStates,
          choices: response.choices,
          responseTimeMs,
        };

      } catch (err) {
        const errMsg = err.message || String(err);
        if (errMsg.includes('timeout') || errMsg.includes('Timeout')) {
          stats.totalTimeouts++;
          log(currentPhase, round, 'error', `Timeout (attempt ${attempt}): ${errMsg}`, { retryAttempt: attempt });
        } else {
          stats.totalErrors++;
          log(currentPhase, round, 'error', `Error (attempt ${attempt}): ${errMsg}`, { retryAttempt: attempt });
        }
        if (attempt < maxRetries) continue;
        return { success: false, content: errMsg, error: true };
      }
    }
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ===== Step 1: Connect =====
  try {
    await connectAsync();
  } catch (err) {
    log('setup', 0, 'error', `FATAL: Cannot connect to server: ${err.message}`);
    saveJsonLog();
    process.exit(1);
  }

  // ===== Step 2: Join session =====
  await new Promise((resolve) => {
    let resolved = false;

    socket.on('session:created', (msg) => {
      const p = msg.payload || msg;
      sessionId = p.sessionId || '';
      log('setup', 0, 'system', `Session created: ${sessionId}, code: ${p.code || ''}`);
      if (!resolved) { resolved = true; resolve(); }
    });

    socket.on('session:joined', (msg) => {
      const p = msg.payload || msg;
      sessionId = p.sessionId || sessionId;
      log('setup', 0, 'system', `Session joined: ${sessionId}`);
      if (!resolved) { resolved = true; resolve(); }
    });

    socket.emit('session:join', {
      type: 'session:join',
      sessionId: '',
      senderId: PLAYER_ID,
      payload: {
        playerId: PLAYER_ID,
        role: 'player',
        name: '耐久测试玩家',
        character: TEST_CHARACTER,
      },
      timestamp: Date.now(),
    });

    setTimeout(() => {
      if (!resolved) { resolved = true; resolve(); }
    }, 10000);
  });

  // ===== Step 3: Start session =====
  await new Promise((resolve) => {
    let resolved = false;

    socket.on('session:started', (msg) => {
      log('setup', 0, 'system', 'Session started (active)');
      if (!resolved) { resolved = true; resolve(); }
    });

    socket.on('session:sessionZeroStarted', (msg) => {
      const p = msg.payload || msg;
      log('setup', 0, 'system', `Session Zero started, phase: ${p.phase || 'unknown'} — submitting S0 to skip`);

      // Auto-submit S0 to skip to active gameplay
      socket.emit('s0:submit', {
        type: 's0:submit',
        sessionId,
        senderId: PLAYER_ID,
        payload: {
          lines: ['explicit gore', 'torture descriptions'],
          veils: ['detailed body horror'],
          toneFlags: ['heroic', 'mystery'],
        },
        timestamp: Date.now(),
      });

      // Listen for S0 completion
      socket.on('session:completeSessionZero', () => {
        log('setup', 0, 'system', 'Session Zero completed');
        if (!resolved) { resolved = true; resolve(); }
      });

      socket.on('session:started', () => {
        log('setup', 0, 'system', 'Session active after S0');
        if (!resolved) { resolved = true; resolve(); }
      });
    });

    socket.emit('session:start', {
      type: 'session:start',
      sessionId,
      senderId: PLAYER_ID,
      payload: {},
      timestamp: Date.now(),
    });

    setTimeout(() => {
      if (!resolved) { resolved = true; resolve(); }
    }, 15000);
  });

  // ===== Step 4: Request initial narration =====
  log('setup', 0, 'system', 'Requesting initial scene narration...');

  const initialResult = await sendActionAndWait('我到达了德拉克海姆，环顾四周，描述一下我看到的景象。');

  if (initialResult.success) {
    log('setup', 1, 'system', `Initial narration received (${initialResult.content.length} chars, ${Math.round(initialResult.responseTimeMs / 1000)}s)`);
  } else {
    log('setup', 1, 'error', 'Initial narration failed, continuing anyway');
  }

  saveJsonLog();

  // ===== Step 5: Run all test phases =====
  for (const scenario of TEST_SCENARIOS) {
    currentPhase = scenario.phase;
    log(currentPhase, round, 'system', '\n' + '='.repeat(60));
    log(currentPhase, round, 'system', `阶段: ${scenario.label} (${scenario.phase})`);
    log(currentPhase, round, 'system', '='.repeat(60));

    const phaseStartRounds = round;
    const phaseStartTime = Date.now();

    for (let i = 0; i < scenario.actions.length; i++) {
      const action = scenario.actions[i];
      const result = await sendActionAndWait(action);

      if (!result.success) {
        log(currentPhase, round, 'error', `Action failed after retries: ${action.substring(0, 80)}...`);
      }

      // If GM offered choices, sometimes pick one (every 3rd round with choices)
      if (result.success && result.choices && result.choices.length > 0 && i % 3 === 0) {
        const choice = result.choices[0];
        const choiceText = choice.label || choice.text || choice.action || 'continue';
        log(currentPhase, round, 'system', `Picking choice: ${choiceText}`);
        await sleep(2000);
        const choiceResult = await sendActionAndWait(`[选择] ${choiceText}`);
        if (!choiceResult.success) {
          log(currentPhase, round, 'error', 'Choice response failed');
        }
      }

      // Save intermediate logs every 5 rounds
      if (round % 5 === 0) {
        saveJsonLog();
      }

      // Delay between actions to avoid overwhelming the AI
      await sleep(3000);
    }

    const phaseDuration = Math.round((Date.now() - phaseStartTime) / 1000);
    const phaseRounds = round - phaseStartRounds;
    log(currentPhase, round, 'system', `Phase complete: ${phaseRounds} rounds, ${phaseDuration}s`);

    // Save log after each phase
    saveJsonLog();
  }

  // ===== Step 6: Generate final report =====
  const totalDuration = Math.round((Date.now() - stats.startTime) / 1000);
  const avgResponseTime = stats.responseTimes.length > 0
    ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length / 1000)
    : 0;
  const maxResponseTime = stats.responseTimes.length > 0
    ? Math.round(Math.max(...stats.responseTimes) / 1000)
    : 0;

  log('report', round, 'system', '\n' + '='.repeat(60));
  log('report', round, 'system', '  测试完成 — 生成最终报告');
  log('report', round, 'system', '='.repeat(60));

  const report = {
    testId: TEST_ID,
    testDate: new Date().toISOString(),
    totalDuration: `${Math.floor(totalDuration / 3600)}h ${Math.floor((totalDuration % 3600) / 60)}m ${totalDuration % 60}s`,
    serverUrl: SERVER_URL,
    model: 'nex-agi/Nex-N2-Pro',
    character: TEST_CHARACTER.name,
    scenarios: TEST_SCENARIOS.length,
    totalRounds: round,
    totalGmResponses: stats.totalGmResponses,
    totalErrors: stats.totalErrors,
    totalTimeouts: stats.totalTimeouts,
    totalRetries: stats.totalRetries,
    emptyResponses: stats.emptyResponses,
    avgResponseTime: `${avgResponseTime}s`,
    maxResponseTime: `${maxResponseTime}s`,
    stateMarkers: {
      found: stats.stateMarkersFound,
      parsed: stats.stateMarkersParsed,
      details: stats.stateMarkerDetails,
    },
    lastCharacterState,
    phaseResponseCounts: stats.phaseResponseCounts,
  };

  // Write markdown report
  const reportPath = path.join(LOG_DIR, `endurance-test-report-${TEST_ID}.md`);
  const reportMd = generateMarkdownReport(report, allLogs);
  fs.writeFileSync(reportPath, reportMd, 'utf-8');
  log('report', round, 'system', `Report saved to: ${reportPath}`);

  // Final JSON log
  saveJsonLog();

  // Disconnect
  socket.disconnect();
  log('report', round, 'system', 'Disconnected. Test complete.');

  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Rounds: ${round}`);
  console.log(`  Duration: ${report.totalDuration}`);
  console.log(`  GM Responses: ${stats.totalGmResponses}`);
  console.log(`  Errors: ${stats.totalErrors} | Timeouts: ${stats.totalTimeouts} | Retries: ${stats.totalRetries}`);
  console.log(`  [STATE] markers: ${stats.stateMarkersFound} found, ${stats.stateMarkersParsed} parsed`);
  console.log(`  Avg response: ${avgResponseTime}s | Max: ${maxResponseTime}s`);
  console.log(`  Report: ${reportPath}`);
  console.log('='.repeat(60));
}

// ===== Markdown Report Generator =====

function generateMarkdownReport(report, logs) {
  const gmLogs = logs.filter(l => l.direction === 'gm');
  const errorLogs = logs.filter(l => l.direction === 'error');
  const stateLogs = logs.filter(l => l.direction === 'state');

  // Phase breakdown table
  const phaseRows = Object.entries(report.phaseResponseCounts)
    .map(([phase, count]) => `| ${phase} | ${count} |`)
    .join('\n');

  // State marker summary
  const stateMarkerSummary = report.stateMarkers.details.length > 0
    ? report.stateMarkers.details.map(d =>
        `- **[${d.phase}] R${d.round}**: ${d.markers.join(' | ')} → ${JSON.stringify(d.parsed)}`
      ).join('\n')
    : 'No [STATE] markers detected.';

  // Memory check phase analysis
  const memoryLogs = logs.filter(l => l.phase === '09_memory_check' && l.direction === 'gm');
  const memoryAnalysis = memoryLogs.length > 0
    ? memoryLogs.map((l, i) => `**Q${i + 1}**: ${l.content.substring(0, 500)}...`).join('\n\n')
    : 'Memory check phase not completed.';

  // Error summary
  const errorSummary = errorLogs.length === 0
    ? 'No errors encountered.'
    : errorLogs.slice(0, 20).map(e => `- [${e.phase}] R${e.round}: ${e.content.substring(0, 150)}`).join('\n');

  // Character state timeline
  const charStateLogs = logs.filter(l => l.characterState);
  const charStateTimeline = charStateLogs.length > 0
    ? charStateLogs.slice(0, 30).map(l =>
        `| R${l.round} | ${l.characterState.hp}/${l.characterState.maxHp} | ${l.characterState.stress}/${l.characterState.maxStress} | ${l.characterState.hope}/${l.characterState.maxHope} | ${l.characterState.fearPoints} |`
      ).join('\n')
    : 'No character state data captured.';

  return `# TRPGMaster 长时间会话一致性测试报告

**测试日期**: ${report.testDate}
**测试ID**: ${report.testId}
**持续时长**: ${report.totalDuration}
**模型**: ${report.model}
**服务器**: ${report.serverUrl}
**角色**: ${report.character}

---

## 总体统计

| 指标 | 数值 |
|------|------|
| 总轮数 | ${report.totalRounds} |
| GM响应数 | ${report.totalGmResponses} |
| 错误数 | ${report.totalErrors} |
| 超时数 | ${report.totalTimeouts} |
| 重试数 | ${report.totalRetries} |
| 空响应数 | ${report.emptyResponses} |
| 平均响应时间 | ${report.avgResponseTime} |
| 最大响应时间 | ${report.maxResponseTime} |

## [STATE] 标记分析

| 指标 | 数值 |
|------|------|
| 发现标记数 | ${report.stateMarkers.found} |
| 成功解析数 | ${report.stateMarkers.parsed} |
| 标记出现率 | ${report.totalGmResponses > 0 ? Math.round(report.stateMarkers.found / report.totalGmResponses * 100) : 0}% |

### 标记详情

${stateMarkerSummary}

## 阶段响应统计

| 阶段 | GM响应数 |
|------|----------|
${phaseRows}

## 角色状态时间线

| 轮次 | HP | 压力 | 希望 | 恐惧 |
|------|-----|------|------|------|
${charStateTimeline}

## 记忆一致性评估

${memoryAnalysis}

## 错误日志

${errorSummary}

## 最终角色状态

${report.lastCharacterState ? '```json\n' + JSON.stringify(report.lastCharacterState, null, 2) + '\n```' : 'No character state available.'}

---

## 评估结论

### 1. [STATE] 标记一致性
${report.stateMarkers.found > 0 ? '✅ 检测到 ' + report.stateMarkers.found + ' 个 [STATE] 标记，解析率 ' + report.stateMarkers.parsed + '/' + report.stateMarkers.found : '❌ 未检测到 [STATE] 标记，状态追踪系统可能未正常工作'}

### 2. 长程稳定性
${report.totalErrors === 0 ? '✅ 无错误' : '⚠️ ' + report.totalErrors + ' 个错误，' + report.totalTimeouts + ' 次超时'}${report.totalRetries > 0 ? '，' + report.totalRetries + ' 次重试' : ''}

### 3. 响应时间
${parseInt(report.avgResponseTime) < 60 ? '✅' : '⚠️'} 平均 ${report.avgResponseTime}，最大 ${report.maxResponseTime}

---

*Generated by TRPGMaster endurance test script at ${new Date().toISOString()}*
`;
}

// ===== Run =====

runTest().catch(err => {
  console.error('FATAL:', err);
  try {
    fs.appendFileSync(logFile, '\nFATAL ERROR: ' + err.message + '\nStack: ' + err.stack + '\n', 'utf-8');
  } catch {}
  saveJsonLog();
  process.exit(1);
});
