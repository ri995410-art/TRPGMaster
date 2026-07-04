# Bug Fix Progress — 2026-07-04

## P0 — 致命级（角色创建完全不可用）

| # | Bug | 文件 | 状态 | 完成时间 | 修改摘要 |
|---|-----|------|------|---------|---------|
| 1 | 服务器创建流程缺少 `showSubclasses`，子职业选择消失 | DaggerHeartRules.ts:256 | ✅已完成 | 2026-07-04 | 添加 `showSubclasses: true, showClassDetails: true` 到 class 步骤 |
| 2 | 服务器 `backstory` 步骤 `fields` 配置类型错误 | DaggerHeartRules.ts:262 | ✅已完成 | 2026-07-04 | 改为 TextFieldConfig[] 对象数组；同时修复 dataKey: 'resources'→'_resources', 'mainWeaponId'→'_equipment', 'name'→'_backstory' |
| 3 | `setCharacter()` 在多玩家场景不同步 | StateManager.ts:221 | ✅已完成 | 2026-07-04 | 移除 `players.length === 0` 条件，始终同步 characters[] 和 players[].character |

## P1 — 严重级（数据不一致/规则错误）

| # | Bug | 文件 | 状态 | 完成时间 | 修改摘要 |
|---|-----|------|------|---------|---------|
| 4 | 客户端 Hope 初始值 6→2 | CharacterCreateScreen.tsx:203 | ✅已完成 | 2026-07-04 | `hope: 6` → `hope: 2`（Daggerheart 规则：1级角色 Hope=2） |
| 5 | 客户端 HP 计算 `baseHp+1`→`baseHp` | CharacterCreateScreen.tsx:199 | ✅已完成 | 2026-07-04 | `hp: baseHp + 1` → `hp: baseHp`（与服务器一致） |
| 6 | `PUT /api/character` 不校验角色结构 | character.ts:24 | ✅已完成 | 2026-07-04 | 添加 `validateCharacterSheet()` 校验，返回 400 + 错误列表 |
| 7 | 服务器领域卡允许选5张+不限制职业领域 | DaggerHeartRules.ts:263 | ✅已完成 | 2026-07-04 | `max: 5` → `max: 2`，添加 `filterByClassDomains: true` |
| 8 | `hasJoinedSession` 切换服务器时不重置 | useSocket.ts:151 | ✅已完成 | 2026-07-04 | 在 `connectToServer()` 清理旧 socket 后添加 `hasJoinedSession = false` |
| 9 | 服务器/客户端创建流程 `dataKey` 不一致 | DaggerHeartRules.ts | ✅已完成 | 2026-07-04 | 同 Bug 2 一起修复，dataKey 对齐客户端 |
| 10 | `buildCharacter()` 强制要求 `experiences` | CharacterCreator.ts:232 | ✅已完成 | 2026-07-04 | 移除 `!d.experiences` 条件，buildCharacterLegacy 中 `d.experiences` 改为 `d.experiences \|\| []` |

## P2 — 中等级（潜在运行时错误）

| # | Bug | 文件 | 状态 | 完成时间 | 修改摘要 |
|---|-----|------|------|---------|---------|
| 11 | `shared/types` 循环依赖含值导入 | character.ts:20 | ✅已完成 | 2026-07-04 | 删除 `import { getTier } from './rules'`（死代码） |
| 12 | 客户端 `DiceResult.outcome` 类型为 string | gameStore.ts:70 | ✅已完成 | 2026-07-04 | `outcome: string` → `outcome: RollResultType` |
| 13 | 客户端 `pendingReactionPrompt` 枚举放宽为 string | gameStore.ts:163 | ✅已完成 | 2026-07-04 | 使用 `ReactionTrigger`, `DamageSeverity`, `ReactionType`, `Attribute` 类型 |
| 14 | `characterCreateStore` 不持久化 | characterCreateStore.ts | ✅已完成 | 2026-07-04 | 添加 `persist` 中间件 + AsyncStorage，partialize 排除 loading |
| 15 | `CharacterScreen` 导航类型不匹配 | CharacterScreen.tsx:22 | ✅已完成 | 2026-07-04 | 改用 `CompositeNavigationProp<BottomTabNavigationProp, NativeStackNavigationProp>` |
| 16 | `GameCampaignState.currentChapter` 基类索引签名泄露 | base.ts:106 | ✅已完成 | 2026-07-04 | 移除 `[key: string]: unknown` 索引签名，添加可选的 visitedLocations/factionRelations |
| 17 | `character:switch` 跳过 markDirty | SocketServer.ts:1643 | ✅已完成 | 2026-07-04 | 改用 `stateManager.setCharacter(character)` 统一同步 |
| 23 | 流式 AI 响应无超时 | AIGateway.ts:228 | ✅已完成 | 2026-07-04 | `timeout: 0` → `timeout: 120000`（2分钟） |
| 24 | `acquireTurnLock` 返回值未检查 | SocketServer.ts:1738 | ✅已完成 | 2026-07-04 | 检查返回值，未获锁时发送 session:error 并 return false |
| 25 | `autoHit` 条件效果未执行 | combatResolver.ts:270 | ✅已完成 | 2026-07-04 | 检查目标 conditions 中 unconscious/dying 时自动命中 |
| 26 | 客户端 action 发送无防抖 | useSocket.ts | ✅已完成 | 2026-07-04 | 添加 `isSendingAction` 模块级标志，在 sendPlayerAction 入口检查 |

## P3 — 低等级（代码质量/维护性）

| # | Bug | 文件 | 状态 | 完成时间 | 修改摘要 |
|---|-----|------|------|---------|---------|
| 18 | `handleFinish` 不处理 `offWeapon` | CharacterCreateScreen.tsx:169 | ✅已完成 | 2026-07-04 | 添加 offWeaponData 查找和 offWeapon 字段构建 |
| 19 | `CharacterRosterScreen` "详情"按钮导航错误 | CharacterRosterScreen.tsx:151 | ✅已完成 | 2026-07-04 | 先调用 `setActiveCharacter(char.id)` 再导航到 Main |
| 20 | `AdvantageState` getter 不符纯对象 | rules.ts:607 | ✅已完成 | 2026-07-04 | `get net(): number` → `net: number`，加注释说明计算方式 |
| 21 | `getHpLossFromSeverity` 重复定义 | character.ts:236, rules.ts:217 | ✅已完成 | 2026-07-04 | character.ts 中改为 `HP_LOSS_BY_SEVERITY` 常量 + 委托函数，rules.ts 中加 `as const` |
| 22 | CORS 缺少 DELETE/PATCH | index.ts:38 | ✅已完成 | 2026-07-04 | 添加 `PATCH, DELETE` 到 Allow-Methods |

## 测试结果

- StateManager.test.ts: 31/31 通过 ✅
- CharacterCreator.test.ts: 35/35 通过 ✅
- DaggerHeartRules.test.ts: 136/136 通过 ✅
- combatResolver.test.ts: 通过 ✅
- shared package build: 通过 ✅
- server tsc --noEmit: 通过 ✅
- AIGameMaster.test.ts: 1个预存失败（prompt格式变更，与本次修复无关）

## 已知遗留

- AdventureSimulation.test.ts: 预存问题（process.exit(1)），与本次修复无关
- AIGameMaster.test.ts: 1个测试期望 `【输出要求】` 但 prompt 已改为 `【机械结算提醒】`，需单独修复
