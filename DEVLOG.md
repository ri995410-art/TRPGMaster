# TRPGMaster Development Log

> 本文档记录开发过程中的架构决策、方案取舍、踩坑细节和关键修复。
> 每次重大变更（commit 或跨会话工作）后应更新此文件。

---

## Phase 1: 初始架构 (2026-06-05)

**Commit**: `00f1e58` init: TRPGMaster - AI-assisted GM system for TRPG sessions

### 架构决策

**技术栈选择**: React Native (Expo) + Node.js + Socket.IO + GLM5.1
- **取舍**: 选择 GLM5.1 而非 OpenAI，因为国内网络无需代理，成本更低
- **取舍**: React Native 而非 Web，目标是移动端桌游体验（面对面围坐场景）

**8-Agent 架构**: Narrative / Rules / SceneDirector / NPC / Combat / Faction / ImageDirector / Novel
- **决策逻辑**: 模仿真人 GM 的多角色分工——叙事、规则裁定、场景调度、NPC 扮演、战斗管理、派系政治、图像生成、小说记录
- **后来被废弃**: 实际运行中发现多 Agent 协调开销大、延迟高，Phase 5 重构为单一 AIGameMaster

**Event Bus 驱动**: Agent 间通过 EventBus 发布/订阅事件通信
- **取舍**: 选择发布/订阅而非直接调用，解耦 Agent 依赖，但引入了事件顺序和冲突解决问题

### 完成内容

- 共享类型库 (`shared/`): rules.ts, character.ts, events.ts, agent.ts, gameEvents.ts
- 后端核心: EventBus, StateManager, AgentCoordinator, SessionOrchestrator
- Agent 系统: BaseAgent 基类 + RulesAgent
- 网络层: Socket.IO 服务器 + LAN UDP 发现
- 移动端 UI: Zustand store + CharacterCard/DiceTray/AgentOutputPanel
- 规则数据: 9 职业、8 武器、4 护甲
- Agent Prompt 模板: narrative/rules/npc/combat/faction/image

### 踩坑与修复

1. **RulesAgent 关键词误匹配** — "力量"正则中单字`力`匹配到"历史知识"。修复：改为双字词组匹配
2. **StateManager override 未 spread** — `createMockCharacter` 缺少 `...overrides`。修复：添加 spread
3. **StateManager stress overflow 无效代码** — `Math.min` 后再检查 overflow 永远不触发。修复：重构为先检测溢出
4. **EventBus 不支持 async handler** — `publish` 只 `emit` 不等待。修复：改为 `Promise.all` 等待

### 测试: 88/88 通过

---

## Phase 2: 规则引擎 + AI 网关 + 多 Agent (2026-06-05)

**Commit**: (与 Phase 1 同日，并行开发)

### 架构决策

**DaggerHeart 规则引擎设计**: 纯函数式，无副作用
- **取舍**: 所有规则计算为纯函数，便于测试和前端复用，但需要手动管理状态更新
- **关键设计**: 二元骰系统 (hope die + fear die) → 5 种结果判定，这是 Daggerheart 的核心机制

**AI Gateway 并发控制**: 信号量限制（默认 5 并发）+ 指数退避重试
- **取舍**: 限制并发避免 API 限流，但高峰期可能排队
- **安全降级**: 无 API Key 时使用模板回退响应，确保离线可玩

### 完成内容

- DaggerHeart 规则引擎: 二元骰、伤害系统、希望/恐惧点、等级位阶、升级、休整、死亡行动、角色卡验证、德拉肯海姆污染系统
- AI Gateway: GLM5.1 API 封装、并发控制、流式输出、上下文压缩、安全降级
- 4 个新 Agent: NarrativeAgent, NPCAgent, CombatAgent, FactionAgent

### 测试: 36 新增 (DaggerHeartRules 14 + AIGateway 10 + Agents 12)

---

## Phase 3: Agent 完善 + MemoryCompressor + 角色创建 (2026-06-06)

**Commit**: (Phase 1-3 均在初始 commit 之前的手动开发阶段)

### 架构决策

**MemoryCompressor 压缩策略**: 分层保留
- 关键时刻 (isKeyMoment) 完整保留
- 最近 5 分钟事件保留原文
- 5-30 分钟事件压缩为摘要
- 30 分钟以上只保留统计
- **取舍**: 保留近期细节、压缩远期，平衡上下文完整性和 token 消耗

**角色创建 9 步流程**: class → ancestry → community → attributes → experiences → weapons → armor → domainCards → backstory
- **决策逻辑**: 遵循 Daggerheart 官方创建流程顺序
- **验证设计**: 每步验证确保数据完整性，属性必须 +2,+1,+1,0,0,-1 排列

### 完成内容

- BaseAgent 流式输出、上下文压缩、输出格式化
- AgentCoordinator 输出缓存、事件过滤、输出订阅
- MemoryCompressorAgent: 定时压缩 + AI/回退双模式
- 角色创建 9 步流程 (后端 + 前端 + API)
- Agent 输出 UI 集成: 类型过滤、展开/折叠、GM/玩家端区分

### 踩坑与修复

1. **AgentCoordinator 输出事件数据丢失** — `agent:output` 不包含 agentType 和 output。修复：在事件对象中添加字段
2. **AgentCoordinator 无输出缓存** — 同一事件被重复处理。修复：增加 outputCache Map
3. **shared 未导出 AGENT_SUBSCRIPTIONS** — 导入但未导出。修复：添加导出
4. **AGENT_SUBSCRIPTIONS 类型不匹配** — `Record<string, string[]>` 导致类型错误。修复：改为 `Record<AgentType, GameEventType[]>`
5. **EVENT_PRIORITY 键值格式错误** — 使用 'agent:rules' 而非 'rules'。修复：统一为无前缀格式
6. **AIGateway 测试无法运行** — mock 路径错误 + 类型错误。修复：重写为 fetch mock
7. **DaggerHeartRules 缺少 Character 导入** — 使用 `Partial<Character>` 但未导入。修复：添加 import
8. **DaggerHeartRules reduce 类型推断错误** — `Object.values` 返回 `unknown[]`。修复：添加 `as number[]`

### 测试: 185/185 通过 (含 Phase 1-2 遗留)

---

## Phase 4: Daggerheart 重写 + AI GM + 多人 + 持久化 (2026-06-21)

**Commit**: `5a9a184` feat: complete Daggerheart rewrite, AI GM, multiplayer, persistence, and networking fixes
**变更规模**: 113 files, +18514/-3702 lines

### 架构决策 — 重大重构

**废弃 8-Agent 架构，改为单一 AIGameMaster**
- **原因**: 多 Agent 协调延迟高、上下文割裂、Agent 间信息传递不完整。一个统一的 AI GM 反而能产出更连贯的叙事
- **取舍**: 放弃了 Agent 分工的灵活性，换取了叙事连贯性和响应速度
- **影响**: 所有 Agent 移入 `_deprecated/`，后续 Phase 5 彻底删除

**AIGameMaster 设计**: 可配置 model/API/temperature/maxTokens
- **决策逻辑**: 不同场景可能需要不同模型（叙事用创意模型、规则用精确模型）
- **buildStateSummary**: 将完整角色状态注入 AI 上下文（属性、武器、领域卡、状态、伤疤、经历、背包、金币、背景）

**多人会话系统 (SessionRegistry)**: 房间码机制
- **取舍**: 房间码而非自动发现，更可靠但需要手动分享
- **设计**: SessionRegistry 管理会话生命周期，SessionPersistence 持久化到 JSON

**玩家标识: 稳定 UUID 替代 socket.id**
- **踩坑**: socket.id 在重连时会变化，导致角色丢失。修复：生成稳定 UUID 作为 playerId

### 关键修复

1. **重连循环** — 重连时触发 playerJoined/playerLeft 广播风暴。修复：静默重入，不广播
2. **角色切换不通知服务器** — 前端切换角色后服务器不知道。修复：roster 选择时通知服务器
3. **移动网络超时** — Socket.IO 默认 pingTimeout 太短。修复：增加到 25s
4. **react-native-mmkv 兼容性** — Expo 不支持原生模块。修复：替换为 @react-native-async-storage/async-storage
5. **Windows 路径问题** — node_modules 中 HTTP header 和路径问题。修复：patch node_modules

### 新增内容

- 完整的屏幕: AdventureScreen, CharacterCreateScreen, CharacterRosterScreen, CharacterScreen, CombatScreen, HomeScreen, JournalScreen, LevelUpScreen, RestScreen, SessionJoinScreen, SessionLobbyScreen, SettingsScreen
- 德拉肯海姆战役模块: DrakkenheimCampaign + 派系/地点/NPC 数据
- 共享类型全面重写: character.ts, events.ts, rules.ts, agent.ts, game.ts
- DaggerHeartRules 重写: 1210 行规则引擎

---

## Phase 5: 协作叙事 + Session Zero + [STATE] 标记 + 恐惧点经济 (2026-06-22)

**Commit**: `edff809` feat: collaborative narrative, Session Zero, [STATE] markers, and fear point economy
**变更规模**: 12 files, +3024/-65 lines

### 架构决策

**4 种叙事模式替代强制选择**
- A: 开放提问 (50%) — 玩家自由描述行动
- B: 情境提示 (25%) — GM 给出情境让玩家选择
- C: 世界构建 (15%) — 邀请玩家共创世界细节
- D: 编号选项 (10%) — 传统选择模式
- **决策逻辑**: 遵循 Daggerheart "Create Your World Together" 理念，避免 AI GM 垄断叙事权
- **取舍**: 开放提问比例最高，但可能导致新手玩家不知所措

**[STATE] 标记系统**: AI 输出中嵌入状态变更如 `[STATE] hp:-2 stress:+1`
- **设计意图**: 让 AI GM 的叙事自动触发数值状态更新，无需玩家手动操作
- **关键问题**: 81 轮耐力测试发现 AI 模型几乎不输出 [STATE] 标记，系统形同虚设
- **根因**: LLM 倾向于自然叙事而非结构化标记，prompt 指令被"稀释"
- **待解决**: 需要 few-shot 示例、primacy effect、或后处理 regex 回退

**Session Zero 5 阶段流程**: safety → worldbuilding → connections → expectations → narrativePact
- **决策逻辑**: 多人 TRPG 的安全工具最佳实践，确保所有玩家舒适度
- **实现**: 前端橙色位置栏 + 动态输入占位符 + S0 阶段指示器

**恐惧点经济**: 恐惧骰结果 → GM 获得恐惧点 → GM 消费恐惧点驱动敌人行动
- **设计**: 完整的获取/消费循环，通过 [STATE] fearPoints 追踪
- **问题**: 同样受 [STATE] 标记不输出问题影响

### 新增内容

- extractStateChanges / applyStateChanges: [STATE] 解析和 StateManager 集成
- buildStateSummary 重写: 完整角色状态注入
- Session Zero UI 组件
- 54 轮 playtest 测试运行器和分析报告

---

## Phase 6: 流式叙事 + 聚光灯 + 会话存储 + 安全工具 + UI 主题 (2026-06-23)

**Commit**: `0e000f5` feat: streaming narrative, spotlight, session store, safety tools, UI theme
**变更规模**: 116 files, +6650/-20400 lines (大量删除废弃代码)

### 架构决策

**5.1 流式叙事**: 三阶段事件 `gm:narrate:start/delta/end`
- **取舍**: 替代整体 `gm:narrate` 事件，实现逐字渲染体验，但增加了事件处理复杂度
- **设计**: start 开始流、delta 增量文本、end 结束流，前端拼接渲染

**5.2 聚光灯 (SpotlightManager)**: 服务器权威的回合管理
- **决策逻辑**: 服务器控制谁可以行动，避免多人同时发言导致混乱
- **设计**: canAct 门控 + AI 响应后自动 pass
- **取舍**: 服务器权威更可靠，但增加了延迟感知

**5.3 会话存储 (FileSessionStore)**: 外部化 AI GM 对话历史
- **决策逻辑**: AIGameMaster 的对话历史不能只存在内存中，重启会丢失
- **设计**: JSON 持久化 + FIFO 回合锁队列
- **取舍**: 文件存储简单可靠，但不支持分布式部署

**5.4 安全工具**: S0 门控 + X-Card
- **设计**: S0 未完成时阻止行动、X-Card 运行时暂停中止活跃流、Lines/Veils 注入 AI prompt
- **取舍**: 安全优先，但可能打断游戏节奏

**5.5 UI 主题系统**: Design Token + Cinzel + EB Garamond 字体
- **决策逻辑**: 统一视觉语言，零硬编码颜色
- **组件**: NarrativeCard, ResourceGauge, SpotlightIndicator, SafetyOverlay

### 重大清理

- **删除 _deprecated/ 目录**: 58 文件，约 13k 行废弃代码
- **路由拆分**: 从 index.ts 提取 data/character/ai/session 路由
- **AIConfigService**: 集中化 AI 配置管理
- **stateChangeParser**: 纯函数解析 [STATE] 标记
- **buildWorldLore**: 世界设定构建工具
- **后端骰子解析**: resolveDualityDice

### 测试: 12 套件, 311 测试全通过

---

## Phase 7: 战斗系统 + 骰盘 + 战斗状态管理 (2026-06-24)

**Commit**: `2b3aa12` feat: combat resolution system, DiceTray component, combat state management
**变更规模**: 15 files, +1162/-386 lines

### 架构决策

**combatResolver: 后端纯逻辑战斗结算**
- **设计**: attack/damage/heal 三种行动类型，纯函数无副作用
- **取舍**: 纯函数便于测试，但需要 combatApply 桥接到 StateManager

**extractGmEffects: 从 GM 叙事中提取战斗效果**
- **设计**: AI 解析叙事文本，提取 damageToPlayer/stressToPlayer/enemyAttack/enemyHp/spendFear
- **取舍**: AI 提取比规则匹配更灵活，但依赖模型理解能力，可能漏标或误标

**DiceTray 组件**: Daggerheart 二元骰 (hope die + fear die)
- **设计**: 前端骰盘组件，支持掷骰动画和结果展示
- **集成**: combatState + pendingDiceResult 加入 gameStore

**战斗自动导航**: 战斗开始时自动跳转 CombatScreen
- **设计**: AdventureScreen 检测 combatState 变化，自动导航

### 新增内容

- shared/types/combat.ts: CombatAction, CombatResult, CombatState 类型
- combatApply: 将战斗结果应用到游戏状态
- AIGameMaster: 战斗上下文注入
- StateManager: 战斗状态持久化
- SocketServer: 战斗事件处理器

---

## Phase 8: WIP — 战利品/物品/特性/冒险总结 (2026-06-25, 未提交)

**状态**: 工作中，19 files changed, +1979/-111 lines

### 架构决策

**lootResolver: 战后战利品生成**
- **设计**: 基于 loot.json 和 consumables.json 目录，骰子随机选取
- **难度缩放**: 物品数量和稀有度随 difficulty 和 tier 变化

**FeatureTray: 特性选择组件**
- **设计**: 统一展示领域卡/职业特性/血统特性/社区特性，供玩家在行动时选择使用
- **集成**: 与 RollDeclaration 配合，行动声明时可附带特性

**InventoryScreen: 背包管理界面**
- **设计**: 展示角色物品 + 待拾取战利品 + 金币显示
- **集成**: sendSceneSearch / sendLootPickup 事件

**RollDeclaration: 掷骰+行动一体化声明**
- **设计**: 替代分离的 ActionDeclaration，将行动描述、属性、难度、优势/劣势、领域卡、特性整合为一条声明
- **取舍**: 一体化减少网络往返，但增加了单条消息的复杂度

**extractGmEffects 扩展**: 新增 5 种效果类型
- addEnemy: 叙事中出现新敌人，必须匹配 enemies.json 中的 statBlockId
- startCombat / endCombat: 战斗状态自动切换
- setDifficulty: 场景难度设置 (8-25)
- addItem: 叙事中玩家获得物品/金币
- **设计原则**: "宁可多标不可漏标" — 避免战斗触发遗漏

**playerInputSuggestsCombat: 玩家输入战斗意图检测**
- **设计**: 正则匹配即时攻击意图（"我要攻击"/"砍"/"刺"等）
- **排除**: 过去时/梦境/远处观察等非即时语境
- **取舍**: 正则匹配快速但可能误判，AI 理解更准确但延迟高

**AdventureSummary: 冒险总结**
- **设计**: AI 生成第三人称小说式总结 + 3-5 个关键里程碑
- **集成**: AIGameMaster.generateAdventureSummary，会话结束时调用

**JournalEntry 自动提取**: 从 GM 叙事中提取 NPC 遭遇、任务进展、地点发现
- **设计**: 正则模式匹配中文叙事文本
- **取舍**: 正则提取快速但覆盖有限，复杂叙事可能遗漏

### 新增类型

- `featureUses: Record<string, number>` — 特性使用次数追踪
- `adventureSummaries: AdventureSummary[]` — 冒险总结历史
- `LootResult` — 战利品结果
- `RollDeclaration` / `RollResolution` — 掷骰声明与结算
- GmEffect 扩展: addEnemy/startCombat/endCombat/setDifficulty/addItem + enemyStatBlockId/enemyName/itemName/itemDescription/itemCategory/goldCoins

---

## 已知问题与待解决

1. **[STATE] 标记系统失效** — 81 轮耐力测试确认 AI 模型几乎不输出 [STATE] 标记。需要 few-shot 示例、primacy effect、或后处理 regex 回退方案
2. **120 条历史限制** — 81 轮未触发但 6 小时真实会话会超限。需要记忆压缩
3. **extractGmEffects 误标/漏标** — AI 提取战斗效果依赖模型理解，可能误判。当前策略是"宁可多标"，但可能产生虚假战斗触发
4. **playerInputSuggestsCombat 正则局限** — 中文攻击意图正则可能误判（如"我以前攻击过"），已加排除词但覆盖有限
5. **FileSessionStore 不支持分布式** — 当前文件存储方案仅适合单机/局域网场景

---

## 架构演进时间线

| 阶段 | 日期 | 核心变化 | 代码量 |
|------|------|---------|--------|
| Phase 1-3 | 06-05~06 | 8-Agent 架构 + 规则引擎 + 角色创建 | ~8k 行 |
| Phase 4 | 06-21 | 废弃多 Agent → 单一 AI GM + 多人 + 持久化 | +18.5k/-3.7k |
| Phase 5 | 06-22 | 协作叙事 + [STATE] + Session Zero + 恐惧点 | +3k |
| Phase 6 | 06-23 | 流式叙事 + 聚光灯 + 安全工具 + UI 主题 + 清理 | +6.7k/-20.4k |
| Phase 7 | 06-24 | 战斗系统 + 骰盘 + 战斗状态 | +1.2k |
| Phase 8 | 06-25 | 战利品/物品/特性/冒险总结 (WIP) | +2k |
