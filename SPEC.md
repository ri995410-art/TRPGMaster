# SPEC.md — 单桌演示就绪重构执行文档

> 目标: 让当前项目可在单桌环境下完成"开始→结束"完整游玩流程的演示
> 执行模型: Sonnet 100% 严格按步骤执行，禁止修改计划外代码
> 项目根: `D:\TRPGMaster - 副本`
> 验证命令均从项目根执行

---

## 第一部分：前置现状扫描

### 1.1 TypeScript 与类型安全问题

`npx tsc --noEmit -p server/tsconfig.json` 与 `npx tsc --noEmit -p app/tsconfig.json` 当前**零编译错误**，但存在危险的类型逃逸：

| 严重度 | 文件:行 | 问题 |
|--------|---------|------|
| HIGH | `server/src/core/StateManager.ts:43` | `character: null as unknown as Character` — `getCharacter()` (line 88-90) 在 character 未 set 时返回 `null`，调用方访问属性即崩溃 |
| HIGH | `server/src/core/StateManager.ts:759` | `loadFromPersisted` 中 `|| null as unknown as Character` — 持久化恢复时若角色未匹配，返回 null 角色对象 |
| HIGH | `server/src/core/CharacterCreator.ts:233,287,297,303` | 4 处 `null as unknown as Character` — 创建失败时返回 null 角色，调用方未检查 |
| MED | `app/src/screens/CombatScreen.tsx:85` | `(enemy as any).evasion ?? 12` — 服务端字段变化时静默回退到 12，破坏战斗难度 |
| MED | `app/src/hooks/useSocket.ts:599` | `store.setSessionZeroPhase(msg.payload.phase as any)` — 类型不安全 |
| MED | `app/src/screens/CharacterCreateScreen.tsx:139,172,176,277` | 多处 `as any` 处理域卡/经历，掩盖类型错误 |
| LOW | `server/src/rules/data/DaggerheartDataProvider.ts:21` | `daggerheartData as unknown as GameDataCollection` — 数据形状无校验 |
| LOW | `server/src/ai/AIGateway.ts:244` | 批量请求失败时返回 `null as unknown as AIResponse` |

### 1.2 关键运行时 Bug

| 严重度 | 文件:行 | Bug |
|--------|---------|-----|
| **P0** | `server/src/network/SocketServer.ts:2294,2355,2431` | `pendingReactionContext` Map 只有 `.get()` 与 `.delete()`，**从不 `.set()`** — 反应系统声明了但实际无法触发，玩家声明反应永远收到 `NO_PENDING_REACTION` 错误 |
| **P0** | `server/src/network/SocketServer.ts:936-939` | `disconnect` 处理器只调用 `handleLeave`，未清理 `this.clients`、`this.activeStreams`、`this.pendingReactionContext` — 长会话内存泄漏，重连后出现幽灵客户端 |
| **P0** | `server/src/core/StateManager.ts:88-90` | `getCharacter()` 返回 `JSON.parse(JSON.stringify(this.state.character))`，若 character 为 null 返回 `null`，调用方访问 `.hp`/`.name` 立即崩溃 |
| **P0** | `server/src/core/FileSessionStore.ts:169-187` | `persistHistory` 非原子写：`writeFileSync(tmp)` → `copyFileSync(tmp, dst)` → `unlinkSync(tmp)`。Windows 上 `copyFileSync` 不保证原子替换；进程在 copy 与 unlink 间崩溃则留下 `.tmp` 垃圾文件，且目标文件可能半写 |
| **P0** | `app/src/hooks/useSocket.ts:150-164` | `connectToServer` 在 `socket.disconnect()` 前调用 `socket.removeAllListeners()` — disconnect 事件监听器被先移除，disconnect 永不触发，旧 socket 状态泄漏 |
| P1 | `server/src/ai/extractGmEffects.ts:180-188` | AI 返回非 JSON 时 `JSON.parse` 抛错被 catch，仅重试 1 次后返回空效果 — 战斗触发信号丢失，玩家"打了人但战斗没启动" |
| P1 | `server/src/rules/combatResolver.ts:65-77` | `resolvePlayerAttack` 中 `severity` 硬编码为 `'none'`，玩家攻击伤害不计算严重度，与敌人攻击行为不一致 |
| P1 | `server/src/network/SocketServer.ts:319-341` | `gm:cancelNarration` 不校验请求方是否为活跃流的所有者 — 任意客户端可取消他人的叙述 |
| P1 | `server/src/index.ts:24` | `parseInt(process.env.PORT || '3000', 10)` 无 NaN 校验 — `PORT=abc` 启动失败无明确错误 |
| P1 | `server/src/index.ts:84-117` | session 恢复循环无 try/catch — 单个损坏 session 崩溃整个启动 |
| P2 | `app/src/screens/AdventureScreen.tsx:95-99` | `combatState` 出现即自动跳转战斗屏，未检查 `enemies.length > 0` — 空战斗仍跳转 |
| P2 | `app/src/store/gameStore.ts:367-376` | 冒险消息硬上限 500 条，超出静默丢弃 — 长 demo 丢失历史 |

### 1.3 工具链缺口

- **无 ESLint 配置文件**：项目根、`server/`、`app/` 均无 `.eslintrc.*` 或 `eslint.config.*`。`npm run lint` 实际无法运行。
- **核心规则模块测试覆盖为零**：`server/src/__tests__/rules/` 仅有 `DaggerHeartRules.test.ts`。下列模块无任何测试：
  - `server/src/rules/combatResolver.ts`
  - `server/src/rules/systems/reactionSystem.ts`
  - `server/src/rules/systems/fearActions.ts`
  - `server/src/rules/systems/enemyBehavior.ts`
  - `server/src/rules/systems/damageFormula.ts`
  - `server/src/rules/systems/cardEffects.ts`
  - `server/src/network/SocketServer.ts`（集成测试）
  - `server/src/core/SessionPersistence.ts`

### 1.4 数据层风险

- `server/src/rules/data/daggerheart/*.json` 启动时无完整性校验。`weapons.json` 引用的 trait、`classes.json` 引用的 `subclassIds`、`enemies.json` 的 `behavior` 字段均无外键校验。
- 已有 `server/src/rules/data/dataValidator.ts` 文件存在但**未在启动时调用**。

---

## 第二部分：重构改进核心目标

### 可量化指标

| 指标 | 当前值 | 目标值 | 验证方法 |
|------|--------|--------|----------|
| TypeScript 编译错误数 | 0 | 0 | `npx tsc --noEmit -p server/tsconfig.json && npx tsc --noEmit -p app/tsconfig.json` 退出码 0 |
| 生产代码 `as any` 数量 | 6 处 | 0 处 | `grep -rn "as any" server/src app/src --include="*.ts" --include="*.tsx" \| grep -v __tests__ \| wc -l` = 0 |
| 生产代码 `as unknown as` 数量 | 12 处 | ≤ 2 处（仅保留 dataValidator 内动态校验） | `grep -rn "as unknown as" server/src app/src --include="*.ts" --include="*.tsx" \| grep -v __tests__ \| grep -v dataValidator \| wc -l` ≤ 2 |
| ESLint 错误数 | N/A（无配置） | 0 | `npx eslint server/src app/src shared/src --ext .ts,.tsx` 退出码 0 |
| 核心规则模块测试文件数 | 1 | 7 | `ls server/src/__tests__/rules/*.test.ts server/src/__tests__/systems/*.test.ts 2>/dev/null \| wc -l` ≥ 7 |
| 单元测试通过率 | — | 100% | `npx jest --testPathPattern="server" --passWithNoTests` 退出码 0 |
| `pendingReactionContext.set` 调用数 | 0 | ≥ 1 | `grep -c "pendingReactionContext.set" server/src/network/SocketServer.ts` ≥ 1 |
| `disconnect` 处理器清理 `clients` Map | 否 | 是 | `grep -A 20 "socket.on('disconnect'" server/src/network/SocketServer.ts` 含 `this.clients.delete` |
| `FileSessionStore.persistHistory` 使用原子 rename | 否 | 是 | `grep -E "renameSync|rename\(" server/src/core/FileSessionStore.ts` 命中 |
| `getCharacter()` 在 character 为 null 时行为 | 返回 null | 抛出明确错误或返回可选类型 | 代码审查 |
| `dataValidator` 启动时调用 | 否 | 是 | `grep -n "validateAllData\|dataValidator" server/src/index.ts` 命中 |
| `process.env.PORT` NaN 校验 | 无 | 有 | `grep -A 2 "parseInt.*PORT" server/src/index.ts` 含 `Number.isNaN` 检查 |

### 不做的事（明确排除）

- **不**新增团队动作掷骰、接力掷骰、帮助盟友等缺失规则机制（属 FRESH_AUDIT 范畴，非本次重构）
- **不**新增商用功能（多桌、预约、计费等）
- **不**重构 AI prompt 结构
- **不**改写 `dataValidator.ts` 的动态校验逻辑
- **不**触碰 `shared/types/` 下的类型定义文件（除明确指定的字段可选化）

---

## 第三部分：分步执行拆解

> 每步独立可执行、可验证。Sonnet 按步骤顺序执行，每步完成后运行该步的"即时验证"命令通过后再进入下一步。
> 行号会随修改漂移，定位时以**函数名/唯一字符串**为准。

---

### 步骤 1：建立 ESLint 配置

**文件**:
- 新建 `eslint.config.js`（项目根）

**修改逻辑**:
1. 在项目根创建 `eslint.config.js`，使用 ESLint v9 flat config 格式
2. 配置内容：
   - `@eslint/typescript-eslint` 推荐规则
   - `eslint:recommended` 规则
   - 解析器 `typescript-eslint/parser`
   - 忽略 `node_modules/`、`**/dist/**`、`**/__tests__/**` 中生成的快照
   - 规则：`no-unused-vars` 警告、`@typescript-eslint/no-explicit-any` 错误、`@typescript-eslint/no-non-null-assertion` 警告
3. 不修改 `package.json` 的 `lint` 脚本（已是 `eslint shared/src server/src app/src --ext .ts,.tsx`，flat config 会自动识别）

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx eslint server/src app/src shared/src --ext .ts,.tsx 2>&1 | tail -20
```
退出码非零是预期的（现有代码会有 `no-explicit-any` 报错），但配置文件能加载即视为本步通过。若输出 `ConfigNotFound` 或 `Invalid config` 则失败。

---

### 步骤 2：StateManager null character 安全化

**文件**: `server/src/core/StateManager.ts`

**修改逻辑**:
1. 定位 `createInitialState` 函数（约 line 38-63），将 `character: null as unknown as Character` 改为 `character: null`，并将 `SessionState.character` 字段在 `shared/types/character.ts` 或对应 session state 类型文件中标为 `Character | null`
2. 定位 `getCharacter()` 函数（约 line 88-90），改为：
   ```ts
   getCharacter(): Character | null {
     if (!this.state.character) return null;
     return JSON.parse(JSON.stringify(this.state.character));
   }
   ```
3. 定位 `loadFromPersisted` 中 `|| null as unknown as Character`（约 line 759），改为直接返回 `null`（去掉 `as unknown as Character`）
4. 全局搜索 `getCharacter()` 调用方（`server/src` 下），凡是不处理 null 的，添加 `if (!character) { ... return; }` 守卫。**只在调用方添加守卫，不修改调用方业务逻辑**。具体调用点用 `grep -rn "getCharacter()" server/src` 列出后逐个处理。

**禁止改动**:
- 不修改 `getCharacter()` 的返回值结构（仍是深拷贝）
- 不修改 `addPlayer`、`setCharacter` 等其他方法

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx tsc --noEmit -p server/tsconfig.json
grep -c "as unknown as Character" server/src/core/StateManager.ts
```
第一命令退出码 0；第二命令输出 `0`。

---

### 步骤 3：CharacterCreator 返回类型安全化

**文件**: `server/src/core/CharacterCreator.ts`

**修改逻辑**:
1. 定位 4 处 `return { character: null as unknown as Character, errors }`（line 233、287、297、303）
2. 将函数返回类型从 `{ character: Character; errors: string[] }` 改为 `{ character: Character | null; errors: string[] }`
3. 4 处 `null as unknown as Character` 改为 `null`
4. 调用方（`grep -rn "CharacterCreator" server/src --include="*.ts" | grep -v __tests__`）添加 `if (!result.character) { return handleErrors(result.errors); }` 守卫，不修改成功路径逻辑

**禁止改动**: 不修改创建成功路径的任何字段赋值逻辑

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx tsc --noEmit -p server/tsconfig.json
grep -c "as unknown as Character" server/src/core/CharacterCreator.ts
```
第一命令退出码 0；第二命令输出 `0`。

---

### 步骤 4：SocketServer disconnect 资源清理

**文件**: `server/src/network/SocketServer.ts`

**修改逻辑**:
1. 定位 `socket.on('disconnect', ...)` 处理器（约 line 936-939）
2. 在 `handleLeave(socket)` 之后、`console.log` 之前，添加清理逻辑：
   ```ts
   socket.on('disconnect', () => {
     this.handleLeave(socket);
     const sessionId = this.clients.get(socket.id)?.sessionId;
     if (sessionId) {
       this.activeStreams.delete(sessionId);
       this.pendingReactionContext.delete(sessionId);
     }
     this.clients.delete(socket.id);
     console.log(`Client disconnected: ${socket.id}`);
   });
   ```
3. 不修改 `handleLeave` 内部逻辑

**禁止改动**:
- 不修改 `handleLeave` 函数
- 不修改 `clients`/`activeStreams`/`pendingReactionContext` 的声明位置或类型

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx tsc --noEmit -p server/tsconfig.json
grep -A 12 "socket.on('disconnect'" server/src/network/SocketServer.ts | grep -E "clients.delete|activeStreams.delete|pendingReactionContext.delete"
```
第二命令至少输出 3 行。

---

### 步骤 5：SocketServer gm:cancelNarration 所有权校验

**文件**: `server/src/network/SocketServer.ts`

**修改逻辑**:
1. 定位 `gm:cancelNarration` 处理器（约 line 319-341）
2. 在调用 `this.abortStream(sessionId)` 之前，添加所有权校验：
   ```ts
   const activeStream = this.activeStreams.get(sessionId);
   if (activeStream && activeStream.senderId !== msg.senderId) {
     socket.emit('session:error', {
       type: 'session:error',
       sessionId, senderId: 'system',
       payload: { error: '无权取消他人的叙述', code: 'FORBIDDEN' },
       timestamp: Date.now(),
     });
     return;
   }
   ```
3. 若 `activeStream` 不存在则正常 abort（保持原逻辑）

**注**: `activeStream` 的实际字段名以 `activeStreams` Map 的 value 类型为准。若该类型无 `senderId` 字段，用 `grep -n "activeStreams.set" server/src/network/SocketServer.ts` 找到 set 时的赋值，确认正确的字段名。

**禁止改动**: 不修改 `abortStream` 函数内部

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx tsc --noEmit -p server/tsconfig.json
grep -B 2 -A 15 "gm:cancelNarration" server/src/network/SocketServer.ts | grep "FORBIDDEN"
```
第二命令输出 1 行。

---

### 步骤 6：FileSessionStore 原子写

**文件**: `server/src/core/FileSessionStore.ts`

**修改逻辑**:
1. 定位 `persistHistory` 函数（约 line 169-187）
2. 将 `writeFileSync(tmp)` + `copyFileSync(tmp, dst)` + `unlinkSync(tmp)` 三步替换为：
   ```ts
   const tmp = `${filePath}.tmp.${process.pid}`;
   writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
   try {
     fs.renameSync(tmp, filePath);  // POSIX 上原子，Windows 上同盘原子
   } catch (e) {
     try { fs.unlinkSync(tmp); } catch {}
     throw e;
   }
   ```
3. 确保已 `import * as fs from 'fs'` 或具体函数已导入（`renameSync`、`unlinkSync`、`writeFileSync`）

**禁止改动**:
- 不修改 `loadHistoryFromDisk` 的逻辑
- 不修改函数签名

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx tsc --noEmit -p server/tsconfig.json
grep -E "renameSync|copyFileSync" server/src/core/FileSessionStore.ts
```
第二命令输出含 `renameSync`，**不**含 `copyFileSync`。

---

### 步骤 7：useSocket 监听器清理顺序修正

**文件**: `app/src/hooks/useSocket.ts`

**修改逻辑**:
1. 定位 `connectToServer` 函数（约 line 150-164）
2. 当前顺序：`removeAllListeners()` → `disconnect()`。改为：
   ```ts
   if (socket) {
     socket.disconnect();
     // 等待 disconnect 事件触发后再清理监听器
     socket.removeAllListeners();
   }
   ```
3. 若原代码用了 `setTimeout` 或 promise 等待 disconnect，保持原结构，仅交换 `disconnect` 与 `removeAllListeners` 的调用顺序

**禁止改动**: 不修改其他 hook 逻辑、不修改 socket 事件绑定

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx tsc --noEmit -p app/tsconfig.json
grep -B 2 -A 8 "socket.disconnect" app/src/hooks/useSocket.ts | head -20
```
第二命令输出显示 `socket.disconnect()` 在 `removeAllListeners()` 之前。

---

### 步骤 8：extractGmEffects JSON 解析健壮化

**文件**: `server/src/ai/extractGmEffects.ts`

**修改逻辑**:
1. 定位 JSON 解析处（约 line 180-188）
2. 将当前的 `response.content.replace(/```(?:json)?\s*\n?/gi, '').replace(/```/g, '').trim()` 替换为更精确的提取：
   ```ts
   function extractJsonFromContent(content: string): string | null {
     // 优先匹配 ```json ... ``` 围栏
     const fenced = content.match(/```json\s*([\s\S]*?)```/i);
     if (fenced) return fenced[1].trim();
     // 其次匹配任意 ``` ... ``` 围栏
     const anyFenced = content.match(/```\s*([\s\S]*?)```/);
     if (anyFenced) return anyFenced[1].trim();
     // 最后尝试整段当作 JSON
     return content.trim();
   }
   ```
3. 用 `extractJsonFromContent` 替换原有 replace 链
4. `JSON.parse` 失败时，重试次数从 1 次提高到 2 次（共 3 次尝试），每次重试 prompt 中追加"上一次返回了无效 JSON，请只返回 JSON 数组"

**禁止改动**: 不修改效果类型的 schema、不修改重试触发的"战斗信号"判定逻辑

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx tsc --noEmit -p server/tsconfig.json
grep -c "extractJsonFromContent" server/src/ai/extractGmEffects.ts
```
第二命令输出 ≥ 2（定义 + 调用）。

---

### 步骤 9：combatResolver 玩家攻击严重度计算

**文件**: `server/src/rules/combatResolver.ts`

**修改逻辑**:
1. 定位 `resolvePlayerAttack` 函数（约 line 65-77）
2. 当前 `severity` 硬编码 `'none'`。改为根据 `dmg`（伤害值）与目标的阈值计算：
   ```ts
   const severity = this.calculateDamageSeverity(
     dmg,
     target.minorThreshold,
     target.majorThreshold,
     target.severeThreshold,
   );
   ```
   其中 `calculateDamageSeverity` 是 `DaggerHeartRules` 已有的方法（或在 shared 中 `DAMAGE_SEVERITY_HP` 工具）。若 `combatResolver` 内无该方法，通过 `getDataProvider()` 或直接调用 `DaggerHeartRules` 实例的方法。
3. `hpLossToTarget` 改为根据 severity 查表得到（与 `resolveDamage` 一致）

**禁止改动**: 不修改函数签名、不修改敌人攻击逻辑

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx tsc --noEmit -p server/tsconfig.json
grep -A 15 "resolvePlayerAttack" server/src/rules/combatResolver.ts | grep -E "calculateDamageSeverity|severity"
```
第二命令输出 ≥ 2 行，且无 `'none'` 硬编码。

---

### 步骤 10：index.ts 启动健壮性

**文件**: `server/src/index.ts`

**修改逻辑**:
1. 定位 PORT 解析（约 line 24），改为：
   ```ts
   const PORT_RAW = process.env.PORT || '3000';
   const PORT = Number(PORT_RAW);
   if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
     console.error(`Invalid PORT: ${PORT_RAW}`);
     process.exit(1);
   }
   ```
2. 定位 session 恢复循环（约 line 84-117），用 try/catch 包裹每个 session 的恢复：
   ```ts
   for (const [sessionId, sessionData] of Object.entries(persistedData.sessions)) {
     try {
       sessionRegistry.createSessionFromPersisted(sessionData);
     } catch (e) {
       console.error(`Failed to restore session ${sessionId}:`, e);
     }
   }
   ```
3. 在服务器启动完成后、监听端口前，调用 `dataValidator`（若步骤 12 已完成）或跳过本步的 dataValidator 部分

**禁止改动**: 不修改 `sessionRegistry` 的接口

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx tsc --noEmit -p server/tsconfig.json
grep -E "Number.isInteger|Invalid PORT" server/src/index.ts
grep -A 5 "createSessionFromPersisted" server/src/index.ts | grep "try\|catch"
```
两条命令均命中。

---

### 步骤 11：消除生产代码 `as any`（客户端）

**文件**:
- `app/src/screens/CombatScreen.tsx`
- `app/src/hooks/useSocket.ts`
- `app/src/screens/CharacterCreateScreen.tsx`

**修改逻辑**:
1. `CombatScreen.tsx:85` — `(enemy as any).evasion ?? 12` 改为正确字段访问。先确认 `CombatEnemy` 类型在 `shared/types/combat.ts` 中是否有 `evasion` 字段（已有）。直接 `enemy.evasion ?? 12`，去掉 `as any`。
2. `useSocket.ts:599` — `msg.payload.phase as any` 改为正确类型。查 `sessionZeroPhase` 的实际类型（应为联合字符串字面量），将 `as any` 替换为 `as SessionZeroPhase` 或对应类型，并 `import type { SessionZeroPhase } from '@trpgmaster/shared'`。
3. `CharacterCreateScreen.tsx:139,172,176,277` — 4 处 `as any`，逐一审查：
   - 若是域卡字段，改为 `as DomainCard` 或 `as DomainCard[]`
   - 若是经历字段，改为 `as Experience` 或 `as Experience[]`
   - 若是创建步骤数据，改为 `as CreationStepData` 或对应类型
   - 若无法确定类型，添加类型守卫（`if (isXxx(value))`）替代 `as any`

**禁止改动**: 不修改 UI 渲染逻辑、不修改组件结构

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx tsc --noEmit -p app/tsconfig.json
grep -rn "as any" app/src --include="*.ts" --include="*.tsx" | grep -v __tests__
```
第二命令输出为空。

---

### 步骤 12：dataValidator 启动时调用

**文件**: `server/src/index.ts`

**修改逻辑**:
1. 在 session 恢复循环之前（约 line 80 附近），添加数据校验调用：
   ```ts
   import { validateAllData } from './rules/data/dataValidator';
   // ...
   const dataIssues = validateAllData();
   if (dataIssues.length > 0) {
     console.warn(`Data validation issues (${dataIssues.length}):`);
     dataIssues.forEach(i => console.warn(`  - ${i}`));
     // 不退出，仅警告 — 允许降级运行
   }
   ```
2. 若 `validateAllData` 函数名与 `dataValidator.ts` 实际导出不符，用 `grep -n "^export" server/src/rules/data/dataValidator.ts` 确认实际函数名后调整 import

**禁止改动**: 不修改 `dataValidator.ts` 内部逻辑、不修改 JSON 数据文件

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx tsc --noEmit -p server/tsconfig.json
grep -n "validateAllData\|dataValidator" server/src/index.ts
```
第二命令输出 ≥ 1 行。

---

### 步骤 13：新增 combatResolver 单元测试

**文件**: 新建 `server/src/__tests__/rules/combatResolver.test.ts`

**修改逻辑**:
1. 创建测试文件，覆盖以下场景（每个场景一个 `it` 块）：
   - `resolvePlayerAttack` 攻击命中时计算正确 severity
   - `resolvePlayerAttack` 攻击未命中时 hpLoss 为 0
   - `resolvePlayerAttack` 暴击时伤害计算（若规则引擎支持）
   - `resolveDamageToCharacter` 轻度/重度/严重伤害对应 1/2/3 HP 槽
   - `resolveDamageToCharacter` 护甲槽消耗降一级严重度
   - `resolveDamageToCharacter` 已死角色不再受伤
2. 使用 `DaggerHeartRules` 测试中已有的 mock character/ enemy 模式（参考 `server/src/__tests__/rules/DaggerHeartRules.test.ts`）
3. 不引入新的 mock 库，复用 `jest`

**禁止改动**: 不修改 `combatResolver.ts` 源码

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx jest server/src/__tests__/rules/combatResolver.test.ts
```
所有 `it` 通过，退出码 0。

---

### 步骤 14：新增 fearActions 单元测试

**文件**: 新建 `server/src/__tests__/systems/fearActions.test.ts`（若 `__tests__/systems/` 目录不存在则创建）

**修改逻辑**:
1. 覆盖 5 种 Fear 行动：
   - `interruptAction` — 1 Fear 消耗，返回正确效果
   - `extraGMAction` — 1 Fear 消耗
   - `useEnemyFearTrait` — 缺少 enemyId 时返回错误
   - `useEnvironmentTrait` — 无环境特质时返回错误
   - `addEnemyExperience` — 敌人不存在时返回错误
2. 测试 Fear 不足时所有行动返回错误
3. 测试 Fear 足够时各行动正确扣减

**禁止改动**: 不修改 `fearActions.ts` 源码

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx jest server/src/__tests__/systems/fearActions.test.ts
```
退出码 0。

---

### 步骤 15：新增 enemyBehavior 与 damageFormula 单元测试

**文件**:
- 新建 `server/src/__tests__/systems/enemyBehavior.test.ts`
- 新建 `server/src/__tests__/systems/damageFormula.test.ts`

**修改逻辑**:
1. `enemyBehavior.test.ts` 覆盖：
   - 6 种 behavior（bruiser/leader/support/solo/ambusher/caster）的行动选择
   - 无可用目标时的回退行为
   - 压力满时优先解除自身状态
2. `damageFormula.test.ts` 覆盖：
   - `rollDamageFormula` 单骰与多骰
   - `maxDamageFormula` 返回所有骰最大值之和 + modifier
   - `averageDamageFormula` 返回期望值
   - 带抗性时伤害减半
   - 带免疫时伤害为 0

**禁止改动**: 不修改源码

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx jest server/src/__tests__/systems/enemyBehavior.test.ts server/src/__tests__/systems/damageFormula.test.ts
```
退出码 0。

---

### 步骤 16：新增 reactionSystem 与 cardEffects 单元测试

**文件**:
- 新建 `server/src/__tests__/systems/reactionSystem.test.ts`
- 新建 `server/src/__tests__/systems/cardEffects.test.ts`

**修改逻辑**:
1. `reactionSystem.test.ts` 覆盖：
   - `findAvailableReactions` 对 4 种触发（onAttacked/onEnemyMove/onAllyDamaged/onEnemyCast）的返回
   - `resolveReactionRoll` 关键成功时忽略附加效果
   - `shieldBlock` 反应消耗护甲槽降一级严重度
   - `opportunityAttack` 反应命中时掷武器伤害
   - `uncannyDodge` 反应成功时降一级严重度
   - `reactionsUsed` 每轮一次限制
2. `cardEffects.test.ts` 覆盖：
   - `resolveCardEffect` 处理 `heal` 类型，HP 不超过 maxHp
   - 处理 `damage` 类型，正确扣减 HP
   - hopeCost 不足时拒绝执行
   - 目标不存在时返回错误

**禁止改动**: 不修改源码

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx jest server/src/__tests__/systems/reactionSystem.test.ts server/src/__tests__/systems/cardEffects.test.ts
```
退出码 0。

---

### 步骤 17：AdventureScreen 空战斗跳转守卫

**文件**: `app/src/screens/AdventureScreen.tsx`

**修改逻辑**:
1. 定位 `combatState` 出现时的自动跳转（约 line 95-99）
2. 添加守卫：
   ```ts
   if (combatState && combatState.enemies && combatState.enemies.length > 0) {
     navigation.navigate('Combat');
   }
   ```
3. 若 `combatState.enemies` 字段名不符，用 `grep -n "enemies" shared/types/combat.ts` 确认实际字段名

**禁止改动**: 不修改其他导航逻辑

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx tsc --noEmit -p app/tsconfig.json
grep -B 1 -A 5 "navigation.navigate('Combat')" app/src/screens/AdventureScreen.tsx | grep "enemies.length"
```
第二命令输出 ≥ 1 行。

---

### 步骤 18：gameStore 消息上限可配置化

**文件**: `app/src/store/gameStore.ts`

**修改逻辑**:
1. 定位消息上限 500（约 line 367-376）
2. 将硬编码 `500` 提取为模块顶部常量 `const MAX_ADVENTURE_MESSAGES = 500;`
3. 超出上限时不再静默丢弃，而是**保留最后 500 条**并 `console.warn('Adventure messages truncated')`
4. 不改变上限值，仅改变行为可观察性

**禁止改动**: 不修改 store 其他字段、不修改 persist 逻辑

**即时验证**:
```bash
cd "D:/TRPGMaster - 副本"
npx tsc --noEmit -p app/tsconfig.json
grep -n "MAX_ADVENTURE_MESSAGES" app/src/store/gameStore.ts
```
第二命令输出 ≥ 2 行（声明 + 使用）。

---

## 第四部分：风险与回滚方案

### 4.1 每步风险与回滚

| 步骤 | 风险 | 回滚操作 |
|------|------|----------|
| 1 ESLint 配置 | 现有代码大量 `no-explicit-any` 报错，CI 阻塞 | 删除 `eslint.config.js`，恢复无 lint 状态 |
| 2 StateManager null | 调用方未覆盖全，运行时 `Cannot read property of null` | `git checkout server/src/core/StateManager.ts`；调用方守卫保留无害 |
| 3 CharacterCreator null | 调用方未处理 null，创建失败时崩溃 | `git checkout server/src/core/CharacterCreator.ts` |
| 4 disconnect 清理 | 清理时机错误，重连时状态丢失 | `git checkout server/src/network/SocketServer.ts` 的 disconnect 处理器段落 |
| 5 cancelNarration 校验 | activeStream 字段名不符导致编译失败 | 按报错调整字段名；最差回滚 `git checkout` 该函数 |
| 6 FileSessionStore rename | Windows 跨盘 rename 失败 | 在 catch 中回退到 `copyFileSync` + `unlinkSync` 旧逻辑 |
| 7 useSocket 顺序 | disconnect 事件触发时序变化 | 交换回原顺序 |
| 8 extractGmEffects | 重试次数提高导致 AI 调用成本上升 | 重试次数改回 1 |
| 9 combatResolver severity | 玩家攻击伤害变化影响战斗平衡 | `severity` 改回 `'none'` |
| 10 index.ts 启动 | 端口校验过严导致开发环境失败 | 删除 `Number.isInteger` 校验 |
| 11 客户端 as any 清除 | 类型不匹配暴露潜在 bug | 逐处 `git checkout` 单个文件 |
| 12 dataValidator 启动 | 校验过严导致启动警告过多 | 删除 import 与调用 |
| 13-16 新增测试 | 测试 mock 不准导致 false fail | 单独 `git rm` 测试文件 |
| 17 AdventureScreen 守卫 | `enemies` 字段名不符编译失败 | 按报错调整字段名 |
| 18 gameStore 常量化 | 无显著风险 | `git checkout` |

### 4.2 绝对不能触碰的边界（Sonnet 禁改）

1. **`shared/types/` 下的类型定义文件** — 除步骤 2 明确允许的 `character: Character | null` 字段可选化外，**不修改任何类型定义**。类型修改会引发跨项目连锁错误。
2. **`data/rulebooks/daggerheart/*.md`** — 规则书 Markdown 是数据源，不修改。
3. **`server/src/rules/data/daggerheart/*.json`** — 数据文件不修改（校验发现问题应记录到 DEVLOG 而非直接改数据）。
4. **`server/src/ai/AIGameMaster.ts` 的 prompt 模板** — prompt 结构改动属于另一个工作流，本次只动 `extractGmEffects.ts`。
5. **`server/src/__tests__/integration/AdventureSimulation.test.ts`** — 集成测试是基线，不修改其断言。
6. **`app/src/components/creation/`** — 角色创建组件已在工作，不重构。
7. **任何 `package.json`、`tsconfig.json`** — 不修改依赖与编译选项。
8. **`prompts/` 目录** — AI prompt 文件不修改。
9. **任何未在本 SPEC 第三部分明确列出的文件** — 即使发现可改进点也禁止修改，记录到 DEVLOG 待后续处理。

### 4.3 步骤间依赖关系

- 步骤 1（ESLint）独立，可最先或最后做
- 步骤 2、3 独立（不同文件）
- 步骤 4、5 独立（同文件不同函数）
- 步骤 6 独立
- 步骤 7 独立
- 步骤 8 独立
- 步骤 9 独立
- 步骤 10 独立
- 步骤 11 依赖步骤 2、3 完成（否则 `as any` 清除后类型错误无法收敛）— **必须在 2、3 之后**
- 步骤 12 独立
- 步骤 13-16 独立于修复步骤，可在任何时候做（但建议在对应修复步骤后，以测试修复正确性）
- 步骤 13 建议在步骤 9 之后（验证 severity 修复）
- 步骤 16 建议在步骤 8 之后（验证 extractGmEffects 修复间接影响 cardEffects）
- 步骤 17、18 独立

**推荐执行顺序**: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18

---

## 第五部分：最终验收标准

### 5.1 编译与类型检查

```bash
cd "D:/TRPGMaster - 副本"
npx tsc --noEmit -p server/tsconfig.json
npx tsc --noEmit -p app/tsconfig.json
npx tsc --noEmit -p shared/tsconfig.json
```
三条命令退出码均为 0。

### 5.2 Lint 检查

```bash
cd "D:/TRPGMaster - 副本"
npx eslint server/src app/src shared/src --ext .ts,.tsx --max-warnings 0
```
退出码 0（步骤 11 完成后 `no-explicit-any` 错误应清零）。

### 5.3 单元测试

```bash
cd "D:/TRPGMaster - 副本"
npx jest --testPathPattern="server/src/__tests__" --ci --passWithNoTests
```
退出码 0，所有测试通过。预期测试文件数 ≥ 13（原有） + 6（新增） = 19。

### 5.4 类型逃逸审计

```bash
cd "D:/TRPGMaster - 副本"
grep -rn "as any" server/src app/src --include="*.ts" --include="*.tsx" | grep -v __tests__ | wc -l
grep -rn "as unknown as" server/src app/src --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v dataValidator | wc -l
```
第一条输出 `0`；第二条输出 `≤ 2`。

### 5.5 关键修复点验证

```bash
cd "D:/TRPGMaster - 副本"
# pendingReactionContext 仍只有 get/delete —— 反应系统不在本次修复范围（属 FRESH_AUDIT N-1~N-4）
# 本 SPEC 不要求修复反应系统，仅要求 disconnect 时清理 pendingReactionContext
grep -c "pendingReactionContext.delete" server/src/network/SocketServer.ts  # ≥ 1

# disconnect 清理 clients
grep -A 12 "socket.on('disconnect'" server/src/network/SocketServer.ts | grep "clients.delete"  # 命中

# StateManager null 安全
grep -c "as unknown as Character" server/src/core/StateManager.ts  # = 0

# FileSessionStore 原子写
grep -c "renameSync" server/src/core/FileSessionStore.ts  # ≥ 1
grep -c "copyFileSync" server/src/core/FileSessionStore.ts  # = 0

# useSocket 顺序
grep -B 1 -A 1 "removeAllListeners" app/src/hooks/useSocket.ts | grep "disconnect"  # disconnect 在前

# PORT 校验
grep -c "Number.isInteger" server/src/index.ts  # ≥ 1

# dataValidator 启动调用
grep -c "validateAllData\|dataValidator" server/src/index.ts  # ≥ 1
```

### 5.6 业务场景端到端校验

下列场景需通过人工或集成测试验证（Sonnet 完成代码修改后，由人工运行 demo 验证）：

1. **角色创建**: 启动 server + app，创建一个 1 级角色，选择种族/社区/职业/子职业/属性/经历/装备/域卡，完成创建进入冒险屏
2. **session 多人加入**: host 创建 session，2 个玩家用 session code 加入，全部进入冒险屏
3. **AI GM 叙事**: 玩家输入行动，AI 返回叙事，掷骰结果正确应用 Hope/Fear/Stress
4. **战斗启动**: AI 叙事触发敌人出现，自动跳转战斗屏，敌人 HP/压力/闪避正确显示
5. **玩家攻击**: 玩家对敌人攻击，掷骰、伤害、severity（轻度/重度/严重）正确计算
6. **敌人攻击**: 敌人对玩家攻击，伤害正确扣减 HP 槽，护甲槽可消耗降级
7. **死亡行动**: 玩家 HP 槽填满，弹出死亡行动选择，三选项效果正确
8. **休整**: 短休选 2 项行动，HP/压力/护甲槽/Hope 正确恢复，GM 获得 Fear
9. **断线重连**: 玩家断线后重连，能重新加入 session，状态不丢失
10. **session 持久化**: server 重启后，session 状态从磁盘恢复，玩家可继续

### 5.7 回归校验

```bash
cd "D:/TRPGMaster - 副本"
# 原有测试全过
npx jest --testPathPattern="server/src/__tests__" --ci 2>&1 | tail -20
```
原有 13 个测试文件全部通过，新增 6 个测试文件全部通过，无任何原有测试 fail。

### 5.8 DEVLOG 更新

Sonnet 完成所有步骤后，在 `DEVLOG.md` 顶部添加新章节：
```markdown
## Phase 17: 单桌演示就绪重构 (2026-06-28)

**基于**: SPEC.md 步骤 1-18

### 完成内容
- [列出每步的实际改动摘要]

### 验证结果
- TypeScript: 0 错误
- ESLint: 0 错误
- 单元测试: X 通过 / 0 失败
- 类型逃逸: as any=0, as unknown as=X (仅 dataValidator)

### 已知遗留
- [任何步骤中发现的、但不在本 SPEC 范围内的问题]
```

---

## 附录：执行检查清单（Sonnet 自检）

每完成一步，Sonnet 须在内部确认：
- [ ] 仅修改了本步"修改逻辑"中列出的文件
- [ ] 未触碰第四部分 4.2 节列出的任何禁改边界
- [ ] 运行了本步"即时验证"命令且通过
- [ ] 若验证失败，已回滚到本步开始前的状态并报告失败原因

全部 18 步完成后，运行第五部分 5.1-5.5 全部验收命令，全部通过后方可声明完成。5.6 节业务场景由人工执行，Sonnet 不负责运行 demo。

---

**文档结束**
