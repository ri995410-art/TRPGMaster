import { v4 as uuidv4 } from 'uuid';
import type { ImageGenerationRequest, GeneratedImage, ImageStyle } from '@trpgmaster/shared';
import type { AgentAIConfigResult } from '../ai/AgentAIConfig';

const DEFAULT_STYLES: ImageStyle[] = [
  {
    id: 'drakkenheim',
    name: 'Drakkenheim',
    basePrompt: 'dark fantasy oil painting style, muted color palette, dramatic lighting',
    characterPromptTemplate: 'portrait of {name}, {description}, dark fantasy oil painting',
    scenePromptTemplate: '{scene} in dark fantasy oil painting style, dramatic atmosphere',
    negativePrompt: 'anime, cartoon, modern, photograph, low quality, blurry, watermark',
  },
];

export class ImageClient {
  private config: AgentAIConfigResult | null;

  constructor(config?: AgentAIConfigResult) {
    this.config = config ?? null;
  }

  isConfigured(): boolean {
    return this.config !== null && this.config.apiKey.length > 0;
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    if (!this.config) {
      return {
        id: uuidv4(),
        url: `placeholder://image-${Date.now()}.png`,
        prompt: request.prompt,
        styleId: request.style.id,
        category: 'scene',
        timestamp: Date.now(),
      };
    }

    const fullPrompt = `${request.style.basePrompt}, ${request.prompt}`;
    const fullNegative = `${request.style.negativePrompt}, ${request.negativePrompt}`;

    const size = `${request.width}x${request.height}`;

    const response = await fetch(`${this.config.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt: fullPrompt,
        negative_prompt: fullNegative,
        image_size: size,
        batch_size: 1,
        guidance_scale: 7.5,
      }),
      signal: AbortSignal.timeout(120000), // 2 minute timeout for image generation
    });

    if (!response.ok) {
      throw new Error(`Image generation failed: ${response.status}`);
    }

    const data = await response.json() as {
      images: Array<{ url: string }>;
      seed?: number;
    };

    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error('Image generation returned no image URL');
    }

    return {
      id: uuidv4(),
      url: imageUrl,
      prompt: request.prompt,
      styleId: request.style.id,
      category: 'scene',
      timestamp: Date.now(),
    };
  }

  async generateBatch(requests: ImageGenerationRequest[]): Promise<GeneratedImage[]> {
    if (!this.config || requests.length === 0) {
      return [];
    }

    return Promise.all(requests.map(r => this.generate(r)));
  }

  getAvailableStyles(): ImageStyle[] {
    return [...DEFAULT_STYLES];
  }
}