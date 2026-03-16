import { create } from "zustand";
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';
import { setLanguage as setI18nLanguage, type SupportedLanguage } from '../i18n';

// LIVE.POS.THEME.RUNTIME_TOGGLE_PARITY.001: Theme mode type
export type ThemeMode = 'light' | 'dark';

type SettingsState = {
  buyEnabled: boolean;
  reorderEnabled: boolean;
  categoryBrowsingEnabled: boolean; // CAT-005: Category browsing for SELL screen
  voiceEnabled: boolean; // VOICE-009: Voice assistant feature flag
  bnplEnabled: boolean; // SM-020: BNPL feature flag
  bnplCreditLimit: number; // SM-020: BNPL credit limit in minor units (paise)
  bnplAvailableCredit: number; // SM-020: Available BNPL credit
  creditEnabled: boolean; // SM-022: Credit/Loans feature flag
  posV3Enabled: boolean; // STG-552: POS v3 layout feature flag
  language: SupportedLanguage;
  storeName: string | null; // GO-LIVE: Store name from SuperAdmin (read-only, persisted for offline)
  storeCode: string | null; // GO-LIVE: Human-readable store code
  // LIVE.POS.THEME: Theme preference (persisted via AsyncStorage)
  themeMode: ThemeMode;
  // T-195: Thermal printer settings
  printerPaperWidth: 58 | 80; // mm
  printerAutoPrint: boolean;  // Auto-print receipt after sale
  printerCopies: number;      // Number of copies (1-3)
  setPrinterPaperWidth: (width: 58 | 80) => void;
  setPrinterAutoPrint: (enabled: boolean) => void;
  setPrinterCopies: (copies: number) => void;
  setBuyEnabled: (enabled: boolean) => void;
  setReorderEnabled: (enabled: boolean) => void;
  setCategoryBrowsingEnabled: (enabled: boolean) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setBnplEnabled: (enabled: boolean) => void; // SM-020
  setBnplCreditLimit: (limit: number) => void; // SM-020
  setBnplAvailableCredit: (credit: number) => void; // SM-020
  setCreditEnabled: (enabled: boolean) => void; // SM-022
  setPosV3Enabled: (enabled: boolean) => void; // STG-552
  setLanguage: (lang: SupportedLanguage) => void;
  setStoreName: (name: string | null) => void;
  setStoreCode: (code: string | null) => void;
  // LIVE.POS.THEME: Theme actions
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      buyEnabled: true, // BUY tab enabled by default
      reorderEnabled: true, // P1-UI-004: Match backend default for go-live
      categoryBrowsingEnabled: true, // CAT-005: Category browsing enabled by default for Demo Store
      voiceEnabled: true, // VOICE-009: Voice enabled by default for Demo Store, OFF for others
      bnplEnabled: false, // SM-020: BNPL disabled by default, enabled per store
      bnplCreditLimit: 5000000, // SM-020: Default 50k credit limit
      bnplAvailableCredit: 5000000, // SM-020: Default available credit
      creditEnabled: false, // SM-022: Credit disabled by default, enabled per store
      posV3Enabled: true, // V3-LAUNCH: POS v3 layout enabled by default
      language: 'en', // Default language
      storeName: null, // GO-LIVE: Persisted for offline display
      storeCode: null, // GO-LIVE: Human-readable store code
      // LIVE.POS.THEME: Default to light mode (parity with web portals)
      themeMode: 'light' as ThemeMode,
      // T-195: Thermal printer defaults
      printerPaperWidth: 58,
      printerAutoPrint: false,
      printerCopies: 1,
      setPrinterPaperWidth: (width) => set({ printerPaperWidth: width }),
      setPrinterAutoPrint: (enabled) => set({ printerAutoPrint: Boolean(enabled) }),
      setPrinterCopies: (copies) => set({ printerCopies: Math.max(1, Math.min(3, copies)) }),
      setBuyEnabled: (enabled) => set({ buyEnabled: Boolean(enabled) }),
      setReorderEnabled: (enabled) => set({ reorderEnabled: Boolean(enabled) }),
      setCategoryBrowsingEnabled: (enabled) => set({ categoryBrowsingEnabled: Boolean(enabled) }),
      setVoiceEnabled: (enabled) => set({ voiceEnabled: Boolean(enabled) }),
      setBnplEnabled: (enabled) => set({ bnplEnabled: Boolean(enabled) }), // SM-020
      setBnplCreditLimit: (limit) => set({ bnplCreditLimit: limit }), // SM-020
      setBnplAvailableCredit: (credit) => set({ bnplAvailableCredit: credit }), // SM-020
      setCreditEnabled: (enabled) => set({ creditEnabled: Boolean(enabled) }), // SM-022
      setPosV3Enabled: (enabled) => set({ posV3Enabled: Boolean(enabled) }), // STG-552
      setLanguage: (lang) => {
        set({ language: lang });
        // Also update i18n instance
        void setI18nLanguage(lang);
      },
      setStoreName: (name) => set({ storeName: name }),
      setStoreCode: (code) => set({ storeCode: code }),
      // LIVE.POS.THEME: Theme toggle actions
      toggleTheme: () => set((state) => ({ themeMode: state.themeMode === 'dark' ? 'light' : 'dark' })),
      setThemeMode: (mode) => set({ themeMode: mode }),
    }),
    {
      name: 'supermandi.settings.v9', // V3-LAUNCH: Bumped to activate v3 on existing devices
      storage: createJSONStorage(() => AsyncStorage),
      // LIVE.POS.THEME.PERSISTENCE_AND_BOOTSTRAP.001: Log hydration errors
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.warn('[SettingsStore] Hydration failed, using defaults:', error);
        }
      },
    }
  )
);

// LIVE.POS.THEME.PERSISTENCE_AND_BOOTSTRAP.001: Hydration-aware hook
// Gates rendering until AsyncStorage has rehydrated persisted theme preference.
// Prevents light-mode flash for dark-mode users on app startup.
// COMPAT-HYDRATION-001: 5s timeout fallback — if AsyncStorage hangs (observed on
// MIUI/Redmi devices), proceed with Zustand defaults rather than spinning forever.
const HYDRATION_TIMEOUT_MS = 5_000;

export function useSettingsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(useSettingsStore.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    const unsub = useSettingsStore.persist.onFinishHydration(() => setHydrated(true));
    const timeout = setTimeout(() => {
      if (!useSettingsStore.persist.hasHydrated()) {
        console.warn('[SettingsStore] Hydration timeout after 5s, proceeding with defaults');
      }
      setHydrated(true);
    }, HYDRATION_TIMEOUT_MS);
    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, [hydrated]);
  return hydrated;
}
