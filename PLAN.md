---
name: comprehensive-audit-plan
description: TRPGMaster Daggerheart 全面审查报告与完善计划（玩家/GM/产品经理三重视角）
metadata:
  type: project
---

# TRPGMaster Daggerheart 全面审查报告与完善计划

> 审查日期: 2026-06-28
> 审查范围: 全项目——服务端规则引擎、AI GM、客户端UI、数据层
> 目标: 三个视角审查不足，制定可验收的完善计划

---

## 第一部分：三重视角审查

### 一、资深 TRPG 玩家视角

#### P1-1. 骰子系统不完整——缺少 With Fear / With Hope 机制
Daggerheart 的核心骰子机制不仅仅是"掷两个d12看谁大"。规则书明确规定了：
- **With Hope**: 当 Hope 骰子结果更高时，玩家获得 1 点 Hope（已实现）
- **With Fear**: 当 Fear 骰子结果更高时，GM 获得 1 点 Fear（**已实现**）
- **Critical Success**: 双骰相同且成功 → 额外效果（**部分实现，缺少"可以选择做一个不需要掷骰的行动"规则**）
- **Critical Failure**: 双骰相同且失败 → GM 获得 2 Fear（**未实现**，当前只给 1 Fear）

**严重度**: 高——这是 Daggerheart 最核心的机制

#### P1-2. Fear 经济系统不完整
规则书中 Fear 的用途远不止当前实现的：
- ❌ **Fear 中断行动** (1 Fear): GM 可以在玩家行动前中断，让敌人先行动
- ❌ **Fear 增加敌人行动** (1 Fear): 给一个敌人额外行动
- ❌ **Fear 切换焦点** (1 Fear): 将敌人焦点从当前目标切换到另一个角色
- ❌ **Fear 使用恐惧能力** (varies): 每个敌人类型有独特的恐惧能力，消耗 Fear 激活
- ❌ **Fear 环境效果** (1 Fear): 触发环境危害

当前 Fear 只是一个计数器，GM 无法在战斗中花费它，使战斗失去策略深度。

**严重度**: 高——没有 Fear 花费机制的战斗只是"你打我我打你"

#### P1-3. 敌人战斗行为完全依赖 AI，缺少结构化敌人行为
规则书中每个敌人都有明确定义的：
- **攻击**: 具体的攻击骰和伤害值
- **特质 (Traits)**: 被动/行动/反应三种，每个有明确的触发条件和效果
- **经验 (Experiences)**: 敌人在特定情境下的加值
- **战术说明**: 详细的作战策略

当前实现中，敌人攻击是通过 `extractGmEffects` 让 AI "猜"出来的，没有结构化的敌人行为系统。这意味着：
- 敌人伤害值不稳定，AI 可能给1点也可能给10点
- 敌人特质从不被使用
- 战斗缺乏可预测性和策略性

**严重度**: 高——这是"能通过后端处理的规则不要依赖 AI"原则的直接违反

#### P1-4. 缺少完整的条件(Conditions)系统
Daggerheart 规则书中定义了以下条件：
- ✅ Vulnerable (已实现——压力溢出时自动获得)
- ❌ Blind
- ❌ Deafened
- ❌ Hidden
- ❌ Restrained
- ❌ Unconscious
- ❌ Surprised

每个条件都有具体的游戏效果（如 Hidden 时对攻击有优势），但当前只实现了 Vulnerable 一个。

**严重度**: 中——条件系统是战斗深度的基础

#### P1-5. 缺少死亡判定规则
规则书规定 HP 归零时不是直接死亡，而是：
1. 角色 HP 降到 0 → 进入 **Dying** 状态
2. 每次受到伤害时进行 **Death Move** 选择（壮烈牺牲/避免死亡/孤注一掷）
3. 三个选择各有明确的游戏效果

当前 `deathMoves` 函数虽然定义了三种死亡移动，但缺少 Dying 状态的触发和选择流程。

**严重度**: 高——死亡是 TRPG 中最严肃的时刻，必须正确处理

#### P1-6. 缺少反應(Reaction)规则
规则书中的反应是在其他角色的回合中触发的行动：
- 受到攻击时可以使用护盾格挡
- 敌人离开威胁范围时可以借机攻击
- 各种特质标注为"反应"的可以在特定触发条件下使用

当前 `reactionRoll` 函数只处理了骰子掷法，没有反应触发系统。

**严重度**: 中——反应机制是战斗动态性的关键

#### P1-7. 域卡(Domain Cards)系统不完整
- ❌ **回忆(Recall)**: 消耗 Hope 返回Vault → 未实现
- ❌ **交换(Swap)**: 长休息时交换卡牌 → 仅在 `DaggerHeartRules` 中有函数定义，但未接入游戏流程
- ❌ **施法(Spell)**: 域卡中法术类有明确的施法规则 → 完全依赖 AI
- ❌ **法典(Grimoire)**: 法典类有独特的持续效果 → 完全依赖 AI

**严重度**: 中高——域卡是 Daggerheart 角色定制的核心

#### P1-8. 角色特质(Traits)系统缺失
每个种族(Race)有两个特质、每个社区有一个特质、每个职业有职业特质，这些特质有明确的游戏效果（优势/加值/特殊行动），但当前系统只记录了特质名称，没有结构化的效果系统。

**严重度**: 中——特质是角色身份的核心表达

---

### 二、资深 GM 视角

#### G1-1. 战斗回合管理不完整
GM 运行战斗时需要：
- ❌ **先攻/回合顺序**: 谁在何时行动——当前 SpotlightManager 支持回合顺序但没有与敌人集成
- ❌ **敌人回合自动化**: 敌人应该按规则执行行动，而不是 AI 即兴发挥
- ❌ **多敌人管理**: 同时管理多个敌人的 HP/压力/条件/焦点
- ❌ **战斗难度评估**: 规则书有明确的难度指南，当前 AI 自行决定

**严重度**: 高——GM 没有结构化工具来管理战斗

#### G1-2. 缺少场景环境(Environment)系统
规则书第四章定义了完整的环境系统：
- 4种环境类型（探索/社交/危险/事件）
- 环境特质和恐惧特质
- 环境按层级缩放的规则

当前环境完全是 AI 即兴创作的，没有结构化的环境数据或触发机制。

**严重度**: 中——环境为冒险提供结构和节奏

#### G1-3. 缺少倒计时(Countdown)可视化
规则书的倒计时机制用于制造紧迫感：
- 骰子池随时间增长
- 触发时有灾难性后果

当前 `Countdown` 类型已定义但缺少 UI 和 GM 管理界面。

**严重度**: 中低

#### G1-4. Session Zero 流程不够引导性
好的 Session Zero 应该：
- 引导讨论安全工具（Lines & Veils）
- 共同建立世界观
- 讨论游戏风格和期望
- 建立角色间关系

当前实现有这些步骤但缺乏**引导性提问**和**结构化记录**，太依赖 AI 即兴发挥。

**严重度**: 中

#### G1-5. 缺少 GM 速查工具
GM 在运行中需要快速查阅：
- 规则摘要
- 敌人数据
- 难机表格
- 条件效果

当前没有任何 GM 辅助工具或速查面板。

**严重度**: 中低

---

### 三、产品经理视角

#### M1-1. 数据层：规则书是 Markdown，不是结构化数据
所有游戏数据（武器、护甲、敌人、域卡等）都嵌入在 Markdown 规则书中。服务端使用的是**单独维护的 JSON 文件**，这些 JSON 文件与规则书没有同步机制。

当前 `data/` 目录中的 JSON 数据是否完整、是否与规则书一致——无法验证。

**严重度**: 高——数据不一致会直接导致规则计算错误

#### M1-2. 效果提取系统的可靠性问题
`extractGmEffects` 是项目最脆弱的环节：
- 使用 AI 提取结构化效果（14种类型），依赖 AI 正确理解中文叙事
- 重试逻辑仅在"无效果但有战斗信号"时触发
- `extractEnemyNameFromNarration` 中的正则有运算符优先级 bug
- `_enemyIdList` 缓存失败后永不重试

**核心原则违反**: "后台处理不要高度依赖正则"——当前系统不仅依赖正则，还依赖 AI 的 JSON 输出，双重脆弱

**严重度**: 高——这是游戏体验的基础管道

#### M1-3. 角色升级的两个选项是空操作
`gainSubclassCard` 和 `multiclass` 是完全的空操作——玩家花费升级位但什么也得不到。这会直接导致用户困惑和不满。

**严重度**: 高——直接影响用户核心体验

#### M1-4. 客户端与服务端状态同步问题
- 客户端可以修改 HP/压力/Hope 等资源（通过 +/- 按钮），服务端通过 socket 接受
- 没有服务端权威验证——客户端报"我扣了2HP"，服务端就照做
- 战斗中伤害计算如果同时有 AI 效果和规则引擎结果，可能重复扣减

**严重度**: 高——数据一致性风险

#### M1-5. 缺少新手引导(Tutorial/Onboarding)
当前的新手引导极其简陋：
- 首次使用显示一个简单的欢迎指南
- 没有骰子系统的教学
- 没有角色创建的引导
- 没有战斗流程的教程

Daggerheart 是一个相对新的规则系统，大多数用户不熟悉其机制。

**严重度**: 中

#### M1-6. 缺少错误恢复和状态修复工具
- 没有"撤销上一步"功能
- 没有 GM 手动修正角色属性的界面（只有 +/- 1）
- 没有战斗重置功能
- 没有会话回滚机制

**严重度**: 中

#### M1-7. 数据 JSON 与规则书 Markdown 不同步
`data/` 下的 JSON 数据文件需要手动维护与规则书一致。没有验证工具、没有生成脚本、没有差异检测。

**严重度**: 中

---

## 第二部分：完善计划

### 设计原则

1. **规则在后端，AI 只描述**: 所有可计算的规则必须在后端代码中实现，AI 只负责叙事
2. **结构化数据驱动**: 游戏数据应该是结构化 JSON，而非依赖正则或 AI 解析
3. **服务端权威**: 所有状态变更由服务端计算和验证，客户端只展示和发送意图
4. **渐进式实现**: 按优先级分阶段完成，每阶段可独立验收

### 阶段划分

---

### Phase 1: 核心骰子与规则修复（最高优先级）
**目标**: 修复核心机制的bug，使基础游戏循环正确运行

#### 1.1 修复 Critical Failure 的 Fear 获得量
- **当前**: 两个骰子相同且失败时，GM 获得 1 Fear
- **规则**: 两个骰子相同且失败时，GM 获得 **2 Fear**
- **文件**: `DaggerHeartRules.ts` 的 `rollDualD12()` 函数
- **验收**: 掷骰结果为 fearFailure 且双骰相同时，fearGain 应为 2

#### 1.2 添加 Critical Success 的额外行动规则
- **规则**: Critical Success 时玩家可以选择做一个不需要掷骰的行动
- **实现**: 在 `RollResult` 中添加 `canTakeFreeAction: boolean` 字段，客户端显示额外行动选项
- **文件**: `DaggerHeartRules.ts`, `combat.ts`, `CombatScreen.tsx`
- **验收**: 掷骰结果为 criticalSuccess 时，UI 提示"你可以执行一个免费行动"

#### 1.3 修复 `extractGmEffects` 中的正则 bug
- 修复 `extractEnemyNameFromNarration` 第二个正则的运算符优先级错误
- 修复 `_enemyIdList` 缓存失败后不重试的问题
- 增强 Markdown 代码围栏清理逻辑
- **验收**: 单元测试覆盖所有正则边界情况

#### 1.4 修复角色升级空操作
- 实现 `gainSubclassCard`: 从子职业数据中查找对应等级的域卡并添加到 Vault
- 实现 `multiclass`: 允许选择第二个职业的域，获得该域的域卡
- **文件**: `CharacterLevelUp.ts`
- **验收**: 升级时选择这两个选项，角色实际获得对应能力

---

### Phase 2: Fear 经济系统（高优先级）
**目标**: 实现 Fear 的花费机制，让战斗有 GM 策略层

#### 2.1 定义结构化的 Fear 能力系统
- 创建 `FearAction` 类型：`interruptAction`, `extraEnemyAction`, `switchFocus`, `useFearAbility`, `environmentEffect`
- 每个 Fear 行动有明确的规则效果（不是 AI 即兴的）
- **文件**: 新建 `server/src/rules/systems/fearActions.ts`

#### 2.2 实现敌人特质(Traits)的结构化系统
- 从规则书数据中提取敌人特质为结构化 JSON
- 每个特质有类型（passive/action/reaction）、触发条件、效果
- 恐惧能力(Fear Ability)类型特质需要消耗 Fear 激活
- **文件**: `data/enemies.json` 扩展, 新建 `server/src/rules/systems/enemyTraits.ts`

#### 2.3 实现 GM Fear 花费流程
- AI GM 决定是否花费 Fear（叙事决策）
- 但 Fear 的**效果**由规则引擎计算（非 AI 即兴）
- 例如：AI 说"GM 花费 1 Fear 让骷髅卫士再次攻击"→ 规则引擎执行敌人攻击计算
- **文件**: `AIGameMaster.ts`, `StateManager.ts`, `SocketServer.ts`
- **验收**: GM 在战斗中可以花费 Fear 执行 5 种标准行动，效果由规则引擎计算

---

### Phase 3: 结构化敌人战斗系统（高优先级）
**目标**: 敌人行为由规则驱动而非 AI 即兴

#### 3.1 敌人数据结构化
- 将规则书中的敌人数据提取为完整 JSON（包含攻击、特质、经验）
- 每个敌人的攻击有明确的骰子公式和伤害值
- **文件**: `data/enemies.json` 全面扩展

#### 3.2 实现敌人攻击解析器
- 将"3d6+2 物理伤害"等字符串公式解析为可执行的计算函数
- **不使用正则**：使用预定义的伤害公式结构 `{ dice: [{count: 3, sides: 6}], modifier: 2, type: 'physical' }`
- **文件**: 新建 `server/src/rules/systems/damageFormula.ts`

#### 3.3 实现敌人行为引擎
- 根据敌人类型和当前状态选择行动
- Bruiser → 优先攻击最近目标
- Leader → 指挥盟友
- Support → 辅助盟友
- Solo → 使用多行动模式
- **文件**: 新建 `server/src/rules/systems/enemyBehavior.ts`

#### 3.4 实现敌人回合自动执行
- 战斗中敌人回合由规则引擎执行（AI 只描述发生了什么）
- 敌人攻击 → 规则引擎计算命中/伤害 → AI 根据结果叙述
- **文件**: `combatResolver.ts` 扩展, `AIGameMaster.ts` 修改
- **验收**: 战斗中敌人回合完全由规则驱动，AI 只负责叙事

---

### Phase 4: 条件与状态系统（中高优先级）
**目标**: 实现完整的条件系统，让战斗有更多战术选择

#### 4.1 扩展 Condition 类型
- 添加所有规则书定义的条件：Blind, Deafened, Hidden, Restrained, Unconscious, Surprised
- 每个条件有明确的效果函数
- **文件**: `shared/types/combat.ts`, `DaggerHeartRules.ts`

#### 4.2 实现条件的游戏效果
- Hidden → 对这个角色的攻击有劣势
- Restrained → 敏捷检定劣势
- Surprised → 第一轮无法行动
- 等等
- **文件**: `DaggerHeartRules.ts` 扩展条件处理

#### 4.3 实现 Dying 状态和死亡选择流程
- HP 降到 0 → 进入 Dying 状态
- Dying 时受到伤害 → 触发 Death Move 选择
- 三个选择各有结构化效果
- **文件**: `StateManager.ts`, `combatResolver.ts`, 客户端 DeathMove UI
- **验收**: HP 降0时自动进入 Dying，显示三个死亡选择，选择后执行对应效果

---

### Phase 5: 效果提取系统重构（中高优先级）
**目标**: 减少对 AI 解析的依赖，用结构化意图代替正则匹配

#### 5.1 引入玩家意图声明系统
- 玩家行动时**声明意图**（而非只输入自由文本）
- 意图类型：`attack`, `cast`, `defend`, `move`, `interact`, `rest`, `useFeature`, `socialize`, `explore`
- 每种意图有结构化的参数（攻击目标、使用特征等）
- AI 收到意图声明后只负责**叙事描述**，不负责**规则计算**
- **文件**: `events.ts` 扩展, `SocketServer.ts`, `AdventureScreen.tsx`

#### 5.2 简化效果提取——AI 只补充环境效果
- 玩家声明了攻击 → 规则引擎计算，不需要 AI 提取 `enemyAttack`
- AI 只需要提取**规则引擎无法预知的效果**：环境变化、NPC 反应、新敌人出现
- 将 14 种效果类型减少到 ~6 种：`addEnemy`, `startCombat`, `endCombat`, `setSceneName`, `addItem`, `setDifficulty`
- **文件**: `extractGmEffects.ts` 大幅简化

#### 5.3 移除 `extractEnemyNameFromNarration` 的正则依赖
- 敌人名称从结构化的 `addEnemy` 效果中获取（需要 `enemyStatBlockId`）
- 不再从叙事文本中正则匹配敌人名称
- **文件**: `extractGmEffects.ts`

---

### Phase 6: 域卡与特质系统（中优先级）
**目标**: 让角色的卡牌和特质有实际游戏效果

#### 6.1 域卡效果结构化
- 每种域卡效果定义为结构化数据（非纯文本描述）
- 效果类型：`heal`, `damage`, `buff`, `debuff`, `summon`, `move`, `utility`
- **文件**: `data/domainCards.json` 扩展, 新建 `server/src/rules/systems/cardEffects.ts`

#### 6.2 实现 Recall 和 Swap
- Recall: 消耗 Hope，将 Loadout 中的卡移回 Vault
- Swap: 长休息时交换 Loadout 和 Vault 中的卡
- **文件**: `DaggerHeartRules.ts` 已有函数，需接入游戏流程

#### 6.3 角色特质效果系统
- 每个种族/社区/职业特质有结构化效果
- 在对应情境下自动应用（如：精灵在黑暗中可以看远 → 探索时获得优势）
- **文件**: 新建 `server/src/rules/systems/traitEffects.ts`

---

### Phase 7: 数据层加固（中优先级）
**目标**: 确保游戏数据的完整性和一致性

#### 7.1 从规则书 Markdown 提取结构化 JSON
- 编写脚本从 Markdown 规则书中提取武器、护甲、敌人、域卡等数据
- 生成标准格式的 JSON 文件
- **文件**: 新建 `scripts/extractRuleData.ts`

#### 7.2 数据验证工具
- 每次启动时验证 JSON 数据完整性（字段完整性、引用完整性、值域检查）
- 发现问题时降级而非崩溃
- **文件**: 新建 `server/src/rules/data/dataValidator.ts`

#### 7.3 消除 `as any` 类型断言
- `lootResolver.ts` 和 `DaggerheartDataProvider.ts` 中的 `as any` 改为正确的类型定义
- **文件**: `lootResolver.ts`, `DaggerheartDataProvider.ts`

---

### Phase 8: 客户端体验优化（中低优先级）
**目标**: 提升用户体验和 GM 工具

#### 8.1 GM 控制面板
- Fear 花费界面（在战斗中可以手动花费 Fear）
- 敌人管理界面（添加/移除/修改敌人状态）
- 场景管理（切换场景、设置难度）
- 倒计时管理
- **文件**: 新建 `app/src/screens/GMPanelScreen.tsx`

#### 8.2 角色属性修正工具
- GM 可以直接设置角色属性值（而非只能 +/-1）
- 修复错误状态的"紧急按钮"
- **文件**: 扩展 `CharacterScreen.tsx` 和 socket 事件

#### 8.3 新手引导改进
- 骰子系统交互式教程
- 角色创建引导提示
- 战斗流程教学场景
- **文件**: 新建 `app/src/screens/TutorialScreen.tsx`

---

### Phase 9: 反应系统与进阶战斗（低优先级）
**目标**: 实现完整的战斗深度

#### 9.1 反应触发系统
- 定义反应触发条件：`onAttacked`, `onEnemyMove`, `onAllyDamaged`, `onEnemyCast`
- 角色可以在其他角色回合中使用反应
- **文件**: 新建 `server/src/rules/systems/reactionSystem.ts`

#### 9.2 护盾格挡(Shield Block)反应
- 受到攻击时可以使用护盾减少伤害
- 消耗护甲槽位
- **文件**: `combatResolver.ts` 扩展

#### 9.3 借机攻击(Opportunity Attack)反应
- 敌人离开威胁范围时触发
- **文件**: `combatResolver.ts` 扩展

---

## 第三部分：验收标准

### 每阶段验收流程

1. **代码审查**: 所有修改符合设计原则
2. **单元测试**: 核心规则函数有完整的单元测试
3. **集成测试**: 端到端流程（掷骰→计算→状态更新→AI叙述）可正确运行
4. **规则准确性**: 随机抽取规则书中的规则场景，验证系统行为一致
5. **AI 解耦验证**: 关闭 AI 后，规则引擎仍可独立计算所有机械效果

### 最终验收标准

- [ ] Daggerheart 核心骰子规则 100% 准确（Critical Success/Failure、Hope/Fear 经济）
- [ ] 战斗中所有数值计算由规则引擎完成，AI 只叙述
- [ ] 敌人行为由结构化数据驱动，不依赖 AI 即兴
- [ ] Fear 花费机制完整可玩
- [ ] 条件系统完整实现
- [ ] 死亡选择流程正确运行
- [ ] 角色升级所有选项有效
- [ ] 域卡 Recall/Swap 可用
- [ ] 数据层与规则书一致且可验证
- [ ] 多规则适配架构（IRulesEngine/IDataProvider）未被破坏

---

## 附录：与记忆系统的关联

- [[trpgmaster-endurance-test]]: 81 轮测试发现 [STATE] 标记和数值追踪问题——本计划 Phase 1-3 直接解决
- [[devlog-maintenance]]: 每个 Phase 完成后更新 DEVLOG
- [[multi-rule-architecture]]: 所有改动通过 IRulesEngine/IDataProvider 接口，保持多规则适配能力
