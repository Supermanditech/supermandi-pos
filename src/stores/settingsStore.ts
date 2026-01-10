import { create } from "zustand";

type SettingsState = {
  reorderEnabled: boolean;
  setReorderEnabled: (enabled: boolean) => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  // TODO: Wire to persisted settings store/service.
  reorderEnabled: false,
  setReorderEnabled: (enabled) => set({ reorderEnabled: Boolean(enabled) })
}));
