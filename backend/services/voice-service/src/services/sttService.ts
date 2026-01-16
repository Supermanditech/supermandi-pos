// Speech-to-Text Service - VOICE-003
// Integrates with OpenAI Whisper for speech recognition

import { createReadStream } from 'fs';
import { config } from '../config.js';

// =============================================================================
// TYPES
// =============================================================================

export interface TranscriptionResult {
  text: string;
  language: string;
  duration?: number;
}

// =============================================================================
// OPENAI STT
// =============================================================================

/**
 * Transcribe audio file using OpenAI Whisper.
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
    // Dynamic import for OpenAI (ESM)
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });

    const audioStream = createReadStream(audioFilePath);

    const transcription = await openai.audio.transcriptions.create({
      file: audioStream as any,
      model: config.openai.model,
      language: config.openai.language,
      response_format: 'verbose_json',
    });

    console.log('[STT] Transcription successful:', transcription.text?.slice(0, 50));

    return {
      text: transcription.text || '',
      language: transcription.language || config.openai.language,
      duration: transcription.duration,
    };
  } catch (error) {
    console.error('[STT] OpenAI transcription failed:', error);
    throw new Error('Speech transcription failed');
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
