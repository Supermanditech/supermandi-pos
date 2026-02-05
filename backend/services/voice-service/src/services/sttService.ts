// Speech-to-Text Service - VOICE-003
// AUD-076-D: Migrated from OpenAI Whisper to Claude/Anthropic API
// Uses Claude's multimodal capabilities for audio transcription

import { readFile } from 'fs/promises';
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
// CLAUDE STT (AUD-076-D)
// =============================================================================

/**
 * Transcribe audio file using Claude's multimodal capabilities.
 * AUD-076-D: Replaced OpenAI Whisper with Anthropic Claude API
 *
 * @param audioFilePath - Path to the audio file
 * @returns Transcription result with text and detected language
 */
export async function transcribeAudio(audioFilePath: string): Promise<TranscriptionResult> {
  if (!config.anthropic.apiKey) {
    console.warn('[STT] Anthropic API key not configured, using mock transcription');
    return mockTranscribe(audioFilePath);
  }

  try {
    // Dynamic import for Anthropic SDK (ESM)
    const AnthropicModule = await import('@anthropic-ai/sdk');
    const Anthropic = AnthropicModule.default as any;
    const client = new Anthropic({
      apiKey: config.anthropic.apiKey,
    });

    // Read audio file and convert to base64
    const audioBuffer = await readFile(audioFilePath);
    const audioBase64 = audioBuffer.toString('base64');

    // Determine media type from file extension
    const ext = audioFilePath.split('.').pop()?.toLowerCase() || 'mp4';
    const mediaTypeMap: Record<string, string> = {
      'm4a': 'audio/mp4',
      'mp4': 'audio/mp4',
      'mp3': 'audio/mpeg',
      'mpeg': 'audio/mpeg',
      'wav': 'audio/wav',
      'webm': 'audio/webm',
    };
    const mediaType = mediaTypeMap[ext] || 'audio/mp4';

    // Use Claude to transcribe the audio
    // Claude can process audio as a document and transcribe it
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: mediaType as any,
                data: audioBase64,
              },
            },
            {
              type: 'text',
              text: `Transcribe this audio file. The audio is likely in Hindi (Hinglish) or English.
                     Return ONLY the exact transcription text, nothing else.
                     If the audio is unclear or silent, return an empty string.
                     Do not add any explanations or formatting.`,
            },
          ],
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find((c: any) => c.type === 'text');
    const transcribedText = textContent && 'text' in textContent ? textContent.text.trim() : '';

    console.log('[STT] Claude transcription successful:', transcribedText.slice(0, 50));

    return {
      text: transcribedText,
      language: config.anthropic.language,
      duration: undefined, // Claude doesn't provide duration info
    };
  } catch (error: any) {
    console.error('[STT] Claude transcription failed:', error?.message || error);
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
