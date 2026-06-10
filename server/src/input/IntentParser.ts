import type { AIGateway, AIRequest, AIResponse } from '../ai/AIGateway';
import type { AgentAIConfig } from '../ai/AgentAIConfig';
import type { GameIntentType, ParsedIntent } from '@trpgmaster/shared';

export interface ParseContext {
  characterClass?: string;
  currentScene?: string;
  recentEvents?: string[];
  ruleSystem: string;
}

const VALID_INTENT_TYPES: Set<GameIntentType> = new Set<GameIntentType>([
  'action', 'dialogue', 'query', 'command', 'narration',
  'combat_action', 'character_introduction', 'rest', 'movement',
  'interaction', 'image_generation', 'unknown',
]);

export class IntentParser {
  private aiGateway: AIGateway | null;
  protected model: string;

  constructor(aiGateway?: AIGateway, agentAIConfig?: AgentAIConfig) {
    this.aiGateway = aiGateway ?? null;
    this.model = agentAIConfig?.getConfig('intentParser').model || 'nex-agi/Nex-N2-Pro';
  }

  async parseIntent(text: string, context: ParseContext): Promise<ParsedIntent> {
    if (!text || !text.trim()) {
      return {
        intentType: 'unknown',
        confidence: 0,
        attributes: {},
        rawInput: text,
      };
    }

    const trimmed = text.trim();

    // Fast path: command detection (starts with /)
    if (trimmed.startsWith('/')) {
      const match = trimmed.match(/^\/(\w+)/);
      return {
        intentType: 'command',
        confidence: 1.0,
        attributes: {
          command: match?.[1] ?? '',
          args: match ? trimmed.slice(match[0].length).trim() : '',
        },
        rawInput: trimmed,
      };
    }

    // AI parsing — primary method
    if (this.aiGateway) {
      try {
        const aiResult = await this.parseWithAI(trimmed, context);
        if (aiResult && VALID_INTENT_TYPES.has(aiResult.intentType)) {
          return aiResult;
        }
      } catch {
        // Fall through to safe fallback
      }
    }

    // Safe fallback: return generic 'action' instead of keyword matching
    // This avoids misclassification (e.g. "攻击" in character descriptions
    // triggering combat_action). When AI is unavailable, it's better to
    // return a safe default than to guess wrong and trigger CombatAgent.
    return {
      intentType: 'action',
      confidence: 0.3,
      attributes: { ruleSystem: context.ruleSystem },
      rawInput: trimmed,
    };
  }

  private async parseWithAI(text: string, context: ParseContext): Promise<ParsedIntent | null> {
    const systemPrompt = this.buildSystemPrompt(context);

    const request: AIRequest = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      maxTokens: 200,
      agentType: 'intentParser',
    };

    const response: AIResponse = await this.aiGateway!.sendRequest(request);

    try {
      const parsed = JSON.parse(response.content);
      if (parsed && typeof parsed.intentType === 'string' && typeof parsed.confidence === 'number') {
        return {
          intentType: parsed.intentType as GameIntentType,
          confidence: parsed.confidence,
          attributes: parsed.attributes ?? {},
          rawInput: text,
        };
      }
    } catch {
      // Invalid JSON
    }

    return null;
  }

  private buildSystemPrompt(context: ParseContext): string {
    let prompt = `你是TRPG游戏意图解析器。将玩家输入解析为结构化游戏意图。

输出JSON格式：
{ "intentType": "类型", "confidence": 0.0-1.0, "attributes": { "target": "...", "action": "...", "object": "..." }, "rawInput": "..." }

可选类型：
- character_introduction: 角色自我介绍、描述角色背景或能力（如"我叫晨星"、"我的妹妹是..."、"她是一名神使，使用圣光来攻击敌人"）
- combat_action: 明确的战斗指令（如"我攻击那个哥布林"、"对它砍一刀"、"施放火球术"）
- dialogue: 与NPC或其他角色对话（如"你好"、"请问这里是哪里"）
- action: 一般行动（不涉及战斗也不涉及对话）
- query: 查询规则或状态（如"什么规则"、"怎么判定"）
- narration: 描述场景或环境（如"描述一下这个走廊"）
- image_generation: 要求生成图片（如"帮我生成场景图片"、"画一张插图"）
- rest: 休息或恢复
- movement: 移动或前往某处
- interaction: 检查、搜索、打开等交互
- command: 斜杠命令
- unknown: 无法判断

关键区分规则：
1. 角色描述中提到"攻击"、"战斗"等词（如"她使用圣光来攻击敌人"）是 character_introduction，不是 combat_action
2. 只有明确的战斗指令（如"我攻击它"、"对哥布林砍一刀"）才是 combat_action
3. 描述某人的能力、职业、特征不等于发起战斗
4. 要求生成图片、插图、场景图像时，intentType应为image_generation，不是narration`;

    if (context.currentScene) {
      prompt += `\n\n当前场景：${context.currentScene}`;
    }
    if (context.characterClass) {
      prompt += `\n角色职业：${context.characterClass}`;
    }
    prompt += `\n规则系统：${context.ruleSystem}`;

    return prompt;
  }
}
