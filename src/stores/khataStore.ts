// T-154: Khata (Credit Book) Zustand store
import { create } from "zustand";
import * as khataService from "../services/khataService";
import type { KhataCustomer, KhataEntry, AddKhataEntryRequest } from "../services/khataService";

interface KhataState {
  customers: KhataCustomer[];
  entries: Map<string, KhataEntry[]>; // keyed by customerId
  selectedCustomer: KhataCustomer | null;
  loading: boolean;
  entriesLoading: boolean;
  error: string | null;

  fetchCustomers: (query?: string) => Promise<void>;
  fetchEntries: (customerPhone: string) => Promise<void>;
  addEntry: (data: AddKhataEntryRequest) => Promise<boolean>;
  recordPayment: (data: {
    customerPhone: string;
    amountMinor: number;
    method: "CASH" | "UPI";
    description?: string;
  }) => Promise<boolean>;
  setSelectedCustomer: (customer: KhataCustomer | null) => void;
  clearError: () => void;
}

export const useKhataStore = create<KhataState>()((set, get) => ({
  customers: [],
  entries: new Map(),
  selectedCustomer: null,
  loading: false,
  entriesLoading: false,
  error: null,

  fetchCustomers: async (query?: string) => {
    set({ loading: true, error: null });
    try {
      const customers = await khataService.getKhataCustomers(query);
      set({ customers, loading: false });
    } catch (e: any) {
      console.error("[KhataStore] fetchCustomers failed:", e);
      set({ loading: false, error: e?.message || "Failed to load customers" });
    }
  },

  fetchEntries: async (customerPhone: string) => {
    set({ entriesLoading: true, error: null });
    try {
      const response = await khataService.getKhataEntries(customerPhone);
      const entries = new Map(get().entries);
      entries.set(response.customer.id, response.entries);
      set({
        entries,
        selectedCustomer: response.customer,
        entriesLoading: false,
      });
    } catch (e: any) {
      console.error("[KhataStore] fetchEntries failed:", e);
      set({ entriesLoading: false, error: e?.message || "Failed to load entries" });
    }
  },

  addEntry: async (data: AddKhataEntryRequest) => {
    try {
      const response = await khataService.addKhataEntry(data);
      // Update the customer in the list
      const customers = get().customers.map((c) =>
        c.id === response.customer.id ? response.customer : c
      );
      // If the customer is new, add to list
      if (!customers.find((c) => c.id === response.customer.id)) {
        customers.unshift(response.customer);
      }
      // Update entries for the customer
      const entries = new Map(get().entries);
      const existing = entries.get(response.customer.id) || [];
      entries.set(response.customer.id, [...existing, response.entry]);
      set({ customers, entries, selectedCustomer: response.customer });
      return true;
    } catch (e: any) {
      console.error("[KhataStore] addEntry failed:", e);
      set({ error: e?.message || "Failed to add entry" });
      return false;
    }
  },

  recordPayment: async (data) => {
    return get().addEntry({
      customerPhone: data.customerPhone,
      type: "PAYMENT",
      amountMinor: data.amountMinor,
      description: data.description || "Payment received",
      paymentMethod: data.method,
    });
  },

  setSelectedCustomer: (customer) => set({ selectedCustomer: customer }),
  clearError: () => set({ error: null }),
}));
