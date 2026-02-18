// Speech-to-Text Service - VOICE-003
// Uses OpenAI Whisper API for audio transcription

import { createReadStream } from 'fs';
import { config } from '../config';

// =============================================================================
// TYPES
// =============================================================================

export interface TranscriptionResult {
  text: string;
  language: string;
  duration?: number;
}

// =============================================================================
// OPENAI WHISPER STT
// =============================================================================

/**
 * Transcribe audio file using OpenAI Whisper API.
 *
 * @param audioFilePath - Path to the audio file
 * @returns Transcription result with text and detected language
 */
export async function transcribeAudio(audioFilePath: string): Promise<TranscriptionResult> {
  if (!config.openai.apiKey) {
    console.warn('[STT] OpenAI API key not configured, using mock transcription');
    return mockTranscribe(audioFilePath);
  }

  try {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({
      apiKey: config.openai.apiKey,
    });

    const audioStream = createReadStream(audioFilePath);

    const response = await client.audio.transcriptions.create({
      file: audioStream as any,
      model: config.openai.sttModel,
      language: config.openai.language,
      response_format: 'json',
    });

    const transcribedText = response.text?.trim() || '';

    console.log('[STT] Whisper transcription successful:', transcribedText.slice(0, 50));

    return {
      text: transcribedText,
      language: config.openai.language,
      duration: undefined,
    };
  } catch (error: any) {
    console.error('[STT] Whisper transcription failed:', error?.message || error);
    // Fallback to mock on error
    console.warn('[STT] Falling back to mock transcription');
    return mockTranscribe(audioFilePath);
  }
}

// =============================================================================
// MOCK TRANSCRIPTION (for development without API key)
// =============================================================================

/**
 * Mock transcription for development/testing.
 * Returns predefined responses based on random selection.
 */
function mockTranscribe(_audioFilePath: string): TranscriptionResult {
  const mockResponses = [
    '2 kilo rice chahiye',
    'toor dal 1 kilo',
    'aata kitna hai',
    'sugar 5 kg add karo',
    'maggi ka stock check karo',
    'oil 1 litre',
  ];

  const randomIndex = Math.floor(Math.random() * mockResponses.length);

  console.log('[STT] Using mock transcription:', mockResponses[randomIndex]);

  return {
    text: mockResponses[randomIndex]!,
    language: 'hi',
    duration: 2.5,
  };
}

export default {
  transcribeAudio,
};
