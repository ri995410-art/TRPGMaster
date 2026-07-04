/**
 * GM effect extractor — structured channel for AI-declared mechanical effects
 * After narration completes, a separate AI call extracts mechanical effects as JSON.
 * This replaces unreliable [STATE] regex parsing of freeform narrative.
 */
import type { AIGateway } from './AIGateway';
import type { GmEffect } from '@trpgmaster/shared';

const MAX_EFFECTS = 20; // Prevent hallucinated effect floods

function extractJsonFromContent(content: string): string | null {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const anyFenced = content.match(/```\s*([\s\S]*?)```/);
  if (anyFenced) return anyFenced[1].trim();
  return content.trim();
}

// Lazy-initialized enemy ID list — avoids module-level crash if data provider not ready
let _enemyIdList: string | null = null;
let _enemyIdListError = false;
function getEnemyIdList(): string {
  // Always retry if the previous attempt failed (data may not have been ready)
  if (_enemyIdList !== null && !_enemyIdListError) {
    return _enemyIdList;
  }
  try {
    const { getDataProvider } = require('../rules/DataProviderRegistry');
    _enemyIdList = getDataProvider('daggerheart').getEnemies().map((e: any) => `${e.id}(${e.name})`).join('、');
    _enemyIdListError = false;
  } catch {
    _enemyIdList = '(数据未加载)';
    _enemyIdListError = true;
  }
  return _enemyIdList ?? '(数据未加载)';
}

function buildSystemPrompt(): string {
  return `你是规则结算助手。给定一段 GM 叙事和玩家行动，只提取"规则引擎无法预知的环境效果"。
只输出 JSON 数组，无任何解释或 markdown。没有环境效果则输出 []。

注意：伤害、治疗、压力、恐惧花费、敌人攻击等机械效果已由规则引擎处理，不需要你提取。
你只需要提取以下6种环境效果：

字段：type, amount, source, enemyStatBlockId, enemyName, itemName, itemDescription, itemCategory, goldCoins, sceneName

效果类型：
- addEnemy: 叙事中出现了新敌人。enemyStatBlockId 必须是以下之一：${getEnemyIdList()}。enemyName 为敌人名字。如果不确定类型，用最接近的。
- startCombat: 叙事表明战斗开始或敌对遭遇。只要叙事中出现威胁性的敌对行动（攻击、冲锋、伏击、拔剑对峙等），就必须标记。
- endCombat: 叙事表明战斗结束、敌人被击败或逃跑、冲突解决。
- setSceneName: 叙事中场景名称发生变化（如进入新地点）。sceneName为新场景名。
- addItem: 叙事中玩家找到了物品、金币。itemName 为物品名称，goldCoins 为金币数量。
- setDifficulty: 场景中有新的挑战时设置难度(8-25)，amount 为难度值。

判断原则：
1. 叙事中出现新敌人 → addEnemy + startCombat
2. 场景转换 → setSceneName
3. 发现物品/金币 → addItem
4. 新的挑战 → setDifficulty
5. 不要提取伤害/治疗/压力/恐惧花费——这些已由规则引擎处理`;
}

interface RawEffect {
  type: 'addEnemy' | 'startCombat' | 'endCombat' | 'setSceneName' | 'addItem' | 'setDifficulty';
  amount?: number;
  source?: string;
  enemyStatBlockId?: string;
  enemyName?: string;
  itemName?: string;
  itemDescription?: string;
  itemCategory?: string;
  goldCoins?: number;
  sceneName?: string;
}

function validateRawEffects(raw: unknown): GmEffect[] {
  if (!Array.isArray(raw)) return [];
  const validTypes = new Set(['addEnemy', 'startCombat', 'endCombat', 'setSceneName', 'addItem', 'setDifficulty']);

  // Cap total effects to prevent hallucinated floods
  const capped = raw.slice(0, MAX_EFFECTS);

  return capped.filter((item: unknown): item is RawEffect => {
    if (typeof item !== 'object' || item === null) return false;
    const obj = item as Record<string, unknown>;
    return typeof obj.type === 'string' && validTypes.has(obj.type);
  }).map(item => {
    // Validate amount: must be non-negative
    let amount: number | undefined = typeof item.amount === 'number' ? item.amount : undefined;
    if (amount !== undefined && amount < 0) {
      console.warn(`[extractGmEffects] Negative amount ${amount} for ${item.type}, clamping to 0`);
      amount = 0;
    }

    return {
      type: item.type,
      amount,
      source: typeof item.source === 'string' ? item.source : undefined,
      enemyStatBlockId: typeof item.enemyStatBlockId === 'string' ? item.enemyStatBlockId : undefined,
      enemyName: typeof item.enemyName === 'string' ? item.enemyName : undefined,
      itemName: typeof item.itemName === 'string' ? item.itemName : undefined,
      itemDescription: typeof item.itemDescription === 'string' ? item.itemDescription : undefined,
      itemCategory: typeof item.itemCategory === 'string' ? item.itemCategory : undefined,
      goldCoins: typeof item.goldCoins === 'number' ? Math.max(0, item.goldCoins) : undefined,
      sceneName: typeof item.sceneName === 'string' ? item.sceneName : undefined,
    };
  });
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
    /(?:敌人|怪物|守卫|士兵|骷髅|僵尸|巨魔|龙|恶魔|亡灵|刺客|兽人|哥布林)([一-龥]{0,4}?)(?:说|喊|叫|笑|怒|冲|扑)/,
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
  const baseContent = playerInput
    ? `玩家行动：${playerInput}\n\nGM叙事：${narration}`
    : narration;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const userContent = attempt > 0
        ? `${baseContent}\n\n上一次返回了无效 JSON，请只返回 JSON 数组`
        : baseContent;

      const response = await gw.sendRequest({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: userContent },
        ],
        temperature: 0,
        maxTokens: 512,
        agentType: 'combat',
      });

      const json = extractJsonFromContent(response.content);
      if (!json) continue;
      const parsed = JSON.parse(json);
      const effects = validateRawEffects(parsed);
      if (attempt < 2 && effects.length === 0 && narrationHasCombatSignals(narration)) {
        console.warn('[extractGmEffects] No effects extracted but narration has combat signals, retrying');
        continue;
      }
      if (effects.length > 0) {
        console.log(`[extractGmEffects] Extracted ${effects.length} effect(s): ${effects.map(e => e.type).join(', ')}`);
      }
      return effects;
    } catch (err) {
      console.warn(`[extractGmEffects] Attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err);
      continue;
    }
  }
  console.warn('[extractGmEffects] All attempts failed, returning empty effects');
  return [];
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
