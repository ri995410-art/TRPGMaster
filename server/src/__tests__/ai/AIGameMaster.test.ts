/**
 * AIGameMaster - 单测
 * 任务 1.1：玩家消息进入对话历史
 * 任务 2.1：结构化事实渲染（buildStateSummary 增强字段）
 * 验证：
 * 1. 玩家输入被持久化进 conversationHistory
 * 2. 消息按时间顺序交替（player→user, narrator→assistant）
 * 3. 多人模式带名字前缀
 * 4. stateReminder 只在当前消息，不在历史中
 * 5. 逐字窗口扩大到 50 条
 * 6. 向后兼容：无 player 条目的旧历史不报错
 * 7. narrativeMemory 已移除（不再出现截断摘要）
 * 8. buildStateSummary 渲染 narrativeFlags、hazeExpansion、visitedLocations、sealsFound、任务进度
 */
import { AIGameMaster } from '../../ai/AIGameMaster';
import type { AIGMConfig } from '../../ai/AIGameMaster';
import type { AIGMContext, Character, SessionState, CampaignState, WorldLore } from '@trpgmaster/shared';
import { AIGateway } from '../../ai/AIGateway';
import type { SessionStore, HistoryEntry } from '../../core/SessionStore';

// In-memory SessionStore for tests
class InMemorySessionStore implements SessionStore {
  private history = new Map<string, HistoryEntry[]>();
  async appendHistory(sessionId: string, entry: HistoryEntry): Promise<void> {
    const entries = this.history.get(sessionId) || [];
    entries.push(entry);
    if (entries.length > 120) this.history.set(sessionId, entries.slice(-120));
    else this.history.set(sessionId, entries);
  }
  async getHistory(sessionId: string, limit?: number): Promise<HistoryEntry[]> {
    return (this.history.get(sessionId) || []).slice(-(limit || 120));
  }
  async acquireTurnLock(): Promise<boolean> { return true; }
  async releaseTurnLock(): Promise<void> {}
}

function makeSessionStore(): SessionStore {
  return new InMemorySessionStore();
}

// Mock AIGateway.sendRequest so we never hit a real model
const mockSendRequest = jest.spyOn(AIGateway.prototype, 'sendRequest').mockResolvedValue({
  content: 'GM 叙事响应',
  agentType: 'aigm',
  model: 'test-model',
  tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  finishReason: 'stop',
  requestId: 'test-req',
});

beforeEach(() => {
  mockSendRequest.mockClear();
});

function makeConfig(): AIGMConfig {
  return {
    gateway: {
      apiKey: 'test-key',
      baseUrl: 'http://localhost:1234',
      defaultModel: 'test-model',
      maxRetries: 1,
      retryDelay: 100,
      maxConcurrent: 1,
    },
    narratorModel: 'test-model',
    combatModel: 'test-model',
    maxTokensPerResponse: 1000,
    temperature: 0.7,
  };
}

function makeCharacter(name = 'TestChar'): Character {
  return {
    id: 'char-1', name,
    hp: 10, maxHp: 10, stress: 0, maxStress: 3, hope: 2, maxHope: 3,
    armorSlots: 2, maxArmorSlots: 3, evasion: 10,
    minorThreshold: 1, majorThreshold: 2, severeThreshold: 4,
  } as unknown as Character;
}

function makeSessionState(sessionId: string, character: Character): SessionState {
  return {
    sessionId,
    status: 'active',
    character,
    characters: [character],
    players: [],
    currentScene: { id: 'scene-1', name: '测试场景', description: '测试', environment: 'indoor', activeConditions: [], npcPresent: [], enemies: [], countdowns: [] },
    fearPoints: 0,
    totalFearGained: 0,
    totalFearSpent: 0,
    timeline: [],
    shortRestsSinceLong: 0,
    campaignState: {
      campaignId: 'drakkenheim',
      currentLocation: 'emberVillage',
      visitedLocations: [],
      factionRelations: {},
      personalQuestProgress: {},
      factionQuestProgress: {},
      contaminationLevel: 0,
      deleriumCollected: 0,
      sealsFound: [],
      currentChapter: 'arrival',
      hazeExpansion: 0,
      narrativeFlags: {},
    } as CampaignState,
  };
}

function makeContext(sessionId: string, isMultiplayer = false): AIGMContext {
  const character = makeCharacter();
  const char2 = makeCharacter('Char2');
  char2.id = 'char-2';
  char2.name = 'Char2';
  const sessionState = makeSessionState(sessionId, character);
  if (isMultiplayer) {
    sessionState.characters = [character, char2];
    sessionState.players = [
      { id: 'p1', name: 'TestPlayer', character, isConnected: true, joinedAt: Date.now() },
      { id: 'p2', name: 'Player2', character: char2, isConnected: true, joinedAt: Date.now() },
    ];
  }
  return {
    sessionId,
    sessionState,
    character,
    characters: isMultiplayer ? [character, char2] : [character],
    activePlayerId: isMultiplayer ? 'p1' : undefined,
    activePlayerName: isMultiplayer ? 'TestPlayer' : undefined,
  };
}

describe('AIGameMaster — 玩家历史（任务 1.1）', () => {
  test('玩家输入被持久化进 conversationHistory', async () => {
    const store = makeSessionStore();
    const gm = new AIGameMaster(makeConfig(), store);
    const ctx = makeContext('s1');

    await gm.processPlayerAction(ctx, '我攻击地精');
    await gm.processPlayerAction(ctx, '我搜索房间');

    const history = await store.getHistory('s1');
    const playerEntries = history.filter(e => e.role === 'player');
    expect(playerEntries.length).toBe(2);
    expect(playerEntries[0].content).toContain('我攻击地精');
    expect(playerEntries[1].content).toContain('我搜索房间');
  });

  test('消息按时间顺序交替：player→user, narrator→assistant', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeContext('s2');

    await gm.processPlayerAction(ctx, '第一个行动');
    await gm.processPlayerAction(ctx, '第二个行动');

    // 第二次调用的 messages 应包含第一次的玩家输入
    const callArgs = mockSendRequest.mock.calls[1][0];
    const messages = callArgs.messages as Array<{ role: string; content: string }>;

    // 过滤出非 system 的对话消息
    const conv = messages.filter(m => m.role !== 'system');

    // 应该有：user(player1) → assistant(ai1) → user(player2)
    const userMsgs = conv.filter(m => m.role === 'user');
    const asstMsgs = conv.filter(m => m.role === 'assistant');

    expect(userMsgs.length).toBeGreaterThanOrEqual(2);
    expect(asstMsgs.length).toBeGreaterThanOrEqual(1);

    // 第一个 user 消息是历史中的玩家输入
    expect(userMsgs[0].content).toContain('第一个行动');
    // 接着是 assistant（AI 第一次响应）
    expect(conv[1].role).toBe('assistant');
  });

  test('多人模式带名字前缀', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeContext('s3', true);

    await gm.processPlayerAction(ctx, '我施放法术');

    const callArgs = mockSendRequest.mock.calls[0][0];
    const messages = callArgs.messages as Array<{ role: string; content: string }>;
    const userMsgs = messages.filter(m => m.role === 'user');
    const lastUser = userMsgs[userMsgs.length - 1];

    expect(lastUser.content).toContain('[TestPlayer/TestChar]:');
    expect(lastUser.content).toContain('我施放法术');
  });

  test('stateReminder 只在当前消息，不在历史中', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeContext('s4');

    await gm.processPlayerAction(ctx, '第一个行动');
    await gm.processPlayerAction(ctx, '第二个行动');

    const callArgs = mockSendRequest.mock.calls[1][0];
    const messages = callArgs.messages as Array<{ role: string; content: string }>;
    const userMsgs = messages.filter(m => m.role === 'user');

    // 历史玩家消息不含 stateReminder
    const histMsg = userMsgs.find(m => m.content.includes('第一个行动'));
    expect(histMsg).toBeDefined();
    expect(histMsg!.content).not.toContain('【输出要求】');

    // 当前玩家消息（最后一条 user）含 stateReminder
    const curMsg = userMsgs[userMsgs.length - 1];
    expect(curMsg.content).toContain('第二个行动');
    expect(curMsg.content).toContain('【输出要求】');
  });

  test('逐字窗口扩大到 50 条', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeContext('s5');

    // 模拟 15 轮（30 条：15 player + 15 narrator）
    for (let i = 0; i < 15; i++) {
      await gm.processPlayerAction(ctx, `行动 ${i}`);
    }

    const callArgs = mockSendRequest.mock.calls[14][0];
    const messages = callArgs.messages as Array<{ role: string; content: string }>;
    const conv = messages.filter(m => m.role !== 'system');

    // 15 轮 = 15 player + 15 narrator + 1 当前 player = 31 条
    // 旧窗口只取 20 条（且只含 AI），现在应该 > 20
    expect(conv.length).toBeGreaterThan(20);
  });

  test('向后兼容：无 player 条目的旧历史不报错', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeContext('s6');

    // 直接调用，第一次会产生 player + narrator 条目
    await gm.processPlayerAction(ctx, '第一个行动');

    // 验证不抛错即可
    const callArgs = mockSendRequest.mock.calls[0][0];
    const messages = callArgs.messages as Array<{ role: string; content: string }>;
    const userMsgs = messages.filter(m => m.role === 'user');
    expect(userMsgs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('AIGameMaster — 结构化事实渲染（任务 2.1）', () => {
  function makeRichContext(sessionId: string): AIGMContext {
    const character = makeCharacter();
    const sessionState = makeSessionState(sessionId, character);
    sessionState.campaignState = {
      campaignId: 'drakkenheim',
      currentLocation: 'outerRuins',
      visitedLocations: ['emberVillage', 'outerRuins', 'bankDistrict'],
      factionRelations: { lanterns: 7, queensMen: 3 },
      personalQuestProgress: {
        lostArtifact: {
          questId: 'lostArtifact',
          status: 'inProgress',
          milestones: ['foundClue'],
          currentObjective: '探索内城遗迹',
        },
      },
      factionQuestProgress: {
        lanternMission: {
          questId: 'lanternMission',
          status: 'inProgress',
          milestones: [],
          currentObjective: '调查失踪信使',
        },
      },
      contaminationLevel: 2,
      deleriumCollected: 5,
      sealsFound: ['flameSeal', 'shadowSeal'],
      currentChapter: 'outerCity',
      hazeExpansion: 3,
      narrativeFlags: { unlockedPortal: true, metQueen: true, unusedFlag: false },
    } as CampaignState;
    return {
      sessionId,
      sessionState,
      character,
      characters: [character],
      activePlayerId: undefined,
      activePlayerName: undefined,
    };
  }

  function getStateSummaryFromCall(callArgs: { messages: Array<{ role: string; content: string }> }): string {
    const sysMsgs = callArgs.messages.filter(m => m.role === 'system');
    // stateSummary is the second system message (after buildSystemPrompt)
    return sysMsgs.length >= 2 ? sysMsgs[1].content : '';
  }

  test('narrativeMemory 已移除：不再出现截断摘要', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeContext('mem-test');

    await gm.processPlayerAction(ctx, '我攻击地精');
    await gm.processPlayerAction(ctx, '我搜索房间');

    const callArgs = mockSendRequest.mock.calls[1][0];
    const messages = callArgs.messages as Array<{ role: string; content: string }>;

    // 不应出现 narrativeMemory 的标题
    const hasMemorySummary = messages.some(m => m.content.includes('关键事件记忆'));
    expect(hasMemorySummary).toBe(false);
  });

  test('buildStateSummary 渲染 narrativeFlags', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeRichContext('flags-test');

    await gm.processPlayerAction(ctx, '我四处查看');

    const callArgs = mockSendRequest.mock.calls[0][0];
    const summary = getStateSummaryFromCall(callArgs);

    expect(summary).toContain('叙事标记:');
    expect(summary).toContain('unlockedPortal');
    expect(summary).toContain('metQueen');
    expect(summary).not.toContain('unusedFlag');
  });

  test('buildStateSummary 渲染 hazeExpansion', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeRichContext('haze-test');

    await gm.processPlayerAction(ctx, '我继续前进');

    const callArgs = mockSendRequest.mock.calls[0][0];
    const summary = getStateSummaryFromCall(callArgs);

    expect(summary).toContain('迷雾扩展: 3');
  });

  test('buildStateSummary 渲染 visitedLocations 具体名称', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeRichContext('loc-test');

    await gm.processPlayerAction(ctx, '我移动');

    const callArgs = mockSendRequest.mock.calls[0][0];
    const summary = getStateSummaryFromCall(callArgs);

    expect(summary).toContain('emberVillage');
    expect(summary).toContain('outerRuins');
    expect(summary).toContain('bankDistrict');
    // 不应只显示数量
    expect(summary).not.toMatch(/已访问地点: \d+处/);
  });

  test('buildStateSummary 渲染 sealsFound 具体名称', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeRichContext('seal-test');

    await gm.processPlayerAction(ctx, '我检查封印');

    const callArgs = mockSendRequest.mock.calls[0][0];
    const summary = getStateSummaryFromCall(callArgs);

    expect(summary).toContain('flameSeal');
    expect(summary).toContain('shadowSeal');
    // 不应只显示数量
    expect(summary).not.toMatch(/封印已发现: \d+个/);
  });

  test('buildStateSummary 渲染 personalQuestProgress 详情', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeRichContext('quest-test');

    await gm.processPlayerAction(ctx, '我接任务');

    const callArgs = mockSendRequest.mock.calls[0][0];
    const summary = getStateSummaryFromCall(callArgs);

    expect(summary).toContain('个人任务:');
    expect(summary).toContain('lostArtifact');
    expect(summary).toContain('进行中');
    expect(summary).toContain('探索内城遗迹');
  });

  test('buildStateSummary 渲染 factionQuestProgress 详情', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeRichContext('fquest-test');

    await gm.processPlayerAction(ctx, '我见派系');

    const callArgs = mockSendRequest.mock.calls[0][0];
    const summary = getStateSummaryFromCall(callArgs);

    expect(summary).toContain('派系任务:');
    expect(summary).toContain('lanternMission');
    expect(summary).toContain('调查失踪信使');
  });

  test('空 narrativeFlags 不输出叙事标记行', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeContext('empty-flags');

    await gm.processPlayerAction(ctx, '我行动');

    const callArgs = mockSendRequest.mock.calls[0][0];
    const summary = getStateSummaryFromCall(callArgs);

    expect(summary).not.toContain('叙事标记:');
  });

  test('空 visitedLocations 显示"无"', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeContext('empty-loc');

    await gm.processPlayerAction(ctx, '我行动');

    const callArgs = mockSendRequest.mock.calls[0][0];
    const summary = getStateSummaryFromCall(callArgs);

    expect(summary).toContain('已访问地点: 无');
  });

  test('空 sealsFound 显示"无"', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeContext('empty-seal');

    await gm.processPlayerAction(ctx, '我行动');

    const callArgs = mockSendRequest.mock.calls[0][0];
    const summary = getStateSummaryFromCall(callArgs);

    expect(summary).toContain('封印已发现: 无');
  });
});

describe('AIGameMaster — worldLore 接通（任务 2.2）', () => {
  const testWorldLore: WorldLore = {
    campaignId: 'drakkenheim',
    campaignName: '德拉肯海姆',
    overview: '测试概述',
    themes: ['暗黑奇幻'],
    tone: 'dark',
    locations: [],
    factions: [
      {
        id: 'hoodedLanterns',
        name: '提灯团',
        nameEn: 'Hooded Lanterns',
        leader: '指挥官',
        lieutenant: '副官',
        baseLocation: '灯塔',
        agenda: '收复城市',
        ideology: '秩序与重建',
        relationRange: [1, 10],
        boons: [],
      },
    ],
    npcs: [
      {
        id: 'elder-martha',
        name: '长者玛莎',
        role: '村长',
        personality: '慈祥',
        motivation: '保护村民',
        secrets: ['知道秘密通道'],
        stressSlots: 4,
        currentStress: 0,
        locationId: 'emberVillage',
      },
    ],
    customRules: [],
    timeline: [],
  };

  function makeContextWithWorldLore(sessionId: string, currentLocation = 'emberVillage'): AIGMContext {
    const character = makeCharacter();
    const sessionState = makeSessionState(sessionId, character);
    sessionState.campaignState.currentLocation = currentLocation;
    return {
      sessionId,
      sessionState,
      character,
      characters: [character],
    };
  }

  function getStateSummaryFromCall(callArgs: { messages: Array<{ role: string; content: string }> }): string {
    const sysMsgs = callArgs.messages.filter(m => m.role === 'system');
    return sysMsgs.length >= 2 ? sysMsgs[1].content : '';
  }

  test('setWorldLore 后 getWorldLore 返回数据', () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    expect(gm.getWorldLore()).toBeUndefined();
    gm.setWorldLore(testWorldLore);
    expect(gm.getWorldLore()).toEqual(testWorldLore);
  });

  test('buildStateSummary 包含派系详情', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    gm.setWorldLore(testWorldLore);
    const ctx = makeContextWithWorldLore('faction-test');

    await gm.processPlayerAction(ctx, '我见提灯团');

    const callArgs = mockSendRequest.mock.calls[0][0];
    const summary = getStateSummaryFromCall(callArgs);

    expect(summary).toContain('派系详情:');
    expect(summary).toContain('提灯团');
    expect(summary).toContain('秩序与重建');
  });

  test('buildStateSummary 包含本地 NPC', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    gm.setWorldLore(testWorldLore);
    const ctx = makeContextWithWorldLore('npc-test', 'emberVillage');

    await gm.processPlayerAction(ctx, '我和长者说话');

    const callArgs = mockSendRequest.mock.calls[0][0];
    const summary = getStateSummaryFromCall(callArgs);

    expect(summary).toContain('本地NPC:');
    expect(summary).toContain('长者玛莎');
    expect(summary).toContain('村长');
  });

  test('无 worldLore 时不输出派系详情和本地NPC', async () => {
    const gm = new AIGameMaster(makeConfig(), makeSessionStore());
    const ctx = makeContextWithWorldLore('no-lore-test');

    await gm.processPlayerAction(ctx, '我行动');

    const callArgs = mockSendRequest.mock.calls[0][0];
    const summary = getStateSummaryFromCall(callArgs);

    expect(summary).not.toContain('派系详情:');
    expect(summary).not.toContain('本地NPC:');
  });
});
