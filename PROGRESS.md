# 合规性修复进度

## 状态：进行中（P1-P3已完成，P4大部分完成）

## 修复路线图

### 第一优先级 — 核心战斗循环 ✅
- [x] C1: 敌人 d20 攻击掷骰 — `combatResolver.ts:resolveEnemyAttack` 完整重写
- [x] C2: 压力溢出自动施加脆弱 — `StateManager.updateCharacterStress` 检查并添加脆弱条件
- [x] C3: 伤害低于阈值标记压力 — `combatResolver.ts:resolveDamageToCharacter` 添加分支
- [x] M10: 直接伤害跳过护甲 — `combatResolver.ts:resolveDamageToCharacter` 检查 damageType='direct'
- [x] M11: 抗性/免疫接入管线 — `combatResolver.ts:resolveEnemyAttack` 调用 applyResistance
- [x] M7: 统一脆弱伤害效果 — 统一为 +1 HP标记（而非+1/+2原始伤害）

### 第二优先级 — 经济与状态系统 ✅
- [x] C4: 回想费用改为标记压力 — `SocketServer.ts` 改用 updateCharacterStress
- [x] C5: 恐惧上限12 — `StateManager.addFearPoints` 添加 FEAR_POINT_CAP=12
- [x] M1: 长休恐惧 = 1d4+玩家人数 — `DaggerHeartRules.gainFearOnRest` 添加 playerCount 参数
- [x] M3: 会话开始恐惧初始化 — `StateManager.startSession` 设置 fearPoints=players.length
- [x] M4: 隐藏条件攻击劣势 — `CONDITION_EFFECTS.hidden.targetDisadvantage=true`
- [x] M5: 隐藏状态攻击后自动解除 — `AttackResolution.hiddenAutoCleared` 字段
- [x] M6: 束缚条件修正 — `CONDITION_EFFECTS.restrained` 改为 cannotMove=true, attackerAdvantage=true

### 第三优先级 — 敌人系统 ✅
- [x] C6: 战斗点数系统 — 新建 `encounterBuilder.ts`
- [x] C7: 集群(Horde)机制 — `CombatEnemy.hordeDamage` 字段 + `enemyBehavior.ts` 半血逻辑
- [x] C8: 无情(Relentless)机制 — `CombatEnemy.relentlessCount` + `enemyBehavior.ts` focusEnemy 函数
- [x] C9: 迟缓(Slow)机制 — `CombatEnemy.isSlow` + `enemyBehavior.ts` canActAfterFocus 函数
- [x] M8: 恐惧成功反应 — `AttackResolution.fearSuccessReactionAvailable` 字段
- [x] M9: 希望成功施法效果 — `AttackResolution.hopeSuccessCastAvailable` 字段

### 第四优先级 — 完善与内容
- [x] C10: 伤痕退役逻辑 — `StateManager.applyDeathMoveResult` 允许 maxHope=0 + mustRetire 条件
- [x] M2: 做好准备团队加成 — `executeShortRestAction` 添加 isTeamRest 参数
- [x] M12: 多重优势/劣势叠加 — `rollAdvantageDisadvantage` 掷 |net| 个 d6 并累加
- [x] M13: 兼职授予子职卡 — `CharacterLevelUp.levelUp` multiclass 分支添加基础子职业卡
- [x] M14: 兼职领域卡等级限制 — `CharacterLevelUp` gainDomainCard 添加 ceil(level/2) 限制
- [x] m1: 关键成功伤害计算 — `calculateCriticalDamage` 改为 proficiency × dieSides
- [x] m2: 敌人类型系统扩展 — `EnemyType` 扩展为12种类型
- [x] m4: 补充状态效果类型 — 添加7种新条件 + CONDITION_EFFECTS + CONDITION_LABELS
- [x] m5: 休息行动数服务端验证 — `executeRestInternal` 检查 actions.length !== 2
- [x] m6: 短休允许换领域卡 — domainCardsSwapped 改为 true（短休+长休均可）
- [x] m7: 回避死亡施加昏迷 — `avoidDeath` 添加 conditionApplied='unconscious'
- [x] m8: 局势恶化机械效果 — `avoidDeath` 添加 stressGained=1, fearGained=1 + StateManager 处理
- [x] m9: 伤痕记录Scar对象 — `StateManager.applyDeathMoveResult` 推入 Scar 对象
- [x] m10: 恐惧特性费用从数据读取 — `fearActions.ts` 从 enemy.features 读取 cost
- [x] m11: 兼职后子职卡限制修正 — 仅阻止原职业精通卡，允许进阶卡
- [x] m12: 初始经历验证修正 — CharacterCreator + DaggerHeartRules 均改为2个+2

### 跳过项（内容补充，非代码逻辑修复）
- [ ] m3: 补充敌人数据（数据补充，非逻辑修复）

## TypeScript 编译状态：✅ 通过（0 错误）
## 测试状态：15/19 suites passed, 380+ tests passed
## 遗留测试失败：AIGameMaster.test.ts (1 test, 与本次修复无关), AdventureSimulation.test.ts (worker crash, 环境问题)
