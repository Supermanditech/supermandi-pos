// T-155: Customer Profiles Zustand store
import { create } from "zustand";
import * as customerService from "../services/customerService";
import type {
  Customer,
  CustomerDetail,
  CreateCustomerRequest,
  UpdateCustomerRequest,
} from "../services/customerService";
import { asError } from "../utils/errorUtils";

interface CustomerState {
  customers: Customer[];
  selectedCustomer: CustomerDetail | null;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;

  fetchCustomers: (query?: string) => Promise<void>;
  fetchCustomerDetail: (customerId: string) => Promise<void>;
  createCustomer: (data: CreateCustomerRequest) => Promise<boolean>;
  updateCustomer: (customerId: string, data: UpdateCustomerRequest) => Promise<boolean>;
  setSelectedCustomer: (customer: CustomerDetail | null) => void;
  clearError: () => void;
}

export const useCustomerStore = create<CustomerState>()((set, get) => ({
  customers: [],
  selectedCustomer: null,
  loading: false,
  detailLoading: false,
  error: null,

  fetchCustomers: async (query?: string) => {
    set({ loading: true, error: null });
    try {
      const customers = await customerService.getCustomers(query);
      set({ customers, loading: false });
    } catch (_e: unknown) {
    const e = asError(_e);
      console.error("[CustomerStore] fetchCustomers failed:", e);
      set({ loading: false, error: e?.message || "Failed to load customers" });
    }
  },

  fetchCustomerDetail: async (customerId: string) => {
    set({ detailLoading: true, error: null });
    try {
      const detail = await customerService.getCustomerDetail(customerId);
      set({ selectedCustomer: detail, detailLoading: false });
    } catch (_e: unknown) {
    const e = asError(_e);
      console.error("[CustomerStore] fetchCustomerDetail failed:", e);
      set({ detailLoading: false, error: e?.message || "Failed to load customer detail" });
    }
  },

  createCustomer: async (data: CreateCustomerRequest) => {
    try {
      const customer = await customerService.createCustomer(data);
      set({ customers: [customer, ...get().customers] });
      return true;
    } catch (_e: unknown) {
    const e = asError(_e);
      console.error("[CustomerStore] createCustomer failed:", e);
      set({ error: e?.message || "Failed to create customer" });
      return false;
    }
  },

  updateCustomer: async (customerId: string, data: UpdateCustomerRequest) => {
    try {
      const updated = await customerService.updateCustomer(customerId, data);
      const customers = get().customers.map((c) =>
        c.id === customerId ? { ...c, ...updated } : c
      );
      set({ customers });
      // Also update selected customer if it matches
      const selected = get().selectedCustomer;
      if (selected && selected.id === customerId) {
        set({ selectedCustomer: { ...selected, ...updated } });
      }
      return true;
    } catch (_e: unknown) {
    const e = asError(_e);
      console.error("[CustomerStore] updateCustomer failed:", e);
      set({ error: e?.message || "Failed to update customer" });
      return false;
    }
  },

  setSelectedCustomer: (customer) => set({ selectedCustomer: customer }),
  clearError: () => set({ error: null }),
}));
