// T-154: Khata (Credit Book) service — API calls for credit/debit ledger
import { apiClient } from "./api/apiClient";

// =============================================================================
// TYPES
// =============================================================================

export interface KhataCustomer {
  id: string;
  name: string;
  phone: string;
  balanceMinor: number; // positive = they owe store, negative = store owes them
  lastEntryAt: string | null;
  entryCount: number;
}

export interface KhataEntry {
  id: string;
  customerId: string;
  type: "CREDIT" | "DEBIT" | "PAYMENT";
  amountMinor: number;
  description: string;
  paymentMethod?: "CASH" | "UPI" | null;
  runningBalanceMinor: number;
  createdAt: string;
  createdByStaffId?: string | null;
  createdByStaffName?: string | null;
}

export interface AddKhataEntryRequest {
  customerPhone: string;
  customerName?: string;
  type: "CREDIT" | "DEBIT" | "PAYMENT";
  amountMinor: number;
  description: string;
  paymentMethod?: "CASH" | "UPI";
}

interface KhataCustomersResponse {
  customers: KhataCustomer[];
}

interface KhataEntriesResponse {
  entries: KhataEntry[];
  customer: KhataCustomer;
}

interface AddKhataEntryResponse {
  entry: KhataEntry;
  customer: KhataCustomer;
}

// =============================================================================
// API CALLS
// =============================================================================

export async function getKhataCustomers(query?: string): Promise<KhataCustomer[]> {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  const response = await apiClient.get<KhataCustomersResponse>(
    `/api/v1/pos/khata/customers${params}`
  );
  return response.customers;
}

export async function getKhataEntries(customerPhone: string): Promise<KhataEntriesResponse> {
  const response = await apiClient.get<KhataEntriesResponse>(
    `/api/v1/pos/khata/entries?phone=${encodeURIComponent(customerPhone)}`
  );
  return response;
}

export async function addKhataEntry(data: AddKhataEntryRequest): Promise<AddKhataEntryResponse> {
  const response = await apiClient.post<AddKhataEntryResponse>(
    `/api/v1/pos/khata/entries`,
    data
  );
  return response;
}
