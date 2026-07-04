# TRPGMaster Development Log

> 本文档记录开发过程中的架构决策、方案取舍、踩坑细节和关键修复。
> 每次重大变更（commit 或跨会话工作）后应更新此文件。

---

## Phase 19: 敌人数据与遭遇生成系统 (2026-06-30)

**目标**: 完成敌人数据补充、遭遇自动生成、LLM 叙事集成、验证数据导出

### 完成内容

1. **敌人数据 SRD 对齐**: 基于 Daggerheart SRD 官方基准重写 enemies.json（38个敌人，4个层级）
   - Minion 统一为 1HP/1Stress（SRD 规范：minion 总是 1HP/1Stress）
   - Difficulty 按 SRD 基准: Tier1=11, Tier2=14, Tier3=17, Tier4=20
   - Damage thresholds 按 SRD: T1=7/12, T2=10/20, T3=20/32, T4=25/45
   - 伤害骰按层级递增: T1=1d6+2~1d12+2, T2=2d6+3~2d8+4, T3=3d8+3~3d10+3, T4=4d10+10~4d12+13
   - Solo 类型获得额外攻击修正值和 relentlessCount

2. **遭遇生成器** (`encounterSpawner.ts`): 基于战斗点数预算自动生成平衡遭遇
   - 支持难度调节: easy(0.6x)/moderate(1.0x)/hard(1.3x)/deadly(1.6x)
   - 智能敌人选择: 50%概率以首领/solo开场，加权随机填充，偏好多样性
   - 自动将 EnemyStatBlock 转换为 CombatEnemy 运行时实例
   - 生成 LLM 可读的敌人描述文本（含攻击、特性、数值）

3. **SocketServer 集成**: 新增 `combat:spawnEncounter` 事件
   - 自动根据玩家等级/人数计算层级和预算
   - 生成敌人后广播 `combat:encounterNarration` 事件供前端使用
   - 仅房主可触发遭遇生成

4. **AIGameMaster 叙事增强**:
   - `manageCombat` 现在包含敌人特性描述（恐惧特性标注费用）
   - 新增 `narrateEncounterIntro` 方法用于遭遇开场叙事

5. **数据导出验证**: `exportEnemyData.ts` 脚本验证+导出完整敌人数据
   - 输出至 `shared/data/enemies_validated.json`
   - 包含 EnemyStatBlock 和 CombatEnemy 双格式
   - 验证必填字段、minion 规范、阈值完整性
   - 38个敌人全部通过验证，0错误

### 架构决策

- **encounterSpawner 独立于 encounterBuilder**: Builder 负责预算计算和验证（纯函数），Spawner 负责随机选择和实例生成（有状态），职责分离
- **narrationPrompt 作为结构化文本**: 不使用复杂 JSON prompt，而是生成人类+LLM 可读的中文文本块，便于 AI 理解和生成自然叙事
- **±1 tier 容差**: 遭遇生成允许选择层级±1的敌人，避免层级边界处选择过少

### 敌人分布

| 层级 | 数量 | 代表敌人 |
|------|------|---------|
| Tier 1 | 14 | 哥布林、骷髅战士、狼、强盗、兽人暴徒、酸液掘虫 |
| Tier 2 | 10 | 暗影法师、灰烬骑士、大地精队长、火元素、石像魔像 |
| Tier 3 | 9 | 吸血鬼领主、九头蛇、暗影刺客、堕落大德鲁伊、污霭恐惧者 |
| Tier 4 | 5 | 恶魔将军、龙巫妖、虚空巨蛇、深渊大魔 |

---

## Phase 18: Daggerheart 规则合规性全面修复 (2026-06-29)

**基于**: COMPLIANCE_REPORT.md 审查结果，36项差异

### 完成内容

修复了35/36项规则合规差异（仅跳过m3敌人数据补充）。关键修复：

1. **核心战斗循环** (C1/C2/C3/M10/M11/M7): 敌人d20攻击掷骰、压力溢出脆弱、低伤害标记压力、直接伤害跳过护甲、抗性免疫管线、统一脆弱效果
2. **经济与状态** (C4/C5/M1/M3-M6): 回想费用改压力、恐惧上限12、长休恐惧=1d4+人数、会话初始恐惧、隐藏/束缚条件修正
3. **敌人系统** (C6-C9/M8-M9): 战斗点数、集群/无情/迟缓机制、恐惧成功反应、希望成功施法
4. **完善与内容** (C10/M2/M12-M14/m1-m12): 伤痕退役、团队休整、优势叠加、兼职修正、7种新条件、休息验证等

### 架构决策

- **EnemyAttackResolution 移至 shared**: 从 combatResolver.ts 本地定义移至 shared/types/combat.ts，供 combatApply.ts 复用
- **resolveEnemyAttack 委托 resolveDamageToCharacter**: 统一处理抗性、直接伤害、脆弱、低阈值压力
- **ConditionEffect 扩展**: 添加 cannotReact（恍惚）和 targetDisadvantage（隐藏）字段
- **DeathMoveResult 扩展**: 添加 conditionApplied、stressGained、fearGained 字段
- **validateCurrentStep 委托修复**: 当 IRulesEngine 流程步骤与 CREATION_STEPS 不匹配时回退到旧逻辑

### 踩坑

- CharacterLevelUp.getAvailableOptions 中引用 `updated`（仅 levelUp 方法中的变量）→ 改为 `character`
- 护甲步骤 goNext() 失败：因 IRulesEngine 流程步骤索引与 CREATION_STEPS 不匹配，experiences 等步骤验证被跳过
- combatResolver.test.ts 的 resolveEnemyAttack 测试未提供 d20Override，随机 d20 可能导致未命中

---

## Phase 17: 单桌演示就绪重构 (2026-06-29)

**基于**: SPEC.md 步骤 1-18

### 完成内容

1. **ESLint 配置**: 新建 `eslint.config.js`，ESLint v10 flat config，`no-explicit-any` 设为 error
2. **StateManager null 安全化**: `character: null as unknown as Character` → `character: null`；`getCharacter()` 返回 `Character | null`；调用方添加 null 守卫
3. **CharacterCreator 返回类型安全化**: `buildCharacter()` 返回 `{ character: Character | null; errors: string[] }`；4处 `null as unknown as Character` → `null`
4. **SocketServer disconnect 清理**: disconnect 时清理 `clients`/`activeStreams`/`pendingReactionContext` 三个 Map
5. **cancelNarration 所有权校验**: 检查 `activeStream.senderId !== msg.senderId` 时返回 FORBIDDEN 错误
6. **FileSessionStore 原子写**: `copyFileSync + unlinkSync` → `renameSync`，同盘原子替换
7. **useSocket 监听器清理顺序**: `socket.disconnect()` 先于 `removeAllListeners()` 执行
8. **extractGmEffects JSON 健壮化**: 新增 `extractJsonFromContent()` 函数，重试从 1 次增加到 2 次（共 3 次尝试）
9. **combatResolver 玩家攻击严重度**: `severity` 不再硬编码 `'none'`，改为基于伤害值计算
10. **index.ts 启动健壮性**: PORT NaN 校验 + session 恢复循环 try/catch
11. **消除客户端 `as any`**: CombatScreen/CharacterCreateScreen/CharacterRosterScreen/useSocket 中的 `as any` 全部消除
12. **dataValidator 启动调用**: `validateAllData()` 在服务端启动时执行
13. **combatResolver 单元测试**: 11 个测试用例覆盖玩家攻击/伤害结算/敌人攻击
14. **fearActions 单元测试**: 13 个测试用例覆盖 5 种 Fear 行动 + Fear 不足 + getAvailableFearActions
15. **enemyBehavior + damageFormula 单元测试**: enemyBehavior 8 个、damageFormula 13 个测试用例
16. **reactionSystem + cardEffects 单元测试**: reactionSystem 10 个、cardEffects 14 个测试用例
17. **AdventureScreen 空战斗守卫**: `combatState.enemies.length > 0` 检查已存在
18. **gameStore 消息上限常量化**: 提取 `MAX_ADVENTURE_MESSAGES = 500`，截断时 `console.warn`

### 验证结果

- TypeScript: 3 个项目零编译错误
- 单元测试: 新增 69 个测试全部通过（combatResolver 11 + fearActions 13 + enemyBehavior 8 + damageFormula 13 + reactionSystem 10 + cardEffects 14）
- 类型逃逸: `as any`=0（生产代码）, `as unknown as`=4（仅 dataValidator/AIGateway/DaggerheartDataProvider/gameStore persist，均不在 SPEC 修改范围）
- 关键修复验证全部通过

### 已知遗留

- `CharacterCreator.test.ts` 有 10 个预先存在的测试失败（验证逻辑重构后与新 `validateCurrentStep` 不匹配，非本次 SPEC 引入）
- `AIGameMaster.test.ts` 有 1 个预先存在的测试失败（prompt 模板变更导致断言不匹配）
- `AdventureSimulation.test.ts` 集成测试在 Jest worker 资源受限环境下可能失败
- `as unknown as` 在 4 处非 SPEC 范围文件中仍存在（AIGateway、DaggerheartDataProvider、gameStore persist）
- `FileSessionStore` 中 `copyFileSync` 仍用于备份/恢复路径（非 persistHistory 写入路径），符合预期

## Phase 16: Phase 8-9 实现 — GM工具/属性修正/教程/反应系统 (2026-06-28)

**基于**: PLAN.md Phase 8-9，完成GM控制面板、属性修正工具、新手教程、反应系统

### 架构决策

**GM控制面板 (GMPanelScreen)**: 独立的模态屏幕，三个标签页——恐惧点管理/敌人管理/场景管理
- **恐惧点花费**: 使用 `useGameStore.getState().updateFearPoints(-1)` 而非 `addFearPoints`（后者不存在）
- **敌人管理**: 使用正确的字段名 `currentHp/maxHp/currentStress/maxStress/evasion/behavior`（不是 `hp/stress/difficulty/type`）
- **战斗状态检测**: `combatState != null` 而非 `combatState.active`（CombatState 没有 `active` 字段）

**属性修正工具 (CharacterScreen GM Edit Mode)**:
- **复用现有 socket 事件**: `character:update` 已支持 `Partial<Character>` 更新，无需新增服务端点
- **GM编辑模式切换**: 仅 `isHost` 可见，开启后所有数值变为可点击（下划线高亮），弹出模态输入框设置绝对值
- **紧急重置**: 一键恢复满HP/0压力/满希望/清除所有条件，用于修复错误状态
- **属性嵌套处理**: `attributes.agility` 格式的字段路径，更新时合并到 `character.attributes` 对象

**新手教程 (TutorialScreen)**:
- **三组教程**: 骰子系统(4步)、角色创建(5步)、战斗流程(6步)
- **进度指示**: 进度条 + 步骤计数器 + 上一步/下一步导航
- **重点提示**: `highlight` 字段用于标记关键规则要点（如"双12是最幸运的结果！"）

**反应系统 (reactionSystem.ts)**:
- **五种触发**: `onAttacked`, `onEnemyMove`, `onAllyDamaged`, `onEnemyCast`, `onDamageTaken`
- **五种反应类型**: `shieldBlock`, `opportunityAttack`, `traitReaction`, `domainCardReaction`, `uncannyDodge`
- **每轮一次限制**: `reactionsUsed` 字段（Character上已有但从未使用），现在正式接入
- **Shield Block**: 消耗护甲槽降低伤害严重度一级，复用 `applyArmorSlot` 规则引擎
- **Opportunity Attack**: 反应骰检定（`resolveReactionRoll`），命中则掷武器伤害
- **Uncanny Dodge**: 反应骰闪避，成功则降一级严重度（等效免费护甲槽）
- **Socket流程**: 服务端发出 `combat:reactionPrompt` → 客户端响应 `combat:reactionDeclare` → 服务端结算并广播 `combat:reactionResult`
- **pendingReactionContext**: SocketServer 上的 Map，暂存触发上下文等待玩家声明

### 踩坑与修复

- **`addFearPoints` 不存在**: GameStore 的方法是 `updateFearPoints(delta)`，不是 `addFearPoints`
- **`combatState.active` 不存在**: CombatState 没有 `active` 字段，用 `combatState != null` 判断
- **敌人字段名错误**: `enemy.hp/stress/difficulty/type` → 正确是 `enemy.currentHp/currentStress/evasion/behavior`
- **`WeaponData.range` 不存在**: 正确字段是 `distance`（类型为 `'melee'|'nearby'|'close'|'far'|'veryFar'|'outOfRange'`）
- **`DamageDie` 是字符串**: 类型是 `'d4'|'d6'|'d8'|'d10'|'d12'`，不是数字。需要 `parseInt(damageDie.replace('d', ''), 10)` 转换
- **`updateCharacterArmorSlots(boolean)`**: 接受布尔值（消耗1槽），不是数字。用 `adjustCharacterArmorSlots(delta)` 处理多槽消耗
- **Ionicons `sword` 不存在**: 改用 `flash` 图标替代

### 完成内容

- GMPanelScreen（恐惧点/敌人/场景三标签页管理）
- CharacterScreen GM编辑模式（属性/阈值/闪避/资源绝对值设置 + 条件移除 + 紧急重置）
- useSocket `sendCharacterSetValues` 函数（复用 `character:update` 事件）
- TutorialScreen（骰子/角色创建/战斗三组交互式教程）
- SettingsScreen 教程入口
- reactionSystem.ts（反应触发/声明/结算全链路）
- SocketServer `combat:reactionDeclare` 处理器 + `pendingReactionContext` 状态
- 客户端 `combat:reactionPrompt` / `combat:reactionResult` 监听器
- GameStore `pendingReactionPrompt` 状态 + `setPendingReactionPrompt` 动作
- Zod `reactionDeclarePayload` 校验
- shared types: `ReactionTrigger`, `ReactionType`, 三种反应事件接口

---

## Phase 15: 核心规则修复+审查计划 (2026-06-28)

**基于**: 三重视角审查（资深玩家/GM/产品经理），识别出核心骰子规则、Fear经济、敌人行为、效果提取等系统性不足

### 架构决策

**Critical Success 规则补全**: 关键成功现在正确实现规则书的全部效果——获得1希望点+清除1压力点+可执行免费行动
- **为什么之前缺失**: 代码中 `criticalSuccess` 分支只给了 `hopeGained=1`，遗漏了压力清除和免费行动
- **Daggerheart 没有关键失败**: 两个骰子相同时永远是关键成功（即使总和低于难度也自动成功），所以不存在"关键失败给2 Fear"的情况——这与D&D不同

**效果提取系统修复**: 三个 bug 修复
- **`_enemyIdList` 缓存失效后永不重试**: 改为每次调用时检查错误标记，失败则重试
- **`extractEnemyNameFromNarration` 正则运算符优先级**: 第二个正则的 `|` 没有被括在非捕获组内，导致整个模式被 `|` 分割
- **Markdown 代码围栏清理**: 从精确匹配 ` ```json` 改为不区分大小写匹配 ` ```json ` 和 ` ``` `

**角色升级空操作修复**: `gainSubclassCard` 和 `multiclass` 两个选项不再是无操作
- **gainSubclassCard**: 根据等级解锁对应的子职业特性（基础/进阶/精通），如果是卡牌形式则添加到领域卡配置
- **multiclass**: 选择第二个职业的一个领域，记录在 `character.multiclass` 中，领域卡上限为等级一半
- **规则联动**: 兼职后不能选择 `gainSubclassCard`（对应规则书"划掉子职业精通卡牌"）

### 新增类型字段

- `RollResult.stressCleared: number` — 关键成功时清除的压力点
- `RollResult.canTakeFreeAction: boolean` — 关键成功时可执行免费行动
- `DualityDiceResult.stressCleared/canTakeFreeAction` — 同上，服务器结算结果
- `AttackResolution.stressCleared/canTakeFreeAction` — 攻击结算结果
- `RollResolution.stressCleared/canTakeFreeAction` — 属性检定结果
- `DiceResult.stressCleared/canTakeFreeAction` — 客户端骰子结果
- `DaggerheartCharacter.multiclass?: { classId, domain }` — 多职信息

### 完成内容

- 关键成功：+1希望 +清除1压力 +可执行免费行动（全链路：规则→结算→Socket→客户端UI）
- extractGmEffects 三个 bug 修复（缓存重试、正则优先级、代码围栏）
- gainSubclassCard 实现（解锁子职业特性，卡牌形式添加到领域卡）
- multiclass 实现（选择第二职业领域，规则联动限制）
- Fear 经济系统：5种 Fear 花费行动的类型定义和规则引擎（fearActions.ts）
- Fear 消费 Socket 事件（gm:fearAction），仅 Host 可用
- CombatEnemy 扩展：experiences + fearTraits 字段
- AI Prompt 更新：完整的 Fear 经济规则描述（5种花费选项 + 使用原则）
- Critical Success 规则描述修正（之前错误写为"双骰相同且≥6"→应为"双骰相同即关键成功"）

### 待完成（后续 Phase）

参见 PLAN.md 中的 Phase 2-9：
- Phase 2: Fear 经济系统（5种 Fear 花费行动）
- Phase 3: 结构化敌人战斗系统（敌人行为引擎+伤害公式解析）
- Phase 4: 条件与状态系统（6种缺失条件 + Dying 状态）
- Phase 5: 效果提取系统重构（玩家意图声明 → 简化效果提取）
- Phase 6-9: 域卡特质、数据层、客户端体验、反应系统

### 架构决策

**Socket事件授权**: 引入 `requireHost()` 守卫，破坏性操作（session:end, campaign:reset, combat:end, safety:resume, adventure:end, session:start）只有主持人(GM)可执行
- **为什么不用RBAC**: 当前只需GM/Player两级，RBAC过度设计。单一 `requireHost` 足够，且与已有的 `getHostId()` 无缝集成
- **前后端双重防护**: 服务端返回 `NOT_HOST` 错误码，前端在UI层也禁用/隐藏非GM按钮

**运行时输入校验 (Zod)**: 引入 `validation.ts` 模块，对所有Socket事件payload和REST API输入进行运行时校验
- **为什么选Zod**: 轻量、TypeScript原生、`safeParse` 模式不抛异常。运行时校验补足了TypeScript编译时检查的空白
- **关键校验**: `dice:roll` 骰子值1-12, `character:update` 禁止覆盖id字段, `character:resourceUpdate` delta范围限制
- **温度值范围放宽**: 从硬编码0.4/0.8/1.2改为0-2连续范围，Zod schema和index.ts同步修改

**持久化安全**:
- **Windows兼容写入**: 用 `copyFileSync + unlinkSync` 替代 `renameSync`（后者在Windows目标文件存在时不原子）
- **写入前备份**: `saveSessionData` 先 `copyFileSync` 到 `.bak`，主文件损坏时自动从备份恢复
- **版本迁移框架**: `migrateData()` 函数预留迁移路径，不再用严格版本号相等检查丢弃数据

**进程优雅终止**: 处理 `SIGTERM`, `uncaughtException`, `unhandledRejection`，终止前调用 `persistAll()`
- **为什么加 uncaughtException**: Node.js未捕获异常默认崩溃进程，但不调persistAll就丢失数据。这是个权衡：可能导致不稳定状态持久化，但比丢失全部数据好

**战斗状态持久化**: `toPersisted` 和 `loadFromPersisted` 现在序列化/恢复 `activeCombat`
- **为什么改了之前"不持久化"的决策**: 战斗是高频操作，服务器重启丢失战斗进度对玩家打击最大。CombatState完全是JSON可序列化的，没有不可恢复的运行时引用

**AI效果提取改进**:
- **懒加载敌ID列表**: `getEnemyIdList()` 替代模块级 `_ENEMY_ID_LIST`，避免数据未就绪时import崩溃
- **效果数量上限**: `MAX_EFFECTS = 20` 防止AI幻觉产生的效果洪泛
- **amount非负校验**: 负数amount会反转效果语义（伤害变治疗），现clamp到0
- **场景搜索双倍loot修复**: `handleSceneSearch` 现在检查AI是否已通过GmEffect添加物品，避免与随机loot表重复
- **提取失败日志**: 每次重试和最终失败都有 `console.warn`

### 完成内容

- Socket事件授权 (requireHost + 前端isHost检查)
- Zod运行时输入校验 (28个socket事件 + AI配置API)
- session_data.json备份机制 (写入前.bak + 损坏恢复 + Windows兼容)
- SIGTERM/uncaughtException/unhandledRejection处理
- 战斗状态持久化 + createdAt保留
- 前端Error Boundary组件
- 客户端冒险消息持久化上限 100→500
- API Key客户端MMKV持久化（不再每次重启清空）
- AI效果提取可靠性（懒加载+上限+非负+去重+日志）
- 前端isHost按钮禁用 (Settings重置/Combat结束/Adventure结束)
- Settings设置项持久化+生效 (autoScroll连接到AdventureScreen)
- HomeScreen局域网预设URL修复
- useSocket重连改进 (removeAllListeners + reconnect handler + reconnection config)

### 踩坑与修复

- **Zod `player:rest` handler误传参数**: `this.validateMsg(msg, msg, ...)` 应为 `this.validateMsg(socket, msg, ...)`，第一个参数是socket用于发送错误
- **narrationSpeed类型推断**: Zustand的 `initialState` 中 `'normal'` 被推断为 `string`，需用 `as const` 显式标注字面量类型
- **Windows renameSync**: 在目标文件存在时行为不一致，是已知的Node.js/Windows兼容问题。改用copyFileSync替代

## Phase 13: 角色跨规则穿越 — 多规则系统架构 (2026-06-27)

**基于**: 产品需求——角色可在不同规则系统（Daggerheart/CoC/D&D 5e）间穿越，加入新规则房间时用新规则重新创建角色数据

### 架构决策

**CharacterCore + SystemCharacter 分离**: 角色身份跨规则持久，规则数据按 systemId 隔离
- **为什么选"重新创建"而非"属性映射"**: 不同 TRPG 系统的属性体系差异过大（DH 有 stress/hope/阈值，CoC 有 SAN/Luck/技能点），映射既不准确又会丢失风味。重新创建保证角色在新规则下数据完整合法
- **CharacterCore 包含**: id, name, level, backstory, personalQuest, relationships, adventureSummaries, systemVersions
- **SystemCharacter<T> 泛型信封**: coreId + systemId + systemData<T> + hp/maxHp/inventory

**IRulesEngine 扩展角色创建**: 每个规则系统定义自己的创建步骤、验证逻辑、角色构建
- **getCreationFlow()**: 返回 CreationFlowDef（步骤列表，每步含 renderer 类型提示）
- **validateCreationStep()**: 委托验证，替代 CharacterCreator 中的硬编码 switch
- **buildCharacter()**: 从 CharacterCore + 创建数据构建 SystemCharacter
- **6 种渲染器类型**: select-one / multi-select / attribute-allocate / text-input / resource-preview / connection-list

**Per-Session AIGameMaster**: AIGameMasterPool 替代单一 aiGM 实例
- **为什么按 session 而非按 system**: AI 对话历史是 session 级别的，同一系统不同房间的 AI 语境完全不同
- **懒创建**: 仅在首次需要时创建，避免启动时为所有 session 预分配
- **Hot-reload**: AI 配置变更时 clear pool，下次访问自动用新配置重建

**Session 绑定 systemId**: 每个房间记录规则系统
- **默认 'daggerheart'**: 所有现有会话无感知，向后兼容
- **session:create 新增 systemId 参数**: 前端创建房间时可选规则系统
- **API 端点**: GET /api/data/creation-flow?systemId=... 和 GET /api/data/systems

### 完成内容

**Phase 1 — 类型系统**:
- shared/types/base.ts: 新增 CharacterCore, SystemCharacter<T>, CreationStepDef, CreationFlowDef, CreationStepRenderer
- shared/types/character.ts: Character 重命名为 DaggerheartCharacter + 类型别名 `export type Character = DaggerheartCharacter`
- shared/types/daggerheart.ts: 新文件，DaggerheartCharData 独立数据结构
- shared/types/events.ts: SessionState 新增 systemId 字段

**Phase 2 — IRulesEngine 扩展**:
- server/src/rules/IRulesEngine.ts: 新增 getCreationFlow/validateCreationStep/buildCharacter
- server/src/rules/systems/DaggerHeartRules.ts: 实现三个新方法，9 步 DH 创建流程定义
- server/src/core/CharacterCreator.ts: 重构为委托模式，接受 IRulesEngine 参数，保留旧 API 向后兼容

**Phase 3 — Session + AIGameMaster**:
- server/src/ai/AIGameMasterPool.ts: 新文件，Map<sessionId, AIGameMaster> 池化管理
- server/src/network/SocketServer.ts: aiGM → gmPool，所有调用点通过 getOrCreate(sessionId, systemId) 获取
- server/src/index.ts: 使用 AIGameMasterPool，reinitializeAI 重建 pool
- server/src/routes/data.ts: 新增 /api/data/creation-flow 和 /api/data/systems 端点
- server/src/ai/IPromptProvider.ts: 新增 buildStateSummary 可选方法

**Phase 4 — 前端泛化**:
- app/src/store/characterCreateStore.ts: DH 特有字段 → 通用 data: Record<string, unknown> 数据包 + systemId/coreId/steps/loading
- app/src/store/gameStore.ts: 新增 characterCores/addCharacterCore/updateCharacterCore/getCharacterCore
- app/src/screens/CharacterCreateScreen.tsx: 从服务器获取 CreationFlowDef，步骤渲染器注册表驱动

**Phase 5 — 通用步骤组件**:
- app/src/components/creation/: 8 个文件（6 组件 + props 接口 + index）
- SelectOneStep, MultiSelectStep, AttributeAllocateStep, TextInputStep, ResourcePreviewStep, ConnectionListStep

### 已知问题

- **DaggerheartCharData 未被实际消费**: buildCharacter() 返回 SystemCharacter，但现有代码仍用 DaggerheartCharacter。需要后续将 DH 角色数据切换到 SystemCharacter 体系
- **跨规则加入房间的 UX 流程未实现**: session:needsCharacterCreation 事件和自动导航到创建界面还需前端 hook 层面的支持
- **HomeScreen 规则系统选择器未添加**: 创建房间时选择规则系统的 UI 尚未实现
- **buildStateSummary 未提取到 DaggerheartPromptProvider**: IPromptProvider 接口已加可选方法但 DH 实现尚未迁移

---
---

## Phase 12: P1 体验修复 & P2 可扩展性三层抽象 (2026-06-27)

**基于**: 产品边界审查后续修复——P1 体验可用（聚光灯让出、首屏简化）+ P2 可扩展性（泛化类型、可配置 prompt、动态数据）

### 架构决策

**聚光灯让出**: 服务器新增 `spotlight:pass` socket 事件，调用 SpotlightManager.pass()
- **为什么不一键自动让出**: 聚光灯持有者可能需要选择让给谁（多人队列中），保留 targetPlayerId 可选参数

**首屏简化策略**: 渐进式引导而非强制约束
- **预设服务器地址**: 提供本机/局域网两个快捷标签，而非自动发现——自动发现需要网络权限和复杂逻辑，对 MVP 过重
- **AI 配置向导**: 4 步引导（选提供商→输 Key→选模型→测试连接），而非一次性展示所有配置项
- **首次使用引导卡片**: 仅在无角色且无房间时显示，有数据后自动消失
- **为什么不用全屏 Onboarding**: TRPG 用户群体偏好快速进入，强制教程会劝退有经验的玩家

**泛化类型系统**: 提取 `GameCharacter`/`DiceRollResult`/`GameCampaignState` 到 `shared/types/base.ts`
- **取舍**: Character extends GameCharacter 但保留 inventory 类型细化（`InventoryItem[]` vs `unknown[]`），因为类型安全比完全泛化更重要
- **CampaignState.campaignId 从字面量 'drakkenheim' 改为 string**: 这是一个破坏性类型变更，但项目尚无外部消费者，且可扩展性需要此改动
- **为什么不用泛型 Character<T>**: 泛型参数传播会让所有消费方都需要类型参数，增加复杂度；extends 模式更简单

**可配置 AI Prompt**: 提取 `PromptProviderConfig` 接口，将硬编码文本移至 `DaggerheartPromptProvider`
- **为什么将 provider 注册到 RulesEngineFactory 而非独立 registry**: 规则引擎和 prompt 是 1:1 绑定的，放在一起查找更方便
- **为什么 buildSystemPrompt 结构不变只替换内容**: prompt 的模板逻辑（多人模式追加、安全边界追加）是通用的，只有文本内容是系统专有的

**动态数据加载**: 提取 `IDataProvider` 接口 + `DataProviderRegistry`
- **为什么用惰性 Map 缓存敌人查找**: enemies.json 有 50+ 条目，按 ID/Name 查找从 O(n) 降到 O(1)
- **为什么不一次性迁移所有数据引用方**: CharacterCreator 和 CharacterLevelUp 直接 import daggerheartData，改动风险大；先迁移 routes/SocketServer/extractGmEffects 三个高频引用，其余后续渐进迁移

### 完成内容

1. **聚光灯让出** (P1-3): SocketServer 新增 `spotlight:pass` handler；useSocket 新增 `passSpotlight()` 函数；SpotlightIndicator 添加"让出聚光灯"按钮
2. **首屏简化** (P1-4): HomeScreen 服务器地址预设标签 + 首次使用引导卡片（创建角色→配置AI→开始冒险）；SettingsScreen AI 配置向导（SiliconFlow/DeepSeek/OpenAI/Ollama/自定义）
3. **泛化类型系统** (P2-2): 新增 `shared/types/base.ts`（GameCharacter/DiceRollResult/BaseRollOutcome/GameCampaignState）；Character extends GameCharacter；CampaignState extends GameCampaignState；CampaignState.campaignId 从字面量改为 string
4. **可配置 AI prompt** (P2-3): 新增 `IPromptProvider.ts`（PromptProviderConfig/NarrativeMode 接口）；新增 `DaggerheartPromptProvider.ts`（提取所有硬编码文本）；AIGameMaster.buildSystemPrompt 使用 provider；RulesEngineFactory 注册 prompt provider
5. **动态数据加载** (P2-4): 新增 `IDataProvider.ts`（GameDataCollection/IDataProvider 接口）；新增 `DaggerheartDataProvider.ts`（惰性 Map 缓存）；新增 `DataProviderRegistry.ts`；routes/data.ts、SocketServer.ts、extractGmEffects.ts 迁移到 registry

### 踩坑与修复

- **P1-4 子 agent 添加样式未完成导致编译失败**: HomeScreen.tsx 引用了 `presetRow`/`presetChip`/`presetChipText` 样式但未定义。手动补齐样式定义
- **P1-4 子 agent 添加样式后主会话重复添加导致重复属性错误**: 修复时未检查子 agent 已完成的工作，导致同一样式定义出现两次。删除重复定义

### 添加新规则系统的路径（现在可行）

要添加 CoC（克苏鲁的呼唤），需要：
1. 实现 `IRulesEngine` → `CoCRules`（百分位骰、理智、技能制）
2. 实现 `IDataProvider` → `CoCDataProvider`（职业/技能/法术数据）
3. 创建 `CoCPromptProvider`（克苏鲁/1920年代设定 prompt）
4. 三个 `register` 调用注册到对应 Factory/Registry
5. `shared/types/` 中 CoC 专有类型扩展 `GameCharacter`

---

## Phase 11: IRulesEngine 接口抽象 & DaggerHeartRules 类重构 (2026-06-27)

**基于**: 产品愿景从 Daggerheart-only 转向多规则系统平台，需要为 CoC（百分位骰/理智/技能制）和 D&D 5e（d20/AC/法术位）预留扩展点

### 架构决策

**IRulesEngine 接口设计**: 提取通用规则引擎接口，覆盖骰子检定、角色验证、伤害结算、休息、死亡行动、升级、状态管理、抗性/免疫、阈值计算
- **取舍**: 接口不过度统一为 lowest-common-denominator——保留各系统的特有返回结构（如 DamageResult.severity 是可选的，CoC 不需要），消费方通过 systemId 判断后窄化类型
- **为什么不用抽象类**: 抽象类强制继承层级，而不同规则系统（Daggerheart 的二元骰 vs D&D 5e 的 d20）结构差异太大，接口+组合更灵活
- **为什么保留向后兼容导出函数**: 6 个文件直接 import DaggerHeartRules 的纯函数，一次性改所有引用方风险太大；转发导出让旧代码零改动继续工作

**DaggerHeartRules 类实现**: 将 1111 行纯函数模块转为 `class DaggerHeartRules implements IRulesEngine`，同时保留所有 `export function` 作为对单例的转发
- **为什么用单例而非静态方法**: 单例可以被 RulesEngineFactory 注册和分发，静态方法无法实现多态
- **为什么内部方法带 Internal 后缀**: `calculateThresholds` / `addCondition` / `tickConditions` / `applyResistance` 在接口和旧导出函数中同名但签名不同，加后缀避免歧义

**RulesEngineFactory**: 简单 Map 注册表 + get/register/list/has 四个函数
- **为什么不用 DI 容器**: 项目当前规模不需要，Map 足够；未来如果加 CoC/D&D 5e 只需 `registerRulesEngine(new CoCRules())`

### 完成内容

1. **IRulesEngine 接口** (`server/src/rules/IRulesEngine.ts`): 定义 systemId/systemName/maxLevel + rollCheck/validateCharacter/resolveDamage/applyDamage/getAttackDifficulty/executeRest/handleDeath/getDeathMoveTypes/getLevelUpOptions/applyLevelUp/addCondition/removeCondition/tickConditions/applyResistance/calculateThresholds
2. **DaggerHeartRules 类** (`server/src/rules/systems/DaggerHeartRules.ts`): 实现 IRulesEngine，所有原纯函数转为类方法，文件末尾导出 `daggerHeartRules` 单例 + 向后兼容转发函数
3. **RulesEngineFactory** (`server/src/rules/RulesEngineFactory.ts`): 默认注册 daggerheart 引擎，提供 getRulesEngine/registerRulesEngine/listRulesSystems/hasRulesEngine

### 踩坑与修复

- **接口方法名冲突**: `addCondition`/`removeCondition`/`tickConditions`/`applyResistance`/`calculateThresholds` 在 IRulesEngine 接口和旧 DaggerHeartRules 导出中有不同签名（接口用通用参数，旧函数用具体参数）。解决方案：类内部用 `addConditionInternal` 等命名，接口方法做适配，旧导出函数转发到内部方法
- **executeRest 返回类型差异**: IRulesEngine.executeRest 返回 `RestResult`，旧 `executeRest` 返回 `RestResult & { newShortRestCount }`。解决方案：类内部用 `executeRestInternal` 返回完整类型，接口方法剥离 `newShortRestCount`

### 已知问题

- CharacterLevelUp 仍直接使用 DaggerHeartRules 纯函数而非通过 IRulesEngine 接口——后续 P2 任务逐步迁移
- IRulesEngine.applyLevelUp 当前是简化 stub，完整逻辑在 CharacterLevelUp 类中——需要将 CharacterLevelUp 重构为接受 IRulesEngine 参数

---

## Phase 10: 产品边界审查 & P0/P1 修复 (2026-06-27)

**基于**: 产品经理视角审查，识别出 P0（大厅未接通、无 OOC 聊天）和 P1（战斗弹回、无掷骰可视化、效果提取静默失败）缺陷

### 架构决策

**SessionLobbyScreen 导航修复**: 修改 SessionJoinScreen 中创建/加入房间后的导航目标从 `Main` 改为 `SessionLobby`
- **取舍**: 重新加入历史房间时仍直接导航到 `Main`，因为游戏可能已在进行中，不需要再经过大厅
- **为什么之前跳过了大厅**: 初始开发时聚焦单人模式，多人流程未走通

**OOC 聊天采用 overlay 模式而非新 Screen**: 在 AdventureScreen 底部弹出聊天面板
- **取舍**: 不创建独立 ChatScreen，因为聊天是辅助功能不应打断游戏流程
- **为什么复用 chat:message 事件**: 服务器端已有完整的 `chat:message` 处理和广播机制，客户端只需 emit/listen + UI

**extractGmEffects 失败可见化**: 在 `gm:narrate:end` payload 中添加 `effectsEmpty` 标志
- **取舍**: 不做自动重试（已有一次重试），而是通知玩家手动调整。原因：效果提取失败的根因是 AI 模型未输出可解析内容，重试更多次也不会改善
- **为什么不用独立事件**: 复用 `gm:narrate:end` 避免新增 socket 事件类型，减少前后端协议变更

### 完成内容

1. **SessionLobbyScreen 接通** (P0-1): SessionJoinScreen 创建/加入房间后导航到大厅；大厅监听 `session:started` 和 `session:sessionZeroStarted` 事件自动导航到 Main；route.params 与 store 双重数据源防止热重载丢失
2. **OOC 聊天 UI** (P0-2): gameStore 新增 `oocMessages` + `addOocMessage`；useSocket 新增 `sendChatMessage` + `chat:message` 监听；AdventureScreen 快捷操作栏添加聊天按钮 + 底部聊天面板 overlay
3. **战斗非攻击行动弹回修复** (P1-1): CombatScreen `handleOtherAction` 移除 `navigation.goBack()`；`handleEndCombat` 移除手动 goBack，改由 `combatState` 变 null 时 useEffect 自动导航
4. **战斗掷骰可视化** (P1-2): CombatScreen 读取 `pendingDiceResult`，在底部显示骰子结果横幅（与 AdventureScreen 一致）
5. **效果提取失败提示** (P1-3): 服务器 `runNarration` 中跟踪 `effectsEmpty` 标志，通过 `gm:narrate:end` payload 传递；客户端收到后显示系统警告消息

### 踩坑与修复

- **多人模式 session:start 触发 Session Zero 而非 session:started**: 审查代码发现多人模式下 `session:start` 会广播 `session:sessionZeroStarted`，不是 `session:started`。修复：SessionLobbyScreen 同时监听两个事件
- **theme 中无 `border`/`bgDark` 属性**: 初次使用 theme token 时误用不存在的属性名。实际可用：`fog`（边框色）、`bgInput`（输入背景色）
- **useSocket.ts 编辑导致 submitS0 函数闭合被破坏**: 在插入 `sendChatMessage` 时意外截断了 `submitS0` 的闭合括号和分号。修复：重写完整的两个函数

### 状态追踪审查修正

旧测试报告称"HP全程不变"，但代码审查确认当前 extractGmEffects → applyGmEffect → StateManager 链路完整。旧测试的根因可能是：
1. AI 提取调用静默失败（被 try/catch 吞掉）
2. Daggerheart 伤害阈值系统中低伤害被 minor threshold 吸收（规则正确行为）

---

## Phase 9: 24 Bug 依赖顺序修复 (2026-06-27)

**基于**: 6/27 审查报告（5 严重 Bug + 11 前后端未打通 + 4 中等 + 4 低优先级）

### 架构决策

**修复顺序按依赖关系排列**: 先修 StateManager 双路径同步（根因），后修各上层 Bug，确保不重复修改同一处代码。
- **取舍**: 选择在 backward-compat 方法中添加 `syncBackwardCompat()` 而非重构所有调用方为 `updatePlayerCharacter()`，因为改动范围小、风险低、自动修复 Bug 1.3

### 完成内容

1. **StateManager 双路径同步** (Bug 3.1→1.3): 新增 `syncBackwardCompat()` 私有方法，8 个 backward-compat 方法末尾调用，自动同步到 `players[0].character` 和 `characters[0]`
2. **S0 阶段推进** (Bug 1.4): 移除 `currentPhase !== 'safety'` 条件，允许所有阶段推进
3. **战斗回合递增** (Bug 1.5): 新增 `incrementCombatRound()` 方法，`runNarration` 中调用
4. **Rest 机械效果** (Bug 1.2): `player:rest` handler 中调用 `executeRest()` 并应用恢复结果
5. **CharacterScreen 同步** (Bug 1.1): 新增 `character:resourceUpdate` 事件，+/- 按钮同步到服务器
6. **双重消息** (Bug 2.11): 删除 `sendActionRoll`/`sendUseFeature` 中的客户端预添加消息
7. **choiceId 保留** (Bug 2.10): `handlePlayerChoice` 中保留 choiceId 传入 AI 上下文
8. **角色切换 AI 上下文** (Bug 2.8): `handleCharacterSwitch` 后添加系统消息记录
9. **搜索拾取通知** (Bug 2.9): `handleSceneSearch` 后添加系统消息通知
10. **独立掷骰叙事** (Bug 2.1): `dice:roll` handler 中独立掷骰后触发 AI 叙事
11. **遗留战斗动作** (Bug 2.2): `combat:action` 中 defend 恢复护甲槽
12. **deathMove 处理器** (Bug 2.3): 新增 `player:deathMove` handler
13. **swapDomainCard 处理器** (Bug 2.4): 新增 `player:swapDomainCard` handler
14. **Drakkenheim 处理器** (Bug 2.5): 新增 contamination/hazeEffect/deleriumFound/sealFound handler
15. **升级 Socket 连接** (Bug 2.6): 新增 `campaign:levelUp` handler + 客户端 `sendLevelUp`
16. **日记设计标注** (Bug 2.7): 标注为客户端派生数据的设计决策
17. **extractGmEffects 增强** (Bug 3.2, 3.3, 4.3): 新增 healPlayer/hopeToPlayer/stressRelief/setSceneName 类型 + applyGmEffect case
18. **战斗自动结束** (Bug 3.4): runNarration 中检查敌人全灭自动结束战斗
19. **AI 热重载通知** (Bug 4.1): `setAIGM` 中通知客户端 + 客户端监听
20. **断线重连反馈** (Bug 4.2): disconnect handler 中添加重连系统消息
21. **叙事取消** (Bug 4.4): 新增 `gm:cancelNarration` handler + 客户端函数 + 取消按钮

### 踩坑与修复

- **shared 包需先 build**: 修改 `shared/types/combat.ts` 后必须 `npm run build` 重新生成 dist，否则 server tsc 读到旧的 .d.ts 报类型不兼容错误

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

### 5.5 主题化完成细节 (跨会话补充, 2026-06-23)

**AdventureScreen 全面主题化**:
- 所有硬编码颜色（`#1a1a2e`、`#16213e`、`#ecf0f1`、`#7f8c8d`、`#e67e22` 等 20+ 处）替换为 `theme.color.*` 引用
- 所有文本样式添加 `fontFamily: theme.font.display/body`
- 流式叙事渲染改用 `NarrativeCard` 组件（替换内联 streamingCard + Animated.Text）
- 清理未使用的 `Animated` import、`cursorOpacity` ref、cursor 动画 effect
- 删除 12 个废弃样式（6 个 spotlight 内联 + 6 个 X-Card 内联），已被组件替代
- 验证：零硬编码 hex 颜色残留

**GitHub 集成**:
- 首次推送至 GitHub: `ri995410-art/TRPGMaster`
- 创建 PR #1: `feat: Stage 5 — streaming, spotlight, session store, safety tools, UI theme`
- PR 已合并（base: stage5 → head: master）
- **踩坑**: `gh` CLI 未安装，通过 git remote URL 内嵌 token + curl GitHub API 完成操作
- **建议**: 安装 gh CLI 后运行 `gh auth login`，后续无需手动给 token

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

## Phase 9: 第二轮测试 7 项修复 + 3 项用户反馈改进 (2026-06-25 ~ 06-27, 未提交)

**状态**: 工作完成，19 files changed, +1780/-94 lines

### 背景

Phase 8 完成后用户进行第二轮完整游戏测试，发现 7 个问题：
1. 多人每次都要新建房间，看不到历史会话
2. 硬编码难度 15 导致许多检定不可能成功
3. 战斗从未触发，即使与敌人激烈交战
4. 看不到骰子结果（希望骰/恐惧骰数值）
5. 场景搜索给通用战利品，叙事中提到的物品无法获取
6. 结束冒险按钮仍不工作
7. 冒险日志始终为空

### 7 项修复

**Fix 1: 会话重入** — `handleJoin` 优先查找 `findByPlayerId`，有历史会话则重入而非新建

**Fix 2: 动态难度评估** — 移除客户端难度选择 UI，改为 AI 静默评估
- 新增 `setDifficulty` GmEffect 类型，AI 从叙事中提取场景难度
- `StateManager.setSceneDifficulty()` / `getSceneDifficulty()` (默认 15)
- `handleActionRoll` 和 `handleUseFeature` 均使用 `stateManager.getSceneDifficulty()` 替代硬编码 15
- 前端发送 `difficulty: 0`，由服务端覆盖

**Fix 3: 战斗触发** — 三层机制
- 第一层: `extractGmEffects` 提示词改进 — 更积极地检测战斗信号，要求"敌对行动必须标记 startCombat + addEnemy"
- 第二层: 传入 `playerInput` 参数给提取器，让 AI 看到玩家行动上下文
- 第三层: `playerInputSuggestsCombat` 关键词回退 — 检测即时攻击意图，创建通用敌人

**Fix 4: 骰子结果可见** — 在 `handleActionRoll`、`handleUseFeature`、`handleAttack` 中新增 `dice:roll` 事件发送
- 客户端 `pendingDiceResult` banner 改进: 颜色编码的希望骰/恐惧骰 + 希望/恐惧增益显示

**Fix 5: 场景搜索语境化** — `handleSceneSearch` 先触发 AI 叙事，后补充随机战利品
- 新增 `addItem` GmEffect 类型，AI 可从叙事中声明玩家找到的物品
- `applyGmEffect` 新增 addItem case: 调用 `addInventoryItem` / `addGold`

**Fix 6: 结束冒险** — 移除 `!aiProcessing` 守卫，按钮始终可点击
- 客户端 15 秒安全超时回退

**Fix 7: 日志自动填充** — 新增 `extractJournalEntries()` 从 GM 叙事中解析日志
- 匹配 NPC 遭遇、任务进展、发现、派系、重大事件
- 在 `gm:narrate:end` 处理器中自动调用

### 3 项用户反馈改进

**改进 1: 场景搜索冷却** — 30 秒冷却防止资源膨胀
- `searchCooldownBySession` Map 追踪每次搜索时间
- 冷却期内返回提示消息，不触发 AI 叙事

**改进 2: 流式冒险总结** — 替代一次性等待 AI 生成总结
- 服务端先发 `adventure:ending` 事件，客户端立即显示总结弹窗 + "返回大厅"按钮
- 总结文本通过 `sendStreamRequest` → `gm:narrate:delta` 流式传输，实时显示
- 流式完成后发 `adventure:summary` 做最终持久化
- Store 新增 `isAdventureEnding`、`streamingSummaryText` 状态管理流式过程
- `gm:narrate:delta` 处理器增加对 `isAdventureEnding` 的判断，同时追加到流式总结

**改进 3: 战斗检测准确性** — 重写 `playerInputSuggestsCombat`，解决误触发问题
- **问题**: 用户指出"我朋友十年前被攻击了""我梦里攻击了仇敌"等过去/虚拟语境会误触发战斗
- **解决方案**: 三层防护替代简单关键词匹配
  1. 非战斗语境黑名单: 以前/曾经/梦里/听说/远处/故事等标记直接排除
  2. 即时动作模式匹配: 只匹配第一人称现在时声明（`^我(?:要|想|准备)?(?:攻击|砍|刺|射|挥|斩|劈|击|施法|射击)`），锚定句首
  3. AI 提取重试: `extractGmEffects` 增加重试逻辑，第一次返回空但叙事有战斗信号时自动重试一次
- **`narrationHasCombatSignals`**: 辅助启发式函数，检测叙事中的战斗信号（攻击动作/战斗词汇/伤害描述），用于判断是否需要重试 AI 提取

### 关键文件变更

| 文件 | 变更 |
|------|------|
| `server/src/ai/extractGmEffects.ts` | 重写提示词、新增 playerInput 参数、addItem 类型、重试逻辑、playerInputSuggestsCombat 三层防护、extractEnemyNameFromNarration |
| `server/src/network/SocketServer.ts` | handleActionRoll/handleUseFeature/handleAttack 发送 dice:roll、handleSceneSearch 冷却+语境化、handleAdventureEnd 流式总结、applyGmEffect addItem case、关键词回退改用 extractEnemyNameFromNarration |
| `server/src/core/StateManager.ts` | setSceneDifficulty / getSceneDifficulty |
| `shared/types/combat.ts` | GmEffect 新增 setDifficulty/addItem 及 itemName/itemDescription/itemCategory/goldCoins 字段 |
| `shared/types/events.ts` | SessionState 新增 sceneDifficulty |
| `app/src/screens/AdventureScreen.tsx` | 移除难度选择 UI、骰子结果 banner 改进、结束冒险按钮守卫移除、流式总结 modal |
| `app/src/hooks/useSocket.ts` | adventure:ending 处理器、gm:narrate:delta 追加流式总结、extractJournalEntries、adventureSummary 流程重构 |
| `app/src/store/gameStore.ts` | isAdventureEnding / streamingSummaryText / appendStreamingSummary / finalizeStreamingSummary |

### 模拟测试：45 项集成测试 (2026-06-25)

**测试文件**: `server/src/__tests__/integration/AdventureSimulation.test.ts`
**结果**: 45/45 通过，发现并修复 2 个真实 Bug

#### 测试覆盖的完整跑团循环

```
角色创建 → 探索(场景+检定) → 场景搜索(随机+叙事物品) → 战斗(敌人出现+攻击+受伤+护甲)
→ 领域卡使用(消耗+检定) → 休整(HP恢复+压力恢复+恐惧获得) → 解密(知识检定)
→ 战斗检测(8种语境) → 敌人名提取(4种句式) → 压力溢出 → 战利品 → 难度评估
→ 伤害严重度 → 日志记录 → 阈值计算
```

#### 战斗检测专项测试 (8/8 通过)

| 输入 | 预期 | 结果 | 原因 |
|------|------|------|------|
| "我攻击面前的哥布林" | ✅战斗 | ✅ | 第一人称现在时 |
| "我砍向那个骷髅" | ✅战斗 | ✅ | 第一人称+目标 |
| "十年前我被攻击了" | ❌不战斗 | ✅ | 过去时态排除 |
| "我梦里攻击了仇敌" | ❌不战斗 | ✅ | 梦境语境排除 |
| "远处传来战斗的声音" | ❌不战斗 | ✅ | 远处观察排除 |
| "我听说了关于战斗的故事" | ❌不战斗 | ✅ | 听说/故事排除 |
| "攻击" | ✅战斗 | ✅ | 句首直接攻击 |
| "我向哥布林发起攻击" | ✅战斗 | ✅ | 明确攻击声明 |

#### 模拟测试发现的 2 个 Bug

**Bug 1: `StateManager.getCharacter()` 返回引用而非深拷贝** — 严重度: 高
- 外部代码持有的"旧值"随状态更新而改变，导致状态比较失效
- 修复: 改为 `JSON.parse(JSON.stringify(this.state.character))`

**Bug 2: 日志 NPC 检测缺失** — 严重度: 中
- `extractJournalEntries` 仅通过 `npcName` 参数检测 NPC，叙事文本中出现"名叫马库斯的老人"时无法记录
- 修复: 新增内联 NPC 检测模式（"名叫/名为/自称"关键词）

#### 测试报告

完整报告保存在 `test-results/adventure-simulation-report.md`

---

## Phase 10: 存档选择 + 历史房间 + 数据完整性修复 + 默认模型切换 (2026-06-26 ~ 06-27)

**Commit**: `5cad67a` feat: save slot selection, past rooms, data integrity fixes, default model change
**变更规模**: 20+ files, +1.5k/-0.3k lines

### 背景

用户启动应用后发现三个问题：(1) 首页直接加载灰烬行者·凯尔而非钻石·格里西亚，无法选择角色；(2) 多人游戏只能创建新房间，看不到历史房间；(3) 默认 AI 模型仍为 nex-agi/Nex-N2-Pro 而非 DeepSeek-V4-Flash。深入分析后发现 6 个核心数据完整性问题。

### 数据持久化分析 — 6 项核心问题

| # | 问题 | 严重度 | 状态 |
|---|------|--------|------|
| 0.1 | 单文件 JSON 无原子写入，崩溃可致全量数据丢失 | 高 | ✅已修复 |
| 0.2 | AI 对话历史重启后是否恢复 | — | ✅确认非bug，已加预热 |
| 0.3 | 玩家-角色靠名称关联，改名/同名会错配 | 中 | ✅已修复 |
| 0.4 | hostPlayerId 未持久化，重启后丢失 | 中 | ✅已修复 |
| 0.5 | 前后端角色数据冲突 | 中 | ✅确认原则 |
| 0.6 | 单文件存所有会话 | 低 | ⏸暂不修复 |

### 架构决策

**0.1 原子写入**: write-to-tmp-then-rename 模式
- **取舍**: `renameSync` 在大多数 OS 上是原子操作，崩溃时最多丢失 tmp 文件而非损坏主文件
- **实现**: `SessionPersistence.saveSessionData` 先写 `.tmp` 再 `renameSync`

**0.3 characterId 关联**: 持久化玩家-角色映射增加 ID 字段
- **设计**: `PersistedSession.players` 增加 `characterId?: string`，恢复时优先 ID 匹配，回退名称匹配
- **取舍**: 向后兼容（旧数据无 characterId 时仍可用名称匹配）

**0.4 hostPlayerId 持久化**: 房主身份跨重启保留
- **设计**: `PersistedSession` 增加 `hostPlayerId?: string`，`SessionRegistry` 所有持久化方法注入该字段

**0.5 服务端权威原则**: 确立 server-authoritative 数据模型
- **原则**: 前端可乐观更新 UI，但服务端状态为准，每次 `game:state` 同步时覆盖本地
- **确认**: `updateCharacterFromServer` 已在 `game:state` 处理器中正确调用

**存档选择系统**: HomeScreen 重构为存档槽位列表
- **设计**: 每个角色显示为独立存档卡片，含"继续冒险"和"新冒险"两个入口
- **数据流**: `characters[]` + `characterSessionHistory` + `adventureMessagesBySession` → `getSaveSlots()` 派生
- **取舍**: 存档信息从多个数据源派生而非单独存储，避免数据冗余但增加计算

**历史房间系统**: SessionJoinScreen 新增历史房间区域
- **设计**: 挂载时 fetch `GET /api/sessions`，过滤当前玩家参与的房间
- **取舍**: 每次从服务器获取而非本地缓存，保证数据新鲜但依赖网络

**autoJoin 解耦**: `connectToServer` 增加 `autoJoin` 参数
- **原因**: 存档选择流程需要先连接服务器，用户选槽位后再 rejoin，而非连接时自动加入旧会话
- **设计**: `autoJoin=false` 时只建立 socket 连接，不发射 `session:join`/`session:rejoin`

### 新增内容

- `GET /api/sessions` 端点: 列出所有会话及玩家信息
- `session:rejoinById` Socket 事件: 按 sessionId 定向重新加入
- `rejoinSessionById()` / `joinDefaultSession()`: 前端 Socket 工具函数
- `characterSessionHistory` / `pastRooms` / `loadSaveSlot`: Store 新增状态和操作
- HomeScreen 存档槽位 UI: 角色卡片 + 继续冒险/新冒险按钮
- SessionJoinScreen 历史房间区域: 房间卡片 + 重新加入按钮
- `scripts/start.bat` + `scripts/stop.bat`: 一键启动/关闭脚本

### 踩坑与修复

1. **.env 覆盖代码默认值** — 修改了 `AIConfigService.ts` 和 `index.ts` 的默认模型为 DeepSeek-V4-Flash，但 `.env` 中 `AI_DEFAULT_MODEL=nex-agi/Nex-N2-Pro` 通过 `process.env` 优先级更高，实际运行仍用旧模型。修复: 更新 `.env` 文件
2. **session_data.json 残留旧角色** — 清理了前端角色数据但服务端 `session_data.json` 仍存灰烬行者·凯尔的会话，导致重连时自动加载旧角色。修复: 清空 `session_data.json`
3. **autoJoin=true 导致存档选择失效** — HomeScreen 的 `handleConnect` 使用默认 `autoJoin=true`，连接后自动发射 `session:join`/`session:rejoin`，用服务端旧状态覆盖本地选择。修复: 改为 `autoJoin: false`，新冒险时手动调用 `joinDefaultSession()`
4. **bat 脚本中文乱码** — Windows cmd 期望 ANSI/GBK 编码，`Write` 工具输出 UTF-8 导致乱码。修复: 用 Node.js 生成纯 ASCII 内容 + CRLF 换行
5. **Character 类型缺少 className/ancestryName** — HomeScreen 使用 `character.className` 但 shared 类型只有 `classId`/`ancestryId`。修复: 改用 `classId`/`ancestryId`

### 会话清理

- 删除 4 个非格里西亚的 session_history 文件
- 清空 `session_data.json` 为初始状态
- 仅保留钻石·格里西亚的持久化数据

---

## 已知问题与待解决

1. **[STATE] 标记系统失效** — 81 轮耐力测试确认 AI 模型几乎不输出 [STATE] 标记。extractGmEffects 已部分替代其功能，但 [STATE] 作为安全网保留
2. **120 条历史限制** — 81 轮未触发但 6 小时真实会话会超限。需要记忆压缩
3. **extractGmEffects 误标/漏标** — AI 提取战斗效果依赖模型理解，可能误判。已加入重试机制和关键词回退，但回退可能误触发（已大幅降低概率）
4. **playerInputSuggestsCombat 仍有局限** — 三层防护大幅减少误判，但极端复杂的中文语境可能仍有边界情况。长期方案应让 extractGmEffects 更可靠而非依赖关键词回退
5. **FileSessionStore 不支持分布式** — 当前文件存储方案仅适合单机/局域网场景
6. **场景搜索叙事优先但物品依赖 AI addItem** — 如果 AI 提取不产生 addItem 效果，玩家只能得到随机战利品
7. **StateManager.getCharacter() 深拷贝性能** — 每次调用 JSON.parse/stringify 有开销，高频调用场景（如 broadcastState 中多次读取）可能需要缓存或选择性深拷贝

---

## 架构演进时间线

| 阶段 | 日期 | 核心变化 | 代码量 |
|------|------|---------|--------|
| Phase 1-3 | 06-05~06 | 8-Agent 架构 + 规则引擎 + 角色创建 | ~8k 行 |
| Phase 4 | 06-21 | 废弃多 Agent → 单一 AI GM + 多人 + 持久化 | +18.5k/-3.7k |
| Phase 5 | 06-22 | 协作叙事 + [STATE] + Session Zero + 恐惧点 | +3k |
| Phase 6 | 06-23 | 流式叙事 + 聚光灯 + 安全工具 + UI 主题 + 清理 + 首次 GitHub 推送 | +6.7k/-20.4k |
| Phase 7 | 06-24 | 战斗系统 + 骰盘 + 战斗状态 + GitHub PR #1 合并 | +1.2k |
| Phase 8 | 06-25 | 战利品/物品/特性/冒险总结 | +2k |
| Phase 9 | 06-25~27 | 二轮测试 7 修复 + 搜索冷却 + 流式总结 + 战斗检测改进 | +1.8k |
| Phase 9.5 | 06-27 | 模拟测试 45 项 + 2 Bug 修复 (getCharacter引用 + NPC日志) | +0.5k |
| Phase 10 | 06-26~27 | 存档选择 + 历史房间 + 6项数据完整性修复 + 默认模型切换 | +1.5k |
| Phase 11 | 06-27 | 9 项玩家体验问题全面实现 (6 Sprint: 掷骰重做/session隔离/重置战役/结束冒险/战斗敌人/特性UI/物品战利品) | +3k |

---

## Phase 11: 9 项玩家体验问题全面实现 (2026-06-27, 未提交)

**状态**: 工作完成，跨 6 个 Sprint 实现 9 项玩家体验问题

### 背景

前端接通后玩家手动测试发现 9 个核心体验问题，根本矛盾是：前端只有自由文本输入通道，所有结构化游戏机制（掷骰、能力、战斗、物品）都缺乏 UI 入口和后端联动。玩家只能口述一切，后台无法处理数据。

9 项问题：
1. 掷骰无上下文、难度调整粗
2. 新角色仍显示旧对话（无 session 隔离）
3. 重置战役按钮无效
4. 缺少"结束冒险"按钮 + AI 总结
5. 战斗不触发、无法手动添加敌人
6. 领域卡/职业特性/种族特性无 UI
7. 针对敌人的能力需后端结算
8. 场景角色/敌人信息缺失
9. 物品界面 + 战后战利品 + 场景搜索

### Sprint 1: 基础修复（问题 2 + 3）

**问题 2: 按 session 隔离冒险消息**
- `adventureMessages: AdventureMessage[]` → `adventureMessagesBySession: Record<string, AdventureMessage[]>`
- 新增 `useCurrentAdventureMessages()` selector hook，从 `adventureMessagesBySession[campaignId]` 派生
- `addAdventureMessage` / `setAdventureMessages` / `clearAdventureMessages` 均按 campaignId 写入
- `partialize` 持久化 `adventureMessagesBySession`，每个 session 只保留最近 100 条
- 迁移逻辑：hydration 时发现旧格式 `adventureMessages` 数组，自动迁移到 `adventureMessagesBySession[currentCampaignId]`
- **踩坑**: Zustand `merge` 函数类型推断错误 — 显式类型标注 `Record<string, unknown>` 导致 zustand 推断为 `Partial<GameStore>`，所有 action 签名断裂。修复：移除显式标注，用 `as unknown as Record<string, unknown>` 转型

**问题 3: 重置战役**
- 后端新增 `campaign:reset` 处理器：删除旧 session → 创建全新空 session → 广播新状态
- 前端 `sendCampaignReset()` → emit `campaign:reset`
- SettingsScreen `handleResetCampaign` 改为先 `sendCampaignReset()` 再 `store.reset()`

### Sprint 2: 掷骰重做（问题 1）

**核心思路**: "先掷骰后打字" → "打字+选属性+行动"，骰子作为行动的一部分由后端掷

**新增类型**:
- `RollDeclaration`: action + attribute + difficulty + advantage/disadvantage + domainCardId + featureId/featureType
- `RollResolution`: outcome + success + isCritical + hopeDie + fearDie + total + difficulty + modifier + hopeGain + fearGain + narrationHint

**后端**:
- `combatResolver.resolveAbilityCheck(character, decl)`: 掷二元骰 + 属性 modifier vs difficulty → RollResolution
- `action:roll` 处理器: 调 resolveAbilityCheck → 应用 hope/fear → runNarration

**前端**:
- AdventureScreen 输入框下方加属性选择行（6 个属性小按钮：敏捷/力量/灵巧/本能/风度/知识）
- 难度选择器（10/15/20）在属性选中时显示
- `handleSend` 判断：有属性 → `sendActionRoll`，无属性 → `sendPlayerAction`
- 发送按钮图标在属性选中时变为骰子

### Sprint 3: 战斗与敌人（问题 5 + 8）

**问题 5: 战斗触发 + 手动添加敌人**
- StateManager 新增 `addCombatEnemy(enemy)`: combat 存在则追加，不存在则自动 startCombat
- GmEffect 扩展: `addEnemy | startCombat | endCombat` + `enemyStatBlockId` + `enemyName`
- extractGmEffects: validTypes 和 system prompt 加入新类型
- SocketServer `applyGmEffect` 新增 addEnemy/startCombat/endCombat case
- 新增 `combat:addEnemy` 处理器: 从 enemies.json 加载 stat block → addCombatEnemy
- 前端 CombatScreen: "添加敌人"按钮 → modal 列出敌人目录（从 `/api/data/enemies` 拉取）→ 点击添加

**问题 8: 场景角色提取**
- 新增 `SceneCharacter` 类型 (id, name, type: 'enemy'|'npc'|'ally', statBlockId, description)
- 后端 `loadEnemyFromStatBlock()` helper: 从 enemies.json 导入 enemyData，按 statBlockId 查找

### Sprint 4: 能力与特性（问题 6 + 7）

**问题 6: 特性 UI**
- Character 类型新增 `featureUses: Record<string, number>` — 特性使用次数追踪
- StateManager 新增 `useFeature(featureId)` / `resetFeatureUses(restType)`
- 后端 `action:useFeature` 处理器: 校验特性 → 扣 hope/stress 成本 → 递减 featureUses → runNarration
- 新增 FeatureTray 组件: 水平可滚动条，展示领域卡/职业特性/种族特性/社群特性
  - 每项显示名称 + 成本图标 + 使用状态
  - 选中后显示"使用"按钮，调用 `sendUseFeature()`
  - **踩坑**: Ionicons `getTypeIcon` 返回 `string` 但组件要求字面量类型。修复：返回类型改为 `React.ComponentProps<typeof Ionicons>['name']`

**问题 7: 对敌能力结算**
- combatResolver 新增 `resolveAbilityOnEnemy` (与 resolveAbilityCheck 类似但含 stressToTarget/conditionsApplied)
- combatApply 新增 `applyAbilityOnEnemy` — 写入 enemy HP/stress/conditions
- CombatScreen: FeatureTray 选中特性 → 进入选目标模式 → 点敌人 → 发 `action:useFeature {featureId, targetId}`

### Sprint 5: 物品与战利品（问题 9）

**物品界面**:
- 新增 InventoryScreen: 列出 character.inventory，分类 tab（消耗品/工具/宝藏/杂项）
- "探查场景"按钮 → `sendSceneSearch()`
- 金币显示 + 整合（10 coins → 1 handful）
- 战利品拾取 modal（物品列表 + "拾取全部"/"放弃"按钮）
- **踩坑**: `coin-outline` 不是有效 Ionicons 名称。修复：全局替换为 `cash-outline`

**战后战利品**:
- 新增 `lootResolver.ts`: `rollLootTable(difficulty, tier)` + `rollSceneSearchLoot()`
- 新增 `LootResult` 类型 (items + gold)
- `combat:end` 处理器: endCombat → rollLootTable → emit `loot:available`
- `loot:pickup` 处理器: 添加物品到 inventory + gold → 广播
- `scene:search` 处理器: rollSceneSearchLoot → auto-add to inventory → runNarration

**背包管理**:
- StateManager 新增 `addInventoryItem(item)` — 已有则叠加 quantity，否则新建
- StateManager 新增 `addGold(gold)` — 加金币 + 整合进位

### Sprint 6: 战役管理（问题 4）

**结束冒险**:
- 新增 `AdventureSummary` 类型 (sessionId, startedAt, endedAt, summary, milestones, locationsVisited)
- Character 新增 `adventureSummaries: AdventureSummary[]`
- AIGameMaster 新增 `generateAdventureSummary(context, messages)` — AI 生成第三人称小说式总结 + 里程碑
- `adventure:end` 处理器: 调 AI 生成总结 → 保存到 character → endSession → 广播
- AdventureScreen: "结束冒险"按钮 → 确认 → `sendAdventureEnd()`
- **踩坑**: `this.config.defaultModel` 不存在于 AIGMConfig。修复：改为 `this.config.gateway.defaultModel`

### 新增 Socket 事件汇总

| 事件 | 方向 | Payload | Sprint |
|------|------|---------|--------|
| `action:roll` | C→S | RollDeclaration | 2 |
| `campaign:reset` | C→S | {} | 1 |
| `combat:addEnemy` | C→S | {statBlockId, name?} | 3 |
| `combat:end` | C→S | {} | 5 |
| `action:useFeature` | C→S | {featureId, featureType, action, targetId?} | 4 |
| `loot:available` | S→C | LootResult | 5 |
| `loot:pickup` | C→S | {itemIds} | 5 |
| `scene:search` | C→S | {} | 5 |
| `adventure:end` | C→S | {} | 6 |
| `adventure:summary` | S→C | AdventureSummary | 6 |
| `campaign:resetDone` | S→C | {state} | 1 |

### 关键文件变更

| 文件 | 变更 |
|------|------|
| `shared/types/combat.ts` | 新增 RollDeclaration/RollResolution/SceneCharacter，扩展 GmEffect |
| `shared/types/character.ts` | 新增 featureUses/LootResult/AdventureSummary，Character 加字段 |
| `shared/types/events.ts` | 新增 SceneCharacter |
| `server/src/core/StateManager.ts` | addCombatEnemy, addInventoryItem, addGold |
| `server/src/network/SocketServer.ts` | 11 个新事件处理器 + 扩展 applyGmEffect + loadEnemyFromStatBlock |
| `server/src/rules/combatResolver.ts` | resolveAbilityCheck |
| `server/src/rules/lootResolver.ts` | 新文件: rollLootTable, rollSceneSearchLoot |
| `server/src/ai/AIGameMaster.ts` | generateAdventureSummary |
| `server/src/ai/extractGmEffects.ts` | 扩展 GmEffect 类型 + validTypes |
| `server/src/core/CharacterCreator.ts` | featureUses/adventureSummaries 初始化 |
| `app/src/store/gameStore.ts` | per-session messages, useCurrentAdventureMessages, pendingLoot |
| `app/src/hooks/useSocket.ts` | 新增 emit 函数 + 监听 |
| `app/src/screens/AdventureScreen.tsx` | 属性选择行 + FeatureTray + 结束冒险 |
| `app/src/screens/CombatScreen.tsx` | 添加敌人 + 结束战斗 + 敌人目录 modal |
| `app/src/screens/SettingsScreen.tsx` | 修复重置战役 |
| `app/src/components/FeatureTray.tsx` | 新组件 |
| `app/src/screens/InventoryScreen.tsx` | 新屏幕 |
| `app/src/navigation/AppNavigator.tsx` | 添加 Inventory 路由 |

### 与 Phase 8/9 的关系

本 Phase 与 Phase 8/9 存在大量重叠和互补：
- Phase 8 设计了 RollDeclaration/FeatureTray/InventoryScreen/LootResolver/AdventureSummary 的架构方案
- Phase 9 修复了动态难度、战斗触发、骰子可见、场景搜索、结束冒险、日志填充等运行时问题
- 本 Phase 将 Phase 8 的设计方案**完整实现**为可运行代码，并整合了 Phase 9 的修复（动态难度、AI 提取扩展、流式总结等）
- 三个 Phase 的代码现已合并，共同构成当前代码库的完整功能集

### 编译验证

三个包 `tsc --noEmit` 全部通过：shared ✅ server ✅ app ✅

---

## Phase 20: 全栈 Bug 大修 — 角色创建不可用的根因追踪与修复 (2026-07-05)

**起因**: 手动测试时发现角色创建流程完全卡死——连第一步都无法通过。这不是某个小 bug，而是前后端创建流程从设计到实现存在系统性脱节。

### 为什么角色创建会完全不可用

排查过程像剥洋葱：表面现象是"点下一步没反应"，但每一层都暴露出更深层的问题。

**第一层：UI 渲染了，但没有数据**

`useGameData` hook 负责从服务器拉取职业/武器/护甲等游戏数据，但这个 hook 只在 `gameData.loaded === false && serverUrl !== null` 时触发。如果用户先进入角色创建页再连接服务器（或 app 重启后 rehydration 时序问题），`loaded` 已经是 `true`（来自空初始值的误设）或 `serverUrl` 为 null，fetch 就永远不会发生。选择列表显示"数据将在连接服务器后加载"的占位文字——但用户已经连上了服务器。

**第二层：服务器返回的创建流程与客户端组件不兼容**

这是最致命的问题。服务器 `DaggerHeartRules.getCreationFlow()` 返回的步骤定义，与客户端组件期望的格式有三大断裂：

1. **`showSubclasses` 缺失** — `SelectOneStep` 组件通过 `config.showSubclasses` 判断是否渲染 `ClassSection`（含子职业选择）。服务器流程没有这个字段，组件降级到 `GenericSelectSection`（一个纯列表选择器），子职业选择完全消失。但客户端验证在 `CharacterCreateScreen.tsx:121` 强制检查 `subclassId`——用户被卡死在职业步骤，选了职业也过不去。

2. **`fields` 类型断裂** — 服务器返回 `fields: ['name', 'backstory', 'personalQuest']`（字符串数组），但 `TextInputStep` 组件将 `fields` 强制转换为 `TextFieldConfig[]`，期望每个元素有 `key`/`label`/`placeholder` 属性。字符串的 `.key` 是 `undefined`，导致三个输入框渲染出来但无法保存数据——`onChange(undefined, text)` 把值写到 `data[undefined]` 下。

3. **`dataKey` 不一致** — 客户端用 `'_resources'`/`'_equipment'`/`'_backstory'`（下划线前缀表示虚拟键），服务器用 `'resources'`/`'mainWeaponId'`/`'name'`。`EquipmentSection` 和 `TextInputStep` 内部用了正确的硬编码键名所以表面上能工作，但 `stepDef.dataKey` 不匹配意味着任何基于 step 定义读取数据的代码会拿错值。

**为什么客户端默认流程能工作？** 因为 `characterCreateStore.ts` 里的 `DEFAULT_DH_FLOW` 是手动编写的、包含了所有正确配置的硬编码流程。当服务器不可达时，客户端使用这个默认流程，一切正常。但一旦连上服务器，`fetch('/api/data/creation-flow')` 返回服务器流程并替换默认流程——所有问题同时暴露。

**根本原因**: 服务器流程定义和客户端默认流程是两套独立维护的配置，没有任何同步机制。客户端组件是围绕默认流程设计的，服务器流程只是"看起来差不多"却缺少关键细节。

**第三层：角色创建成功后，游戏系统看不到这个角色**

`StateManager.setCharacter()` 有一个条件分支：`if (this.state.players.length === 0)` 才同步 `characters[]`。注释写的是"If no players yet, this is single-player mode"。但实际情况是：用户在 HomeScreen 连接服务器时，`session:join` socket 事件就已经把玩家加入了 `state.players[]`。等用户完成角色创建调用 `PUT /api/character` 时，`players.length` 已经 > 0，`characters[]` 永远不更新。

更严重的是，所有 socket handler 通过 `getPlayerCharacter(playerId)` 读取 `state.players[].character`——而 `setCharacter()` 从不更新这个字段。所以角色虽然写入了 `state.character`（向后兼容字段），但游戏的主要数据路径根本找不到它。结果：AI GM 告诉用户"请先创建角色"。

**为什么原来的设计是这样？** `setCharacter()` 的设计假设了"单玩家时不走 socket，多玩家时用 `updatePlayerCharacter()`"的二分法。但 REST API 的 `PUT /api/character` 调用的是 `setCharacter()`，不是 `updatePlayerCharacter()`，因为 REST 路由没有 `playerId` 参数。这是一个 API 设计和状态管理设计之间的缝隙——REST 走了"单玩家捷径"，但实际使用场景是多玩家。

### 为什么 Hope 和 HP 值也是错的

客户端 `CharacterCreateScreen.tsx` 硬编码了 `hope: 6, maxHope: 6` 和 `hp: baseHp + 1`。服务器 `CharacterCreator.buildCharacterLegacy()` 设置 `hope: 2, maxHope: 6` 和 `hp: classData.baseHp`。

- **Hope**: 按 Daggerheart 规则，1 级角色起始 Hope = 2，不是 6。客户端的 `hope: 6` 可能是早期开发时对规则的误解（把 maxHope 当成了 hope）。
- **HP**: 客户端加 1 的原因不明——可能是想体现"1 级加成"，但 Daggerheart 的 `baseHp` 已经是 1 级 HP，不需要额外 +1。

这两个值客户端和服务器不一致，但因为 `PUT /api/character` 不校验（Bug 6），客户端发什么服务器就存什么，所以错误值会静默入库。

### 为什么领域卡规则也错了

服务器流程设置 `max: 5`（最多选 5 张领域卡），没有 `filterByClassDomains`。客户端默认流程设置 `max: 2, filterByClassDomains: true`。

按 Daggerheart 规则，1 级角色从其职业所属领域选择 2 张领域卡。服务器的 `max: 5` 可能是为了将来升级时预留空间，但 1 级创建时不应该允许选 5 张。`filterByClassDomains` 的缺失意味着玩家可以选任何领域的卡，违反了规则。

### 其他隐患的发现过程

修复过程中引入了 Gemini 的并行审查。Gemini 提出了三个隐患方向：

1. **StateManager 上帝对象** — 属实。38 个公开方法、10 个职责域。但 Gemini 说的"不规范点击导致全栈卡死"是夸大的。真正的问题是 `setCharacter()` 的条件分支逻辑错误，不是并发冲突。Node.js 单线程在无 `await` 时不会真正并行。

2. **状态追踪失效链** — Gemini 说 `extractGmEffects` 失败导致状态"冻结"。实际上 `extractGmEffects` 有 3 次重试 + try/catch，失败时返回空数组，不会冻结。真正的冻结风险是流式 AI 响应 `timeout: 0`（无超时）——如果 API 挂起，客户端 `aiProcessing=true` 会无限禁用所有输入。这是 Gemini 没有定位到的问题。

3. **Legacy/New 混杂** — 属实。`CharacterCreator.ts` 的 `CREATION_STEPS` 与 `IRulesEngine.getCreationFlow()` 从第 4 步开始 ID 不匹配，导致 9 步中有 5 步始终走 legacy 路径。但 Gemini 说的"敌人必定命中 bug"和"Zod 验证拒绝 legacy 数据"都不存在——实际情况恰好相反：敌人正常掷骰（反而是昏迷角色的 `autoHit` 条件未执行），角色创建完全没有 Zod schema。

### 修复策略

修复顺序严格按依赖链：

1. **先修服务器流程定义**（Bug 1/2/9）— 这是创建页面的"数据源"，必须先正确
2. **再修状态同步**（Bug 3）— 这是创建后的"数据通道"，确保角色数据可达
3. **然后修数据校验和规则**（Bug 4-7, 10）— 确保入库数据合法
4. **最后修类型安全和运行时保护**（Bug 11-26）— 提升健壮性

### 关键修复决策

| 决策 | 选择 | 为什么不选另一条路 |
|------|------|-------------------|
| `setCharacter()` 同步逻辑 | 移除 `players.length === 0` 条件，始终同步 | 不选"REST 改用 updatePlayerCharacter"——因为 REST 没有 playerId 参数，加了就要改 API 契约 |
| 服务器流程定义 | 对齐客户端 DEFAULT_DH_FLOW 的完整配置 | 不选"让客户端容错缺失字段"——因为字段语义不同（string[] vs TextFieldConfig[]）无法自动修复 |
| `buildCharacter()` 的 `experiences` 要求 | 移除必填，默认空数组 | 不选"添加 experiences 收集步骤"——因为当前创建流程设计中没有这一步，加步骤是功能扩展不是 bug 修复 |
| 客户端 `DiceResult.outcome` 类型 | 改为 `RollResultType` 联合类型 | 不选"保持 string"——string 会让未来服务端类型变更静默失同步 |
| 流式 AI 超时 | 设为 120s | 不选更短——AI 生成叙事确实需要时间，太短会误杀正常请求 |
| `acquireTurnLock` 返回值 | 未获锁时拒绝请求 | 不选"等待锁释放"——等待会延长用户感知延迟，拒绝让用户知道需要重试 |
| `characterCreateStore` 持久化 | 添加 persist 中间件 | 不选"不持久化"——导航离开再回来丢失创建进度是不可接受的 UX |

### 修改文件清单

| 文件 | Bug # | 核心变更 |
|------|-------|---------|
| `server/src/rules/systems/DaggerHeartRules.ts` | 1,2,7,9 | `getCreationFlow()` 对齐客户端：showSubclasses、TextFieldConfig[]、dataKey、max:2、filterByClassDomains |
| `server/src/core/StateManager.ts` | 3 | `setCharacter()` 移除 `players.length === 0` 条件，始终同步 characters[] 和 players[].character |
| `app/src/screens/CharacterCreateScreen.tsx` | 4,5,18 | `hope: 6→2`、`hp: baseHp+1→baseHp`、添加 offWeapon 构建 |
| `server/src/routes/character.ts` | 6 | `PUT /api/character` 添加 `validateCharacterSheet()` 校验 |
| `server/src/core/CharacterCreator.ts` | 10 | 移除 `!d.experiences` 必填条件 |
| `app/src/hooks/useSocket.ts` | 8,26 | `hasJoinedSession` 重置 + `isSendingAction` 防抖 |
| `shared/types/character.ts` | 11,21 | 删除 `import { getTier }` 死代码 + HP 损失映射提取常量 |
| `app/src/store/gameStore.ts` | 12,13 | `DiceResult.outcome: RollResultType` + `pendingReactionPrompt` 使用枚举类型 |
| `app/src/store/characterCreateStore.ts` | 14 | 添加 `persist` 中间件 + AsyncStorage |
| `app/src/screens/CharacterScreen.tsx` | 15 | `CompositeNavigationProp` 替代 `NativeStackNavigationProp` |
| `shared/types/base.ts` | 16 | 移除 `[key: string]: unknown` 索引签名 |
| `server/src/network/SocketServer.ts` | 17,24 | `character:switch` 改用 `setCharacter()` + `acquireTurnLock` 返回值检查 |
| `server/src/ai/AIGateway.ts` | 23 | 流式请求 `timeout: 0→120000` |
| `server/src/rules/combatResolver.ts` | 25 | 检查 unconscious/dying 条件时自动命中 |
| `app/src/screens/CharacterRosterScreen.tsx` | 19 | 详情按钮先 `setActiveCharacter()` 再导航 |
| `shared/types/rules.ts` | 20,21 | `AdvantageState.net` 改为普通属性 + `DAMAGE_SEVERITY_HP` 加 `as const` |
| `server/src/index.ts` | 22 | CORS 添加 PATCH/DELETE |

### 测试验证

- StateManager.test.ts: 31/31 ✅
- CharacterCreator.test.ts: 35/35 ✅
- DaggerHeartRules.test.ts: 136/136 ✅
- 全套服务器测试: 397/397 ✅（1 项 AIGameMaster prompt 格式测试已同步修复）
- shared 包 `tsc` 编译: ✅
- server `tsc --noEmit`: ✅

### 遗留与后续

- **StateManager 架构**: 38 方法/10 职责域的问题未在本轮修复——这是架构重构范畴，不是 bug 修复
- **CharacterCreator Legacy 清理**: `validateCurrentStepLegacy`/`buildCharacterLegacy` 仍作为回退路径存在，9 步中 5 步走 legacy——需要统一步骤 ID 映射
- **AdventureSimulation.test.ts**: `process.exit(1)` 问题未修复——这是测试基础设施问题，与业务逻辑无关
- **graphify 图更新**: 1701→1601 nodes, 2907→2776 edges, 169 communities——循环依赖 `import { getTier }` 已从图中消失
