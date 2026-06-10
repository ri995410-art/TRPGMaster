import { v4 as uuidv4 } from 'uuid';
import { IntentParser, type ParseContext } from './IntentParser';
import { VoiceProcessor } from './VoiceProcessor';
import { VisionProcessor } from './VisionProcessor';
import { EventBus } from '../core/EventBus';
import type {
  InputTextPayload,
  InputVoicePayload,
  InputVisionPayload,
  GameEvent,
  GameEventType,
  ParsedIntent,
} from '@trpgmaster/shared';

export interface ProcessedInput {
  originalInput: InputTextPayload | InputVoicePayload | InputVisionPayload;
  parsedIntent: ParsedIntent;
  generatedEvents: GameEvent[];
}

const INTENT_TO_EVENT_MAP: Record<string, { eventType: GameEventType; source: 'player' | 'gm' }> = {
  combat_action: { eventType: 'combat:attack', source: 'player' },
  character_introduction: { eventType: 'player:action', source: 'player' },
  dialogue: { eventType: 'player:dialogue', source: 'player' },
  rest: { eventType: 'player:rest', source: 'player' },
  movement: { eventType: 'player:action', source: 'player' },
  interaction: { eventType: 'player:action', source: 'player' },
  action: { eventType: 'player:action', source: 'player' },
  query: { eventType: 'player:action', source: 'player' },
  narration: { eventType: 'gm:narrate', source: 'gm' },
  image_generation: { eventType: 'image:generate', source: 'gm' },
};

export class InputProcessor {
  private eventBus: EventBus;
  private intentParser: IntentParser;
  private voiceProcessor: VoiceProcessor;
  private visionProcessor: VisionProcessor;
  private sessionId: string;

  constructor(
    eventBus: EventBus,
    intentParser: IntentParser,
    voiceProcessor: VoiceProcessor,
    visionProcessor: VisionProcessor,
    sessionId: string,
  ) {
    this.eventBus = eventBus;
    this.intentParser = intentParser;
    this.voiceProcessor = voiceProcessor;
    this.visionProcessor = visionProcessor;
    this.sessionId = sessionId;
  }

  async processTextInput(payload: InputTextPayload, context: ParseContext): Promise<ProcessedInput> {
    try {
      const parsedIntent = await this.intentParser.parseIntent(payload.text, context);
      const generatedEvents = this.generateEvents(parsedIntent, payload);

      for (const event of generatedEvents) {
        await this.eventBus.publish(event);
      }

      return {
        originalInput: payload,
        parsedIntent,
        generatedEvents,
      };
    } catch {
      return {
        originalInput: payload,
        parsedIntent: {
          intentType: 'unknown',
          confidence: 0,
          attributes: {},
          rawInput: payload.text,
        },
        generatedEvents: [],
      };
    }
  }

  async processVoiceInput(payload: InputVoicePayload, context: ParseContext): Promise<ProcessedInput> {
    const transcribedText = await this.voiceProcessor.transcribe(payload.audioData, payload.format);

    if (!transcribedText) {
      return {
        originalInput: payload,
        parsedIntent: {
          intentType: 'unknown',
          confidence: 0,
          attributes: {},
          rawInput: '',
        },
        generatedEvents: [],
      };
    }

    const textPayload: InputTextPayload = {
      text: transcribedText,
      source: 'player',
    };

    return this.processTextInput(textPayload, context);
  }

  async processVisionInput(payload: InputVisionPayload): Promise<ProcessedInput> {
    const sceneDescription = await this.visionProcessor.describeScene(payload.imageData, payload.format);

    if (!sceneDescription) {
      return {
        originalInput: payload,
        parsedIntent: {
          intentType: 'unknown',
          confidence: 0,
          attributes: {},
          rawInput: '',
        },
        generatedEvents: [],
      };
    }

    return {
      originalInput: payload,
      parsedIntent: {
        intentType: 'interaction',
        confidence: 0.8,
        attributes: { description: sceneDescription },
        rawInput: sceneDescription,
      },
      generatedEvents: [],
    };
  }

  private generateEvents(parsedIntent: ParsedIntent, payload: InputTextPayload): GameEvent[] {
    const mapping = INTENT_TO_EVENT_MAP[parsedIntent.intentType];
    if (!mapping) return [];

    if (parsedIntent.intentType === 'command') return [];

    const event: GameEvent = {
      id: uuidv4(),
      sessionId: this.sessionId,
      timestamp: Date.now(),
      type: mapping.eventType,
      source: mapping.source,
    };

    const enrichedEvent = event as GameEvent & Record<string, unknown>;
    if (payload.characterId) {
      enrichedEvent.characterId = payload.characterId;
    }
    if (parsedIntent.intentType === 'combat_action' && parsedIntent.attributes.target) {
      enrichedEvent.targetId = parsedIntent.attributes.target;
    }
    if (parsedIntent.intentType === 'movement') {
      enrichedEvent.action = payload.text;
      enrichedEvent.intentType = 'movement';
    } else if (parsedIntent.intentType === 'interaction') {
      enrichedEvent.action = payload.text;
      enrichedEvent.intentType = 'interaction';
    } else if (parsedIntent.intentType === 'query') {
      enrichedEvent.action = payload.text;
      enrichedEvent.isQuery = true;
    } else if (mapping.eventType === 'player:action') {
      enrichedEvent.action = payload.text;
    }
    if (mapping.eventType === 'player:dialogue') {
      enrichedEvent.dialogue = payload.text;
    }
    if (parsedIntent.intentType === 'narration' && payload.source === 'gm') {
      enrichedEvent.description = payload.text;
    }
    if (parsedIntent.intentType === 'image_generation') {
      enrichedEvent.description = payload.text;
      enrichedEvent.prompt = payload.text;
    }

    return [enrichedEvent];
  }
}
