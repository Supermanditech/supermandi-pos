// SA-P1-001: POS staff login API
import { apiClient } from "./apiClient";

export type StaffLoginResponse = {
  staffId: string;
  name: string;
  role: "CASHIER" | "STOCK_MANAGER" | "MANAGER";
};

export async function staffLogin(input: {
  phone: string;
  pin: string;
}): Promise<StaffLoginResponse> {
  return apiClient.post("/api/v1/pos/staff/login", input);
}
