import { create } from "zustand";
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLanguage as setI18nLanguage, type SupportedLanguage } from '../i18n';

type SettingsState = {
  buyEnabled: boolean;
  reorderEnabled: boolean;
  categoryBrowsingEnabled: boolean; // CAT-005: Category browsing for SELL screen
  voiceEnabled: boolean; // VOICE-009: Voice assistant feature flag
  language: SupportedLanguage;
  storeName: string | null; // GO-LIVE: Store name from SuperAdmin (read-only, persisted for offline)
  storeCode: string | null; // GO-LIVE: Human-readable store code
  setBuyEnabled: (enabled: boolean) => void;
  setReorderEnabled: (enabled: boolean) => void;
  setCategoryBrowsingEnabled: (enabled: boolean) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setLanguage: (lang: SupportedLanguage) => void;
  setStoreName: (name: string | null) => void;
  setStoreCode: (code: string | null) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      buyEnabled: true, // BUY tab enabled by default
      reorderEnabled: false,
      categoryBrowsingEnabled: true, // CAT-005: Category browsing enabled by default for Demo Store
      voiceEnabled: true, // VOICE-009: Voice enabled by default for Demo Store, OFF for others
      language: 'en', // Default language
      storeName: null, // GO-LIVE: Persisted for offline display
      storeCode: null, // GO-LIVE: Human-readable store code
      setBuyEnabled: (enabled) => set({ buyEnabled: Boolean(enabled) }),
      setReorderEnabled: (enabled) => set({ reorderEnabled: Boolean(enabled) }),
      setCategoryBrowsingEnabled: (enabled) => set({ categoryBrowsingEnabled: Boolean(enabled) }),
      setVoiceEnabled: (enabled) => set({ voiceEnabled: Boolean(enabled) }),
      setLanguage: (lang) => {
        set({ language: lang });
        // Also update i18n instance
        void setI18nLanguage(lang);
      },
      setStoreName: (name) => set({ storeName: name }),
      setStoreCode: (code) => set({ storeCode: code }),
    }),
    {
      name: 'supermandi.settings.v4', // VOICE-009: Bumped version for voiceEnabled
      storage: createJSONStorage(() => AsyncStorage)
    }
  )
);
