import { ImageClient } from '../../image/ImageClient';
import type { ImageGenerationRequest } from '@trpgmaster/shared';
import type { AgentAIConfigResult } from '../../ai/AgentAIConfig';

describe('ImageClient', () => {
  let imageClient: ImageClient;

  beforeEach(() => {
    imageClient = new ImageClient();
  });

  describe('placeholder mode (no API configured)', () => {
    it('should return placeholder response for generate', async () => {
      const request: ImageGenerationRequest = {
        prompt: 'dark fantasy warrior',
        negativePrompt: 'anime, cartoon',
        style: {
          id: 'drakkenheim',
          name: 'Drakkenheim',
          basePrompt: 'dark fantasy oil painting',
          characterPromptTemplate: 'portrait of {name}',
          scenePromptTemplate: 'scene of {location}',
          negativePrompt: 'anime, cartoon, modern',
        },
        width: 512,
        height: 512,
      };

      const result = await imageClient.generate(request);
      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      expect(result.prompt).toBe(request.prompt);
      expect(result.styleId).toBe(request.style.id);
      expect(result.category).toBe('scene');
      expect(result.url).toContain('placeholder');
    });

    it('should return empty array for generateBatch', async () => {
      const requests: ImageGenerationRequest[] = [];
      const results = await imageClient.generateBatch(requests);
      expect(results).toEqual([]);
    });

    it('should return styles list', () => {
      const styles = imageClient.getAvailableStyles();
      expect(styles.length).toBeGreaterThan(0);
      expect(styles[0].id).toBe('drakkenheim');
    });

    it('should indicate not configured', () => {
      expect(imageClient.isConfigured()).toBe(false);
    });
  });

  describe('with API config', () => {
    it('should indicate configured when apiKey is provided', () => {
      const testConfig: AgentAIConfigResult = {
        apiKey: 'test-key',
        baseUrl: 'https://api.example.com/v1',
        model: 'Kwai-Kolors/Kolors',
      };
      const configuredClient = new ImageClient(testConfig);
      expect(configuredClient.isConfigured()).toBe(true);
    });

    it('should indicate not configured when apiKey is empty', () => {
      const testConfig: AgentAIConfigResult = {
        apiKey: '',
        baseUrl: 'https://api.example.com/v1',
        model: 'Kwai-Kolors/Kolors',
      };
      const configuredClient = new ImageClient(testConfig);
      expect(configuredClient.isConfigured()).toBe(false);
    });

    it('should call API for image generation', async () => {
      const testConfig: AgentAIConfigResult = {
        apiKey: 'test-key',
        baseUrl: 'https://api.test.com/v1',
        model: 'Kwai-Kolors/Kolors',
      };
      const configuredClient = new ImageClient(testConfig);

      const mockResponse = {
        images: [{ url: 'https://cdn.test.com/image-123.png' }],
        seed: 42,
      };

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      global.fetch = mockFetch;

      const request: ImageGenerationRequest = {
        prompt: 'dark fantasy warrior',
        negativePrompt: 'anime, cartoon',
        style: {
          id: 'drakkenheim',
          name: 'Drakkenheim',
          basePrompt: 'dark fantasy oil painting',
          characterPromptTemplate: '',
          scenePromptTemplate: '',
          negativePrompt: 'anime, cartoon, modern',
        },
        width: 512,
        height: 512,
      };

      const result = await configuredClient.generate(request);
      expect(result.url).toBe('https://cdn.test.com/image-123.png');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/images/generations',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key',
          }),
        }),
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.model).toBe('Kwai-Kolors/Kolors');
      expect(callBody.image_size).toBe('512x512');
      expect(callBody.guidance_scale).toBe(7.5);
    });

    it('should throw on API error', async () => {
      const testConfig: AgentAIConfigResult = {
        apiKey: 'test-key',
        baseUrl: 'https://api.test.com/v1',
        model: 'Kwai-Kolors/Kolors',
      };
      const configuredClient = new ImageClient(testConfig);

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const request: ImageGenerationRequest = {
        prompt: 'test',
        negativePrompt: '',
        style: {
          id: 'test',
          name: 'Test',
          basePrompt: '',
          characterPromptTemplate: '',
          scenePromptTemplate: '',
          negativePrompt: '',
        },
        width: 512,
        height: 512,
      };

      await expect(configuredClient.generate(request)).rejects.toThrow('Image generation failed: 500');
    });
  });
});