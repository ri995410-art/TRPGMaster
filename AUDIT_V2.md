---
name: comprehensive-audit-plan-v2
description: TRPGMaster Daggerheart 当前状态审查 V2（Phase 16 完成后），三重视角找出仍存在的不足
metadata:
  type: project
---

# TRPGMaster Daggerheart 审查报告 V2

> 审查日期: 2026-06-28（Phase 16 完成后）
> 审查范围: 全项目——服务端规则引擎、AI GM、客户端 UI、数据层
> 目标: 在原 PLAN.md 9 阶段大部分已实现的现状下，找出**仍然存在**的不足
> 关联: 本文档取代 [[comprehensive-audit-plan]]（PLAN.md）作为前瞻性指导；PLAN.md 保留为历史记录

---

## 第零部分：当前实现状态速览

原 PLAN.md 的 9 个阶段已完成约 80%。下表是核实后的状态：

| 阶段 | 描述 | 状态 | 关键证据 |
|------|------|------|----------|
| Phase 1.1 | Critical Failure 给 2 Fear | **未完成** | `DaggerHeartRules.ts:437` 仍 `fearGained = 1` |
| Phase 1.2 | Critical Success 免费行动 | ✅ 完成 | `DaggerHeartRules.ts:444-445` `stressCleared`/`canTakeFreeAction` |
| Phase 1.3 | extractGmEffects 正则修复 | ✅ 完成 | DEVLOG Phase 15 记录 |
| Phase 1.4 | gainSubclassCard/multiclass | ✅ 完成 | `CharacterLevelUp.ts:324-419` 已实现 |
| Phase 2 | Fear 经济 5 行动 | ✅ 完成 | `fearActions.ts:22-27` |
| Phase 3 | 结构化敌人战斗 | ✅ 完成 | `enemyBehavior.ts`、`damageFormula.ts`、`enemies.json` 富数据 |
| Phase 4 | 条件系统 | **部分** | 仅 `vulnerable`；缺 6 个核心条件 |
| Phase 4 | Dying/死亡选择 | **部分** | `handleDeath` 三选项存在，但 HP=0 → Dying 触发缺失 |
| Phase 5 | 效果提取简化 + 意图系统 | ✅ 完成 | 6 种效果类型、`PlayerIntent` 10 类 |
| Phase 6 | 域卡 Recall/Swap | ✅ 完成 | `DaggerHeartRules.ts:893-926` |
| Phase 6 | 域卡效果结构化 | **部分** | `cardEffects.ts` 仅 `heal`/`damage` |
| Phase 7 | 数据层加固 | **未完成** | 无 validator、无 sync 脚本 |
| Phase 8 | GM 控制面板 + 教程 | **部分** | GMPanelScreen、TutorialScreen 存在；角色属性绝对值编辑缺失 |
| Phase 9 | 反应系统 | ✅ 完成 | `reactionSystem.ts` 四触发 + 五反应类型 |

**总结**: 核心管道已通，但仍有 5 处关键缺口和若干新发现的不足。

---

## 第一部分：三重视角审查——仍然存在的不足

### 一、资深 TRPG 玩家视角

#### V-1. Critical Failure 仍违反规则书（关键规则 bug）
**位置**: `server/src/rules/systems/DaggerHeartRules.ts:435-437`

规则书明确：当两个骰子相同且失败时（`fearFailure` 且 `isCritical`），GM 应获得 **2 Fear**（"Doubled Fear"）。

当前代码：
```ts
} else {
  type = 'fearFailure';
  fearGained = 1;  // ← 应在 isCritical 时为 2
}
```

没有 `isCritical && !isSuccess` 的分支。这是原 PLAN.md Phase 1.1 标记但未修复的遗留 bug，是 Daggerheart 最核心骰子规则的违规。

**严重度**: 高——直接破坏 Fear 经济平衡

---

#### V-2. 条件系统仅有 Vulnerable，缺失 6 个核心条件
**位置**: `shared/types/combat.ts` 的 `conditions` 数组、`enemyBehavior.ts:146`

规则书定义的核心条件：
- ❌ **Blind** — 攻击与依赖视觉的检定劣势
- ❌ **Deafened** — 听觉检定劣势
- ❌ **Hidden** — 对此角色的攻击劣势，自身攻击优势
- ❌ **Restrained** — 敏捷检定劣势
- ❌ **Unconscious** — 无法行动，攻击此角色自动暴击
- ❌ **Surprised** — 第一轮无法行动
- ✅ Vulnerable（已实现，压力溢出时自动获得）

`reactionSystem.ts` 的 `uncannyDodge` 已有"降一级严重度"的概念，但缺少条件级别的状态机。

**严重度**: 高——条件是战斗战术深度的基石

---

#### V-3. Dying 状态触发完全缺失
**位置**: `DaggerHeartRules.ts:131-135` 的 `applyDamage`、`StateManager.ts`

规则书规定 HP 归零时不直接死亡：
1. HP → 0，进入 **Dying** 状态
2. Dying 中再次受到伤害 → 选择 **Death Move**（壮烈牺牲/避免死亡/孤注一掷）
3. 三个 Death Move 已在 `handleDeath` 中实现（`DaggerHeartRules.ts:157-178`），但**无触发点**

当前 `applyDamage` 仅 `Math.max(0, hp - damage)`，没有 Dying 状态置位、没有 Death Move 选择流程、没有客户端选择 UI。

`scars.json` 数据存在（避免死亡应获得伤痕），但未接入流程。

**严重度**: 高——死亡是 TRPG 最严肃的时刻，无 Dying 流程会导致角色"无敌"

---

#### V-4. 域卡效果系统仅覆盖 heal/damage
**位置**: `server/src/rules/systems/cardEffects.ts:14-34` 的 `CardEffectResult`

`resolveCardEffect` 当前只处理 `heal` 和 `damage` 两种效果类型。规则书域卡效果还包括：
- ❌ **buff/debuff** — 给予优势/劣势
- ❌ **summon** — 召唤盟友或敌人
- ❌ **move** — 强制移动、定位
- ❌ **utility** — 复活、解除条件、改变环境
- ❌ **condition apply** — `conditionApplied` 字段存在但无人调用

`domains.json` 有 62KB 数据但效果描述仍是文本，未结构化。

**严重度**: 中高——域卡是 Daggerheart 角色定制的核心，效果不完整则失去战略意义

---

#### V-5. 休整(Rest)机制完整性存疑
**位置**: `app/src/screens/RestScreen.tsx`、`DaggerHeartRules.ts` 中的 rest 函数

规则书的休整规则：
- **短休**: 恢复部分 Hope、清除部分 Stress、恢复武器/护甲槽
- **长休**: 恢复全部 Hope、Stress、HP；可进行域卡 Swap；清除部分条件

需要核实：休整是否正确触发武器/护甲槽重置？是否触发 Swap UI？是否清除条件？还是仅恢复 HP/Hope/Stress？

**严重度**: 中——休整是节奏控制器，不完整则资源经济失衡

---

#### V-6. Vault / Loadout 双层卡牌系统 UI 缺失
**位置**: `InventoryScreen.tsx`、`CharacterScreen.tsx`

规则书规定域卡分两层：
- **Vault**: 角色所学的全部域卡
- **Loadout**: 当前装备的域卡（数量受等级限制）

Recall/Swap 函数已实现（`DaggerHeartRules.ts:893-926`），但客户端是否提供清晰的 Vault↔Loadout 切换 UI？还是仅一个扁平列表？

**严重度**: 中——玩家无法管理卡组则失去策略选择

---

#### V-7. Tier（阶层）系统未在升级流程中体现
**位置**: `CharacterLevelUp.ts`、`shared/types/character.ts`

规则书的阶层解锁：在等级 2/5/8/10 时进入新 Tier（1-4），每次进阶解锁：
- 更高阶的子职业特性
- 更多域卡 Loadout 上限
- 更强敌人遭遇

`subclasses.json` 已有 tier 分层数据，但升级流程是否在到达这些等级时触发对应解锁？还是仅按等级线性增长？

**严重度**: 中——阶层是 Daggerheart 成长曲线的关键

---

#### V-8. 种族/社区/职业特质效果未接入
**位置**: `traitEffects.ts`（已存在！）

`traitEffects.ts` 文件已存在，但其内部覆盖范围未知。规则书的特质系统：
- **种族特质** — 如精灵的黑暗视觉（探索时优势）
- **社区特质** — 如社区的团结反应
- **职业特质** — 职业专属行动

需要核实：`traitEffects.ts` 是否覆盖了 `ancestries.json`/`communities.json`/`classes.json` 中所有特质？还是仅占位？特质是否在情境匹配时自动应用？

**严重度**: 中——特质是角色身份的表达

---

### 二、资深 GM 视角

#### G-1. GM 角色属性绝对值编辑模式缺失
**位置**: `app/src/screens/CharacterScreen.tsx`

DEVLOG Phase 16 提到 CharacterScreen 已有 GM 编辑模式（属性/阈值/闪避/资源绝对值设置 + 条件移除 + 紧急重置），但 Explore 审查未找到该模式。需要核实：
- 是否已合并到主分支？
- 还是仅在本地未提交？

`git status` 显示该文件已修改，可能在本地工作区。

**严重度**: 高（如确实未实现）—— GM 无法修正 AI 计算错误的状态

---

#### G-2. Environment（环境）系统完全缺失
**位置**: 无对应文件

规则书第四章定义的 4 种环境类型：
- **探索** (Exploration) — 长途旅行、发现
- **社交** (Social) — NPC 互动、交涉
- **危险** (Danger) — 战斗遭遇
- **事件** (Event) — 触发剧情

每种环境有环境特质和恐惧特质，按 tier 缩放。当前环境完全依赖 AI 即兴，无结构化数据、无触发机制、无 GM 切换界面。

**严重度**: 中——环境为冒险提供结构和节奏

---

#### G-3. Countdown（倒计时）UI 与 GM 管理缺失
**位置**: `shared/types/` 有 `Countdown` 类型，但无 UI

规则书的倒计时机制：骰子池随时间增长，触发时灾难性后果。类型已定义但：
- 无 GM 管理面板
- 无玩家可视化
- 无触发流程

**严重度**: 中低

---

#### G-4. Session Zero 引导性不足
**位置**: `app/src/screens/SessionLobbyScreen.tsx`

好的 Session Zero 应该有结构化提问引导：
- Lines & Veils（禁忌与边界）
- 世界观共同建立
- 游戏风格与期望
- 角色间关系网

`ConnectionListStep.tsx` 存在（角色间连接），但缺乏引导性提问模板。

**严重度**: 中

---

#### G-5. GM 速查工具缺失
**位置**: 无

GM 运行中需要快速查阅：规则摘要、敌人数据、随机表格、条件效果。当前无任何速查面板或搜索工具。

**严重度**: 中低

---

#### G-6. 遭遇构建与难度评估工具缺失
**位置: 无

规则书有明确的难度指南（按 tier 给出敌人 HP/伤害基准）。当前 GM 添加敌人时无难度提示、无遭遇平衡评估。

`fearActions.ts` 的 `addEnemyExperience` 已有敌人规模概念，但无前端评估 UI。

**严重度**: 中

---

#### G-7. 自定义敌人/自定义规则内容创建工具缺失
**位置**: 无

GM 常需要自定义敌人、自定义域卡、自定义场景。当前所有数据硬编码在 JSON，无 GM 端创建工具。

**严重度**: 中——影响复用性与社区生态

---

#### G-8. 多敌人/Horde 管理 UI 不充分
**位置**: `GMPanelScreen.tsx`

规则书的 Horde 规则：多个 minion 可作为单一实体行动。当前 GMPanelScreen 有敌人管理但是否支持 Horde 编组？

**严重度**: 低

---

### 三、产品经理视角

#### M-1. 数据层无验证/同步工具（Phase 7 未完成）
**位置**: 无 `dataValidator.ts`、无 `extractRuleData.ts`

`data/rulebooks/daggerheart/` 是规则书 Markdown 源，`server/src/rules/data/daggerheart/` 是 JSON 数据。两者无同步机制：
- 无脚本从 Markdown 提取 JSON
- 无启动时数据完整性校验
- 无字段引用完整性检查（如 `subclasses.json` 引用的 `classId` 是否存在）

**严重度**: 高——数据漂移会直接导致规则计算错误

---

#### M-2. 多规则适配架构实际未验证
**位置: `IRulesEngine`/`IDataProvider` 接口

记忆 [[multi-rule-architecture]] 提到"CharacterCore+SystemCharacter split, per-session AIGameMasterPool, generic creation flow"。但 `data/campaigns/` 下有 `coc` 和 `drakkenheim`，`data/rulebooks/` 下有 `coc`——**CoC 规则引擎实际未实现**。架构声称多规则，但仅 Daggerheart 一条路径走通，是否真具备多规则扩展性未经验证。

**严重度**: 中高——架构债，未来加新规则时会暴露

---

#### M-3. 错误恢复与状态修复工具不足
**位置: 无 undo/rollback 机制

- 无"撤销上一步"功能
- 无会话回滚到某一回合
- 无战斗重置
- 紧急重置按钮状态未知（如 G-1 所述）

`FileSessionStore.ts` 有持久化，但是否有版本快照？

**严重度**: 中——AI 错误状态需要人工修复入口

---

#### M-4. 测试覆盖率不足
**位置: `server/src/__tests__/`

仅有 `ai/`、`campaign/`、`core/`、`integration/`、`network/`、`routes/`、`rules/` 几个测试目录。需要核实：
- `DaggerHeartRules.ts` 的核心掷骰函数是否有完整单元测试？
- `fearActions.ts`、`enemyBehavior.ts`、`reactionSystem.ts` 新模块是否覆盖？
- Critical Failure 2 Fear 这种 bug 是否有测试发现？

**严重度**: 中高——核心规则无测试则 bug 难以发现

---

#### M-5. 观察性与调试工具缺失
**位置: 无

- 无日志结构化（仅 console.log？）
- 无 metrics（掷骰分布、Fear 经济流量、AI 调用延迟）
- 无调试面板（查看当前 session 状态、socket 消息流）
- AI 调用的 prompt/response 是否有日志？

**严重度**: 中——线上问题难以定位

---

#### M-6. 离线/单人模式未明确
**位置: 整体架构

当前架构强依赖 socket + 服务端 AI。如果用户想离线单人玩：
- AI GM 是否能本地运行？
- 是否有"无 AI"纯规则模式？

**严重度**: 中——影响产品形态与可触达性

---

#### M-7. 国际化与可访问性
**位置: 全项目

- 仅中文 UI，无英文支持（Daggerheart 是英文原版规则，国际用户难以使用）
- 无屏幕阅读器适配
- 无色盲友好模式（红/绿色用于 Hope/Fear 会有问题）
- `app/src/components/ErrorBoundary.tsx` 存在，错误处理有基础

**严重度**: 中——影响市场扩展

---

#### M-8. AI 模型成本与延迟未优化
**位置: `server/src/ai/AIGameMaster.ts`

- 无 prompt 缓存策略（同一 session 的系统提示词重复发送？）
- 无流式中断/取消机制
- 默认模型选择未知（记忆提到"default model change"）

**严重度**: 中——直接影响运营成本

---

#### M-9. 隐私与会话数据合规
**位置: `FileSessionStore.ts`、`SessionPersistence.ts`

- 会话内容（含玩家输入、AI 叙事）存储路径未明示给用户
- 无数据删除流程
- 无 GDPR/隐私政策说明

**严重度**: 低（个人项目阶段）→ 高（商业化时）

---

## 第二部分：完善计划（V2）

### 设计原则（继承原 PLAN.md）

1. **规则在后端，AI 只描述** — 所有可计算的规则在后端代码中实现
2. **结构化数据驱动** — 游戏数据是结构化 JSON，非依赖正则或 AI 解析
3. **服务端权威** — 所有状态变更由服务端计算和验证
4. **渐进式实现** — 按优先级分阶段，每阶段可独立验收
5. **(新增) 测试驱动** — 核心规则函数必须有单元测试

---

### Phase V2-1: 收尾关键规则 bug（最高优先级）

#### V2-1.1 修复 Critical Failure 2 Fear
- **文件**: `DaggerHeartRules.ts:435-437`
- **改动**: 添加 `isCritical && !isSuccess` 分支，置 `fearGained = 2`
- **测试**: 单元测试覆盖 6×6=36 种双骰组合，验证 Fear 数量
- **验收**: 双 1 失败时 GM 获得 2 Fear

#### V2-1.2 实现 Dying 状态与 Death Move 流程
- **文件**: `DaggerHeartRules.ts` `applyDamage`、`StateManager.ts`、`combatResolver.ts`、客户端 `DeathMoveModal.tsx`
- **改动**:
  - HP → 0 时置 `status = 'dying'`
  - Dying 中受伤害 → 触发 `combat:deathMovePrompt` 事件
  - 客户端弹出三选项模态
  - 选择后调用 `handleDeath` 执行效果，避免死亡时获得 scar
- **验收**: HP 归零自动进入 Dying，再次受伤弹出死亡选择，三选项效果正确

#### V2-1.3 实现 6 个核心条件
- **文件**: `shared/types/combat.ts`、`DaggerHeartRules.ts`、`combatResolver.ts`
- **改动**:
  - 定义 `ConditionType` 枚举：`vulnerable|blind|deafened|hidden|restrained|unconscious|surprised`
  - 每个条件的效果函数：`blind` → 攻击劣势；`hidden` → 攻击优势、被攻击劣势；`unconscious` → 受击自动暴击；`surprised` → 第一轮跳过
  - 在掷骰前计算优势/劣势来源时检查条件
- **验收**: Hidden 角色被攻击时掷骰劣势，攻击时优势

---

### Phase V2-2: 域卡效果系统补全（高优先级）

#### V2-2.1 扩展 CardEffect 类型
- **文件**: `shared/types/combat.ts`、`cardEffects.ts`、`data/daggerheart/domains.json`
- **改动**:
  - 扩展 `CardEffect` 类型至 7 种：`heal|damage|buff|debuff|summon|move|utility`
  - 每种类型定义结构化字段（buff → `{ advantage: number, duration: number }`）
  - 将 `domains.json` 中部分常用域卡的效果从文本描述转为结构化数据（先做 5 张试点）
- **验收**: 试点 5 张域卡效果完全由规则引擎计算

#### V2-2.2 Vault/Loadout 管理 UI
- **文件**: `app/src/screens/InventoryScreen.tsx`
- **改动**: 双栏布局展示 Vault 和 Loadout，提供 Recall/Swap 操作入口
- **验收**: 玩家可在休整时进行 Swap

---

### Phase V2-3: GM 工具补全（中高优先级）

#### V2-3.1 核实并完善 GM 角色编辑模式
- **文件**: `app/src/screens/CharacterScreen.tsx`
- **改动**: 核实 DEVLOG Phase 16 提到的编辑模式是否在主分支；如未完成，实现属性/阈值/闪避/资源绝对值编辑 + 紧急重置
- **验收**: GM 可直接设置角色 HP=20 而非点击 +1 二十次

#### V2-3.2 Environment 系统结构化
- **文件**: 新建 `server/src/rules/systems/environmentSystem.ts`、`data/daggerheart/environments.json`
- **改动**:
  - 定义 4 种环境类型及特质
  - GM 可在 GMPanelScreen 切换当前环境
  - 环境效果（如危险环境的恐惧特质）由规则引擎处理
- **验收**: GM 切换到"危险"环境后，每轮触发环境恐惧特质

#### V2-3.3 Countdown UI
- **文件**: `GMPanelScreen.tsx`、客户端 Countdown 显示组件
- **改动**: GM 可创建/推进/触发 Countdown，玩家侧显示进度
- **验收**: 创建 3 段 Countdown，每轮 +1，触发时执行效果

---

### Phase V2-4: 数据层加固（中优先级）

#### V2-4.1 数据验证器
- **文件**: 新建 `server/src/rules/data/dataValidator.ts`
- **改动**:
  - 启动时校验所有 JSON：字段完整性、引用完整性、值域
  - 不通过则降级到只读模式 + 警告日志
- **验收**: 删除 enemies.json 必填字段后启动有明确错误

#### V2-4.2 规则书→JSON 提取脚本
- **文件**: 新建 `scripts/extractRuleData.ts`
- **改动**: 从 `data/rulebooks/daggerheart/*.md` 提取结构化数据，diff 现有 JSON 输出差异报告
- **验收**: 跑一次脚本输出"enemies.json 缺少 3 个敌人"类报告

---

### Phase V2-5: 测试与观察性（中优先级）

#### V2-5.1 核心规则单元测试
- **文件**: `server/src/__tests__/rules/DaggerHeartRules.test.ts`
- **改动**: 覆盖 `rollDualD12` 全 36 种双骰组合、`resolveCardEffect` 各效果类型、`fearActions` 全 5 种行动、`reactionSystem` 全 4 触发
- **验收**: 覆盖率 ≥ 80% on rules 模块

#### V2-5.2 结构化日志
- **文件**: `server/src/index.ts`、`AIGameMaster.ts`
- **改动**: 引入 winston/pino，按 session 分类日志；记录 AI prompt/response 用于调试
- **验收**: 出 bug 后能从日志重建上下文

---

### Phase V2-6: 多规则架构验证（中低优先级）

#### V2-6.1 CoC 规则引擎最小实现
- **文件**: 新建 `server/src/rules/systems/CoCRules.ts`、`data/coc/...`
- **改动**: 实现 CoC 的 d100 检定、SAN 值、幸运点，验证 IRulesEngine 接口足够
- **验收**: 在 CoC 模式下创建角色、掷骰、战斗（不依赖 AI 即兴）

---

### Phase V2-7: 产品化（低优先级）

- **V2-7.1** 离线模式（本地规则引擎 + 无 AI 模式）
- **V2-7.2** 国际化框架（i18n）
- **V2-7.3** 可访问性（屏幕阅读器、色盲模式）
- **V2-7.4** AI prompt 缓存与取消机制

---

## 第三部分：验收标准

### 每阶段验收流程
1. 单元测试通过
2. 集成测试（掷骰→计算→状态更新→AI叙述）端到端跑通
3. 规则准确性（对照规则书随机场景验证）
4. AI 解耦验证（关闭 AI 后规则引擎独立计算所有机械效果）

### 最终验收清单
- [ ] Critical Failure 正确给 2 Fear
- [ ] 6 个核心条件全部实现并有效果
- [ ] Dying 状态与 Death Move 选择流程正确
- [ ] 域卡 7 种效果类型可由规则引擎计算
- [ ] Vault/Loadout UI 可管理卡组
- [ ] GM 可绝对值编辑角色属性
- [ ] Environment 系统结构化
- [ ] Countdown 有 UI 与 GM 管理
- [ ] 数据验证器在启动时运行
- [ ] 核心规则单元测试覆盖率 ≥ 80%
- [ ] 多规则架构通过 CoC 最小实现验证

---

## 附录：与记忆系统的关联

- [[trpgmaster-endurance-test]]: 81 轮测试发现的问题——V2-1（Dying/条件）和 V2-2（域卡效果）直接解决数值追踪失效
- [[devlog-maintenance]]: 每个 V2 阶段完成后更新 DEVLOG
- [[multi-rule-architecture]]: V2-6 验证多规则适配架构未被破坏
- [[comprehensive-audit-plan]]: 原 PLAN.md，本文档为其 V2 继任者
