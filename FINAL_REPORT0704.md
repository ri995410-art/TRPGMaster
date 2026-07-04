# Final Bug Fix Report — 2026-07-04

## 概要

本次修复覆盖了 22 项初始 bug + 4 项 Gemini 审查验证新增 bug，共计 26 项，全部修复完成。

**修改文件数**: 14
**新增代码行**: ~120 行
**删除/修改代码行**: ~80 行
**测试通过率**: 396/397（1 项预存失败与本次修复无关）

---

## P0 — 致命级修复（3 项，角色创建完全不可用的根因）

### Bug 1: 服务器创建流程缺少 `showSubclasses`
- **文件**: `server/src/rules/systems/DaggerHeartRules.ts:256`
- **修复**: 在 class 步骤的 rendererConfig 中添加 `showSubclasses: true, showClassDetails: true`
- **规则依据**: Daggerheart 角色创建必须选择子职业，SelectOneStep 组件仅在 `showSubclasses=true` 时渲染 ClassSection

### Bug 2: 服务器 backstory 步骤 fields 配置类型错误
- **文件**: `server/src/rules/systems/DaggerHeartRules.ts:257-263`
- **修复**: 
  - `fields: ['name', 'backstory', 'personalQuest']` → TextFieldConfig[] 对象数组
  - 同时修复 dataKey 不一致: `resources`→`_resources`, `mainWeaponId`→`_equipment`, `name`→`_backstory`
  - 添加 `ancestries` 的 `showFeatures: true`，`communities` 的 `showFeature: true`
- **规则依据**: TextInputStep 组件要求 TextFieldConfig[] 格式，字符串数组导致 `field.key` 为 undefined

### Bug 3: `setCharacter()` 多玩家场景不同步
- **文件**: `server/src/core/StateManager.ts:221-233`
- **修复**: 移除 `players.length === 0` 条件判断，始终同步 `characters[]` 和 `players[].character`
- **规则依据**: socket handler 通过 `getPlayerCharacter()` 读取 `players[].character`，不同步则角色数据丢失

---

## P1 — 严重级修复（7 项）

### Bug 4: 客户端 Hope 初始值错误
- **文件**: `app/src/screens/CharacterCreateScreen.tsx:203`
- **修复**: `hope: 6` → `hope: 2`
- **规则依据**: Daggerheart 规则 — 1 级角色起始 Hope = 2

### Bug 5: 客户端 HP 计算错误
- **文件**: `app/src/screens/CharacterCreateScreen.tsx:199`
- **修复**: `hp: baseHp + 1` → `hp: baseHp`
- **规则依据**: 与服务器 CharacterCreator.buildCharacterLegacy() 保持一致

### Bug 6: `PUT /api/character` 缺少结构校验
- **文件**: `server/src/routes/character.ts:24-34`
- **修复**: 添加 `validateCharacterSheet()` 校验，校验失败返回 400 + 错误列表
- **规则依据**: 服务器不应盲目信任客户端提交的数据

### Bug 7: 服务器领域卡规则错误
- **文件**: `server/src/rules/systems/DaggerHeartRules.ts:263`
- **修复**: `max: 5` → `max: 2`，添加 `filterByClassDomains: true, levelRestriction: 1`
- **规则依据**: Daggerheart 规则 — 1 级角色从职业领域选 2 张领域卡

### Bug 8: `hasJoinedSession` 切换服务器不重置
- **文件**: `app/src/hooks/useSocket.ts:151-165`
- **修复**: 在 `connectToServer()` 清理旧 socket 后添加 `hasJoinedSession = false`
- **规则依据**: 连接新服务器时应发送 `session:join` 而非 `session:rejoin`

### Bug 9: 创建流程 dataKey 不一致
- **文件**: `server/src/rules/systems/DaggerHeartRules.ts`（同 Bug 2 一起修复）
- **修复**: 对齐 resources/equipment/backstory 的 dataKey

### Bug 10: `buildCharacter()` 强制要求 experiences
- **文件**: `server/src/core/CharacterCreator.ts:231-232, 286-287`
- **修复**: 移除 `!d.experiences` 验证条件，legacy 中 `d.experiences` → `d.experiences || []`
- **规则依据**: 创建流程中无 experiences 收集步骤，默认为空数组

---

## P2 — 中等级修复（11 项）

### Bug 11: 循环依赖含值导入
- **文件**: `shared/types/character.ts:20`
- **修复**: 删除 `import { getTier } from './rules'`（死代码，从未使用）

### Bug 12: DiceResult.outcome 类型
- **文件**: `app/src/store/gameStore.ts:75`
- **修复**: `outcome: string` → `outcome: RollResultType`

### Bug 13: pendingReactionPrompt 枚举类型
- **文件**: `app/src/store/gameStore.ts:163-182`
- **修复**: 使用 `ReactionTrigger`, `DamageSeverity`, `ReactionType`, `Attribute` 替代 `string`

### Bug 14: characterCreateStore 不持久化
- **文件**: `app/src/store/characterCreateStore.ts:110`
- **修复**: 添加 `persist` 中间件 + AsyncStorage，partialize 排除 loading/errors

### Bug 15: CharacterScreen 导航类型
- **文件**: `app/src/screens/CharacterScreen.tsx:22`
- **修复**: 改用 `CompositeNavigationProp<BottomTabNavigationProp, NativeStackNavigationProp>`

### Bug 16: GameCampaignState 索引签名
- **文件**: `shared/types/base.ts:103-108`
- **修复**: 移除 `[key: string]: unknown`，添加可选的 `visitedLocations`/`factionRelations`

### Bug 17: character:switch 跳过 markDirty
- **文件**: `server/src/network/SocketServer.ts:1640-1654`
- **修复**: 改用 `stateManager.setCharacter(character)` 统一同步所有存储位置

### Bug 23: 流式 AI 响应无超时（Gemini 新增）
- **文件**: `server/src/ai/AIGateway.ts:228`
- **修复**: `timeout: 0` → `timeout: 120000`（2 分钟超时）
- **规则依据**: API 挂起时客户端无限禁用，需有超时保护

### Bug 24: acquireTurnLock 返回值未检查（Gemini 新增）
- **文件**: `server/src/network/SocketServer.ts:1722-1725`
- **修复**: 检查 `lockAcquired` 返回值，未获锁时发送 error 并 return false

### Bug 25: autoHit 条件效果未执行（Gemini 新增）
- **文件**: `server/src/rules/combatResolver.ts:291-296`
- **修复**: 检查目标 `unconscious`/`dying` 状态时跳过命中检定
- **规则依据**: Daggerheart 规则 — 攻击昏迷/濒死角色自动命中

### Bug 26: 客户端 action 发送无防抖（Gemini 新增）
- **文件**: `app/src/hooks/useSocket.ts:836-848`
- **修复**: 添加 `isSendingAction` 模块级标志，防止快速双击发出重复请求

---

## P3 — 低等级修复（5 项）

### Bug 18: handleFinish 不处理 offWeapon
- **文件**: `app/src/screens/CharacterCreateScreen.tsx:169-234`
- **修复**: 添加 offWeaponData 查找和 offWeapon 字段构建

### Bug 19: CharacterRosterScreen 详情按钮
- **文件**: `app/src/screens/CharacterRosterScreen.tsx:151`
- **修复**: 先调用 `setActiveCharacter(char.id)` 再导航到 Main

### Bug 20: AdvantageState getter 不符纯对象
- **文件**: `shared/types/rules.ts:607-611`
- **修复**: `get net(): number` → `net: number`

### Bug 21: HP 损失映射重复定义
- **文件**: `shared/types/character.ts:235-242`, `shared/types/rules.ts:217-222`
- **修复**: character.ts 中提取 `HP_LOSS_BY_SEVERITY` 常量，函数委托给常量；rules.ts 加 `as const`

### Bug 22: CORS 缺少方法
- **文件**: `server/src/index.ts:38`
- **修复**: 添加 `PATCH, DELETE` 到 Allow-Methods

---

## 修改文件清单

| 文件 | Bug # |
|------|-------|
| `server/src/rules/systems/DaggerHeartRules.ts` | 1, 2, 7, 9 |
| `server/src/core/StateManager.ts` | 3 |
| `app/src/screens/CharacterCreateScreen.tsx` | 4, 5, 18 |
| `server/src/routes/character.ts` | 6 |
| `server/src/core/CharacterCreator.ts` | 10 |
| `app/src/hooks/useSocket.ts` | 8, 26 |
| `shared/types/character.ts` | 11, 21 |
| `app/src/store/gameStore.ts` | 12, 13 |
| `app/src/store/characterCreateStore.ts` | 14 |
| `app/src/screens/CharacterScreen.tsx` | 15 |
| `shared/types/base.ts` | 16 |
| `server/src/network/SocketServer.ts` | 17, 24 |
| `server/src/ai/AIGateway.ts` | 23 |
| `server/src/rules/combatResolver.ts` | 25 |
| `app/src/screens/CharacterRosterScreen.tsx` | 19 |
| `shared/types/rules.ts` | 20, 21 |
| `server/src/index.ts` | 22 |

---

## 已知遗留（非本次修复范围）

1. **AIGameMaster.test.ts**: 1 项测试失败 — prompt 标签从 `【输出要求】` 改为 `【机械结算提醒】` 但测试未同步更新
2. **AdventureSimulation.test.ts**: 预存 process.exit(1) 问题
3. **StateManager 架构**: 38 个公开方法/10 职责域的 God Object 问题，建议后续专项重构
4. **CharacterCreator Legacy 清理**: validateCurrentStepLegacy/buildCharacterLegacy 仍作为回退路径存在
