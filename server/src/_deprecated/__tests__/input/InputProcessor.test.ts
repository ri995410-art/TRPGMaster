import { InputProcessor, type ProcessedInput } from '../../input/InputProcessor';
import { IntentParser, type ParseContext } from '../../input/IntentParser';
import { VoiceProcessor } from '../../input/VoiceProcessor';
import { VisionProcessor } from '../../input/VisionProcessor';
import { EventBus } from '../../core/EventBus';
import type {
  InputTextPayload,
  InputVoicePayload,
  InputVisionPayload,
  GameEvent,
} from '@trpgmaster/shared';
import type { AIGateway } from '../../ai/AIGateway';

describe('InputProcessor', () => {
  let processor: InputProcessor;
  let eventBus: EventBus;
  let intentParser: IntentParser;
  let voiceProcessor: VoiceProcessor;
  let visionProcessor: VisionProcessor;
  const sessionId = 'test-session';
  const defaultParseContext: ParseContext = { ruleSystem: 'daggerheart' };

  // Helper: create mock AIGateway that returns specific intent
  function createMockGateway(intentType: string, confidence: number = 0.9, attributes: Record<string, unknown> = {}) {
    return {
      sendRequest: jest.fn().mockResolvedValue({
        content: JSON.stringify({ intentType, confidence, attributes, rawInput: 'test' }),
        agentType: 'intentParser',
        model: 'nex-agi/Nex-N2-Pro',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        requestId: 'test-1',
      }),
      sendRequestSafe: jest.fn(),
      sendStreamRequest: jest.fn(),
      buildAgentContext: jest.fn().mockReturnValue({ messages: [] }),
      estimateTokenCount: jest.fn().mockReturnValue(100),
      getStats: jest.fn(),
      getActiveRequestCount: jest.fn(),
    } as unknown as jest.Mocked<AIGateway>;
  }

  describe('processTextInput — AI mode', () => {
    it('should generate combat:attack event for combat_action intent', async () => {
      const mockGateway = createMockGateway('combat_action', 0.95, { target: '哥布林' });
      intentParser = new IntentParser(mockGateway);
      eventBus = new EventBus();
      processor = new InputProcessor(eventBus, intentParser, new VoiceProcessor(), new VisionProcessor(), sessionId);

      const payload: InputTextPayload = { text: '攻击哥布林', source: 'player', characterId: 'char-1' };
      const result = await processor.processTextInput(payload, defaultParseContext);

      expect(result.parsedIntent.intentType).toBe('combat_action');
      const attackEvent = result.generatedEvents.find(e => e.type === 'combat:attack');
      expect(attackEvent).toBeDefined();
      expect(attackEvent?.source).toBe('player');
    });

    it('should generate player:dialogue event for dialogue intent', async () => {
      const mockGateway = createMockGateway('dialogue');
      intentParser = new IntentParser(mockGateway);
      eventBus = new EventBus();
      processor = new InputProcessor(eventBus, intentParser, new VoiceProcessor(), new VisionProcessor(), sessionId);

      const payload: InputTextPayload = { text: '告诉村长消息', source: 'player', characterId: 'char-1' };
      const result = await processor.processTextInput(payload, defaultParseContext);

      const dialogueEvent = result.generatedEvents.find(e => e.type === 'player:dialogue');
      expect(dialogueEvent).toBeDefined();
    });

    it('should generate player:action event for character_introduction intent', async () => {
      const mockGateway = createMockGateway('character_introduction');
      intentParser = new IntentParser(mockGateway);
      eventBus = new EventBus();
      processor = new InputProcessor(eventBus, intentParser, new VoiceProcessor(), new VisionProcessor(), sessionId);

      const payload: InputTextPayload = { text: '我叫晨星格里西亚', source: 'player', characterId: 'char-1' };
      const result = await processor.processTextInput(payload, defaultParseContext);

      expect(result.parsedIntent.intentType).toBe('character_introduction');
      const actionEvent = result.generatedEvents.find(e => e.type === 'player:action');
      expect(actionEvent).toBeDefined();
      // character_introduction should NOT trigger combat:attack
      const attackEvent = result.generatedEvents.find(e => e.type === 'combat:attack');
      expect(attackEvent).toBeUndefined();
    });

    it('should generate gm:narrate event for narration intent from GM', async () => {
      const mockGateway = createMockGateway('narration');
      intentParser = new IntentParser(mockGateway);
      eventBus = new EventBus();
      processor = new InputProcessor(eventBus, intentParser, new VoiceProcessor(), new VisionProcessor(), sessionId);

      const payload: InputTextPayload = { text: '描述场景', source: 'gm' };
      const result = await processor.processTextInput(payload, defaultParseContext);

      expect(result.parsedIntent.intentType).toBe('narration');
      const narrateEvent = result.generatedEvents.find(e => e.type === 'gm:narrate');
      expect(narrateEvent).toBeDefined();
      expect(narrateEvent?.source).toBe('gm');
    });

    it('should include characterId in generated events', async () => {
      const mockGateway = createMockGateway('combat_action', 0.95, { target: '哥布林' });
      intentParser = new IntentParser(mockGateway);
      eventBus = new EventBus();
      processor = new InputProcessor(eventBus, intentParser, new VoiceProcessor(), new VisionProcessor(), sessionId);

      const payload: InputTextPayload = { text: '攻击哥布林', source: 'player', characterId: 'char-1' };
      const result = await processor.processTextInput(payload, defaultParseContext);

      const attackEvent = result.generatedEvents.find(e => e.type === 'combat:attack') as GameEvent & { characterId?: string };
      expect(attackEvent?.characterId).toBe('char-1');
    });
  });

  describe('processTextInput — fallback mode (no AI)', () => {
    beforeEach(() => {
      eventBus = new EventBus();
      intentParser = new IntentParser(); // No AI gateway
      voiceProcessor = new VoiceProcessor();
      visionProcessor = new VisionProcessor();
      processor = new InputProcessor(eventBus, intentParser, voiceProcessor, visionProcessor, sessionId);
    });

    it('should return action (safe default) for any text input', async () => {
      const payload: InputTextPayload = { text: '攻击哥布林', source: 'player', characterId: 'char-1' };
      const result = await processor.processTextInput(payload, defaultParseContext);

      expect(result.parsedIntent.intentType).toBe('action');
      const actionEvent = result.generatedEvents.find(e => e.type === 'player:action');
      expect(actionEvent).toBeDefined();
      // Should NOT produce combat:attack in fallback mode
      const attackEvent = result.generatedEvents.find(e => e.type === 'combat:attack');
      expect(attackEvent).toBeUndefined();
    });

    it('should still handle commands in fallback mode (fast path)', async () => {
      const payload: InputTextPayload = { text: '/roll 2d6', source: 'player', characterId: 'char-1' };
      const result = await processor.processTextInput(payload, defaultParseContext);

      expect(result.parsedIntent.intentType).toBe('command');
      expect(result.generatedEvents.length).toBe(0);
    });
  });

  describe('processVoiceInput', () => {
    beforeEach(() => {
      eventBus = new EventBus();
      intentParser = new IntentParser();
      voiceProcessor = new VoiceProcessor();
      visionProcessor = new VisionProcessor();
      processor = new InputProcessor(eventBus, intentParser, voiceProcessor, visionProcessor, sessionId);
    });

    it('should process voice input through STT then IntentParser', async () => {
      const payload: InputVoicePayload = {
        audioData: 'base64-audio',
        format: 'wav',
        duration: 5,
        language: 'zh-CN',
      };

      const result = await processor.processVoiceInput(payload, defaultParseContext);
      expect(result.originalInput).toBe(payload);
      expect(result.parsedIntent).toBeDefined();
    });

    it('should return unknown when STT returns empty', async () => {
      const payload: InputVoicePayload = {
        audioData: 'base64-audio',
        format: 'wav',
        duration: 5,
      };

      const result = await processor.processVoiceInput(payload, defaultParseContext);
      expect(result.generatedEvents.length).toBe(0);
      expect(result.parsedIntent.intentType).toBe('unknown');
    });
  });

  describe('processVisionInput', () => {
    beforeEach(() => {
      eventBus = new EventBus();
      intentParser = new IntentParser();
      voiceProcessor = new VoiceProcessor();
      visionProcessor = new VisionProcessor();
      processor = new InputProcessor(eventBus, intentParser, voiceProcessor, visionProcessor, sessionId);
    });

    it('should process vision input through VisionProcessor', async () => {
      const payload: InputVisionPayload = {
        imageData: 'base64-image',
        format: 'jpeg',
        timestamp: Date.now(),
      };

      const result = await processor.processVisionInput(payload);
      expect(result.originalInput).toBe(payload);
      expect(result.parsedIntent).toBeDefined();
    });

    it('should return unknown when VisionProcessor returns empty', async () => {
      const payload: InputVisionPayload = {
        imageData: 'base64-image',
        format: 'jpeg',
        timestamp: Date.now(),
      };

      const result = await processor.processVisionInput(payload);
      expect(result.generatedEvents.length).toBe(0);
      expect(result.parsedIntent.intentType).toBe('unknown');
    });
  });

  describe('error handling', () => {
    it('should handle IntentParser errors gracefully', async () => {
      const failingParser = {
        parseIntent: jest.fn().mockRejectedValue(new Error('Parser error')),
      } as unknown as IntentParser;

      const failingProcessor = new InputProcessor(
        eventBus,
        failingParser,
        new VoiceProcessor(),
        new VisionProcessor(),
        sessionId,
      );

      const payload: InputTextPayload = { text: '攻击哥布林', source: 'player', characterId: 'char-1' };
      const result = await failingProcessor.processTextInput(payload, defaultParseContext);

      expect(result.parsedIntent.intentType).toBe('unknown');
      expect(result.generatedEvents.length).toBe(0);
    });
  });
});

describe('VoiceProcessor', () => {
  let voiceProcessor: VoiceProcessor;

  beforeEach(() => {
    voiceProcessor = new VoiceProcessor();
  });

  it('should return empty string when not configured', async () => {
    const result = await voiceProcessor.transcribe('base64-audio', 'wav');
    expect(result).toBe('');
  });

  it('should indicate not configured when no config', () => {
    expect(voiceProcessor.isConfigured()).toBe(false);
  });

  it('should call STT API when configured', async () => {
    const { VoiceProcessor: VP } = require('../../input/VoiceProcessor');
    const configured = new VP({
      apiKey: 'test-key',
      baseUrl: 'https://api.test.com/v1',
      model: 'TeleAI/TeleSpeechASR',
    });
    expect(configured.isConfigured()).toBe(true);

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '你好世界' }),
    });
    global.fetch = mockFetch;

    const result = await configured.transcribe('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=', 'wav');
    expect(result).toBe('你好世界');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/v1/audio/transcriptions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key',
        }),
      }),
    );
  });
});

describe('VisionProcessor', () => {
  let visionProcessor: VisionProcessor;

  beforeEach(() => {
    visionProcessor = new VisionProcessor();
  });

  it('should return empty string (placeholder)', async () => {
    const result = await visionProcessor.describeScene('base64-image', 'jpeg');
    expect(result).toBe('');
  });
});