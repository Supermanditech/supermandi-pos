// GCP-STG-0005: Staff session store — IN-MEMORY ONLY (not persisted)
// Staff session (Layer 2) is cleared on app kill, idle timeout, and Switch Staff.
// Device session (Layer 1) persists in SecureStore/AsyncStorage independently.
// On app restart, user must re-enter PIN (staff session gone) but device stays enrolled.
import { create } from "zustand";

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
  (set) => ({
    session: null,
    setSession: (session) => set({ session }),
    clearSession: () => set({ session: null }),
  })
);
