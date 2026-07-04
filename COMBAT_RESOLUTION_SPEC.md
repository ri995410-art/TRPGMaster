# COMBAT_RESOLUTION_SPEC.md — 战斗伤害后端结算实现规格

> 目标：闭环 REVIEW.md 的 P0-C。让 HP / 压力 / 护甲 / 敌人血量由**后端按规则结算**，AI 只把"已结算的结果"讲成故事。彻底摆脱对 `[STATE]` 标记的依赖（实测 0% 触发）。
>
> 给执行 LLM：本规格里的函数签名都对照真实代码核实过。`DaggerHeartRules.ts` 里的伤害函数**已经写好且有测试，只是从未被调用**——你的主要工作是"接线"，不是重写规则。所有 socket payload / 字段名以 `shared/types/*` 为准。

---

## 0. 现状（已核实）

- `dice:roll` 事件：已用 `resolveDualityDice` 结算希望/恐惧并写入 `StateManager`，但**结果只广播给前端，没喂进 AI 上下文**，且与 `player:action` 是**两个互不相关的事件**。
- `combat:action` 事件：仅把 `actionId` 拼成一句字符串 → 当普通叙事丢给 `handlePlayerAction`。**没有掷骰、命中判定、伤害计算、HP 扣减。**
- HP / 压力 / 护甲：全代码里**唯一**能改的路径是 `stateChangeParser` 解析 `[STATE]`，而它 0% 触发。
- `DaggerHeartRules.ts` 现成但未被调用：`resolveRoll` / `rollWeaponDamage` / `calculateCriticalDamage` / `calculateDamageSeverity` / `getHpLossFromSeverity` / `applyArmorSlot` / `calculateThresholds`。
- `Character` 已含：`hp/maxHp`、`stress/maxStress`、`hope/maxHope`、`armorSlots/maxArmorSlots`、`evasion`、`minorThreshold/majorThreshold/severeThreshold`、`proficiency`、`mainWeapon: WeaponData{damageDie,...}`、`level`。

---

## 1. 核心原则（不可违背）

**所有数值机制由后端结算。AI 只做两件事：**
1. 把后端**已结算**的结果讲成沉浸式故事（拿到结构化结果，不准改数字）；
2. 通过**结构化通道**声明意图（谁攻击谁、陷阱造成伤害），由后端结算——**绝不**靠自然语言 `[STATE]` 或正则扒散文。

新的回合数据流：

```
玩家声明机械行动 (action:attack / 受到伤害)
  → 后端结算 (combatResolver, 纯函数)           ← 用现成 DaggerHeartRules
  → 后端写 StateManager (HP/压力/护甲/敌血/恐惧)  ← 确定性, 立即广播
  → 把"已结算结果"注入 AI 上下文
  → AI 流式叙事 (只描述既定结果, 不出数字)
GM 裁定的伤害 (陷阱/敌袭) → AI 走结构化效果通道 → 后端结算 → 同上
```

---

## 2. 新增 shared 类型

`shared/types/combat.ts`（新建）：

```ts
import type { DamageSeverity, RollResultType } from './rules';

/** 一次需要掷骰的行动声明（攻击 / 属性检定） */
export interface ActionDeclaration {
  kind: 'attack' | 'check';
  attackerId: string;            // 发起者（玩家 playerId 或敌人 id）
  targetId?: string;             // 攻击目标（敌人 id 或玩家 id）
  trait?: string;               // 用于检定的属性（agility/strength…），决定 modifier
  difficulty: number;            // 攻击=目标 evasion；检定=GM 设定难度
  // 骰子：客户端掷好传入；省略则后端代掷
  hopeDie?: number;
  fearDie?: number;
  advantage?: number;            // 优势 d6 数
  disadvantage?: number;
}

/** 后端结算的攻击结果（纯数据，未写状态） */
export interface AttackResolution {
  outcome: RollResultType;       // criticalSuccess / hopeSuccess / fearSuccess / hopeFailure / fearFailure
  success: boolean;
  isCritical: boolean;
  hopeDie: number;
  fearDie: number;
  total: number;
  difficulty: number;
  hopeGain: number;              // 给发起者（玩家）
  fearGain: number;              // 给 GM 恐惧池
  // 命中后的伤害（未命中则全 0 / none）
  damageRolled: number;
  hpLossToTarget: number;        // 敌人：直接扣 HP；玩家目标：经严重度换算
  severity: DamageSeverity;      // 仅对"目标是玩家"有意义
  narrationHint: string;         // 给 AI 的紧凑事实摘要（中文）
}

/** 对某个角色施加伤害的结算（陷阱 / 敌袭 / 环境，目标是玩家） */
export interface DamageResolution {
  rawDamage: number;
  severityBeforeArmor: DamageSeverity;
  severityAfterArmor: DamageSeverity;
  armorSlotsSpent: number;
  hpLoss: number;
  stressGain: number;
  narrationHint: string;
}

/** AI 通过结构化通道声明的 GM 机械效果（非玩家主动行动的伤害来源） */
export interface GmEffect {
  type: 'damageToPlayer' | 'stressToPlayer' | 'enemyAttack' | 'enemyHp' | 'spendFear';
  targetId?: string;             // 玩家 id / 敌人 id
  enemyId?: string;
  amount?: number;               // 伤害值 / 压力值 / 恐惧值
  source?: string;               // "毒雾陷阱" 等，仅供叙事
}
```

> 若 `RollResultType` / `DamageSeverity` 已在 `shared/types/rules.ts`（已确认存在），直接 import，不要重复定义。

---

## 3. 纯结算层 `server/src/rules/combatResolver.ts`（新建）

全部纯函数，不碰 `StateManager`，便于单测。

```ts
import {
  resolveRoll, rollWeaponDamage, calculateCriticalDamage,
  calculateDamageSeverity, applyArmorSlot, getHpLossFromSeverity,
} from './systems/DaggerHeartRules';
import { rollDualD12 } from './systems/DaggerHeartRules'; // 已存在：后端代掷
import type { Character } from '@trpgmaster/shared';
import type { CombatEnemy } from '@trpgmaster/shared';
import type {
  ActionDeclaration, AttackResolution, DamageResolution, DamageSeverity,
} from '@trpgmaster/shared';

/** 玩家攻击敌人：掷骰判定命中 → 命中则掷武器伤害 → 敌人直接扣 HP */
export function resolvePlayerAttack(
  attacker: Character,
  enemy: CombatEnemy,
  decl: ActionDeclaration,
): AttackResolution {
  // 1) 攻击掷骰（客户端提供 or 后端代掷）
  const dice = decl.hopeDie != null && decl.fearDie != null
    ? { hopeDie: decl.hopeDie, fearDie: decl.fearDie }
    : rollDualD12();
  const modifier = traitModifier(attacker, decl.trait);
  const roll = resolveRoll(
    dice.hopeDie, dice.fearDie, modifier, decl.difficulty,
    decl.advantage ?? 0, decl.disadvantage ?? 0,
  );

  let damageRolled = 0;
  let hpLossToTarget = 0;

  if (roll.success) {
    // 2) 武器伤害；关键成功用 calculateCriticalDamage
    const w = attacker.mainWeapon;
    const dmg = roll.isCritical
      ? calculateCriticalDamage(attacker.proficiency, w.damageDie, w.damageModifier ?? 0).totalDamage
      : rollWeaponDamage(attacker.proficiency, w.damageDie, w.damageModifier ?? 0).total;
    damageRolled = dmg;
    // 敌人按 HP 直接结算（敌人无严重度阈值时的简化；若敌人 statblock 有阈值，改用 severity）
    hpLossToTarget = dmg;
  }

  return {
    outcome: roll.type, success: roll.success, isCritical: roll.isCritical,
    hopeDie: roll.hopeDie, fearDie: roll.fearDie, total: roll.total, difficulty: roll.difficulty,
    hopeGain: roll.hopeGained, fearGain: roll.fearGained,
    damageRolled, hpLossToTarget, severity: 'none',
    narrationHint: roll.success
      ? `攻击命中（${zh(roll.type)}），对${enemy.name}造成${damageRolled}点伤害。`
      : `攻击未命中（${zh(roll.type)}）。`,
  };
}

/** 对玩家角色施加伤害：原始伤害 → 严重度(用角色阈值) → 可选护甲降级 → HP 标记数 */
export function resolveDamageToCharacter(
  target: Character,
  rawDamage: number,
  spendArmorSlots: number = autoArmorPolicy(target, rawDamage),
): DamageResolution {
  const sevBefore = calculateDamageSeverity(
    rawDamage, target.minorThreshold, target.majorThreshold, target.severeThreshold,
  );
  const slots = Math.min(spendArmorSlots, target.armorSlots);
  const { newSeverity, slotsSpent } = applyArmorSlot(sevBefore, slots);
  const hpLoss = getHpLossFromSeverity(newSeverity);
  return {
    rawDamage,
    severityBeforeArmor: sevBefore,
    severityAfterArmor: newSeverity,
    armorSlotsSpent: slotsSpent,
    hpLoss,
    stressGain: 0,
    narrationHint: `${target.name}受到${zh2(newSeverity)}伤害，失去${hpLoss}点生命${slotsSpent ? `（消耗${slotsSpent}护甲槽）` : ''}。`,
  };
}

// --- 辅助 ---
function traitModifier(c: Character, trait?: string): number {
  if (!trait) return 0;
  return (c.attributes as Record<string, number>)[trait] ?? 0;
}
// 简单护甲策略：重度及以上自动消耗 1 槽降级（可后续做成玩家交互选择）
function autoArmorPolicy(c: Character, raw: number): number {
  if (c.armorSlots <= 0) return 0;
  const sev = calculateDamageSeverity(raw, c.minorThreshold, c.majorThreshold, c.severeThreshold);
  return sev === 'major' || sev === 'severe' ? 1 : 0;
}
function zh(t: string): string { /* outcome→中文，省略 */ return t; }
function zh2(s: DamageSeverity): string {
  return { none: '无', minor: '轻度', major: '重度', severe: '严重' }[s];
}
```

> 注意：`WeaponData` 上的伤害修正字段名以 `shared/types/rules.ts` 的 `WeaponData` 为准（这里写 `damageModifier`，若实际不同请改）。敌人是否有伤害阈值同样查 `EnemyStatBlock`，有则把 `hpLossToTarget` 换成 severity 结算。

---

## 4. 应用层 `server/src/network/combatApply.ts`（新建）

把结算结果写进 `StateManager`，集中所有 clamping。

```ts
import type { StateManager } from '../core/StateManager';
import type { AttackResolution, DamageResolution } from '@trpgmaster/shared';

export function applyPlayerAttack(
  sm: StateManager, attackerPlayerId: string, enemyId: string, r: AttackResolution,
): void {
  if (r.hopeGain > 0) sm.updateCharacterHope(r.hopeGain);
  if (r.fearGain > 0) sm.addFearPoints(r.fearGain);
  if (r.hpLossToTarget > 0) sm.updateEnemyHp(enemyId, -r.hpLossToTarget); // 见 §5
}

export function applyDamageToCharacter(
  sm: StateManager, playerId: string, r: DamageResolution,
): void {
  if (r.armorSlotsSpent > 0) sm.updateCharacterArmorSlots(-r.armorSlotsSpent); // 见 §5
  if (r.hpLoss > 0) sm.updateCharacterHp(-r.hpLoss);
  if (r.stressGain > 0) sm.updateCharacterStress(r.stressGain);
}
```

---

## 5. StateManager 缺口补全

`updateCharacterHp / updateCharacterStress / updateCharacterHope / addFearPoints` 已存在。需**确认或新增**：

```ts
// 若缺失，按 updateCharacterHp 的 clamping 模式新增
updateCharacterArmorSlots(delta: number): void {
  const c = this.getCharacter();
  c.armorSlots = Math.max(0, Math.min(c.maxArmorSlots, c.armorSlots + delta));
  this.notifyChange();
}
updateEnemyHp(enemyId: string, delta: number): void {
  const combat = this.getCombatState();
  const e = combat?.enemies.find(x => x.id === enemyId);
  if (!e) return;
  e.currentHp = Math.max(0, Math.min(e.maxHp, e.currentHp + delta));
  if (e.currentHp === 0) { /* 标记击败 / 触发 onDefeat */ }
  this.notifyChange();
}
```

> `notifyChange()` 用现有的 onChange 触发机制（广播 + 持久化），别另起一套。

---

## 6. SocketServer 接线

### 6.1 新事件 `action:attack`（替代纯文本 `combat:action`）

```ts
socket.on('action:attack', (msg: SocketMessage<ActionDeclaration>) => {
  this.handleAttack(socket, msg);
});
```

```ts
private async handleAttack(socket: Socket, msg: SocketMessage<ActionDeclaration>): Promise<void> {
  const client = this.clients.get(socket.id);
  if (!client) return;
  const sm = this.sessionRegistry.findById(client.sessionId);
  if (!sm) return;

  // 复用现有 safety / spotlight / turnLock 闸门（抽成 guardTurn helper，见 §6.3）
  if (!(await this.guardTurn(socket, client, sm))) return;

  const decl = msg.payload;
  const attacker = sm.getPlayerCharacter(client.playerId) || sm.getCharacter();
  const enemy = sm.getCombatState()?.enemies.find(e => e.id === decl.targetId);
  if (!attacker || !enemy) return;

  // 1) 后端结算 + 写状态（确定性，先于叙事）
  const res = resolvePlayerAttack(attacker, enemy, decl);
  applyPlayerAttack(sm, client.playerId, enemy.id, res);
  // onChange 已广播 state:update；前端立即看到敌血/希望/恐惧变化

  // 2) 把已结算结果喂给 AI，让它只负责叙事
  const actionText =
    `【已结算·请据此叙事，不要改动任何数字】${attacker.name} 攻击 ${enemy.name}。结果：${res.narrationHint}`;
  await this.runNarration(socket, client, sm, actionText, { resolved: res }); // 见 §6.4
}
```

### 6.2 玩家受到伤害（来自 GM 裁定 / 敌袭）

走 §7 的结构化效果通道，由 `handlePlayerAction` 叙事后统一结算（不要让玩家客户端自报受伤）。

### 6.3 把三道闸门抽成 helper

当前 `handlePlayerAction` 里 safety / spotlight / turnLock 三段重复逻辑，抽成 `private async guardTurn(socket, client, sm): Promise<boolean>` 复用，`handleAttack` 与 `handlePlayerAction` 共用。

### 6.4 `runNarration`：统一叙事 + 结构化效果回收

把现有 `handlePlayerAction` 里"建 context → 流式 → 结束"那段抽出来，新增两点：
- context 增加 `resolvedOutcome?`，AI 拿到已结算结果；
- 叙事结束后走 §7 回收 GM 效果。

---

## 7. GM 裁定伤害：结构化通道（替代 `[STATE]` 与"正则扒散文"）

**为什么不用正则扫叙事**：模型描述伤害措辞无穷、常无数字、会把敌人受的伤写进去、会为戏剧夸张——正则会"自信地写错状态"，比没有更糟。这正是 REVIEW 的根因，换层皮而已。

**正确做法：让结构化输出成为模型某次调用的唯一任务。** 叙事完成后，对刚生成的叙事**单独发一次"只输出 JSON"的请求**，可靠性远高于在散文里夹标记。

`server/src/ai/extractGmEffects.ts`（新建）：

```ts
import { z } from 'zod';
import type { AIGateway } from './AIGateway';
import type { GmEffect } from '@trpgmaster/shared';

const GmEffectSchema = z.array(z.object({
  type: z.enum(['damageToPlayer','stressToPlayer','enemyAttack','enemyHp','spendFear']),
  targetId: z.string().optional(),
  enemyId: z.string().optional(),
  amount: z.number().optional(),
  source: z.string().optional(),
}));

const SYS = `你是规则结算助手。给定一段 GM 叙事，抽取其中"对玩家角色或敌人产生的机械效果"。
只输出 JSON 数组，无任何解释或 markdown。没有机械效果则输出 []。
字段：type(damageToPlayer|stressToPlayer|enemyAttack|enemyHp|spendFear), targetId, enemyId, amount, source。`;

export async function extractGmEffects(gw: AIGateway, narration: string): Promise<GmEffect[]> {
  try {
    const { fullText } = await gw.sendRequest(
      [{ role: 'system', content: SYS }, { role: 'user', content: narration }],
      { temperature: 0 },
    );
    const json = fullText.replace(/```json|```/g, '').trim();
    return GmEffectSchema.parse(JSON.parse(json));
  } catch { return []; }   // 失败则不施加效果，宁可漏不可错
}
```

应用：叙事结束后调用，把 `damageToPlayer` 走 `resolveDamageToCharacter`→`applyDamageToCharacter`，`enemyAttack` 走攻击结算（敌人攻击玩家），`enemyHp/spendFear` 直接写状态。**所有数值仍由后端结算，AI 只声明"发生了什么类型的事"。**

> 升级路线（更稳）：若 SiliconFlow 的模型支持 function-calling/tool-use，把上面改成工具调用，让"结算"作为工具由后端执行；比二次解析更可靠。先用二次调用跑通，后续再升级。

---

## 8. 提示词改造 `AIGameMaster.buildSystemPrompt`

删除/弱化现有强制 `[STATE]` 段（66 行 `stateReminder`、631–661 行）。改为：

```
## 机械结算（重要）
- 本回合的数值结果由系统预先算好，写在 <resolved_outcome> 中。
- 你必须严格按 <resolved_outcome> 叙事，绝不擅自更改、新增或省略任何数字（HP、伤害、压力、希望、恐惧）。
- 不要输出 [STATE] 标记；状态由系统负责，不归你管。
- 你只描述"已经发生的结果"，把数字讲成画面与后果。
```

`[STATE]` 解析（`stateChangeParser`）**保留为第三道保险**但不再在提示词里要求模型输出——它只在极少数遗漏时兜底。

在 context 注入处加：
```
<resolved_outcome>
${context.resolvedOutcome?.narrationHint ?? '（本回合无机械结算）'}
</resolved_outcome>
```

---

## 9. 必加测试（确定性，秒级）

`combatResolver.test.ts`：
- 关键成功（hopeDie===fearDie）→ 用 `calculateCriticalDamage`、`hopeGain=1`、`fearGain=0`。
- 命中带恐惧 → `fearGain=1`，敌人 HP 扣 `damageRolled`。
- 未命中 → 伤害全 0。
- `resolveDamageToCharacter`：原始伤害刚好等于各阈值 → severity 边界正确；护甲降级后 `hpLoss` 用 `getHpLossFromSeverity`；护甲不足时 `slotsSpent` 不超过 `armorSlots`。

`combatApply.test.ts`：施加后 `StateManager` 的 HP/护甲/恐惧被正确 clamp，敌人 HP 不破 0/上限。

`extractGmEffects.test.ts`：mock `AIGateway` 返回合法/非法/含 markdown 的 JSON，断言解析健壮、失败返回 `[]`。

集成（mock AIGateway）：`action:attack` 一次命中流程，断言敌人掉血、玩家得希望/GM 得恐惧，且**不依赖任何 `[STATE]` 输出**。

---

## 10. 落地顺序

1. 加 `shared/types/combat.ts` + StateManager 缺口（§5）+ 测试。
2. `combatResolver.ts` + `combatApply.ts` + 测试（此时核心机制已可用）。
3. `action:attack` 接线 + `guardTurn`/`runNarration` 抽取（§6）。
4. 提示词改造（§8）：去掉强制 `[STATE]`，注入 `<resolved_outcome>`。
5. `extractGmEffects` 结构化通道（§7）接入叙事后回收。
6. 前端：把战斗按钮从发 `combat:action` 文本改为发 `action:attack` 结构化声明；展示 `state:update` 带来的即时数值变化。

完成后，81 轮里 "HP 卡在 6/7" 的问题从根上消失：因为现在有确定性代码路径在改它，且不再指望模型输出标记。