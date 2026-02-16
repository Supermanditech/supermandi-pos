// T-305: Text-to-Speech Service using expo-speech
// Free, offline, supports Hindi + English
// Used for cart confirmations, search results, alerts

import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TTS_ENABLED_KEY = 'tts_enabled';
const TTS_LANGUAGE_KEY = 'tts_language';

export type TTSLanguage = 'hi-IN' | 'en-IN';

let ttsEnabled: boolean | null = null;
let ttsLanguage: TTSLanguage = 'hi-IN';

/**
 * Initialize TTS settings from storage
 */
export async function initTTS(): Promise<void> {
  try {
    const [enabled, lang] = await Promise.all([
      AsyncStorage.getItem(TTS_ENABLED_KEY),
      AsyncStorage.getItem(TTS_LANGUAGE_KEY),
    ]);
    ttsEnabled = enabled !== 'false'; // default enabled
    ttsLanguage = (lang as TTSLanguage) || 'hi-IN';
  } catch {
    ttsEnabled = true;
    ttsLanguage = 'hi-IN';
  }
}

/**
 * Check if TTS is enabled
 */
export function isTTSEnabled(): boolean {
  return ttsEnabled !== false;
}

/**
 * Get current TTS language
 */
export function getTTSLanguage(): TTSLanguage {
  return ttsLanguage;
}

/**
 * Toggle TTS on/off
 */
export async function setTTSEnabled(enabled: boolean): Promise<void> {
  ttsEnabled = enabled;
  await AsyncStorage.setItem(TTS_ENABLED_KEY, enabled ? 'true' : 'false');
  if (!enabled) {
    Speech.stop();
  }
}

/**
 * Set TTS language
 */
export async function setTTSLanguage(lang: TTSLanguage): Promise<void> {
  ttsLanguage = lang;
  await AsyncStorage.setItem(TTS_LANGUAGE_KEY, lang);
}

/**
 * Speak text aloud
 */
export function speak(text: string, opts?: {
  language?: TTSLanguage; rate?: number; pitch?: number; onDone?: () => void;
}): void {
  if (!isTTSEnabled() || !text.trim()) return;

  // Stop any current speech
  Speech.stop();

  Speech.speak(text, {
    language: opts?.language || ttsLanguage,
    rate: opts?.rate ?? 0.9,
    pitch: opts?.pitch ?? 1.0,
    onDone: opts?.onDone,
    onError: () => {}, // Silently fail
  });
}

/**
 * Stop current speech
 */
export function stopSpeaking(): void {
  Speech.stop();
}

/**
 * Check if currently speaking
 */
export async function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}

// =============================================================================
// Pre-built voice responses for common actions
// =============================================================================

export function speakCartAdd(productName: string, quantity: number, unit: string): void {
  const hindi = ttsLanguage === 'hi-IN';
  const text = hindi
    ? `${productName}, ${quantity} ${unitHindi(unit)} cart mein joḍ diya`
    : `Added ${quantity} ${unit} ${productName} to cart`;
  speak(text);
}

export function speakCartRemove(productName: string): void {
  const hindi = ttsLanguage === 'hi-IN';
  const text = hindi
    ? `${productName} cart se hatā diya`
    : `Removed ${productName} from cart`;
  speak(text);
}

export function speakCartTotal(totalRupees: string): void {
  const hindi = ttsLanguage === 'hi-IN';
  const text = hindi
    ? `Kul bill ${totalRupees} rupaye`
    : `Total bill is ${totalRupees} rupees`;
  speak(text);
}

export function speakSearchResult(count: number, query: string): void {
  const hindi = ttsLanguage === 'hi-IN';
  const text = hindi
    ? count === 0 ? `${query} nahi mila` : `${count} product mile, ${query} ke liye`
    : count === 0 ? `No results for ${query}` : `Found ${count} products for ${query}`;
  speak(text);
}

export function speakStockCheck(productName: string, qty: number): void {
  const hindi = ttsLanguage === 'hi-IN';
  const text = hindi
    ? qty <= 0 ? `${productName} stock mein nahi hai` : `${productName}, ${qty} unit stock mein hai`
    : qty <= 0 ? `${productName} is out of stock` : `${productName} has ${qty} units in stock`;
  speak(text);
}

export function speakError(message: string): void {
  const hindi = ttsLanguage === 'hi-IN';
  const text = hindi ? `Galti: ${message}` : `Error: ${message}`;
  speak(text);
}

export function speakConfirmation(message: string): void {
  speak(message);
}

function unitHindi(unit: string): string {
  switch (unit) {
    case 'kg': return 'kilo';
    case 'g': return 'gram';
    case 'l': return 'litre';
    case 'ml': return 'milli litre';
    case 'dozen': return 'darjan';
    default: return unit;
  }
}
