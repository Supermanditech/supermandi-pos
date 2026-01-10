import { create } from "zustand";
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type SettingsState = {
  reorderEnabled: boolean;
  setReorderEnabled: (enabled: boolean) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      reorderEnabled: false,
      setReorderEnabled: (enabled) => set({ reorderEnabled: Boolean(enabled) })
    }),
    {
      name: 'supermandi.settings.v1',
      storage: createJSONStorage(() => AsyncStorage)
    }
  )
);
