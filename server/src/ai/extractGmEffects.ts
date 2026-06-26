/**
 * GM effect extractor — structured channel for AI-declared mechanical effects
 * After narration completes, a separate AI call extracts mechanical effects as JSON.
 * This replaces unreliable [STATE] regex parsing of freeform narrative.
 */
import type { AIGateway } from './AIGateway';
import type { GmEffect } from '@trpgmaster/shared';
import enemyData from '../rules/data/daggerheart/enemies.json';

// Build a list of valid enemy IDs for the prompt
const ENEMY_ID_LIST = (enemyData as any[]).map((e: any) => `${e.id}(${e.name})`).join('、');

const SYS = `你是规则结算助手。给定一段 GM 叙事和玩家行动，抽取其中"对玩家角色或敌人产生的机械效果"。
只输出 JSON 数组，无任何解释或 markdown。没有机械效果则输出 []。
字段：type(damageToPlayer|stressToPlayer|enemyAttack|enemyHp|spendFear|addEnemy|startCombat|endCombat|setDifficulty|addItem), targetId, enemyId, amount, source, enemyStatBlockId, enemyName, itemName, itemDescription, itemCategory, goldCoins。

关键规则：
- addEnemy: 叙事中出现了新敌人或敌对生物，enemyStatBlockId 必须是以下之一：${ENEMY_ID_LIST}。enemyName 为敌人名字。如果不确定类型，用最接近的。即使叙事只暗示了敌人存在（如"守卫拔剑"、"怪物逼近"），也必须添加。
- startCombat: 叙事表明战斗开始、敌对遭遇、或任何需要战斗检定的冲突。只要叙事中出现威胁性的敌对行动（攻击、冲锋、伏击、拔剑对峙等），就必须标记 startCombat。
- endCombat: 叙事表明战斗结束、敌人被击败或逃跑、冲突解决
- enemyAttack: 敌人对玩家造成伤害，amount 为原始伤害值
- damageToPlayer: 环境或陷阱对玩家造成伤害
- setDifficulty: 场景中有挑战时设置难度(8-25)，amount 为难度值。普通对话=12，有压力=15，危险=18，极限=22。出现新敌人或新场景时必须设置。
- addItem: 叙事中玩家找到了物品、金币或可拾取的东西。itemName 为物品名称，itemDescription 为描述，itemCategory 为分类(weapon/armor/consumable/misc)，goldCoins 为发现的金币数量。如果有具体物品名必须添加。

判断原则（宁可多标不可漏标）：
1. 如果叙事中有人物/生物对玩家表现出敌意并采取行动 → startCombat + addEnemy + enemyAttack
2. 如果玩家正在与敌人战斗 → 确保 addEnemy 和 startCombat 存在
3. 如果叙事提到受伤、被击中、受到攻击 → damageToPlayer 或 enemyAttack
4. 如果场景发生变化或出现新挑战 → setDifficulty
5. 如果叙事提到找到物品、金币、战利品、信件、钥匙等 → addItem
6. 宁可多抽取一个效果，也不要漏掉战斗触发或物品获取`;

interface RawEffect {
  type: 'damageToPlayer' | 'stressToPlayer' | 'enemyAttack' | 'enemyHp' | 'spendFear' | 'addEnemy' | 'startCombat' | 'endCombat' | 'setDifficulty' | 'addItem';
  targetId?: string;
  enemyId?: string;
  amount?: number;
  source?: string;
  enemyStatBlockId?: string;
  enemyName?: string;
  itemName?: string;
  itemDescription?: string;
  itemCategory?: string;
  goldCoins?: number;
}

function validateRawEffects(raw: unknown): GmEffect[] {
  if (!Array.isArray(raw)) return [];
  const validTypes = new Set(['damageToPlayer', 'stressToPlayer', 'enemyAttack', 'enemyHp', 'spendFear', 'addEnemy', 'startCombat', 'endCombat', 'setDifficulty', 'addItem']);
  return raw.filter((item: unknown): item is RawEffect => {
    if (typeof item !== 'object' || item === null) return false;
    const obj = item as Record<string, unknown>;
    return typeof obj.type === 'string' && validTypes.has(obj.type);
  }).map(item => ({
    type: item.type,
    targetId: typeof item.targetId === 'string' ? item.targetId : undefined,
    enemyId: typeof item.enemyId === 'string' ? item.enemyId : undefined,
    amount: typeof item.amount === 'number' ? item.amount : undefined,
    source: typeof item.source === 'string' ? item.source : undefined,
    enemyStatBlockId: typeof (item as any).enemyStatBlockId === 'string' ? (item as any).enemyStatBlockId : undefined,
    enemyName: typeof (item as any).enemyName === 'string' ? (item as any).enemyName : undefined,
    itemName: typeof (item as any).itemName === 'string' ? (item as any).itemName : undefined,
    itemDescription: typeof (item as any).itemDescription === 'string' ? (item as any).itemDescription : undefined,
    itemCategory: typeof (item as any).itemCategory === 'string' ? (item as any).itemCategory : undefined,
    goldCoins: typeof (item as any).goldCoins === 'number' ? (item as any).goldCoins : undefined,
  }));
}

/** Combat action keywords in player's IMMEDIATE action declaration (first-person present intent) */
const IMMEDIATE_COMBAT_PATTERNS = [
  /^我(?:要|想|准备)?(?:攻击|砍|刺|射|挥|斩|劈|击|施法|射击)/,
  /^(?:攻击|砍|刺|射|挥|斩|劈|击|施法|射击)/,
  /^我(?:对|向|朝)(.+?)(?:发起攻击|挥剑|举盾|施法|射击|发动攻击)/,
];

/** Non-combat contexts that should suppress combat triggers */
const NON_COMBAT_CONTEXTS = [
  '以前', '曾经', '过去', '昨天', '上周', '上个月', '十年', '多年前', '小时候', '回忆', '记得',
  '梦里', '梦中', '梦到', '幻觉', '想象', '仿佛', '好像',
  '听说', '据说', '传闻', '远处', '远处有', '远方',
  '故事', '传说', '书上', '记载',
  'was', 'were', 'had', 'yesterday', 'last week', 'last month', 'years ago',
  'dream', 'dreamed', 'heard', 'story', 'legend',
];

/**
 * Check if player input represents an IMMEDIATE combat intent.
 * Returns true only when the player is declaring a present-tense attack action.
 * Narrating past events, dreams, or distant observations do NOT count.
 */
export function playerInputSuggestsCombat(input: string): boolean {
  const lower = input.toLowerCase();

  // Reject if the input is clearly describing past/distant/dream events
  if (NON_COMBAT_CONTEXTS.some(ctx => lower.includes(ctx))) {
    return false;
  }

  // Must match an immediate action pattern (first-person present-tense declaration)
  const trimmed = input.trim();
  return IMMEDIATE_COMBAT_PATTERNS.some(pat => pat.test(trimmed));
}

/**
 * Extract enemy name from narration text.
 * Looks for patterns like "a/an [adjective] [name] [verb]" in Chinese.
 */
export function extractEnemyNameFromNarration(narration: string): string | null {
  // Pattern: 一个/一名/那 + (optional adjective) + name + attack/move verb
  const patterns = [
    /(?:一个|一名|那只|那头|那个|一只|一头|这头|这只|这个)([一-龥]{1,6}?)(?:冲|扑|攻|袭|向|逼|挡|拦|站|出现|现身|走近|咆哮|怒吼|挥|举起)/,
    /(?:敌人|怪物|守卫|士兵|骷髅|僵尸|巨魔|龙|恶魔|亡灵|刺客|兽人|哥布林)([一-龥]{0,4}?)说|喊|叫|笑|怒|冲|扑/,
  ];
  for (const pat of patterns) {
    const match = narration.match(pat);
    if (match && match[1]) {
      return match[1].trim() || null;
    }
  }
  return null;
}

export async function extractGmEffects(
  gw: AIGateway,
  narration: string,
  model: string,
  playerInput?: string,
): Promise<GmEffect[]> {
  // Include player input in the extraction prompt for better context
  const userContent = playerInput
    ? `玩家行动：${playerInput}\n\nGM叙事：${narration}`
    : narration;

  // Retry up to 2 times on failure (JSON parse error, empty response, etc.)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await gw.sendRequest({
        model,
        messages: [
          { role: 'system', content: SYS },
          { role: 'user', content: userContent },
        ],
        temperature: 0,
        maxTokens: 512,
        agentType: 'combat',
      });

      const json = response.content.replace(/```json|```/g, '').trim();
      if (!json) continue;
      const parsed = JSON.parse(json);
      const effects = validateRawEffects(parsed);
      // On retry, also validate: if narration mentions enemies but no addEnemy was extracted, retry
      if (attempt === 0 && effects.length === 0 && narrationHasCombatSignals(narration)) {
        continue; // Likely a miss, retry once
      }
      return effects;
    } catch {
      continue;
    }
  }
  return []; // 失败则不施加效果，宁可漏不可错
}

/** Quick heuristic: does the narration contain signals that combat should be happening? */
function narrationHasCombatSignals(narration: string): boolean {
  const signals = [
    /(?:冲|扑|攻|袭|向.*冲|逼.*近|拔剑|举剑|挥刀|拉弓|施法)/,
    /(?:战斗|交战|厮杀|搏斗|对决|对战)/,
    /(?:伤害|受伤|击中|命中|被打|被砍|被刺)/,
  ];
  return signals.some(pat => pat.test(narration));
}
