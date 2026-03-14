// SA-P1-001: Staff session store (persisted via AsyncStorage)
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type StaffRole = "CASHIER" | "STOCK_MANAGER" | "MANAGER";

type StaffSession = {
  staffId: string;
  name: string;
  role: StaffRole;
  maxDiscountPct: number; // STG-102: Store's max discount % for this staff role
};

type StaffSessionState = {
  session: StaffSession | null;
  setSession: (session: StaffSession) => void;
  clearSession: () => void;
};

export const useStaffSessionStore = create<StaffSessionState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      clearSession: () => set({ session: null }),
    }),
    {
      name: "staff-session",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
