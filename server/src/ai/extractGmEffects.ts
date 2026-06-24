/**
 * GM effect extractor — structured channel for AI-declared mechanical effects
 * After narration completes, a separate AI call extracts mechanical effects as JSON.
 * This replaces unreliable [STATE] regex parsing of freeform narrative.
 */
import type { AIGateway } from './AIGateway';
import type { GmEffect } from '@trpgmaster/shared';

const SYS = `你是规则结算助手。给定一段 GM 叙事，抽取其中"对玩家角色或敌人产生的机械效果"。
只输出 JSON 数组，无任何解释或 markdown。没有机械效果则输出 []。
字段：type(damageToPlayer|stressToPlayer|enemyAttack|enemyHp|spendFear), targetId, enemyId, amount, source。`;

interface RawEffect {
  type: 'damageToPlayer' | 'stressToPlayer' | 'enemyAttack' | 'enemyHp' | 'spendFear';
  targetId?: string;
  enemyId?: string;
  amount?: number;
  source?: string;
}

function validateRawEffects(raw: unknown): GmEffect[] {
  if (!Array.isArray(raw)) return [];
  const validTypes = new Set(['damageToPlayer', 'stressToPlayer', 'enemyAttack', 'enemyHp', 'spendFear']);
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
  }));
}

export async function extractGmEffects(
  gw: AIGateway,
  narration: string,
  model: string,
): Promise<GmEffect[]> {
  try {
    const response = await gw.sendRequest({
      model,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: narration },
      ],
      temperature: 0,
      maxTokens: 512,
      agentType: 'combat',
    });

    const json = response.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(json);
    return validateRawEffects(parsed);
  } catch {
    return []; // 失败则不施加效果，宁可漏不可错
  }
}
