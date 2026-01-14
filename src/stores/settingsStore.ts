import { create } from "zustand";
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLanguage as setI18nLanguage, type SupportedLanguage } from '../i18n';

type SettingsState = {
  buyEnabled: boolean;
  reorderEnabled: boolean;
  language: SupportedLanguage;
  setBuyEnabled: (enabled: boolean) => void;
  setReorderEnabled: (enabled: boolean) => void;
  setLanguage: (lang: SupportedLanguage) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      buyEnabled: true, // BUY tab enabled by default
      reorderEnabled: false,
      language: 'en', // Default language
      setBuyEnabled: (enabled) => set({ buyEnabled: Boolean(enabled) }),
      setReorderEnabled: (enabled) => set({ reorderEnabled: Boolean(enabled) }),
      setLanguage: (lang) => {
        set({ language: lang });
        // Also update i18n instance
        void setI18nLanguage(lang);
      },
    }),
    {
      name: 'supermandi.settings.v1',
      storage: createJSONStorage(() => AsyncStorage)
    }
  )
);
