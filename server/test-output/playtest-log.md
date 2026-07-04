# TRPGMaster 全流程测试报告

**测试时间**: 2026-06-25T08:52:59.150Z
**服务器**: http://localhost:3000

## 测试结果摘要

| 指标 | 数值 |
|------|------|
| 总测试数 | 23 |
| 通过 | 15 |
| 失败 | 8 |
| 通过率 | 65.2% |

## 详细测试结果

### Session (2/2)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| Session accessible | ✅ | SessionID: session_1782067967550_3fbl |
| Session has character | ✅ | Character: ���������� |

### Character (8/8)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| Character created | ✅ | Class: guardian, Level: 1 |
| HP correct | ✅ | HP: 7 |
| Stress correct | ✅ | Stress: 0 |
| Hope correct | ✅ | Hope: 2 |
| Armor slots correct | ✅ | Slots: 4 |
| Domain cards loaded | ✅ | Cards: 2 |
| Evasion correct | ✅ | Evasion: 8 (base 9 - chain -1) |
| Experiences set | ✅ | Count: 2 |

### Exploration (1/3)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| GM responds to exploration | ❌ | Error: Action timeout after 90000ms |
| Scene search emitted | ✅ | Search request sent |
| Deep exploration | ❌ | Error: Action timeout after 90000ms |

### Combat (3/5)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| Combat trigger | ❌ | Error: Action timeout after 90000ms |
| Attack action sent | ✅ | Attack emitted via socket |
| Second attack sent | ✅ | Second attack emitted |
| Domain card use emitted | ✅ | valor-powerful-push feature use sent |
| Character state changed in combat | ❌ | HP: 7 -> 7 |

### Rest (0/2)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| Short rest | ❌ | Error:  |
| Long rest | ❌ | Error:  |

### Puzzle (1/3)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| Puzzle interaction | ❌ | Error: Action timeout after 90000ms |
| Ability check sent | ✅ | knowledge check emitted |
| Second puzzle | ❌ | Error: Action timeout after 90000ms |

## 角色状态快照

| 阶段 | HP | Stress | Hope | Armor | 物品数 | 状态 |
|------|-----|--------|------|-------|--------|------|
| Initial | 7/7 | 0/6 | 2/6 | 4/4 | 0 | 无 |
| After Exploration | 7/7 | 0/6 | 2/6 | 4/4 | 0 | 无 |
| After Search | 7/7 | 0/6 | 2/6 | 4/4 | 0 | 无 |
| After Combat | 7/7 | 0/6 | 2/6 | 4/4 | 0 | 无 |
| After Puzzle | 7/7 | 0/6 | 2/6 | 4/4 | 0 | 无 |

## 完整测试日志

```
[08:44:49] [TEST] === TRPGMaster Full Playtest Starting ===
[08:44:49] [PHASE] --- Phase 0: Connection & Session ---
[08:44:49] [CONNECT] Connecting to server...
[08:44:50] [CONNECT] Connected! Socket ID: IliohT51El4X_tClAAAD
[08:44:51] [RESULT] ✅ PASS | Session > Session accessible | SessionID: session_1782067967550_3fbl
[08:44:51] [RESULT] ✅ PASS | Session > Session has character | Character: ����������
[08:44:51] [SESSION] Session started: {"status":"started"}
[08:44:52] [SNAPSHOT] Initial: HP:7/7 Stress:0/6 Hope:2/6 Armor:4/4 Items:0 Conditions:none
[08:44:52] [RESULT] ✅ PASS | Character > Character created | Class: guardian, Level: 1
[08:44:52] [RESULT] ✅ PASS | Character > HP correct | HP: 7
[08:44:52] [RESULT] ✅ PASS | Character > Stress correct | Stress: 0
[08:44:52] [RESULT] ✅ PASS | Character > Hope correct | Hope: 2
[08:44:52] [RESULT] ✅ PASS | Character > Armor slots correct | Slots: 4
[08:44:52] [RESULT] ✅ PASS | Character > Domain cards loaded | Cards: 2
[08:44:52] [RESULT] ✅ PASS | Character > Evasion correct | Evasion: 8 (base 9 - chain -1)
[08:44:52] [RESULT] ✅ PASS | Character > Experiences set | Count: 2
[08:44:52] [PHASE] --- Phase 1: Exploration ---
[08:44:52] [CONNECT] Disconnected from server
[08:44:53] [CONNECT] Connection error: websocket error
[08:44:54] [PLAYER] Exploring Drakkenheim...
[08:44:54] [PLAYER] Action: 我走向德拉肯海姆的城门，观察周围的环境和可能存在的危险
[08:44:54] [CONNECT] Connection error: websocket error
[08:44:58] [CONNECT] Connection error: websocket error
[08:45:03] [CONNECT] Connection error: websocket error
[08:45:08] [CONNECT] Connection error: websocket error
[08:45:13] [CONNECT] Connection error: websocket error
[08:45:18] [CONNECT] Connection error: websocket error
[08:45:23] [CONNECT] Connection error: websocket error
[08:45:28] [CONNECT] Connection error: websocket error
[08:45:33] [CONNECT] Connection error: websocket error
[08:45:38] [CONNECT] Connection error: websocket error
[08:45:43] [CONNECT] Connection error: websocket error
[08:45:48] [CONNECT] Connection error: websocket error
[08:45:53] [CONNECT] Connection error: websocket error
[08:45:58] [CONNECT] Connection error: websocket error
[08:46:03] [CONNECT] Connection error: websocket error
[08:46:08] [CONNECT] Connection error: websocket error
[08:46:13] [CONNECT] Connection error: websocket error
[08:46:18] [CONNECT] Connection error: websocket error
[08:46:23] [CONNECT] Connection error: websocket error
[08:46:24] [RESULT] ❌ FAIL | Exploration > GM responds to exploration | Error: Action timeout after 90000ms
[08:46:24] [SNAPSHOT] After Exploration: HP:7/7 Stress:0/6 Hope:2/6 Armor:4/4 Items:0 Conditions:none
[08:46:24] [PLAYER] Searching for items...
[08:46:24] [PLAYER] Emitted scene:search
[08:46:27] [RESULT] ✅ PASS | Exploration > Scene search emitted | Search request sent
[08:46:27] [PLAYER] Action: 我仔细搜索城门附近的废墟，寻找有用的物品和线索
[08:46:28] [CONNECT] Connection error: websocket error
[08:46:33] [CONNECT] Connection error: websocket error
[08:46:38] [CONNECT] Connection error: websocket error
[08:46:43] [CONNECT] Connection error: websocket error
[08:46:48] [CONNECT] Connection error: websocket error
[08:46:53] [CONNECT] Connection error: websocket error
[08:46:58] [CONNECT] Connection error: websocket error
[08:47:03] [CONNECT] Connection error: websocket error
[08:47:08] [CONNECT] Connection error: websocket error
[08:47:13] [CONNECT] Connection error: websocket error
[08:47:18] [CONNECT] Connection error: websocket error
[08:47:23] [CONNECT] Connection error: websocket error
[08:47:28] [CONNECT] Connection error: websocket error
[08:47:33] [CONNECT] Connection error: websocket error
[08:47:38] [CONNECT] Connection error: websocket error
[08:47:43] [CONNECT] Connection error: websocket error
[08:47:48] [CONNECT] Connection error: websocket error
[08:47:53] [CONNECT] Connection error: websocket error
[08:47:57] [RESULT] ❌ FAIL | Exploration > Deep exploration | Error: Action timeout after 90000ms
[08:47:57] [SNAPSHOT] After Search: HP:7/7 Stress:0/6 Hope:2/6 Armor:4/4 Items:0 Conditions:none
[08:47:57] [PHASE] --- Phase 2: Combat ---
[08:47:57] [PLAYER] Action: 我拔出阔剑，准备战斗！向面前的敌人发起攻击
[08:47:58] [CONNECT] Connection error: websocket error
[08:48:03] [CONNECT] Connection error: websocket error
[08:48:08] [CONNECT] Connection error: websocket error
[08:48:13] [CONNECT] Connection error: websocket error
[08:48:18] [CONNECT] Connection error: websocket error
[08:48:23] [CONNECT] Connection error: websocket error
[08:48:28] [CONNECT] Connection error: websocket error
[08:48:33] [CONNECT] Connection error: websocket error
[08:48:38] [CONNECT] Connection error: websocket error
[08:48:43] [CONNECT] Connection error: websocket error
[08:48:48] [CONNECT] Connection error: websocket error
[08:48:53] [CONNECT] Connection error: websocket error
[08:48:58] [CONNECT] Connection error: websocket error
[08:49:03] [CONNECT] Connection error: websocket error
[08:49:08] [CONNECT] Connection error: websocket error
[08:49:13] [CONNECT] Connection error: websocket error
[08:49:18] [CONNECT] Connection error: websocket error
[08:49:23] [CONNECT] Connection error: websocket error
[08:49:27] [RESULT] ❌ FAIL | Combat > Combat trigger | Error: Action timeout after 90000ms
[08:49:28] [CONNECT] Connection error: websocket error
[08:49:29] [COMBAT] Sending attack action...
[08:49:29] [COMBAT] Attack emitted, waiting for response...
[08:49:33] [CONNECT] Connection error: websocket error
[08:49:34] [RESULT] ✅ PASS | Combat > Attack action sent | Attack emitted via socket
[08:49:38] [CONNECT] Connection error: websocket error
[08:49:39] [RESULT] ✅ PASS | Combat > Second attack sent | Second attack emitted
[08:49:39] [COMBAT] Using domain card: Powerful Push...
[08:49:43] [CONNECT] Connection error: websocket error
[08:49:44] [RESULT] ✅ PASS | Combat > Domain card use emitted | valor-powerful-push feature use sent
[08:49:44] [SNAPSHOT] After Combat: HP:7/7 Stress:0/6 Hope:2/6 Armor:4/4 Items:0 Conditions:none
[08:49:44] [RESULT] ❌ FAIL | Combat > Character state changed in combat | HP: 7 -> 7
[08:49:44] [PHASE] --- Phase 3: Rest ---
[08:49:44] [REST] Short rest requested
[08:49:48] [CONNECT] Connection error: websocket error
[08:49:49] [RESULT] ❌ FAIL | Rest > Short rest | Error: 
[08:49:49] [REST] Long rest requested
[08:49:53] [CONNECT] Connection error: websocket error
[08:49:54] [RESULT] ❌ FAIL | Rest > Long rest | Error: 
[08:49:54] [PHASE] --- Phase 4: Puzzle & Ability Check ---
[08:49:54] [PLAYER] Action: 我仔细检查墙壁上的古老符文，尝试解读其中的含义
[08:49:58] [CONNECT] Connection error: websocket error
[08:50:03] [CONNECT] Connection error: websocket error
[08:50:08] [CONNECT] Connection error: websocket error
[08:50:13] [CONNECT] Connection error: websocket error
[08:50:18] [CONNECT] Connection error: websocket error
[08:50:23] [CONNECT] Connection error: websocket error
[08:50:28] [CONNECT] Connection error: websocket error
[08:50:33] [CONNECT] Connection error: websocket error
[08:50:39] [CONNECT] Connection error: websocket error
[08:50:44] [CONNECT] Connection error: websocket error
[08:50:49] [CONNECT] Connection error: websocket error
[08:50:54] [CONNECT] Connection error: websocket error
[08:50:59] [CONNECT] Connection error: websocket error
[08:51:04] [CONNECT] Connection error: websocket error
[08:51:09] [CONNECT] Connection error: websocket error
[08:51:14] [CONNECT] Connection error: websocket error
[08:51:19] [CONNECT] Connection error: websocket error
[08:51:24] [CONNECT] Connection error: websocket error
[08:51:24] [RESULT] ❌ FAIL | Puzzle > Puzzle interaction | Error: Action timeout after 90000ms
[08:51:24] [PUZZLE] Sending action roll for knowledge check...
[08:51:24] [PUZZLE] Action roll emitted
[08:51:29] [CONNECT] Connection error: websocket error
[08:51:29] [RESULT] ✅ PASS | Puzzle > Ability check sent | knowledge check emitted
[08:51:29] [PLAYER] Action: 我用我的知识来破解这个谜题，试图找到隐藏的机关
[08:51:34] [CONNECT] Connection error: websocket error
[08:51:39] [CONNECT] Connection error: websocket error
[08:51:44] [CONNECT] Connection error: websocket error
[08:51:49] [CONNECT] Connection error: websocket error
[08:51:54] [CONNECT] Connection error: websocket error
[08:51:59] [CONNECT] Connection error: websocket error
[08:52:04] [CONNECT] Connection error: websocket error
[08:52:09] [CONNECT] Connection error: websocket error
[08:52:14] [CONNECT] Connection error: websocket error
[08:52:19] [CONNECT] Connection error: websocket error
[08:52:24] [CONNECT] Connection error: websocket error
[08:52:29] [CONNECT] Connection error: websocket error
[08:52:34] [CONNECT] Connection error: websocket error
[08:52:39] [CONNECT] Connection error: websocket error
[08:52:44] [CONNECT] Connection error: websocket error
[08:52:49] [CONNECT] Connection error: websocket error
[08:52:54] [CONNECT] Connection error: websocket error
[08:52:59] [RESULT] ❌ FAIL | Puzzle > Second puzzle | Error: Action timeout after 90000ms
[08:52:59] [SNAPSHOT] After Puzzle: HP:7/7 Stress:0/6 Hope:2/6 Armor:4/4 Items:0 Conditions:none
[08:52:59] [PHASE] --- Phase 5: State Verification ---
[08:52:59] [FATAL] Test failed with error: 
AggregateError [ECONNREFUSED]: 
    at internalConnectMultiple (node:net:1142:49)
    at afterConnectMultiple (node:net:1723:7)
```
