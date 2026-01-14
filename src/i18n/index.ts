// I18N Framework - V3.0.10
// Internationalization setup using i18next + expo-localization

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import hi from './locales/hi.json';

// =============================================================================
// CONSTANTS
// =============================================================================

export const LANGUAGE_STORAGE_KEY = 'supermandi.language';

export const SUPPORTED_LANGUAGES = ['en', 'hi'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  hi: 'हिन्दी',
};

// =============================================================================
// INITIALIZATION
// =============================================================================

let isInitialized = false;

/**
 * Initialize i18n with device locale detection and saved preference
 */
export async function initI18n(): Promise<typeof i18n> {
  if (isInitialized) {
    return i18n;
  }

  // Get saved language preference
  const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);

  // Detect device locale using new API (getLocales returns array of locale objects)
  const locales = Localization.getLocales();
  const deviceLocale = locales[0]?.languageCode?.toLowerCase() || 'en';

  // Determine default language
  const defaultLang: SupportedLanguage =
    savedLanguage && SUPPORTED_LANGUAGES.includes(savedLanguage as SupportedLanguage)
      ? (savedLanguage as SupportedLanguage)
      : SUPPORTED_LANGUAGES.includes(deviceLocale as SupportedLanguage)
        ? (deviceLocale as SupportedLanguage)
        : 'en';

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
    },
    lng: defaultLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false, // Avoid suspense issues in React Native
    },
    // GO-LIVE-TR-001: Production-safe fallback handling
    // Never return empty string - always fall back to English or key name
    returnEmptyString: false,
    returnNull: false,
    // Missing key handling
    missingKeyHandler: (lngs, ns, key) => {
      if (__DEV__) {
        console.warn(`[i18n] Missing translation key: ${key}`);
      }
    },
    saveMissing: __DEV__,
    // In production, show the key's last segment as fallback (e.g., "menu.title" -> "title")
    parseMissingKeyHandler: (key: string) => {
      if (__DEV__) {
        return `[${key}]`; // Show full key in dev for debugging
      }
      // In production, show last part of key as safe placeholder
      const parts = key.split('.');
      return parts[parts.length - 1].replace(/([A-Z])/g, ' $1').trim();
    },
  });

  isInitialized = true;
  return i18n;
}

// =============================================================================
// LANGUAGE MANAGEMENT
// =============================================================================

/**
 * Change the current language and persist preference
 */
export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    console.warn(`[i18n] Unsupported language: ${lang}`);
    return;
  }

  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  await i18n.changeLanguage(lang);
}

/**
 * Get the current language
 */
export function getCurrentLanguage(): SupportedLanguage {
  const current = i18n.language;
  return SUPPORTED_LANGUAGES.includes(current as SupportedLanguage)
    ? (current as SupportedLanguage)
    : 'en';
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
}

// =============================================================================
// EXPORTS
// =============================================================================

export { i18n };
export default i18n;
