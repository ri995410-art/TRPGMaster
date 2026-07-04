# Daggerheart 规则合规性审查报告

**生成日期**: 2026-06-29
**规则文档**: `data/rulebooks/daggerheart/` (6个章节)
**代码版本**: master@5cad67a

---

## 总览

| 严重性 | 数量 |
|--------|------|
| 关键 (Critical) | 10 |
| 主要 (Major) | 14 |
| 次要 (Minor) | 12 |

**合规率估算**: 约 55% — 核心骰子框架已建立，但伤害管线、状态效果、敌人系统和恐惧经济存在系统性偏差。

---

## 一、关键差异 (Critical)

### C1. 敌人攻击跳过掷骰 — 自动命中
- **规则**: 第二章"与敌人战斗"、第三章"敌人攻击掷骰" — 敌人使用 d20 + 攻击调整值 vs 玩家闪避值判定命中
- **现状**: `combatResolver.ts:258-303` 的 `resolveEnemyAttack` 不做攻击掷骰，直接从伤害公式计算严重度
- **影响**: 所有敌人攻击自动命中，无闪避可能，严重破坏战斗平衡
- **修复**: 在 `resolveEnemyAttack` 中加入 d20 + attackModifier vs target.evasion 判定

### C2. 压力溢出不自动施加脆弱状态
- **规则**: 第二章"状态" — 当压力标记满时角色进入脆弱状态
- **现状**: `DaggerHeartRules.ts:603-622` 的 `shouldApplyVulnerable` 正确计算标志，但 `StateManager.updateCharacterStress` 和 `combatApply.ts` 从未消费该标志
- **影响**: 压力满的角色不会获得脆弱状态，缺失核心惩罚机制
- **修复**: 在 `applyDamageToCharacter` 和 `updateCharacterStress` 中检查 `shouldApplyVulnerable` 并添加脆弱条件

### C3. 伤害低于阈值不标记压力
- **规则**: 第二章"伤害掷骰" — 伤害低于轻度阈值时标记压力而非生命
- **现状**: `calculateDamageSeverity` 将任何 >0 伤害归为 minor（标记1生命），`resolveDamageToCharacter` 中 `stressGain` 硬编码为 0
- **影响**: 压力仅通过特定能力获得，伤害管线从不产生压力标记
- **修复**: 在伤害结算中添加"伤害 < 轻度阈值 → 标记1压力"的分支

### C4. 回想费用消耗希望而非压力
- **规则**: 第二章"第八步：选择领域卡" — 战斗中更换领域卡支付回想费用（标记压力点）
- **现状**: `SocketServer.ts:631-636` 消耗希望点，错误消息显示"回忆需要X希望点"
- **影响**: 回想机制资源消耗错误，使领域卡换牌成本过高
- **修复**: 将 `updateCharacterHope(-cost)` 改为 `updateCharacterStress(cost)`，修改错误消息

### C5. 恐惧点无上限
- **规则**: 第二章"恐惧点" — 恐惧点上限12，可在场次间保留
- **现状**: `StateManager.addFearPoints` 无上限检查，UI 显示 max=99
- **影响**: 恐惧可无限增长，破坏恐惧经济的风险/回报设计
- **修复**: `addFearPoints` 中添加 `this.state.fearPoints = Math.min(12, this.state.fearPoints + points)`

### C6. 战斗点数系统完全缺失
- **规则**: 第四章"战斗点数系统" — 基础公式 (3×玩家数)+2，6种调整值
- **现状**: 代码中无任何 `combatPoint` / `encounterPoint` 相关逻辑
- **影响**: GM 无法系统化地平衡遭遇战难度
- **修复**: 新建 `encounterBuilder.ts`，实现战斗点数计算和敌人选择

### C7. 集群(Horde)机制完全缺失
- **规则**: 第四章"敌人关键特性" — 标记一半生命点后普通攻击改为 X 伤害
- **现状**: 类型定义中有 `'horde'` 但无任何敌人使用，无半血攻击变化逻辑
- **影响**: 大量集群型敌人无法正确运作
- **修复**: 在 `CombatEnemy` 添加 `hordeDamage` 字段，在伤害计算中检查半血条件

### C8. 无情(Relentless)机制完全缺失
- **规则**: 第四章"敌人关键特性" — 每个 GM 轮次可聚焦 X 次
- **现状**: `CombatEnemy.isFocused` 为布尔值，无多次聚焦追踪
- **影响**: 独狼和强敌无法执行多次行动
- **修复**: 添加 `relentlessCount` 字段，修改聚焦逻辑允许多次聚焦

### C9. 迟缓(Slow)机制完全缺失
- **规则**: 第四章"敌人关键特性" — 首次聚焦无法行动，需第二次聚焦
- **现状**: 无 `slow` 字段或机制
- **影响**: 绿色软泥怪等迟缓敌人无法正确运作
- **修复**: 在 `CombatEnemy` 添加 `isSlow: boolean`，在聚焦逻辑中添加延迟行动

### C10. 伤痕无强制退役逻辑
- **规则**: 第二章"死亡 — 伤痕" — 划掉最后一个希望槽 → 角色必须退役
- **现状**: `StateManager.applyDeathMoveResult` 中 `Math.max(1, char.maxHope - 1)` 阻止 maxHope 降至 0，无退役触发
- **影响**: 角色永远不会因伤痕被迫退役
- **修复**: 允许 maxHope 降至 0，添加 `mustRetire` 标志和退役处理逻辑

---

## 二、主要差异 (Major)

### M1. 长休恐惧获取硬编码 +2 而非 +玩家人数
- **规则**: 第二章"休整" — 长休 GM 获得 1d4 + 玩家人数 恐惧点
- **现状**: `DaggerHeartRules.ts:597` 硬编码 `d4 + 2`
- **修复**: `gainFearOnRest('long', playerCount)` → `d4 + playerCount`

### M2. "做好准备"休整行动缺少团队加成
- **规则**: 第二章"休整行动表" — 做好准备：获得1希望点（与队友则2点）
- **现状**: `executeShortRestAction` 中 `prepare` 始终返回 `{ hopeGained: 1 }`
- **修复**: 添加 `isTeamRest` 参数，团队休息时返回 `{ hopeGained: 2 }`

### M3. 会话开始恐惧未初始化
- **规则**: 第三章"恐惧点" — 战役开始时恐惧 = 玩家角色数量
- **现状**: `StateManager.createInitialState` 设置 `fearPoints: 0`
- **修复**: `startSession` 中根据 `players.length` 设置初始恐惧

### M4. 隐藏条件无战斗效果
- **规则**: 第二章"状态" — 隐藏：所有以你为目标的掷骰具劣势
- **现状**: `CONDITION_EFFECTS.hidden` 所有字段为 false/0；`combatResolver.ts` 只处理了隐藏攻击者的优势，未处理对隐藏目标的劣势
- **修复**: 设置 `CONDITION_EFFECTS.hidden.attackDisadvantage = true`，在 `resolvePlayerAttack` 和 `resolveEnemyAttack` 中检查

### M5. 隐藏状态攻击后不自动解除
- **规则**: 第二章"状态" — 隐藏：攻击后或进入视线则解除
- **现状**: 无自动清除逻辑，攻击后仍保持隐藏
- **修复**: 在 `resolvePlayerAttack` 成功攻击后自动移除隐藏条件

### M6. 束缚条件缺少无法移动效果
- **规则**: 第二章"状态" — 束缚：无法移动，但仍可执行动作
- **现状**: `ConditionEffect` 接口无 `cannotMove` 字段；束缚错误地设置 `attackerAdvantage: true` 和 `attackDisadvantage: true`
- **修复**: 添加 `cannotMove` 字段，修正束缚效果为 `{ cannotMove: true, attackerAdvantage: false, attackDisadvantage: false }`

### M7. 脆弱伤害效果不一致
- **规则**: 第二章"状态" — 脆弱：所有以你为目标的掷骰具优势
- **现状**: 玩家攻击脆弱敌人 +1 原始伤害(`combatResolver.ts:74`)；敌人攻击脆弱玩家 +2 原始伤害(`combatResolver.ts:141`)；`CONDITION_EFFECTS` 定义 `extraHpLoss: 1`
- **修复**: 统一脆弱效果实现，采用一种一致的方式（推荐：攻击者优势 + 目标额外标记1生命）

### M8. 敌人攻击无恐惧成功反应机制
- **规则**: 第二章"掷骰结果总表" — 恐惧成功：目标可标记1压力进行反应
- **现状**: 无代码实现
- **修复**: 在 `AttackResolution` 添加 `fearSuccessReactionAvailable` 字段，在战斗流程中提示

### M9. 希望成功施法无额外效果
- **规则**: 第二章"施法掷骰" — 希望成功施法时可标记1压力给予1盟友1希望
- **现状**: 无代码实现
- **修复**: 在施法结果中检测 hopeSuccess + cast 意图，提供该选项

### M10. 直接伤害类型在管线中无效果
- **规则**: 第二章"伤害类型" — 直接伤害：无法通过护甲槽降低
- **现状**: `DamageType` 含 `'direct'` 但 `resolveDamageToCharacter` 和 `resolveEnemyAttack` 从不检查该类型跳过护甲
- **修复**: 在伤害结算中检查 `damageType === 'direct'` 时跳过护甲槽计算

### M11. 抗性/免疫未接入战斗管线
- **规则**: 第二章"抗性与免疫" — 抗性减半，免疫无效
- **现状**: `applyResistanceInternal` 逻辑正确但从未在 `combatResolver.ts` 中调用
- **修复**: 在 `resolveDamageToCharacter` 和 `resolveEnemyAttack` 中调用 `applyResistance`

### M12. 多重优势/劣势只掷1个d6
- **规则**: 第二章"优势与劣势" — 多个来源叠加
- **现状**: `rollAdvantageDisadvantage` 用 `netAdvantage = count1 - count2` 计算后只掷1个d6
- **修复**: 掷 `Math.abs(netAdvantage)` 个 d6 并累加

### M13. 兼职不授予第二职业基础子职业卡
- **规则**: 第二章"兼职规则" — 获得另一职业的基础子职业卡
- **现状**: `CharacterLevelUp.ts` 只记录 `multiclass.classId` 和 `domain`，未添加子职业卡
- **修复**: 在兼职逻辑中查找并添加目标职业的基础子职业卡

### M14. 兼职领域卡等级限制缺失
- **规则**: 第二章"兼职规则" — 从新领域选卡时等级限制为当前等级一半（向上取整）
- **现状**: `gainDomainCard` 只检查 `c.level <= nextLevel`，无兼职特殊限制
- **修复**: 对兼职领域卡添加 `c.level <= Math.ceil(character.level / 2)` 限制

---

## 三、次要差异 (Minor)

### m1. 关键成功伤害计算不完整
- **规则**: 第二章"关键成功与伤害" — 先取全部伤害骰最大值，再正常掷一次，相加
- **现状**: `calculateCriticalDamage` 添加单个骰面最大值 (`maxDieValue`)，而非 `proficiency × dieSides`
- **示例**: 熟练值3 + d8 → 规则为 (8+8+8) + 3d8 + mod，代码为 8 + 3d8 + mod
- **修复**: 将 `maxDieValue` 改为 `proficiency * dieSides`

### m2. 敌人类型系统不完整
- **规则**: 10种类型（斗士/集群/头目/杂兵/远程/潜伏/社交/独狼/标准/辅助）
- **现状**: 代码仅5种 (`minion/horde/elite/solo/boss`)，缺6种规则类型
- **修复**: 扩展 `EnemyType` 联合类型，更新数据

### m3. 敌人数据严重不足
- **规则**: 50+种位阶1敌人，100+总计
- **现状**: 仅10种敌人
- **修复**: 补充敌人数据，优先填充位阶1常见敌人

### m4. 缺少7种状态效果
- **规则**: 中毒、点燃、魅惑、迷醉、震慑、恍惚、腐蚀
- **现状**: `BaseCondition` 仅含7种，缺少上述7种；`ConditionInstance.condition` 为 `BaseCondition | string` 可绕过但无机械效果
- **修复**: 扩展 `BaseCondition`，添加对应的 `CONDITION_EFFECTS` 和 `CONDITION_LABELS`

### m5. 休息行动数无服务端验证
- **规则**: 短休/长休各选2项
- **现状**: `executeRestInternal` 接受任意长度数组，仅前端强制
- **修复**: 添加 `actions.length !== 2` 的服务端校验

### m6. 短休不允许免费换领域卡
- **规则**: 第二章"配置与宝库" — 休息时可免费交换
- **现状**: `executeRestInternal` 仅在长休时设置 `domainCardsSwapped: true`
- **修复**: 短休也允许换卡（或按规则理解为仅长休可免费换，需确认规则原文）

### m7. 回避死亡无昏迷状态
- **规则**: 第二章"死亡行动" — 回避死亡：免于一死但陷入昏迷
- **现状**: `avoidDeath` 恢复1生命但不施加昏迷条件
- **修复**: 在 `avoidDeath` 生存路径添加 `'unconscious'` 条件

### m8. 回避死亡"局势恶化"无机械效果
- **规则**: 第二章"死亡行动" — 回避死亡：局势恶化
- **现状**: 仅叙述性文本，无压力增加、恐惧标记或条件施加
- **修复**: 添加 `stressGained` 或 `fearGained` 字段

### m9. 伤痕不记录 Scar 对象
- **规则**: 第二章"伤痕" — 叙事效果自定
- **现状**: `applyDeathMoveResult` 减少 `maxHope` 但不向 `char.scars` 添加 `Scar` 对象
- **修复**: 创建 `Scar` 对象并推入 `char.scars`

### m10. 敌人/环境恐惧特性费用硬编码为1
- **规则**: 第三章"花费恐惧点" — 敌人恐惧特性和环境恐惧特性费用各不相同
- **现状**: `fearActions.ts:191-196` 所有恐惧特性 `cost: 1`
- **修复**: 从敌人/环境数据读取 `fearCost` 字段

### m11. 兼职后子职业卡完全禁止
- **规则**: 第二章"兼职规则" — 仅不能获得原职业精通卡
- **现状**: `gainSubclassCard` 对所有兼职角色完全禁用
- **修复**: 仅阻止原职业精通卡，允许兼职职业的进阶/精通卡

### m12. 初始经历验证错误
- **规则**: 第一章"第七步" — 初始2个经历，每个+2加值
- **现状**: `CharacterCreator.ts` 要求1个+2和1个+1
- **修复**: 验证改为2个经历均为+2

---

## 四、规则章节对照表

| 规则章节 | 完全实现 | 部分实现 | 未实现 | 实现错误 |
|----------|----------|----------|--------|----------|
| 核心机制（二元骰） | 4 | 1 | 0 | 1 |
| 动作掷骰 & 结果 | 3 | 0 | 2 | 0 |
| 伤害计算 & 阈值 | 1 | 2 | 3 | 1 |
| 状态效果 | 1 | 2 | 3 | 2 |
| 休整系统 | 3 | 2 | 0 | 1 |
| 恐惧点经济 | 1 | 2 | 2 | 0 |
| 死亡 & 伤痕 | 2 | 2 | 1 | 0 |
| 领域卡系统 | 2 | 1 | 2 | 1 |
| 升级 & 兼职 | 4 | 0 | 2 | 1 |
| 敌人数据 & 行为 | 0 | 2 | 5 | 0 |
| 角色创建 | 5 | 0 | 1 | 1 |
| 战斗点数系统 | 0 | 0 | 1 | 0 |

---

## 五、优先修复路线图

### 第一优先级 — 核心战斗循环 (影响所有战斗)
1. **C1**: 添加敌人 d20 攻击掷骰
2. **C2**: 压力溢出自动施加脆弱
3. **C3**: 伤害低于阈值标记压力
4. **M10**: 直接伤害跳过护甲
5. **M11**: 抗性/免疫接入管线
6. **M7**: 统一脆弱伤害效果

### 第二优先级 — 经济与状态系统
7. **C4**: 回想费用改为标记压力
8. **C5**: 恐惧上限12
9. **M1**: 长休恐惧 = 1d4+玩家人数
10. **M3**: 会话开始恐惧初始化
11. **M4/M5**: 隐藏条件效果和自动解除
12. **M6**: 束缚条件修正

### 第三优先级 — 敌人系统
13. **C6**: 战斗点数系统
14. **C7/C8/C9**: 集群/无情/迟缓机制
15. **m3**: 补充敌人数据
16. **M8/M9**: 恐惧成功反应和希望成功施法效果

### 第四优先级 — 完善与内容
17. **C10**: 伤痕退役逻辑
18. **M13/M14**: 兼职修正
19. **m4**: 补充状态效果类型
20. **m1**: 关键成功伤害计算修正

---

## 六、待确认项

| 项目 | 不确定原因 |
|------|-----------|
| 短休是否允许免费换领域卡 | 规则原文"休息时可免费交换"是否包含短休有歧义 |
| 伤害低于阈值标记多少压力 | 规则未明确说"1点"，但推断应为1点 |
| 脆弱增加的额外伤害形式 | 规则说"以你为目标的掷骰具优势"，但代码实现了不同的额外伤害逻辑 |
| 严重阈值公式 | 代码用 `major * 2`，需确认是否应为 `baseSevere + level` |
| 兼职后能否获得兼职职业的子职卡 | 规则只禁止"原职业精通卡"，但代码禁止所有子职卡 |
