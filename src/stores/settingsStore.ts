import { create } from "zustand";
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLanguage as setI18nLanguage, type SupportedLanguage } from '../i18n';

type SettingsState = {
  buyEnabled: boolean;
  reorderEnabled: boolean;
  categoryBrowsingEnabled: boolean; // CAT-005: Category browsing for SELL screen
  voiceEnabled: boolean; // VOICE-009: Voice assistant feature flag
  bnplEnabled: boolean; // SM-020: BNPL feature flag
  bnplCreditLimit: number; // SM-020: BNPL credit limit in minor units (paise)
  bnplAvailableCredit: number; // SM-020: Available BNPL credit
  creditEnabled: boolean; // SM-022: Credit/Loans feature flag
  language: SupportedLanguage;
  storeName: string | null; // GO-LIVE: Store name from SuperAdmin (read-only, persisted for offline)
  storeCode: string | null; // GO-LIVE: Human-readable store code
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
  setLanguage: (lang: SupportedLanguage) => void;
  setStoreName: (name: string | null) => void;
  setStoreCode: (code: string | null) => void;
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
      language: 'en', // Default language
      storeName: null, // GO-LIVE: Persisted for offline display
      storeCode: null, // GO-LIVE: Human-readable store code
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
      setLanguage: (lang) => {
        set({ language: lang });
        // Also update i18n instance
        void setI18nLanguage(lang);
      },
      setStoreName: (name) => set({ storeName: name }),
      setStoreCode: (code) => set({ storeCode: code }),
    }),
    {
      name: 'supermandi.settings.v6', // SM-022: Bumped version for Credit fields
      storage: createJSONStorage(() => AsyncStorage)
    }
  )
);
