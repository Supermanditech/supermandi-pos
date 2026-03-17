// SA-P1-001: POS staff login API
// STG-487: Staff /me endpoint
// STG-488: Manager PIN verification
import { apiClient } from "./apiClient";

export type StaffLoginResponse = {
  staffId: string;
  name: string;
  role: "CASHIER" | "STOCK_MANAGER" | "MANAGER";
  isOwner?: boolean;
  maxDiscountPct?: number;
};

// STG-487: Staff /me response
export type StaffMeResponse = {
  staffId: string;
  name: string;
  role: "CASHIER" | "STOCK_MANAGER" | "MANAGER";
  maxDiscountPct: number;
};

// STG-488: PIN verification response
export type VerifyPinResponse = {
  verified: true;
  staffId: string;
  name: string;
  role: "MANAGER" | "STOCK_MANAGER";
};

// V3-OWNER-023: PIN-only login (phone optional for backward compat)
export async function staffLogin(input: {
  pin: string;
  phone?: string;
}): Promise<StaffLoginResponse> {
  return apiClient.post("/api/v1/pos/staff/login", input);
}

// STG-487: Fetch current staff info + store discount limit
export async function staffMe(): Promise<StaffMeResponse> {
  return apiClient.get("/api/v1/pos/staff/me");
}

// STG-488: Verify manager PIN for discount approval
export async function verifyManagerPin(input: {
  phone: string;
  pin: string;
}): Promise<VerifyPinResponse> {
  return apiClient.post("/api/v1/pos/staff/verify-pin", input);
}
