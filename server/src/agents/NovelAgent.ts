import type { GameEvent, GameEventType } from '@trpgmaster/shared';
import { BaseAgent } from './BaseAgent';
import type { AgentContext, AgentResponse } from '../core/AgentCoordinator';
import { AIGateway, type AIRequest } from '../ai/AIGateway';
import type { AgentAIConfig } from '../ai/AgentAIConfig';

const SYSTEM_PROMPT = `你是TRPGMaster的小说生成Agent。你负责在跑团结束后为每位玩家生成个人视角的小说。

核心原则：
1. 个人视角：每本小说从对应角色的视角出发，描述他们看到和感受到的一切
2. 角色一致：保持角色的性格、说话方式和行为动机一致
3. 叙事连贯：将零散的游戏事件编织成连贯的故事
4. 情感深度：不仅描述发生了什么，更要描述角色的内心感受
5. 留白艺术：关键时刻给予情感留白，让读者自己体会

小说结构：
- 开篇：角色进入故事的缘由和初始心态
- 发展：通过角色视角体验游戏中的关键事件
- 高潮：最激烈的冲突时刻
- 收束：角色的成长和变化

输出格式（JSON）：
{
  "title": "小说标题",
  "summary": "故事摘要",
  "chapters": [
    { "title": "章节标题", "summary": "章节摘要", "content": "章节正文" }
  ],
  "keyMoments": ["关键时刻1", "关键时刻2"]
}

风格：中文文学性叙事，第三人称有限视角，保持 DaggerHeart 黑暗奇幻的世界观`;

const HANDLED_EVENTS: GameEventType[] = [
  'session:end',
  'novel:generate',
];

interface NovelOutline {
  characterId: string;
  characterName: string;
  title: string;
  summary: string;
  chapters: Array<{ title: string; summary: string; content?: string }>;
  keyMoments: string[];
}

export class NovelAgent extends BaseAgent {
  private aiGateway: AIGateway | null = null;
  protected model: string;

  constructor(aiGateway?: AIGateway, agentAIConfig?: AgentAIConfig) {
    super({
      agentType: 'novel',
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4000,
      temperature: 0.8,
    });
    this.aiGateway = aiGateway ?? null;
    this.model = agentAIConfig?.getConfig('novel').model || 'nex-agi/Nex-N2-Pro';
  }

  async process(event: GameEvent, context: AgentContext): Promise<AgentResponse | null> {
    if (!HANDLED_EVENTS.includes(event.type)) return null;

    const outlines = await this.generateNovelOutlines(context);

    return this.createResponse(
      this.formatJSONOutput({ outlines, sessionId: context.sessionId }),
      [{
        type: 'novel:complete' as GameEventType,
        payload: { outlineCount: outlines.length } as Record<string, unknown>,
        priority: 'low' as const,
      }],
    );
  }

  private async generateNovelOutlines(context: AgentContext): Promise<NovelOutline[]> {
    const outlines: NovelOutline[] = [];

    for (const character of context.characters) {
      const keyMoments = this.extractKeyMoments(context);
      const chapters = this.generateChapterStructure(context, character);

      if (this.aiGateway) {
        try {
          const aiOutline = await this.generateWithAI(character, keyMoments, context);
          outlines.push(aiOutline);
          continue;
        } catch {
          // Fall through to fallback
        }
      }

      outlines.push(this.generateFallbackOutline(character, keyMoments, chapters));
    }

    return outlines;
  }

  private async generateWithAI(
    character: { id: string; name: string; class?: string; backstory?: string },
    keyMoments: string[],
    context: AgentContext,
  ): Promise<NovelOutline> {
    const prompt = this.buildNovelPrompt(character, keyMoments, context);

    const request: AIRequest = {
      model: this.model,
      messages: [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      agentType: 'novel',
    };

    const response = await this.aiGateway!.sendRequest(request);

    let parsed: any;
    try {
      // AI responses may contain markdown fences or malformed JSON
      const content = response.content.trim();
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content;
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`NovelAgent failed to parse AI response as JSON: ${(e as Error).message}`);
    }

    return {
      characterId: character.id,
      characterName: character.name,
      title: parsed.title || `${character.name}的冒险`,
      summary: parsed.summary || '',
      chapters: parsed.chapters || [],
      keyMoments: parsed.keyMoments || keyMoments,
    };
  }

  private buildNovelPrompt(
    character: { id: string; name: string; class?: string; backstory?: string },
    keyMoments: string[],
    context: AgentContext,
  ): string {
    const scene = context.state.currentScene;
    const timeline = context.state.timeline;

    let prompt = `角色：${character.name}（${character.class || '冒险者'}）\n`;
    if (character.backstory) prompt += `背景：${character.backstory}\n`;
    prompt += `\n关键事件：\n`;
    for (const moment of keyMoments) {
      prompt += `- ${moment}\n`;
    }
    prompt += `\n场景：${scene.name} - ${scene.description}\n`;
    prompt += `时间线：${timeline.length}个事件\n`;
    prompt += `\n请为${character.name}生成个人视角的小说大纲。`;

    return prompt;
  }

  private extractKeyMoments(context: AgentContext): string[] {
    return context.state.timeline
      .filter(e => e.isKeyMoment)
      .map(e => e.summary || e.eventType);
  }

  private generateChapterStructure(
    context: AgentContext,
    character: { name: string },
  ): Array<{ title: string; summary: string }> {
    const timeline = context.state.timeline;
    const keyMoments = this.extractKeyMoments(context);

    if (keyMoments.length === 0) {
      return [
        { title: '序章', summary: `${character.name}踏上旅途` },
        { title: '尾声', summary: `旅途告一段落` },
      ];
    }

    const chapters: Array<{ title: string; summary: string }> = [];
    chapters.push({ title: '序章', summary: `${character.name}的旅程开始` });

    for (let i = 0; i < keyMoments.length; i++) {
      chapters.push({
        title: `第${i + 1}章`,
        summary: keyMoments[i],
      });
    }

    chapters.push({ title: '尾声', summary: `${character.name}的旅途暂告段落` });
    return chapters;
  }

  private generateFallbackOutline(
    character: { id: string; name: string; class?: string; backstory?: string },
    keyMoments: string[],
    chapters: Array<{ title: string; summary: string }>,
  ): NovelOutline {
    return {
      characterId: character.id,
      characterName: character.name,
      title: `${character.name}的德拉肯海姆之旅`,
      summary: `${character.name}踏入了被诅咒的城市德拉肯海姆，在危险与谜团中寻找自己的道路。`,
      chapters: chapters.map((ch, i) => ({
        ...ch,
        content: i === 0
          ? `${character.name}站在破败的城门前，紫色的迷雾在脚下翻涌。前方的道路充满未知，但回头的路已不再存在。`
          : `这一刻，${character.name}感受到了命运的力量。周围的一切似乎都在暗示着某种更深层的变化正在发生。`,
      })),
      keyMoments,
    };
  }
}