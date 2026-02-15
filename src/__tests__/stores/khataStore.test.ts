/**
 * Deep tests for POS khataStore (Credit Book / Ledger)
 * Covers: fetchCustomers, fetchEntries, addEntry, recordPayment,
 * customer list updates, entries map management, error handling
 * Business invariant: ledger balance integrity
 */

const mockGetKhataCustomers = jest.fn();
const mockGetKhataEntries = jest.fn();
const mockAddKhataEntry = jest.fn();

jest.mock('../../services/khataService', () => ({
  getKhataCustomers: (...args: unknown[]) => mockGetKhataCustomers(...args),
  getKhataEntries: (...args: unknown[]) => mockGetKhataEntries(...args),
  addKhataEntry: (...args: unknown[]) => mockAddKhataEntry(...args),
}));

import { useKhataStore } from '../../stores/khataStore';

const store = useKhataStore;

const mockKhataCustomer = { id: 'kc1', name: 'Raj', phone: '+919876543210', balanceMinor: 50000 };
const mockEntry = { id: 'ke1', type: 'CREDIT', amountMinor: 50000, description: 'Purchase', createdAt: '2026-01-01' };

beforeEach(() => {
  jest.clearAllMocks();
  store.setState({
    customers: [],
    entries: new Map(),
    selectedCustomer: null,
    loading: false,
    entriesLoading: false,
    error: null,
  });
});

describe('khataStore', () => {
  describe('fetchCustomers', () => {
    it('fetches and stores khata customers', async () => {
      mockGetKhataCustomers.mockResolvedValueOnce([mockKhataCustomer]);

      await store.getState().fetchCustomers();

      expect(store.getState().customers).toHaveLength(1);
      expect(store.getState().customers[0].name).toBe('Raj');
      expect(store.getState().loading).toBe(false);
    });

    it('passes search query', async () => {
      mockGetKhataCustomers.mockResolvedValueOnce([]);

      await store.getState().fetchCustomers('Raj');

      expect(mockGetKhataCustomers).toHaveBeenCalledWith('Raj');
    });

    it('handles error', async () => {
      mockGetKhataCustomers.mockRejectedValueOnce(new Error('DB error'));

      await store.getState().fetchCustomers();

      expect(store.getState().error).toBe('DB error');
      expect(store.getState().loading).toBe(false);
    });
  });

  describe('fetchEntries', () => {
    it('fetches entries and sets selectedCustomer', async () => {
      mockGetKhataEntries.mockResolvedValueOnce({
        customer: mockKhataCustomer,
        entries: [mockEntry],
      });

      await store.getState().fetchEntries('+919876543210');

      expect(store.getState().selectedCustomer).toEqual(mockKhataCustomer);
      expect(store.getState().entries.get('kc1')).toHaveLength(1);
      expect(store.getState().entriesLoading).toBe(false);
    });

    it('handles error', async () => {
      mockGetKhataEntries.mockRejectedValueOnce(new Error('Not found'));

      await store.getState().fetchEntries('+919876543210');

      expect(store.getState().error).toBe('Not found');
    });
  });

  describe('addEntry', () => {
    it('adds entry and updates customer in list', async () => {
      store.setState({ customers: [mockKhataCustomer] });
      const updatedCustomer = { ...mockKhataCustomer, balanceMinor: 100000 };
      const newEntry = { id: 'ke2', type: 'CREDIT', amountMinor: 50000, description: 'New purchase', createdAt: '2026-01-02' };

      mockAddKhataEntry.mockResolvedValueOnce({
        customer: updatedCustomer,
        entry: newEntry,
      });

      const result = await store.getState().addEntry({
        customerPhone: '+919876543210',
        type: 'CREDIT',
        amountMinor: 50000,
        description: 'New purchase',
      });

      expect(result).toBe(true);
      expect(store.getState().customers[0].balanceMinor).toBe(100000);
      expect(store.getState().selectedCustomer).toEqual(updatedCustomer);
    });

    it('adds new customer if not in list', async () => {
      store.setState({ customers: [] });
      const newCustomer = { id: 'kc-new', name: 'New Customer', phone: '+91111', balanceMinor: 10000 };

      mockAddKhataEntry.mockResolvedValueOnce({
        customer: newCustomer,
        entry: { id: 'ke-new', type: 'CREDIT', amountMinor: 10000 },
      });

      await store.getState().addEntry({
        customerPhone: '+91111',
        type: 'CREDIT',
        amountMinor: 10000,
        description: 'First purchase',
      });

      expect(store.getState().customers).toHaveLength(1);
      expect(store.getState().customers[0].name).toBe('New Customer');
    });

    it('appends entry to existing entries map', async () => {
      const entries = new Map();
      entries.set('kc1', [mockEntry]);
      store.setState({ customers: [mockKhataCustomer], entries });

      const newEntry = { id: 'ke3', type: 'PAYMENT', amountMinor: 25000 };
      mockAddKhataEntry.mockResolvedValueOnce({
        customer: { ...mockKhataCustomer, balanceMinor: 25000 },
        entry: newEntry,
      });

      await store.getState().addEntry({
        customerPhone: '+919876543210',
        type: 'PAYMENT',
        amountMinor: 25000,
        description: 'Partial payment',
      });

      expect(store.getState().entries.get('kc1')).toHaveLength(2);
    });

    it('returns false on error', async () => {
      mockAddKhataEntry.mockRejectedValueOnce(new Error('Insufficient balance'));

      const result = await store.getState().addEntry({
        customerPhone: '+919876543210',
        type: 'CREDIT',
        amountMinor: 50000,
        description: 'Test',
      });

      expect(result).toBe(false);
      expect(store.getState().error).toBe('Insufficient balance');
    });
  });

  describe('recordPayment', () => {
    it('delegates to addEntry with PAYMENT type', async () => {
      store.setState({ customers: [mockKhataCustomer] });
      mockAddKhataEntry.mockResolvedValueOnce({
        customer: { ...mockKhataCustomer, balanceMinor: 25000 },
        entry: { id: 'ke-pay', type: 'PAYMENT', amountMinor: 25000 },
      });

      const result = await store.getState().recordPayment({
        customerPhone: '+919876543210',
        amountMinor: 25000,
        method: 'UPI',
        description: 'UPI payment',
      });

      expect(result).toBe(true);
      expect(mockAddKhataEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PAYMENT',
          amountMinor: 25000,
          paymentMethod: 'UPI',
        })
      );
    });

    it('uses default description when not provided', async () => {
      store.setState({ customers: [mockKhataCustomer] });
      mockAddKhataEntry.mockResolvedValueOnce({
        customer: mockKhataCustomer,
        entry: { id: 'ke-pay2', type: 'PAYMENT', amountMinor: 10000 },
      });

      await store.getState().recordPayment({
        customerPhone: '+919876543210',
        amountMinor: 10000,
        method: 'CASH',
      });

      expect(mockAddKhataEntry).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Payment received' })
      );
    });
  });

  describe('setSelectedCustomer / clearError', () => {
    it('sets and clears selected customer', () => {
      store.getState().setSelectedCustomer(mockKhataCustomer);
      expect(store.getState().selectedCustomer).toEqual(mockKhataCustomer);
      store.getState().setSelectedCustomer(null);
      expect(store.getState().selectedCustomer).toBeNull();
    });

    it('clears error', () => {
      store.setState({ error: 'Some error' });
      store.getState().clearError();
      expect(store.getState().error).toBeNull();
    });
  });
});
