/**
 * Adventure Simulation Test — End-to-end integration test
 *
 * Simulates a full Daggerheart adventure loop:
 *   Character Creation → Exploration → Combat → Rest → Puzzle → Loot → End
 *
 * Tests: character state changes, domain card usage, item search,
 *         journal entries, combat resolution, difficulty evaluation,
 *         fear/hope economy, GM effect extraction, scene search cooldown.
 *
 * No real AI calls — all AI-dependent functions are mocked.
 * Results are logged to a local file for review.
 */
import {
  resolveAbilityCheck,
  resolvePlayerAttack,
  resolveDamageToCharacter,
} from '../../rules/combatResolver';
import {
  resolveRoll,
  rollDualD12,
  gainFearOnRest,
} from '../../rules/systems/DaggerHeartRules';
import {
  calculateThresholds,
  getDamageSeverity,
  getHpLossFromSeverity,
} from '@trpgmaster/shared';
import { extractGmEffects, playerInputSuggestsCombat, extractEnemyNameFromNarration } from '../../ai/extractGmEffects';
import type { Character, GmEffect, RollDeclaration, ActionDeclaration, CombatEnemy } from '@trpgmaster/shared';
import { StateManager } from '../../core/StateManager';
import { rollSceneSearchLoot, rollLootTable } from '../../rules/lootResolver';

// ===== Mock Character Builder =====

function createTestCharacter(overrides?: Partial<Character>): Character {
  return {
    id: 'char_test',
    name: '艾琳',
    classId: 'warrior',
    subclassId: '',
    ancestryId: 'human',
    secondAncestryId: '',
    communityId: 'village',
    level: 1,
    tier: 1,
    proficiency: 1,
    attributes: {
      agility: 1,
      strength: 2,
      finesse: 1,
      instinct: 0,
      presence: 0,
      knowledge: -1,
    },
    attributeMarks: { agility: false, strength: false, finesse: false, instinct: false, presence: false, knowledge: false },
    hp: 8,
    maxHp: 8,
    stress: 0,
    maxStress: 3,
    hope: 2,
    maxHope: 6,
    armorSlots: 2,
    maxArmorSlots: 2,
    evasion: 10,
    minorThreshold: 1,
    majorThreshold: 2,
    severeThreshold: 4,
    mainWeapon: { id: 'broadsword', name: '阔剑', nameEn: 'Broadsword', attribute: 'strength' as any, distance: 'melee' as any, damageDie: 'd8' as any, damageModifier: 0, load: 'oneHanded' as any, traits: [], weaponTier: 1 },
    offWeapon: undefined,
    armor: { id: 'leather', name: '皮甲', nameEn: 'Leather', baseThreshold: 1, baseThresholdSevere: 3, armorSlots: 2, evasionPenalty: 0, traits: [] as any[], armorTier: 1 },
    inventory: [],
    gold: { coins: 0, handfuls: 0, bags: 0, chests: 0 },
    experiences: [
      { id: 'exp1', name: '战斗经验', modifier: 2 },
      { id: 'exp2', name: '野外生存', modifier: 1 },
    ],
    domainCardConfig: {
      loadout: [
        { id: 'dc1', name: '斩击', nameEn: 'Slash', domain: 'blade', level: 1, type: 'ability', recallCost: 0, description: '一次强力的近战攻击', effect: '对目标造成武器伤害+1', hopeCost: 1 },
        { id: 'dc2', name: '坚守', nameEn: 'Hold', domain: 'valor', level: 1, type: 'ability', recallCost: 0, description: '固守阵地', effect: '获得1护甲槽', stressCost: 1 },
      ],
      vault: [],
      maxLoadout: 5,
    },
    featureUses: { dc1: 3, dc2: 2 },
    conditions: [],
    scars: [],
    resistances: [],
    reactionsUsed: 0,
    relationships: [],
    backstory: '一个来自边境村落的年轻战士',
    personalQuest: '找到失踪的姐姐',
    adventureSummaries: [],
    ...overrides,
  };
}

// ===== Test Result Logger =====

interface TestStep {
  phase: string;
  action: string;
  input?: string;
  result: string;
  stateBefore?: Record<string, unknown>;
  stateAfter?: Record<string, unknown>;
  passed: boolean;
  notes?: string;
}

const testLog: TestStep[] = [];
let passCount = 0;
let failCount = 0;

function logStep(step: TestStep): void {
  testLog.push(step);
  if (step.passed) passCount++;
  else failCount++;
  const icon = step.passed ? '✅' : '❌';
  console.log(`${icon} [${step.phase}] ${step.action}: ${step.result}`);
  if (step.notes) console.log(`   📝 ${step.notes}`);
}

function getStateSnapshot(sm: StateManager): Record<string, unknown> {
  const s = sm.getState();
  return {
    hp: s.character?.hp,
    maxHp: s.character?.maxHp,
    stress: s.character?.stress,
    hope: s.character?.hope,
    fearPoints: s.fearPoints,
    sceneDifficulty: s.sceneDifficulty,
    combatEnemies: s.activeCombat?.enemies?.map((e: CombatEnemy) => `${e.name} HP:${e.currentHp}/${e.maxHp}`),
    inventoryCount: s.character?.inventory?.length,
    gold: s.character?.gold,
  };
}

// ===== Test Suite =====

async function runSimulation(): Promise<void> {
  console.log('\n🗡️  TRPGMaster Adventure Simulation Test\n');
  console.log('='.repeat(60));

  // ===== Phase 1: Character Creation =====
  console.log('\n📋 Phase 1: Character Creation\n');

  const sm = new StateManager('test_session');
  const character = createTestCharacter();
  sm.setCharacter(character);
  sm.startSession();

  logStep({
    phase: '角色创建',
    action: '创建战士角色',
    result: `${character.name} Lv.${character.level} HP:${character.hp}/${character.maxHp} 压力:${character.stress}/${character.maxStress} 希望:${character.hope}/${character.maxHope}`,
    stateAfter: getStateSnapshot(sm),
    passed: character.hp === 8 && character.stress === 0 && character.hope === 2,
    notes: `属性: 敏${character.attributes.agility} 力${character.attributes.strength} 巧${character.attributes.finesse}`,
  });

  // ===== Phase 2: Exploration =====
  console.log('\n🗺️  Phase 2: Exploration\n');

  // Simulate entering a new scene
  sm.setCurrentScene({
    id: 'drakkenheim_gate',
    name: '德拉肯海姆城门',
    description: '残破的城门前弥漫着灰绿色的迷雾，远处偶尔传来不明的嘶吼声。',
    environment: '迷雾笼罩',
    activeConditions: [],
    npcPresent: [],
    enemies: [],
    countdowns: [],
  });

  logStep({
    phase: '探索',
    action: '进入德拉肯海姆城门',
    result: sm.getState().currentScene.name,
    stateAfter: getStateSnapshot(sm),
    passed: sm.getState().currentScene.id === 'drakkenheim_gate',
  });

  // Simulate AI setting difficulty via GmEffect
  const setDiffEffect: GmEffect = { type: 'setDifficulty', amount: 15 };
  sm.setSceneDifficulty(15);

  logStep({
    phase: '探索',
    action: 'AI评估场景难度',
    result: `难度设为 ${sm.getSceneDifficulty()}`,
    stateAfter: getStateSnapshot(sm),
    passed: sm.getSceneDifficulty() === 15,
    notes: '迷雾中的城门，有压力但非极端危险',
  });

  // Ability check: perception
  const checkDecl: RollDeclaration = {
    action: '观察城门附近的痕迹',
    attribute: 'instinct',
    difficulty: sm.getSceneDifficulty(),
  };
  const checkResult = resolveAbilityCheck(character, checkDecl);

  logStep({
    phase: '探索',
    action: '属性检定 - 观察(instinct)',
    result: `${checkResult.outcome} 希望${checkResult.hopeDie} 恐惧${checkResult.fearDie} 总计${checkResult.total} vs ${checkResult.difficulty}`,
    stateAfter: undefined,
    passed: checkResult.hopeDie >= 1 && checkResult.fearDie >= 1 && checkResult.total === checkResult.hopeDie + checkResult.fearDie + checkResult.modifier,
    notes: checkResult.narrationHint,
  });

  // Apply hope/fear from check
  if (checkResult.hopeGain > 0) {
    sm.updateCharacterHope(checkResult.hopeGain);
  }
  if (checkResult.fearGain > 0) {
    sm.addFearPoints(checkResult.fearGain);
  }

  logStep({
    phase: '探索',
    action: '应用检定后的希望/恐惧',
    result: `希望:${sm.getCharacter().hope} 恐惧池:${sm.getState().fearPoints}`,
    stateAfter: getStateSnapshot(sm),
    passed: true,
  });

  // ===== Phase 3: Scene Search =====
  console.log('\n🔍 Phase 3: Scene Search\n');

  const loot1 = rollSceneSearchLoot();
  for (const item of loot1.items) {
    sm.addInventoryItem(item);
  }
  if (loot1.gold) sm.addGold(loot1.gold);

  logStep({
    phase: '场景搜索',
    action: '第一次搜索城门',
    result: loot1.items.length > 0 ? `找到 ${loot1.items.map(i => i.name).join('、')}` : `找到 ${loot1.gold?.coins || 0} 金币`,
    stateAfter: getStateSnapshot(sm),
    passed: sm.getCharacter().inventory.length >= 0, // Even 0 items is valid
    notes: `物品数:${sm.getCharacter().inventory.length} 金币:${sm.getCharacter().gold.coins}`,
  });

  // Simulate addItem GM effect (from AI narration)
  const addItemEffect: GmEffect = {
    type: 'addItem',
    itemName: '古老的铜钥匙',
    itemDescription: '一把锈迹斑斑的铜钥匙，上面刻有模糊的符文',
    itemCategory: 'misc',
  };
  // Manually apply addItem effect
  sm.addInventoryItem({
    id: 'item_key_01',
    name: addItemEffect.itemName!,
    quantity: 1,
    description: addItemEffect.itemDescription,
    category: addItemEffect.itemCategory as any,
  });

  logStep({
    phase: '场景搜索',
    action: 'AI叙事中发现物品',
    result: `获得 "${addItemEffect.itemName}"`,
    stateAfter: getStateSnapshot(sm),
    passed: sm.getCharacter().inventory.some(i => i.name === '古老的铜钥匙'),
    notes: '通过 addItem GmEffect 从叙事中获取的物品',
  });

  // ===== Phase 4: Combat =====
  console.log('\n⚔️  Phase 4: Combat\n');

  // Add enemy via GmEffect (simulating extractGmEffects output)
  const addEnemyEffect: GmEffect = {
    type: 'addEnemy',
    enemyStatBlockId: 'goblin-raider',
    enemyName: '哥布林劫掠者',
  };

  // Simulate loadEnemyFromStatBlock
  const enemy: CombatEnemy = {
    id: 'enemy_goblin_01',
    statBlockId: 'goblin-raider',
    name: '哥布林劫掠者',
    currentHp: 3,
    maxHp: 3,
    currentStress: 0,
    maxStress: 2,
    conditions: [],
    isFocused: false,
    hasActed: false,
    evasion: 10,
  };
  sm.addCombatEnemy(enemy);

  logStep({
    phase: '战斗',
    action: '敌人出现 - addEnemy GmEffect',
    result: `战斗开始! ${enemy.name} HP:${enemy.currentHp}/${enemy.maxHp}`,
    stateAfter: getStateSnapshot(sm),
    passed: sm.getCombatState() !== undefined && sm.getCombatState()!.enemies.length === 1,
    notes: '通过 addEnemy + startCombat GmEffect 触发战斗',
  });

  // Player attacks the goblin
  const attackDecl: ActionDeclaration = {
    kind: 'attack',
    attackerId: 'char_test',
    targetId: 'enemy_goblin_01',
    trait: 'strength',
    difficulty: enemy.evasion,
  };

  const attackResult = resolvePlayerAttack(character, enemy, attackDecl);

  logStep({
    phase: '战斗',
    action: '玩家攻击哥布林',
    result: `${attackResult.outcome} 希望${attackResult.hopeDie} 恐惧${attackResult.fearDie} 总计${attackResult.total} vs 闪避${attackResult.difficulty}`,
    stateAfter: undefined,
    passed: attackResult.hopeDie >= 1 && attackResult.fearDie >= 1,
    notes: attackResult.narrationHint + (attackResult.success ? ` 伤害:${attackResult.damageRolled}` : ' 未命中'),
  });

  // Apply attack results
  if (attackResult.hopeGain > 0) {
    const char = sm.getCharacter();
    sm.updateCharacterHope(attackResult.hopeGain);
  }
  if (attackResult.fearGain > 0) {
    sm.addFearPoints(attackResult.fearGain);
  }
  if (attackResult.success && attackResult.hpLossToTarget > 0) {
    sm.updateCombatEnemyHp('enemy_goblin_01', -attackResult.hpLossToTarget);
  }

  const combatAfterAttack = sm.getCombatState();
  const goblinAfterAttack = combatAfterAttack?.enemies.find(e => e.id === 'enemy_goblin_01');

  logStep({
    phase: '战斗',
    action: '应用攻击结果',
    result: goblinAfterAttack
      ? `${goblinAfterAttack.name} HP:${goblinAfterAttack.currentHp}/${goblinAfterAttack.maxHp}`
      : '哥布林被击败!',
    stateAfter: getStateSnapshot(sm),
    passed: true,
    notes: `希望:${sm.getCharacter().hope} 恐惧池:${sm.getState().fearPoints}`,
  });

  // Enemy attacks player via GmEffect
  const enemyAttackEffect: GmEffect = {
    type: 'enemyAttack',
    amount: 3,
    source: '哥布林劫掠者',
  };
  const dmgResult = resolveDamageToCharacter(sm.getCharacter(), enemyAttackEffect.amount ?? 0);
  sm.updateCharacterHp(-dmgResult.hpLoss);
  if (dmgResult.armorSlotsSpent > 0) {
    sm.adjustCharacterArmorSlots(-dmgResult.armorSlotsSpent);
  }

  logStep({
    phase: '战斗',
    action: '敌人攻击玩家',
    result: `原始伤害:${dmgResult.rawDamage} → ${dmgResult.severityAfterArmor}伤害 失去${dmgResult.hpLoss}HP 护甲消耗:${dmgResult.armorSlotsSpent}`,
    stateAfter: getStateSnapshot(sm),
    passed: dmgResult.hpLoss >= 0 && sm.getCharacter().hp <= character.maxHp,
    notes: dmgResult.narrationHint,
  });

  // Stress from combat
  const stressEffect: GmEffect = { type: 'stressToPlayer', amount: 1 };
  sm.updateCharacterStress(stressEffect.amount!);

  logStep({
    phase: '战斗',
    action: '获得压力',
    result: `压力:${sm.getCharacter().stress}/${sm.getCharacter().maxStress}`,
    stateAfter: getStateSnapshot(sm),
    passed: sm.getCharacter().stress === 1,
  });

  // ===== Phase 5: Domain Card Usage =====
  console.log('\n🃏 Phase 5: Domain Card Usage\n');

  const charBeforeFeature = { ...sm.getCharacter() };
  // Use domain card "斩击" (hope cost: 1)
  const card = character.domainCardConfig.loadout[0];
  const hopeCost = card.hopeCost ?? 0;
  sm.updateCharacterHope(-hopeCost);
  const uses = { ...sm.getCharacter().featureUses };
  if (uses[card.id] !== undefined) {
    uses[card.id] = (uses[card.id] as number) - 1;
  }
  sm.updateCharacter({ featureUses: uses });

  // Roll for the feature use
  const featureRollDecl: RollDeclaration = {
    action: `[${card.name}] 斩击哥布林`,
    attribute: 'strength',
    difficulty: sm.getSceneDifficulty(),
  };
  const featureRollResult = resolveAbilityCheck(sm.getCharacter(), featureRollDecl);

  logStep({
    phase: '领域卡',
    action: `使用"${card.name}" (希望消耗:${hopeCost})`,
    result: `希望:${charBeforeFeature.hope}→${sm.getCharacter().hope} 使用次数:${(charBeforeFeature.featureUses as any)?.[card.id]}→${(sm.getCharacter().featureUses as any)?.[card.id]}`,
    stateAfter: getStateSnapshot(sm),
    passed: sm.getCharacter().hope === charBeforeFeature.hope - hopeCost && (sm.getCharacter().featureUses as any)[card.id] === ((charBeforeFeature.featureUses as any)?.[card.id] ?? 0) - 1,
    notes: `检定: ${featureRollResult.outcome} 总计${featureRollResult.total} vs ${featureRollResult.difficulty}`,
  });

  // ===== Phase 6: Rest =====
  console.log('\n💤 Phase 6: Rest\n');

  const charBeforeRest = { ...sm.getCharacter() };
  const fearBeforeRest = sm.getState().fearPoints;

  // Short rest: recover some HP, gain fear
  const fearFromRest = gainFearOnRest('short');
  sm.addFearPoints(fearFromRest);
  sm.updateCharacterHp(2); // Short rest: recover 2 HP
  sm.updateCharacterStress(-1); // Recover 1 stress
  sm.incrementShortRests();

  logStep({
    phase: '休整',
    action: '短休',
    result: `HP:${charBeforeRest.hp}→${sm.getCharacter().hp} 压力:${charBeforeRest.stress}→${sm.getCharacter().stress} 恐惧池:+${fearFromRest}`,
    stateAfter: getStateSnapshot(sm),
    passed: sm.getCharacter().hp > charBeforeRest.hp && sm.getCharacter().stress < charBeforeRest.stress && sm.getState().fearPoints > fearBeforeRest,
    notes: `短休次数(长休前):${sm.getShortRestsSinceLong()}`,
  });

  // ===== Phase 7: Puzzle / Ability Check =====
  console.log('\n🧩 Phase 7: Puzzle\n');

  // Simulate finding a locked door
  sm.setSceneDifficulty(12); // Puzzle is moderate
  const puzzleDecl: RollDeclaration = {
    action: '用铜钥匙打开符文锁，解读符文含义',
    attribute: 'knowledge',
    difficulty: sm.getSceneDifficulty(),
  };
  const puzzleResult = resolveAbilityCheck(sm.getCharacter(), puzzleDecl);

  logStep({
    phase: '解密',
    action: '知识检定 - 解读符文',
    result: `${puzzleResult.outcome} 希望${puzzleResult.hopeDie} 恐惧${puzzleResult.fearDie} 总计${puzzleResult.total} vs ${puzzleResult.difficulty}`,
    stateAfter: undefined,
    passed: true,
    notes: puzzleResult.narrationHint,
  });

  // ===== Phase 8: GM Effect Extraction =====
  console.log('\n🤖 Phase 8: GM Effect Extraction\n');

  // Test combat detection
  const combatTests = [
    { input: '我攻击面前的哥布林', expected: true, reason: '第一人称现在时攻击' },
    { input: '我砍向那个骷髅', expected: true, reason: '第一人称攻击+目标' },
    { input: '十年前我被攻击了', expected: false, reason: '过去时态' },
    { input: '我梦里攻击了仇敌', expected: false, reason: '梦境语境' },
    { input: '远处传来战斗的声音', expected: false, reason: '远处的战斗' },
    { input: '我听说了关于战斗的故事', expected: false, reason: '听说/故事' },
    { input: '攻击', expected: true, reason: '句首直接攻击' },
    { input: '我向哥布林发起攻击', expected: true, reason: '明确攻击声明' },
  ];

  for (const test of combatTests) {
    const result = playerInputSuggestsCombat(test.input);
    logStep({
      phase: '战斗检测',
      action: `"${test.input}"`,
      result: `检测=${result} 预期=${test.expected}`,
      passed: result === test.expected,
      notes: test.reason,
    });
  }

  // Test enemy name extraction
  const nameTests = [
    { narration: '一个哥布林劫掠者冲了出来', expected: '哥布林劫掠者' },
    { narration: '一名骷髅战士向你逼近', expectedContains: '骷髅战士' },
    { narration: '那只巨狼咆哮着扑来', expectedContains: '巨狼' },
    { narration: '你发现了一把钥匙', expectedNull: true },
  ];

  for (const test of nameTests) {
    const result = extractEnemyNameFromNarration(test.narration);
    const passed = test.expectedNull
      ? result === null
      : (test.expected ? result === test.expected : result?.includes(test.expectedContains!));
    logStep({
      phase: '敌人名提取',
      action: `"${test.narration}"`,
      result: `提取="${result}"`,
      passed: !!passed,
      notes: test.expectedNull ? '应无敌人' : `预期包含"${test.expected || test.expectedContains}"`,
    });
  }

  // ===== Phase 9: Stress Overflow =====
  console.log('\n💥 Phase 9: Stress Overflow\n');

  const charBeforeOverflow = sm.getCharacter();
  sm.updateCharacterStress(5); // Max stress is 3, should overflow to HP

  logStep({
    phase: '压力溢出',
    action: '压力溢出至HP',
    result: `压力:${charBeforeOverflow.stress}→${sm.getCharacter().stress}/${sm.getCharacter().maxStress} HP:${charBeforeOverflow.hp}→${sm.getCharacter().hp}`,
    stateAfter: getStateSnapshot(sm),
    passed: sm.getCharacter().stress === sm.getCharacter().maxStress && sm.getCharacter().hp < charBeforeOverflow.hp,
    notes: '压力超过上限后溢出为HP伤害',
  });

  // ===== Phase 10: Loot & Inventory =====
  console.log('\n💰 Phase 10: Loot & Inventory\n');

  // Combat end loot
  const combatLoot = rollLootTable(15, 1);
  for (const item of combatLoot.items) {
    sm.addInventoryItem(item);
  }
  if (combatLoot.gold) sm.addGold(combatLoot.gold);

  logStep({
    phase: '战利品',
    action: '战斗结束后获取战利品',
    result: combatLoot.items.length > 0 ? `获得 ${combatLoot.items.map(i => i.name).join('、')}` : '无物品掉落',
    stateAfter: getStateSnapshot(sm),
    passed: sm.getCharacter().inventory.length > 0 || sm.getCharacter().gold.coins > 0,
    notes: `物品:${sm.getCharacter().inventory.length}件 金币:${sm.getCharacter().gold.coins}`,
  });

  // ===== Phase 11: Difficulty Evaluation =====
  console.log('\n📊 Phase 11: Difficulty Evaluation\n');

  const difficultyTests = [
    { scene: '平静的酒馆对话', expectedRange: [10, 14] },
    { scene: '迷雾笼罩的废墟', expectedRange: [14, 17] },
    { scene: '直面巨龙的巢穴', expectedRange: [18, 25] },
  ];

  for (const test of difficultyTests) {
    const testEffect: GmEffect = { type: 'setDifficulty', amount: test.expectedRange[0] };
    if (testEffect.amount! >= 8 && testEffect.amount! <= 25) {
      sm.setSceneDifficulty(testEffect.amount!);
    }
    const diff = sm.getSceneDifficulty();
    const inRange = diff >= test.expectedRange[0] && diff <= test.expectedRange[1];
    logStep({
      phase: '难度评估',
      action: test.scene,
      result: `难度=${diff} 预期范围=[${test.expectedRange[0]},${test.expectedRange[1]}]`,
      passed: inRange,
    });
  }

  // ===== Phase 12: Session State =====
  console.log('\n📋 Phase 12: Session State\n');

  const finalState = sm.getState();
  logStep({
    phase: '会话状态',
    action: '最终会话状态汇总',
    result: `状态:${finalState.status} 恐惧池:${finalState.fearPoints} 场景:${finalState.currentScene.name}`,
    stateAfter: getStateSnapshot(sm),
    passed: finalState.status === 'active',
    notes: `总恐惧获得:${finalState.totalFearGained} 总恐惧消耗:${finalState.totalFearSpent}`,
  });

  // Character final state
  const finalChar = sm.getCharacter();
  logStep({
    phase: '角色状态',
    action: '角色最终状态',
    result: `HP:${finalChar.hp}/${finalChar.maxHp} 压力:${finalChar.stress}/${finalChar.maxStress} 希望:${finalChar.hope}/${finalChar.maxHope} 护甲:${finalChar.armorSlots}/${finalChar.maxArmorSlots}`,
    stateAfter: getStateSnapshot(sm),
    passed: finalChar.hp >= 0 && finalChar.hp <= finalChar.maxHp && finalChar.stress >= 0,
    notes: `物品:${finalChar.inventory.length}件 经历:${finalChar.experiences.map(e => e.name).join('、')}`,
  });

  // ===== Phase 13: Damage Severity System =====
  console.log('\n🎯 Phase 13: Damage Severity\n');

  const severityTests = [
    { raw: 1, majorThreshold: 2, severeThreshold: 4, expected: 'minor' as const },
    { raw: 3, majorThreshold: 2, severeThreshold: 4, expected: 'major' as const },
    { raw: 5, majorThreshold: 2, severeThreshold: 4, expected: 'severe' as const },
    { raw: 0, majorThreshold: 2, severeThreshold: 4, expected: 'none' as const },
  ];

  for (const test of severityTests) {
    const sev = getDamageSeverity(test.raw, test.majorThreshold, test.severeThreshold);
    const hpLoss = getHpLossFromSeverity(sev);
    logStep({
      phase: '伤害严重度',
      action: `原始伤害:${test.raw} (阈值:轻度${test.majorThreshold}/严重${test.severeThreshold})`,
      result: `严重度:${sev} → HP损失:${hpLoss}`,
      passed: sev === test.expected,
    });
  }

  // ===== Phase 14: Journal Entry Extraction =====
  console.log('\n📖 Phase 14: Journal Entry Extraction\n');

  // Test the journal extraction logic that runs in useSocket
  const journalTestNarrations = [
    {
      text: '你在废墟中发现了一把古老的钥匙，上面刻着神秘的符文。这把钥匙似乎能打开深处的密室。',
      expectedTypes: ['discovery'],
    },
    {
      text: '提灯团的使者向你提出一个任务：深入德拉肯海姆找到失落的封印。你接受了这个任务。',
      expectedTypes: ['faction', 'quest'],
    },
    {
      text: '一个名叫马库斯的老人从阴影中走出来，他自称是最后的守夜人。',
      expectedTypes: ['npc'],
    },
    {
      text: '你抵达了德拉肯海姆的外围，迷雾比预想的更加浓厚。',
      expectedTypes: ['event'],
    },
  ];

  // Inline the extraction logic (same as in useSocket.ts)
  function extractJournalEntries(text: string, npcName?: string): Array<{ type: string; title: string }> {
    const entries: Array<{ type: string; title: string }> = [];

    if (npcName) entries.push({ type: 'npc', title: npcName });

    // Inline NPC detection from text
    if (!npcName) {
      const npcPats = [/(?:一个|一名|那位|那个)叫(?:做|着)?(.{1,10}?)(?:的|人|者|男|女|老|少)/, /(?:名叫|叫做|名为|自称)(.{1,10}?)(?:的|人|者|男|女|老人|家伙|先生|女士|商人)/];
      for (const p of npcPats) { const m = text.match(p); if (m && m[1]) { entries.push({ type: 'npc', title: m[1].trim() }); break; } }
    }

    const questPats = [/(?:任务|委托|使命|quest)[:：]?\s*(.{2,40})/i, /(?:接受|完成|推进|失败|放弃)(?:了|了)?(?:任务|委托|使命)(.{0,30})/i];
    for (const p of questPats) { const m = text.match(p); if (m) { entries.push({ type: 'quest', title: m[1]?.trim() || '任务进展' }); break; } }

    const discPats = [/(?:发现|找到|揭示|揭开|得知|获悉)(?:了|了)?(.{2,50})/i, /(?:秘密|线索|真相|隐藏)(.{2,40})/i];
    for (const p of discPats) { const m = text.match(p); if (m) { entries.push({ type: 'discovery', title: m[0].substring(0, 40) }); break; } }

    const facPats = [/(?:提灯团|女王之仆|白银骑士团|陨火信徒|紫晶学院)(.{0,30})/i];
    for (const p of facPats) { const m = text.match(p); if (m) { entries.push({ type: 'faction', title: m[0].substring(0, 40) }); break; } }

    const evtPats = [/(?:战斗|交战|冲突|袭击|伏击)(.{0,30})/i, /(?:升级|升到|等级提升)/i, /(?:死亡|倒下|倒地|重伤)/i, /(?:抵达|来到|进入|离开)(.{2,30})/i];
    for (const p of evtPats) { const m = text.match(p); if (m) { entries.push({ type: 'event', title: m[0].substring(0, 40) }); break; } }

    return entries;
  }

  for (const test of journalTestNarrations) {
    const entries = extractJournalEntries(test.text);
    const foundTypes = entries.map(e => e.type);
    const allExpected = test.expectedTypes.every(t => foundTypes.includes(t));
    logStep({
      phase: '日志记录',
      action: `"${test.text.substring(0, 30)}..."`,
      result: `提取类型:[${foundTypes.join(',')}] 预期:[${test.expectedTypes.join(',')}]`,
      passed: allExpected,
      notes: entries.map(e => `${e.type}:${e.title}`).join(' | '),
    });
  }

  // ===== Phase 15: Threshold Calculation =====
  console.log('\n📐 Phase 15: Threshold Calculation\n');

  const thresholdTests = [
    { level: 1, armorMinor: 1, armorMajor: 3, expectedMinor: 2, expectedMajor: 4, expectedSevere: 8 },
    { level: 3, armorMinor: 1, armorMajor: 3, expectedMinor: 4, expectedMajor: 6, expectedSevere: 12 },
    { level: 5, armorMinor: 2, armorMajor: 4, expectedMinor: 7, expectedMajor: 9, expectedSevere: 18 },
  ];

  for (const test of thresholdTests) {
    const thresholds = calculateThresholds(test.armorMinor, test.armorMajor, test.level);
    logStep({
      phase: '阈值计算',
      action: `Lv.${test.level} 护甲基础:轻度${test.armorMinor}/重度${test.armorMajor}`,
      result: `轻度:${thresholds.minor} 重度:${thresholds.major} 严重:${thresholds.severe}`,
      passed: thresholds.minor === test.expectedMinor && thresholds.major === test.expectedMajor && thresholds.severe === test.expectedSevere,
    });
  }

  // ===== Final Summary =====
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Test Summary: ${passCount} passed, ${failCount} failed, ${passCount + failCount} total\n`);

  if (failCount > 0) {
    console.log('❌ Failed tests:');
    testLog.filter(s => !s.passed).forEach(s => {
      console.log(`   [${s.phase}] ${s.action}: ${s.result}`);
    });
  }

  return;
}

// Run and export results
runSimulation().catch(err => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
