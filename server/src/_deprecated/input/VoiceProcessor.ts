import type { AgentAIConfigResult } from '../ai/AgentAIConfig';

export class VoiceProcessor {
  private config: AgentAIConfigResult | null;

  constructor(config?: AgentAIConfigResult) {
    this.config = config ?? null;
  }

  isConfigured(): boolean {
    return this.config !== null && this.config.apiKey.length > 0;
  }

  async transcribe(audioData: string, format: string): Promise<string> {
    if (!this.config) {
      console.warn('VoiceProcessor: not configured, returning empty transcription');
      return '';
    }

    const dataLength = audioData?.length || 0;
    console.log(`VoiceProcessor: transcribing audio, format=${format}, dataLength=${dataLength}`);

    if (dataLength === 0) {
      console.warn('VoiceProcessor: empty audio data received');
      return '';
    }

    const formData = new FormData();
    formData.append('model', this.config.model);

    const blob = this.dataToBlob(audioData, format);
    console.log(`VoiceProcessor: blob created, size=${blob.size}, type=${blob.type}`);
    formData.append('file', blob, `audio.${format}`);

    const url = `${this.config.baseUrl}/audio/transcriptions`;
    console.log(`VoiceProcessor: calling STT API at ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: formData,
    });

    console.log(`VoiceProcessor: STT API response status=${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`VoiceProcessor: STT API error ${response.status}: ${errorText}`);
      throw new Error(`STT API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as { text: string };
    console.log(`VoiceProcessor: transcription result: "${data.text}" (length=${data.text?.length || 0})`);
    return data.text || '';
  }

  private dataToBlob(audioData: string, format: string): Blob {
    let base64Data: string;
    let mimeType: string;

    // Extract base64 data and mime type from data URI
    if (audioData.startsWith('data:')) {
      const match = audioData.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      } else {
        throw new Error('Invalid data URI format');
      }
    } else {
      // Raw base64 — infer mime type from format parameter
      base64Data = audioData;
      const formatToMime: Record<string, string> = {
        wav: 'audio/wav',
        mp3: 'audio/mpeg',
        ogg: 'audio/ogg',
        webm: 'audio/webm',
      };
      mimeType = formatToMime[format] || `audio/${format}`;
    }

    // Decode base64 to binary
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }
}