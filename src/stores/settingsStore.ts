import { create } from "zustand";
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLanguage as setI18nLanguage, type SupportedLanguage } from '../i18n';

type SettingsState = {
  buyEnabled: boolean;
  reorderEnabled: boolean;
  language: SupportedLanguage;
  storeName: string | null; // GO-LIVE: Store name from SuperAdmin (read-only, persisted for offline)
  storeCode: string | null; // GO-LIVE: Human-readable store code
  setBuyEnabled: (enabled: boolean) => void;
  setReorderEnabled: (enabled: boolean) => void;
  setLanguage: (lang: SupportedLanguage) => void;
  setStoreName: (name: string | null) => void;
  setStoreCode: (code: string | null) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      buyEnabled: true, // BUY tab enabled by default
      reorderEnabled: false,
      language: 'en', // Default language
      storeName: null, // GO-LIVE: Persisted for offline display
      storeCode: null, // GO-LIVE: Human-readable store code
      setBuyEnabled: (enabled) => set({ buyEnabled: Boolean(enabled) }),
      setReorderEnabled: (enabled) => set({ reorderEnabled: Boolean(enabled) }),
      setLanguage: (lang) => {
        set({ language: lang });
        // Also update i18n instance
        void setI18nLanguage(lang);
      },
      setStoreName: (name) => set({ storeName: name }),
      setStoreCode: (code) => set({ storeCode: code }),
    }),
    {
      name: 'supermandi.settings.v2', // Bumped version for new fields
      storage: createJSONStorage(() => AsyncStorage)
    }
  )
);
