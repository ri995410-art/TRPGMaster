import type { GameEvent, GameEventType } from '@trpgmaster/shared';
import { BaseAgent } from './BaseAgent';
import type { AgentContext, AgentResponse } from '../core/AgentCoordinator';
import { AIGateway, type AIRequest } from '../ai/AIGateway';
import type { AgentAIConfig } from '../ai/AgentAIConfig';
import { ImageClient } from '../image/ImageClient';

const SYSTEM_PROMPT = `你是TRPGMaster的图像指导Agent。你负责根据当前剧情、角色对话和GM要求，为AI图像生成创建精准的提示词。

核心原则：
1. 内容跟随剧情：提示词必须反映当前正在发生的故事和对话内容
2. 角色可见：如果剧情涉及特定角色，他们的外观应出现在图像中
3. 动态变化：不同时刻、不同事件应产生不同风格的图像（战斗激烈、对话温馨、探索神秘等）
4. 氛围匹配：图像风格必须匹配场景的叙事氛围
5. 安全合规：避免生成不适当的内容

德拉肯海姆风格指南：
- 整体风格：dark fantasy, oil painting style, muted color palette
- 场景风格：ruined cityscape, purple eldritch haze, dramatic lighting, gothic architecture
- 角色风格：detailed character portraits, medieval fantasy attire, expressive faces
- 负面prompt：anime, cartoon, modern, photograph, low quality, blurry, watermark

根据剧情内容选择合适的表现重点：
- 战斗场景：突出动作、紧张感、武器碰撞、动态姿势
- NPC对话：突出角色表情、对话氛围、两人互动
- 探索场景：突出环境细节、神秘感、光影效果
- GM描述：忠实反映GM叙述的具体内容

输出格式（JSON）：
{ "prompt": "完整的英文图像生成提示词（必须包含当前剧情的具体内容）", "negativePrompt": "负面提示词", "styleId": "使用的风格ID", "category": "character/scene/item/map", "relatedEntityId": "关联的实体ID" }`;

const HANDLED_EVENTS: GameEventType[] = [
  'gm:sceneChange',
  'session:start',
  'image:generate',
  'combat:start',
];

export class ImageDirectorAgent extends BaseAgent {
  private aiGateway: AIGateway | null = null;
  private imageClient: ImageClient | null = null;
  protected model: string;

  constructor(aiGateway?: AIGateway, imageClient?: ImageClient, agentAIConfig?: AgentAIConfig) {
    super({
      agentType: 'imageDirector',
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 1000,
      temperature: 0.5,
    });
    this.aiGateway = aiGateway ?? null;
    this.imageClient = imageClient ?? new ImageClient();
    this.model = agentAIConfig?.getConfig('imageDirector').model || 'nex-agi/Nex-N2-Pro';
  }

  async process(event: GameEvent, context: AgentContext): Promise<AgentResponse | null> {
    if (!HANDLED_EVENTS.includes(event.type)) return null;

    const promptResult = await this.generateImagePrompt(event, context);

    if (this.imageClient) {
      try {
        console.log(`ImageDirectorAgent: generating image with prompt="${promptResult.prompt.substring(0, 80)}..."`);
        const image = await this.imageClient.generate({
          prompt: promptResult.prompt,
          negativePrompt: promptResult.negativePrompt,
          style: {
            id: promptResult.styleId || 'drakkenheim',
            name: 'Drakkenheim',
            basePrompt: 'dark fantasy oil painting style, muted color palette',
            characterPromptTemplate: 'portrait of {name}',
            scenePromptTemplate: '{scene} in dark fantasy oil painting style',
            negativePrompt: promptResult.negativePrompt,
          },
          width: 1024,
          height: 1024,
        });

        console.log(`ImageDirectorAgent: image generated, id=${image.id}, url=${image.url.substring(0, 60)}...`);

        const events = image ? [{
          type: 'image:complete' as GameEventType,
          payload: { imageId: image.id, url: image.url, category: image.category } as Record<string, unknown>,
          priority: 'normal' as const,
        }] : undefined;

        return this.createResponse(
          this.formatJSONOutput({ ...promptResult, imageId: image?.id, imageUrl: image?.url }),
          events,
        );
      } catch (err) {
        console.error('ImageDirectorAgent: image generation failed:', err);
        // Fall through to return prompt-only result
      }
    }

    console.log('ImageDirectorAgent: returning prompt-only result (no image generated)');
    return this.createResponse(this.formatJSONOutput(promptResult));
  }

  private async generateImagePrompt(event: GameEvent, context: AgentContext): Promise<{
    prompt: string;
    negativePrompt: string;
    styleId: string;
    category: string;
    relatedEntityId?: string;
  }> {
    if (this.aiGateway) {
      try {
        const prompt = this.buildPromptForEvent(event, context);

        const request: AIRequest = {
          model: this.model,
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          agentType: 'imageDirector',
        };

        const response = await this.aiGateway.sendRequest(request);
        const parsed = JSON.parse(response.content);
        return {
          prompt: parsed.prompt || '',
          negativePrompt: parsed.negativePrompt || '',
          styleId: parsed.styleId || 'drakkenheim',
          category: parsed.category || 'scene',
          relatedEntityId: parsed.relatedEntityId,
        };
      } catch {
        // Fall through to fallback
      }
    }

    return this.generateFallbackPrompt(event, context);
  }

  private buildPromptForEvent(event: GameEvent, context: AgentContext): string {
    const scene = context.state.currentScene;
    const characters = context.characters;

    // Build scene context
    let prompt = `当前场景：${scene.name}\n环境：${scene.environment}\n描述：${scene.description}\n\n`;

    // Add character info
    if (characters.length > 0) {
      prompt += `在场角色：\n`;
      for (const char of characters) {
        prompt += `- ${char.name}（${char.classId}）：HP ${char.hp}/${char.maxHp}\n`;
      }
      prompt += '\n';
    }

    // Add recent events/story context
    const recentEvents = context.recentEvents.slice(-8);
    if (recentEvents.length > 0) {
      prompt += `最近的剧情事件（从早到晚）：\n`;
      for (const ev of recentEvents) {
        const evData = ev as GameEvent & Record<string, unknown>;
        let eventDesc = '';
        switch (ev.type) {
          case 'player:dialogue':
            eventDesc = `玩家对话：${evData.dialogue || evData.action || ''}`;
            break;
          case 'gm:narrate':
            eventDesc = `GM叙述：${evData.description || evData.action || ''}`;
            break;
          case 'combat:attack':
            eventDesc = `战斗攻击`;
            break;
          case 'combat:start':
            eventDesc = `战斗开始`;
            break;
          case 'player:action':
            eventDesc = `玩家行动：${evData.action || ''}`;
            break;
          default:
            eventDesc = `${ev.type}`;
        }
        prompt += `- ${eventDesc}\n`;
      }
      prompt += '\n';
    }

    // Add GM request from the event itself
    const eventData = event as GameEvent & Record<string, unknown>;
    if (eventData.description || eventData.prompt) {
      prompt += `GM的具体要求：${eventData.description || eventData.prompt || ''}\n\n`;
    }

    switch (event.type) {
      case 'gm:sceneChange':
        prompt += 'GM切换了场景。请根据新场景的描述和最近的剧情，生成一幅反映当前情境的图像提示词。';
        break;
      case 'session:start':
        prompt += '会话刚刚开始。请为初始场景生成图像提示词，展现角色们首次进入这个世界的画面。';
        break;
      case 'image:generate':
        prompt += 'GM要求生成图像。请根据当前剧情、角色状态和最近的对话内容，生成一幅反映当前情境的图像提示词。如果GM有具体要求，优先遵循GM的要求。';
        break;
      case 'combat:start':
        prompt += '战斗开始了。请生成一幅战斗场景的图像提示词，体现角色们的战斗姿态和紧张氛围。';
        break;
    }

    return prompt;
  }

  private generateFallbackPrompt(event: GameEvent, context: AgentContext): {
    prompt: string;
    negativePrompt: string;
    styleId: string;
    category: string;
    relatedEntityId?: string;
  } {
    const scene = context.state.currentScene;
    const characters = context.characters;
    const charNames = characters.map(c => c.name).join(', ');
    const charDesc = charNames ? `, featuring ${charNames}` : '';

    // Build context from recent events
    const recentEvents = context.recentEvents.slice(-3);
    const eventDesc = recentEvents.map(e => {
      const d = e as GameEvent & Record<string, unknown>;
      if (e.type === 'player:dialogue') return d.dialogue || d.action || '';
      if (e.type === 'gm:narrate') return d.description || d.action || '';
      if (e.type === 'player:action') return d.action || '';
      return '';
    }).filter(Boolean).join(', ');
    const eventContext = eventDesc ? `, depicting: ${eventDesc}` : '';

    const neg = 'anime, cartoon, modern, photograph, low quality, blurry, watermark';

    switch (event.type) {
      case 'gm:sceneChange':
        return {
          prompt: `dark fantasy oil painting of ${scene.name}, ${scene.environment}, dramatic lighting, muted colors, gothic atmosphere${charDesc}${eventContext}`,
          negativePrompt: neg,
          styleId: 'drakkenheim',
          category: 'scene',
          relatedEntityId: scene.id,
        };

      case 'session:start':
        return {
          prompt: `dark fantasy oil painting of ${scene.name}, establishing shot, ${scene.environment}, dramatic atmosphere, oil painting style${charDesc}`,
          negativePrompt: neg,
          styleId: 'drakkenheim',
          category: 'scene',
          relatedEntityId: scene.id,
        };

      case 'image:generate': {
        const eventData = event as GameEvent & Record<string, unknown>;
        const gmRequest = eventData.description || eventData.prompt || '';
        const requestContext = gmRequest ? `, based on: ${gmRequest}` : '';
        return {
          prompt: `dark fantasy oil painting of ${scene.name}, ${scene.description}, detailed, atmospheric${charDesc}${eventContext}${requestContext}`,
          negativePrompt: neg,
          styleId: 'drakkenheim',
          category: 'scene',
          relatedEntityId: scene.id,
        };
      }

      case 'combat:start':
        return {
          prompt: `dark fantasy oil painting of combat in ${scene.name}, intense action, dramatic combat scene, ${scene.environment}, dynamic poses${charDesc}`,
          negativePrompt: `${neg}, peaceful`,
          styleId: 'drakkenheim',
          category: 'scene',
          relatedEntityId: scene.id,
        };

      default:
        return {
          prompt: `dark fantasy oil painting of ${scene.name}, atmospheric${charDesc}${eventContext}`,
          negativePrompt: neg,
          styleId: 'drakkenheim',
          category: 'scene',
        };
    }
  }
}