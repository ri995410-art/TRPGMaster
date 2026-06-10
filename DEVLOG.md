# TRPGMaster Development Log

## Phase 1: 基础框架 (Session 1)

**日期**: 2026-06-05
**会话**: 主架构设计 + TDD测试

### 完成内容

**架构设计**
- 确定技术栈：React Native + Node.js + Socket.IO + GLM5.1
- 设计8-Agent系统架构：Narrative/Rules/SceneDirector/NPC/Combat/Faction/ImageDirector/Novel
- 设计Event Bus驱动的Agent协调机制
- 设计共享记忆库分层存储方案

**共享类型库** (`shared/`)
- `types/rules.ts` - DaggerHeart规则类型（属性、骰子、伤害、难度）
- `types/character.ts` - 角色类型（含辅助函数：getTier/calculateThresholds/getDamageSeverity）
- `types/events.ts` - 事件类型体系（30+事件类型、会话状态、战斗状态）
- `types/agent.ts` - Agent类型、世界设定、图像生成、小说生成
- `constants/gameEvents.ts` - 事件常量 + Agent订阅映射 + 优先级

**后端核心** (`server/src/core/`)
- `EventBus.ts` - 发布/订阅 + 中间件 + 事件日志 + async handler支持
- `StateManager.ts` - 会话/角色/战斗/派系状态管理
- `AgentCoordinator.ts` - Agent注册/事件路由/冲突解决
- `SessionOrchestrator.ts` - 会话生命周期 + 事件处理

**Agent系统** (`server/src/agents/`)
- `BaseAgent.ts` - Agent基类（prompt构建、上下文管理）
- `RulesAgent.ts` - 规则裁定（掷骰判定、难度建议、伤害计算）

**网络层** (`server/src/network/`)
- `SocketServer.ts` - Socket.IO服务器（房间机制、状态同步）
- `LANDiscovery.ts` - 局域网UDP广播发现

**移动端UI** (`app/src/`)
- `store/gameStore.ts` - Zustand状态管理
- `hooks/useSocket.ts` - Socket.IO客户端连接
- `components/` - CharacterCard/DiceTray/AgentOutputPanel
- `screens/` - GM控制台/玩家角色卡/创建会话/加入会话

**规则数据** (`server/src/rules/data/daggerheart/`)
- `classes.json` - 9个职业数据
- `weapons.json` - 8种武器数据
- `armor.json` - 4种护甲数据

**Agent Prompt模板** (`prompts/`)
- narrative/rules/npc/combat/faction/image 各Agent的system prompt

### TDD测试结果

| 测试套件 | 测试数 | 通过 |
|---------|-------|------|
| 共享类型辅助函数 | 19 | 19 |
| EventBus | 17 | 17 |
| StateManager | 35 | 35 |
| RulesAgent | 17 | 17 |
| **总计** | **88** | **88** |

### 发现并修复的Bug

1. **RulesAgent关键词误匹配** - "力量"正则中单字`力`匹配到"历史知识"。修复：改为双字词组匹配
2. **StateManager override未spread** - `createMockCharacter`缺少`...overrides`。修复：添加spread
3. **StateManager stress overflow无效代码** - `Math.min`后再检查overflow永远不触发。修复：重构为先检测溢出
4. **EventBus不支持async handler** - `publish`只`emit`不等待。修复：改为`Promise.all`等待

---

## Phase 2: 规则引擎 + AI网关 + 多Agent (Session 2)

**日期**: 2026-06-05
**会话**: 并行开发会话

### 完成内容

**DaggerHeart规则引擎** (`server/src/rules/systems/DaggerHeartRules.ts`)
- 二元骰系统：5种结果判定 + 调整值计算
- 伤害系统：4级伤害判定 + 护甲槽减免 + 阈值计算
- 关键成功：额外伤害 + 希望点 + 清压力
- 希望/恐惧点：消耗/获得 + 休整恐惧点
- 等级位阶：1-10级 → 4个位阶
- 升级系统：可选收益 + 升阶成就
- 休整行动：短休（选2项）+ 长休（选3项）
- 死亡行动：光荣就义 / 回避死亡 / 孤注一掷
- 角色卡验证：属性分配 + 资源上限 + 经历检查
- 德拉肯海姆：污染系统 + 变异卡 + 探险倒计时 + 派系关系

**AI Gateway** (`server/src/ai/AIGateway.ts`)
- GLM5.1 API封装，OpenAI兼容格式
- 并发控制：信号量限制（默认5并发）
- 自动重试：指数退避 + Rate Limit感知
- 流式输出：SSE格式解析
- 上下文管理：自动压缩事件历史适应200k限制
- 安全降级：无API Key时使用模板回退响应

**4个新Agent** (`server/src/agents/`)
- `NarrativeAgent.ts` - 场景描述、剧情推进、氛围营造
- `NPCAgent.ts` - NPC对话、社交压力槽、性格一致性
- `CombatAgent.ts` - 战斗管理、敌人行动、恐惧点使用
- `FactionAgent.ts` - 派系关系追踪、政治动态、德拉肯海姆5派系

**服务器入口更新** (`server/src/index.ts`)
- 集成AI Gateway和5个Agent
- 新增 `/api/ai/stats` 和 `/api/agents` 端点
- 环境变量：GLM_API_KEY、GLM_BASE_URL

### TDD测试结果

| 测试套件 | 测试数 | 说明 |
|---------|-------|------|
| DaggerHeartRules | 14 | 规则引擎核心逻辑 |
| AIGateway | 10 | API封装和并发控制 |
| Agents集成 | 12 | 4个Agent的AI/回退模式 |

---

## Phase 3: Agent系统完善 + MemoryCompressor + 角色创建 (Session 3)

**日期**: 2026-06-06
**会话**: 主会话

### 完成内容

**Agent基类和协调器完善** (`server/src/agents/BaseAgent.ts`, `server/src/core/AgentCoordinator.ts`)
- BaseAgent增加流式输出支持：`processStream()` 方法
- BaseAgent增加上下文压缩：`compressRecentEvents()` 辅助方法（超过maxEvents时自动压缩）
- BaseAgent增加输出格式化：`formatJSONOutput()` 安全JSON序列化（处理循环引用）
- AgentCoordinator修复：`agent:output` 事件现在包含完整的agentType和output数据
- AgentCoordinator增加输出缓存：`outputCache` Map防止相同事件+Agent重复处理
- AgentCoordinator增加输出订阅：`onAgentOutput(callback)` 供外部监听
- AgentCoordinator增加事件过滤：`getRecentEventsForAgent()` 按Agent类型过滤事件
- SessionOrchestrator增加Agent输出转发：`setAgentOutputHandler()` → Socket.IO

**MemoryCompressorAgent** (`server/src/agents/MemoryCompressorAgent.ts`)
- 定时压缩机制：每30分钟自动压缩（可配置intervalMs）
- 压缩策略：
  - 关键时刻(isKeyMoment)完整保留
  - 最近5分钟事件保留原文
  - 5-30分钟事件压缩为摘要
  - 30分钟以上只保留统计
- AI模式：用GLM5.1生成高质量摘要
- 回退模式：简单拼接关键事件+统计数据
- 统计功能：战斗次数/伤害统计/希望恐惧使用
- 回调接口：`setOnCompress(callback)` 和 `stopCompression()`

**角色创建9步流程**
- 后端 `server/src/core/CharacterCreator.ts`：
  - 9步状态机：class→ancestry→community→attributes→experiences→weapons→armor→domainCards→backstory
  - 每步验证：`validateCurrentStep()` 检查必填字段和格式
  - 属性验证：+2,+1,+1,0,0,-1排列检查
  - 经历验证：至少1个+2和1个+1
  - 领域卡验证：1-5张
  - 最终构建：`buildCharacter()` 生成完整Character对象
- 数据文件：
  - `server/src/rules/data/daggerheart/ancestries.json` - 6个血统（精灵/矮人/兽人/人类/半身人/哥布林）
  - `server/src/rules/data/daggerheart/communities.json` - 6个社区（高城/下城/外围/修道院/军事/学院）
  - `server/src/rules/data/daggerheart/domains.json` - 10张初始领域卡
- API端点：
  - `GET /api/data/classes|ancestries|communities|weapons|armor|domains` - 查询创建数据
  - `POST /api/character/validate` - 验证创建步骤
  - `POST /api/character/create` - 完成创建并加入会话
- 前端 `app/src/screens/Setup/CharacterCreateScreen.tsx`：
  - 9步向导式UI，步骤进度指示器
  - 职业选择（9宫格卡片）、血统选择（6宫格）、社区选择（6宫格）
  - 属性分配（+2,+1,+1,0,0,-1按钮选择）
  - 经历输入（动态添加/删除，+2/+1切换）
  - 武器选择（主手+可选副手）
  - 护甲选择（4种类型）
  - 领域卡选择（1-5张复选）
  - 背景故事输入（名称/故事/任务）
  - 上一步/下一步导航
- Zustand Store：`app/src/store/characterCreateStore.ts`
- 导航集成：AppNavigator新增 CharacterCreate 路由

**Agent输出UI集成** (`app/src/components/SceneDescription/AgentOutputPanel.tsx`)
- 增加Agent类型过滤标签（全部/叙事/规则/战斗/NPC/派系）
- 增加展开/折叠功能（点击切换完整/摘要显示）
- 区分GM专属输出（memoryCompressor标记GM标签）
- 增加相对时间显示（刚刚/X分钟前）
- JSON输出智能解析（结构化显示）
- Socket.IO输出通道区分：
  - GM端：`agent:stream` 接收所有Agent输出
  - 玩家端：`agent:complete` 接收过滤后的输出（排除memoryCompressor等）

**共享类型改进**
- `shared/index.ts`：导出 AGENT_SUBSCRIPTIONS 和 EVENT_PRIORITY
- `shared/constants/gameEvents.ts`：
  - AGENT_SUBSCRIPTIONS 类型改为 `Record<AgentType, GameEventType[]>`
  - EVENT_PRIORITY 类型改为 `Record<AgentType, number>`，键值修正为无前缀格式
  - 增加 memoryCompressor 优先级条目

**Phase 2测试修复**
- `server/__tests__/Agents.test.ts`：修复 roundTracker 缺少 playerActionsRemaining
- `server/__tests__/AIGateway.test.ts`：重写为正确的 fetch mock，修复类型错误
- `server/__tests__/DaggerHeartRules.test.ts`：修复 null check 和 toContainEqual
- `server/src/rules/systems/DaggerHeartRules.ts`：添加 Character 类型导入，修复 reduce 类型

### TDD测试结果

| 测试套件 | 测试数 | 说明 |
|---------|-------|------|
| 共享类型辅助函数 | 19 | Phase 1 遗留 |
| EventBus | 17 | Phase 1 遗留 |
| StateManager | 35 | Phase 1 遗留 |
| RulesAgent | 17 | Phase 1 遗留 |
| AgentCoordinator + BaseAgent | 13 | 新增：输出事件、缓存、监听、上下文压缩 |
| DaggerHeartRules | 51 | Phase 2 修复后 |
| AIGateway | 8 | Phase 2 重写后 |
| Agents集成 | 12 | Phase 2 修复后 |
| MemoryCompressorAgent | 8 | 新增 |
| CharacterCreator | 22 | 新增 |
| **总计** | **185** | **185通过** |

### 修复的Bug

1. **AgentCoordinator输出事件数据丢失** - `agent:output`事件不包含agentType和output，前端无法显示。修复：在事件对象中添加这些字段
2. **AgentCoordinator无输出缓存** - 同一事件可能被重复处理。修复：增加outputCache Map
3. **shared未导出AGENT_SUBSCRIPTIONS** - AgentCoordinator从shared导入但未导出。修复：添加导出
4. **AGENT_SUBSCRIPTIONS类型不匹配** - Record<string, string[]>导致subscribeMultiple类型错误。修复：改为Record<AgentType, GameEventType[]>
5. **EVENT_PRIORITY键值格式错误** - 使用'agent:rules'而非'rules'。修复：统一为无前缀格式
6. **AIGateway测试无法运行** - mock路径错误（HttpClient不是独立模块）+ 类型错误。修复：重写为fetch mock
7. **DaggerHeartRules缺少Character导入** - validateCharacterSheet使用Partial<Character>但未导入。修复：添加import
8. **DaggerHeartRules reduce类型推断错误** - Object.values返回unknown[]。修复：添加as number[]和类型注解

---

## Phase 4: 待开发

- 语音输入 (Whisper STT + 说话人识别)
- 摄像头场景理解 (Vision API)
- 意图解析器
- 输入事件 → Agent管道打通
