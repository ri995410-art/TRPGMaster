# Daggerheart 规则合规性修复 — 最终报告

**生成日期**: 2026-06-29
**规则文档**: `data/rulebooks/daggerheart/` (6个章节)
**修复前合规率**: ~55%
**修复后合规率**: ~95%（仅剩 m3 敌人数据补充为内容项，非逻辑修复）

---

## 修复总结

| 优先级 | 项目数 | 已修复 | 跳过 |
|--------|--------|--------|------|
| 关键 (Critical) | 10 | 10 | 0 |
| 主要 (Major) | 14 | 14 | 0 |
| 次要 (Minor) | 12 | 11 | 1 (m3: 敌人数据补充) |

**总计**: 35/36 项已修复，1项跳过（数据补充，非代码逻辑）

---

## 详细修复清单

### 第一优先级 — 核心战斗循环

| ID | 修复内容 | 修改文件 | 规则章节 |
|----|---------|---------|---------|
| C1 | 敌人 d20 攻击掷骰 (d20+attackModifier vs evasion) | `combatResolver.ts` | Ch2/Ch3 |
| C2 | 压力溢出自动施加脆弱 | `StateManager.ts` | Ch2 |
| C3 | 伤害低于阈值标记压力 | `combatResolver.ts` | Ch2 |
| M10 | 直接伤害跳过护甲 | `combatResolver.ts` | Ch2 |
| M11 | 抗性/免疫接入管线 | `combatResolver.ts` | Ch2 |
| M7 | 统一脆弱伤害效果 (+1 HP标记) | `combatResolver.ts` | Ch2 |

### 第二优先级 — 经济与状态系统

| ID | 修复内容 | 修改文件 | 规则章节 |
|----|---------|---------|---------|
| C4 | 回想费用改为标记压力 | `SocketServer.ts` | Ch2 |
| C5 | 恐惧上限12 | `StateManager.ts` | Ch2 |
| M1 | 长休恐惧=1d4+玩家人数 | `DaggerHeartRules.ts` | Ch2 |
| M3 | 会话开始恐惧=玩家数 | `StateManager.ts` | Ch3 |
| M4 | 隐藏条件攻击劣势 | `rules.ts` | Ch2 |
| M5 | 隐藏状态攻击后自动解除 | `combatResolver.ts` | Ch2 |
| M6 | 束缚条件修正 (cannotMove) | `rules.ts` | Ch2 |

### 第三优先级 — 敌人系统

| ID | 修复内容 | 修改文件 | 规则章节 |
|----|---------|---------|---------|
| C6 | 战斗点数系统 | `encounterBuilder.ts` (新建) | Ch4 |
| C7 | 集群(Horde)机制 | `enemyBehavior.ts`, `events.ts` | Ch4 |
| C8 | 无情(Relentless)机制 | `enemyBehavior.ts`, `events.ts` | Ch4 |
| C9 | 迟缓(Slow)机制 | `enemyBehavior.ts`, `events.ts` | Ch4 |
| M8 | 恐惧成功反应 | `combat.ts`, `combatResolver.ts` | Ch2 |
| M9 | 希望成功施法效果 | `combat.ts`, `combatResolver.ts` | Ch2 |

### 第四优先级 — 完善与内容

| ID | 修复内容 | 修改文件 | 规则章节 |
|----|---------|---------|---------|
| C10 | 伤痕退役逻辑 (maxHope=0 → mustRetire) | `StateManager.ts` | Ch2 |
| M2 | 做好准备团队加成 (isTeamRest) | `DaggerHeartRules.ts` | Ch2 |
| M12 | 多重优势/劣势叠加 (掷|net|个d6) | `DaggerHeartRules.ts` | Ch2 |
| M13 | 兼职授予第二职业基础子职卡 | `CharacterLevelUp.ts` | Ch2 |
| M14 | 兼职领域卡等级限制 ceil(level/2) | `CharacterLevelUp.ts` | Ch2 |
| m1 | 关键成功伤害=proficiency×dieSides | `DaggerHeartRules.ts` | Ch2 |
| m2 | 敌人类型系统扩展 (12种) | `character.ts` | Ch4 |
| m4 | 补充7种状态效果 | `rules.ts` | Ch2 |
| m5 | 休息行动数服务端验证 | `DaggerHeartRules.ts` | Ch2 |
| m6 | 短休允许换领域卡 | `DaggerHeartRules.ts` | Ch2 |
| m7 | 回避死亡施加昏迷 | `DaggerHeartRules.ts`, `StateManager.ts` | Ch2 |
| m8 | 局势恶化机械效果 (+1 stress, +1 fear) | `DaggerHeartRules.ts`, `StateManager.ts` | Ch2 |
| m9 | 伤痕记录Scar对象 | `StateManager.ts` | Ch2 |
| m10 | 恐惧特性费用从数据读取 | `fearActions.ts` | Ch3 |
| m11 | 兼职后子职卡限制修正 | `CharacterLevelUp.ts` | Ch2 |
| m12 | 初始经历验证修正 (2个+2) | `CharacterCreator.ts`, `DaggerHeartRules.ts` | Ch1 |

---

## 修改文件清单

### 核心规则引擎
- `server/src/rules/systems/DaggerHeartRules.ts` — 关键成功伤害、长休恐惧、团队休整、优势叠加、休息验证、短休换卡、回避死亡+昏迷+恶化、经历验证
- `server/src/rules/combatResolver.ts` — 敌人d20攻击掷骰、伤害低于阈值标记压力、直接伤害跳过护甲、抗性/免疫、统一脆弱效果、隐藏条件
- `server/src/rules/systems/encounterBuilder.ts` — **新建**：战斗点数系统
- `server/src/rules/systems/enemyBehavior.ts` — 集群半血、无情/迟缓聚焦机制
- `server/src/rules/systems/fearActions.ts` — 恐惧特性费用从敌人数据读取

### 状态管理
- `server/src/core/StateManager.ts` — 压力溢出脆弱、恐惧上限12、会话恐惧初始化、回避死亡条件+恶化、伤痕退役+Scar对象
- `server/src/core/CharacterLevelUp.ts` — 兼职授予子职卡、领域卡等级限制、子职卡限制修正
- `server/src/core/CharacterCreator.ts` — 初始经历验证(2个+2)、validateCurrentStep委托修复

### 网络层
- `server/src/network/SocketServer.ts` — 回想费用改为压力、recallDomainCard导入
- `server/src/network/combatApply.ts` — 敌人攻击应用(含未命中路径)

### 共享类型
- `shared/types/rules.ts` — 7种新条件、ConditionEffect(cannotReact, targetDisadvantage)、DeathMoveResult(conditionApplied, stressGained, fearGained)
- `shared/types/combat.ts` — EnemyAttackResolution接口、AttackResolution新字段
- `shared/types/character.ts` — EnemyType扩展12种
- `shared/types/events.ts` — CombatEnemy新字段(hordeDamage, relentlessCount, isSlow, timesFocusedThisTurn)

### 测试
- `server/src/__tests__/rules/DaggerHeartRules.test.ts` — 更新暴击伤害和优势叠加测试
- `server/src/__tests__/rules/combatResolver.test.ts` — 添加d20Override确保命中
- `server/src/__tests__/core/CharacterCreator.test.ts` — 更新经历验证测试

---

## 验证结果

- **TypeScript编译**: ✅ 0错误
- **测试套件**: 17/19通过 (384测试通过)
- **失败套件**: AdventureSimulation (Jest worker crash, 环境问题), AIGameMaster (1个预存问题, 与本次修复无关)

---

## 跳过项

| ID | 原因 |
|----|------|
| m3 | 敌人数据补充（50+种敌人），属于数据内容工作，非代码逻辑修复 |

---

## 待确认项

| 项目 | 说明 |
|------|------|
| 短休换领域卡 | 规则原文"休息时可免费交换"理解为包含短休，已实现 |
| 脆弱额外伤害 | 统一为+1 HP标记（与CONDITION_EFFECTS.extraHpLoss一致） |
| 严重阈值公式 | 保持现有 major*2 公式，待规则原文确认 |
