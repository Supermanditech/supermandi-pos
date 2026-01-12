import { create } from "zustand";
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type SettingsState = {
  buyEnabled: boolean;
  reorderEnabled: boolean;
  setBuyEnabled: (enabled: boolean) => void;
  setReorderEnabled: (enabled: boolean) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      buyEnabled: true, // BUY tab enabled by default
      reorderEnabled: false,
      setBuyEnabled: (enabled) => set({ buyEnabled: Boolean(enabled) }),
      setReorderEnabled: (enabled) => set({ reorderEnabled: Boolean(enabled) })
    }),
    {
      name: 'supermandi.settings.v1',
      storage: createJSONStorage(() => AsyncStorage)
    }
  )
);
