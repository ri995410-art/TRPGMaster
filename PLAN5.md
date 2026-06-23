# STAGE5_ARCHITECTURE.md — 多人在线 TRPG 可执行架构

> 配套 `PLAN.md` 阶段 5。本文把每个增强项拆成：**它解决什么 / 数据结构 / Socket 事件 / 接到现有哪个文件 / 实现步骤**。
> 现有技术栈：后端 Node+TS+Express+**Socket.IO**，前端 Expo/RN+**zustand**，模型走 `AIGateway` 调 SiliconFlow（OpenAI 兼容）。
> 重要前提：阶段 5 里**只有 5.3 的"横向扩展"部分需要 Redis**，其余（流式 / 聚光灯 / 安全 / UI）在单进程下就能做。别为了一个 PoC 过早上 Redis。

---

## 0. 先理解整体：一个多人回合怎么流转

这是所有子系统的主干。理解了这条线，5.1–5.4 就只是往上挂模块。

```
玩家A 点击行动
  │ socket: player:action {sessionId, action}
  ▼
SocketServer.handleTurn(sessionId, playerId, action)
  │ 1) 校验聚光灯：playerId 是否持有 spotlight？           ← 5.2
  │      否 → 入队，回 action:queued，结束
  │ 2) 抢回合锁 acquireTurnLock(sessionId)                ← 5.3
  │      抢不到 → 入队（别人正在生成），结束
  │ 3) 先做"确定性结算"（骰子/伤害/恐惧），写 StateManager ← 阶段1已完成
  │      → onChange 广播 state:update 给全房间（即时反馈）
  │ 4) 从 SessionStore 读历史+事实，组装 prompt          ← 5.3
  │      注入：安全边界(Lines/Veils) + 当前聚光灯 + 已结算结果
  │ 5) 流式调模型：AIGateway.streamRequest(..., onToken)  ← 5.1
  │      emit gm:narrate:start → 多个 gm:narrate:delta
  │      期间若收到 safety:xcard → abort 流，转 5.4
  │ 6) 流结束：emit gm:narrate:end {fullText, nextSpotlight}
  │      把本轮玩家输入+GM叙事写回 SessionStore           ← 5.3
  │      按 nextSpotlight 设定下一个聚光灯，广播           ← 5.2
  │ 7) 释放回合锁；若队列非空，处理下一个排队行动
  ▼
全房间客户端实时看到 GM 逐字落笔 + 状态变化
```

关键设计原则（贯穿）：**状态先于叙事**。第 3 步先把数值算好并广播，第 5 步的流式叙事只是"把已发生的事讲成故事"。这样即使叙事生成失败/被打断，游戏状态也始终一致。

---

## 5.1 流式叙事输出

### 解决什么
单人等 8–170 秒还能忍，多人时全桌干等会崩。流式让 GM "正在落笔"的字一个个冒出来，体感完全不同。

### 改 `AIGateway.ts`：新增流式方法
SiliconFlow 是 OpenAI 兼容接口，`stream:true` 时返回 SSE。

```ts
// AIGateway.ts
async streamRequest(
  messages: ChatMessage[],
  opts: RequestOpts,
  onToken: (delta: string) => void
): Promise<{ fullText: string; usage?: Usage }> {
  const res = await fetch(this.endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: this.model, messages, stream: true, ...opts }),
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let full = '', buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';                    // 留住不完整的最后一行
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content ?? '';
        if (delta) { full += delta; onToken(delta); }
      } catch { /* 跳过心跳/空行 */ }
    }
  }
  return { fullText: full };
}
```
- 现有的并发限制 / 重试逻辑要包到这个方法外层（流式连接占用更久，并发上限照旧生效）。
- 保留原非流式 `sendRequest` 给 eval / 测试用（mock 更简单）。

### 改 `SocketServer.ts`：把一次性 emit 拆成三段事件
每回合生成一个 `turnId`（uuid）用于关联分片、防止两轮叙事错位。

```ts
const turnId = uuid();
this.io.to(sessionId).emit('gm:narrate:start', { turnId, activePlayerId });
const { fullText } = await aiGateway.streamRequest(messages, opts, (delta) => {
  this.io.to(sessionId).emit('gm:narrate:delta', { turnId, text: delta });
});
this.io.to(sessionId).emit('gm:narrate:end', {
  turnId, fullText, choices: extractChoices(fullText), nextSpotlight,
});
```

### 改前端 `gameStore.ts`
```ts
// 监听
socket.on('gm:narrate:start', ({turnId}) => set({ streamingTurnId: turnId, streamingText: '', gmTyping: true }));
socket.on('gm:narrate:delta', ({turnId, text}) =>
  set(s => turnId === s.streamingTurnId ? { streamingText: s.streamingText + text } : {}));
socket.on('gm:narrate:end', ({turnId, fullText, choices}) =>
  set(s => ({ log: [...s.log, {role:'gm', text: fullText}], streamingText: '', gmTyping: false, choices })));
```
UI 渲染 `streamingText`（增长中）+ "GM 正在落笔…"指示器。

### 验收
两个客户端同房间，A 行动时 B 也能实时看到 GM 文字逐步出现；`state:update`（数值变化）在叙事开始前就到达。

---

## 5.2 聚光灯 / 回合管理器

### 解决什么
现在只有一个 `activePlayerName` 字符串，多人时两个玩家同时行动会让 GM 上下文错乱。需要一个"谁现在能行动"的权威仲裁。

### 两种模式（Daggerheart 贴合度）
- **freeform（默认）**：符合 Daggerheart 的"GM 传递聚光灯"。某玩家持有聚光灯可行动，其他人想行动则**入队**，GM 叙事结束后传给下一个。
- **combat**：进入战斗时切换为有序回合（`order` 列表 + `currentIndex`），战斗结束回到 freeform。

### 数据结构（放进 `StateManager`，作为权威会话状态，随 onChange 广播+持久化）
```ts
interface SpotlightState {
  mode: 'freeform' | 'combat';
  current: string | null;   // 当前持灯 playerId
  queue: string[];          // 等待行动的 playerId，FIFO
  order?: string[];         // combat 模式的回合顺序
  round?: number;
}
```

### 新模块 `core/SpotlightManager.ts`（纯逻辑，易测）
```ts
class SpotlightManager {
  request(state, playerId): SpotlightState   // 申请行动 → 持灯或入队
  pass(state, toPlayerId?): SpotlightState    // 传灯：指定或取队首
  canAct(state, playerId): boolean            // SocketServer 用它做准入校验
  enterCombat(state, order): SpotlightState
  advanceCombat(state): SpotlightState
}
```

### Socket 事件
- `spotlight:request`（玩家申请）→ `SpotlightManager.request` → 广播 `spotlight:state`
- `spotlight:state`（服务端→全房间，状态变更时推送）
- 服务端在 `handleTurn` 第 1 步用 `canAct` 把关：非持灯者的 `player:action` 一律入队 + 回 `action:queued`。

### 谁决定下一个传给谁？（关键决策）
**服务端权威，AI 仅建议。** GM 叙事可在结构化字段里"建议"下一个聚光对象（如 `nextSpotlight: playerId`），服务端校验合法后才采纳；非法或缺失则回退到队首 / 轮转。**不要**靠正则解析 AI 自然语言来决定聚光灯——那又会掉进"依赖 LLM 自觉"的坑。

### 验收
三人房间：A 持灯行动时 B 申请→入队；A 回合结束聚光灯按建议/队列转给 B；B 行动时 C 的 `player:action` 被拒并入队。全程 `spotlight:state` 同步正确。

---

## 5.3 会话状态外置（AIGM 无状态化）

### 解决什么
`conversationHistory` / `narrativeMemory` 现在活在 `AIGameMaster` 的进程内存 Map 里，`StateManager` 也是进程内、只 debounce 落一个 JSON 文件。后果：进程重启丢历史；无法跑多个服务进程（多人扩展的硬上限）。

### 分两步，别一步到位
**第一步（现在就做，低风险）：抽象 `SessionStore` 接口 + 把 AIGM 改成无状态。**
即使底层仍是文件，先把"状态从 AIGM 实例里搬出来"这件事做掉，收益立刻有（重启不丢、逻辑清晰、可测）。

```ts
// core/SessionStore.ts
interface SessionStore {
  loadState(sessionId): Promise<SessionState | null>;
  saveState(sessionId, state: SessionState): Promise<void>;

  appendHistory(sessionId, entry: HistoryEntry): Promise<void>;
  getHistory(sessionId, limit: number): Promise<HistoryEntry[]>;

  getFacts(sessionId): Promise<SessionFacts>;     // 结构化记忆（见阶段2.1）
  updateFacts(sessionId, patch): Promise<void>;

  // 多人并发安全：同一会话同一时刻只允许一个回合在生成
  acquireTurnLock(sessionId, ttlMs: number): Promise<boolean>;
  releaseTurnLock(sessionId): Promise<void>;
}
```
- `AIGameMaster` 不再持有 `conversationHistory` / `narrativeMemory` Map；构造时注入 `SessionStore`，每次从 store 读写。它变成无状态服务。
- `FileSessionStore`：保留现有 JSON 持久化语义；`acquireTurnLock` 用进程内 `Map<sessionId, Promise>` 互斥队列即可（单进程足够）。
- **回合锁**是多人正确性的硬保证：即使聚光灯把关，也要防止极端时序下两个回合交错写历史。`handleTurn` 第 2 步抢锁、第 7 步释放。

**第二步（真要多进程/上线再做）：加 `RedisSessionStore` + Socket.IO Redis 适配器。**
```
SESSION_STORE=file|redis   // 环境变量切换，默认 file
```
- `RedisSessionStore`：状态/历史存 Redis；`acquireTurnLock` 用 `SET key val NX PX ttl`。
- 跨进程广播：装 `@socket.io/redis-adapter`，让 A 进程上的玩家和 B 进程上的玩家同房间也能互收广播。
- 这一步**只有当你确实要跑多个后端实例时才需要**。一个 PoC / 小团队单进程跑，停在第一步即可。

### 验收
第一步：杀掉并重启后端进程，重连后历史 / 状态 / 聚光灯完整恢复；两个玩家近乎同时行动，历史不交错（靠回合锁）。

---

## 5.4 安全工具一等公民化

### 解决什么
Session Zero / X-Card / Lines & Veils 不能只在单人被跳过、靠 AI 自发。多人桌上这是底线功能。

### 数据结构（放 `StateManager`，随会话持久化）
```ts
interface SafetyState {
  phase: 's0' | 'play';     // 会话阶段
  lines: string[];          // 绝对不出现（hard no）
  veils: string[];          // 淡出处理（fade to black）
  toneFlags: string[];      // 基调偏好
  xcardActive: boolean;     // X-Card 是否被按下
}
```

### Session Zero 作为会话阶段
- 新会话默认 `phase: 's0'`。S0 期间走专门的收集流程（沿用你现有的五阶段脚手架），每个玩家提交各自的 Lines / Veils / 基调，**聚合**进 `SafetyState`。
- 全员就绪后 `phase → play`，才允许 `player:action`。
- Socket：`s0:submit {lines, veils, tone}`、`s0:ready`、`s0:complete`（广播）。

### Lines/Veils 注入 prompt（不可违背、放在最前）
在 `buildSystemPrompt` **最顶部**（不是末尾）插入：
```
## 安全边界（绝对遵守，高于一切叙事需求）
- 以下内容绝不出现（Lines）：{lines}
- 以下内容只暗示、不描写，立即淡出（Veils）：{veils}
```
放最前是因为它最重要，别像 `[STATE]` 那样埋在 2000 token 末尾。

### X-Card：任何人随时可按，立即止损
```
socket: safety:xcard  (可匿名，不暴露是谁按的)
  → 服务端 set xcardActive=true，广播 safety:paused
  → 若有正在进行的流式生成：abort 掉（见 5.1 的 reader.cancel()）
  → 给 AI 注入强指令"刚才的内容触发了安全卡，请立即收住/回退，转向安全方向"
  → 客户端弹安全遮罩，暂停输入直到 host 点 safety:resume
```
- **诚实提醒执行 LLM**：模型遵从不是 100% 可靠，所以 X-Card 的第一动作是**服务端直接中断当前叙事流**（确定性的），再叠加给模型的软指令。不要把止损完全寄托在模型听话上。

### 验收
S0 未完成时 `player:action` 被拒；某玩家设的 Line 在后续叙事中不出现（eval 检查）；游戏中按 X-Card，当前流式叙事被立即中断、全员收到 `safety:paused`。

---

## 5.5 UI 主题化

### 解决什么
默认 RN 控件"掉气氛"。德拉肯海姆是暗黑奇幻，要羊皮卷 + 翠晶的质感。

### 设计 token（新建 `app/src/theme/theme.ts`）
```ts
export const theme = {
  color: {
    ink:        '#0e0d12',   // 暗色基底
    parchment:  '#e8dcc0',   // 羊皮卷（GM 叙事卡）
    emerald:    '#2f7d5b',   // 翠晶绿（点缀/希望）
    gold:       '#b8893a',   // 低饱和金（标题/强调）
    blood:      '#7a2230',   // 伤害/恐惧
    fog:        '#3a3f4b',   // 迷雾灰
  },
  font: { display: 'Cinzel', body: 'EBGaramond' },  // expo-font 加载
  radius: { card: 10 }, space: [0,4,8,12,16,24,32],
};
```

### 关键组件
- **冒险日志**：做成竖向**叙事流**，不是聊天气泡。GM 条目=羊皮卷卡片（衬线体、暗金描边），玩家行动=内联灰条。流式文字逐字浮现。
- **骰子结果卡**：`react-native-reanimated` 做 d12 翻转动效；希望骰/恐惧骰双色，结果类型（暴击/带希望/带恐惧…）用对应主题色高亮。
- **资源仪表**：HP/压力/希望/恐惧做成**主题化 gauge**（如希望=翠晶点亮、恐惧=血色填充），不要用默认进度条。
- **聚光灯指示**：当前持灯玩家头像高亮 + "轮到你了"提示，呼应 5.2。

### 依赖
`expo-font`（自定义字体）、`react-native-reanimated`（动效）、`expo-linear-gradient`（迷雾/渐变）。遵循现有 Expo/RN+zustand，不换框架。

---

## 6. 文件落点总览

```
server/src/
  ai/AIGateway.ts          ← 加 streamRequest                    (5.1)
  ai/AIGameMaster.ts       ← 去内存 Map，注入 SessionStore        (5.3)
  network/SocketServer.ts  ← handleTurn 主循环 + 新事件 + 准入/abort (5.1/5.2/5.4)
  core/StateManager.ts     ← 加 SpotlightState / SafetyState      (5.2/5.4)
  core/SpotlightManager.ts ← 新增，纯逻辑                          (5.2)
  core/SessionStore.ts     ← 新增接口                              (5.3)
  core/FileSessionStore.ts ← 新增，默认实现                        (5.3)
  core/RedisSessionStore.ts← 新增，扩展时启用                      (5.3-第二步)
shared/
  types/events.ts          ← 新 socket 事件与 payload 类型
  types/safety.ts          ← SafetyState / SpotlightState
app/src/
  store/gameStore.ts       ← 流式分片、聚光灯、安全状态            (5.1/5.2/5.4)
  theme/theme.ts           ← 设计 token                           (5.5)
  components/…              ← 叙事流/骰子卡/资源仪表               (5.5)
```

---

## 7. 建议构建顺序（每步独立可验收）

1. **5.1 流式**——最直接的体验提升，且不依赖其他项。先做 `AIGateway.streamRequest` + 三段事件 + 前端拼接。
2. **5.3 第一步**——抽 `SessionStore`、AIGM 无状态化、加回合锁。这是多人并发正确性的地基，越早越好。
3. **5.2 聚光灯**——有了回合锁再加聚光灯准入，多人才不会乱序。
4. **5.4 安全**——S0 阶段门禁 + Lines/Veils 注入 + X-Card 中断流。
5. **5.5 UI 主题化**——前面跑通后再美化。
6. **5.3 第二步（Redis）**——仅当确实要多进程/上线时再做。

> 每步做完跑 `npm test` + `tsc --noEmit`，并用自然语言向所有者说明"多人体验上有什么可感知的变化"。