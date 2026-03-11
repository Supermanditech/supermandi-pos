// SuperAdmin — Test stores API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchStores, fetchStore, createStore, updateStore, changeStoreStatus, fetchStoreStatusHistory, fetchStoreSettings } from '../../api/stores';

// Mock authToken module
vi.mock('../../api/authToken', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer mock-token', 'X-Request-ID': 'test-id' })),
  fetchWithTimeout: vi.fn((url: string, init?: RequestInit) => {
    const mockFetch = (globalThis as any).__mockFetch;
    if (!mockFetch) throw new Error('Mock fetch not set up');
    return mockFetch(url, init);
  }),
}));

// Mock errorSanitizer
vi.mock('../../api/errorSanitizer', () => ({
  parseError: vi.fn(async (res: Response) => `Request failed (${res.status})`),
}));

describe('stores API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchStores
  // =========================================================================

  describe('fetchStores', () => {
    it('returns paginated store list on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          stores: [{ id: 'store-1', name: 'Test Store' }],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      });

      const result = await fetchStores();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('store-1');
      expect(result.total).toBe(1);
    });

    it('passes pagination params as query string', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ stores: [], total: 0, limit: 10, offset: 20 }),
      });

      await fetchStores({ limit: 10, offset: 20 });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=20');
    });

    it('includes auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ stores: [], total: 0 }),
      });

      await fetchStores();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
            Accept: 'application/json',
          }),
        })
      );
    });

    it('throws error on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      });

      await expect(fetchStores()).rejects.toThrow('Request failed (500)');
    });

    it('returns empty items when stores is not an array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ stores: null, total: 0 }),
      });

      const result = await fetchStores();
      expect(result.items).toEqual([]);
    });

    it('uses default values when pagination fields missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ stores: [] }),
      });

      const result = await fetchStores();
      expect(result.total).toBe(0);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });
  });

  // =========================================================================
  // fetchStore
  // =========================================================================

  describe('fetchStore', () => {
    it('returns single store record', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          store: { id: 'store-1', name: 'Test', upi_vpa: 'test@upi' },
        }),
      });

      const result = await fetchStore('store-1');
      expect(result.id).toBe('store-1');
      expect(result.upi_vpa).toBe('test@upi');
    });

    it('calls correct endpoint with encoded storeId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ store: { id: 'store/special' } }),
      });

      await fetchStore('store/special');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/admin/stores/store%2Fspecial');
    });

    // R4-AC-003: Now throws instead of returning {} as StoreRecord
    it('throws when store field is missing from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await expect(fetchStore('store-1')).rejects.toThrow("Invalid store response");
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      });

      await expect(fetchStore('nonexistent')).rejects.toThrow();
    });

    it('uses GET method with no-store cache', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ store: {} }),
      });

      await fetchStore('store-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
          cache: 'no-store',
        })
      );
    });
  });

  // =========================================================================
  // createStore
  // =========================================================================

  describe('createStore', () => {
    it('sends POST with storeName in body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ store: { id: 'new-store', name: 'New Store' } }),
      });

      const result = await createStore({ storeName: 'New Store' });

      expect(result.id).toBe('new-store');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/stores'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('includes optional storeId in body when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ store: { id: 'custom-id' } }),
      });

      await createStore({ storeName: 'Test', storeId: 'custom-id' });

      const calledInit = mockFetch.mock.calls[0][1];
      const body = JSON.parse(calledInit.body);
      expect(body.storeName).toBe('Test');
      expect(body.storeId).toBe('custom-id');
    });

    it('omits storeId from body when not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ store: {} }),
      });

      await createStore({ storeName: 'Only Name' });

      const calledInit = mockFetch.mock.calls[0][1];
      const body = JSON.parse(calledInit.body);
      expect(body.storeName).toBe('Only Name');
      expect(body.storeId).toBeUndefined();
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Already exists' }),
      });

      await expect(createStore({ storeName: 'Dup' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // updateStore
  // =========================================================================

  describe('updateStore', () => {
    it('sends PATCH with update fields', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ store: { id: 'store-1', upi_vpa: 'new@upi' } }),
      });

      const result = await updateStore('store-1', { upiVpa: 'new@upi' });

      expect(result.upi_vpa).toBe('new@upi');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/stores/store-1'),
        expect.objectContaining({
          method: 'PATCH',
        })
      );
    });

    it('sends all update fields in body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ store: {} }),
      });

      await updateStore('store-1', {
        storeName: 'Updated',
        address: '123 Street',
        contactName: 'John',
        contactPhone: '+919999999999',
        contactEmail: 'john@test.com',
        allowedPaymentMethods: ['CASH', 'UPI'],
      });

      const calledInit = mockFetch.mock.calls[0][1];
      const body = JSON.parse(calledInit.body);
      expect(body.storeName).toBe('Updated');
      expect(body.address).toBe('123 Street');
      expect(body.contactName).toBe('John');
      expect(body.allowedPaymentMethods).toEqual(['CASH', 'UPI']);
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Validation failed' }),
      });

      await expect(updateStore('store-1', {})).rejects.toThrow();
    });
  });

  // =========================================================================
  // changeStoreStatus
  // =========================================================================

  describe('changeStoreStatus', () => {
    it('sends PATCH with status and reason', async () => {
      const mockResponse = {
        store: { id: 'store-1', status: 'SUSPENDED' },
        previous_status: 'ACTIVE',
        status_history: [],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await changeStoreStatus('store-1', 'SUSPENDED', 'Policy violation');

      expect(result.previous_status).toBe('ACTIVE');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/stores/store-1/status'),
        expect.objectContaining({
          method: 'PATCH',
        })
      );

      const calledInit = mockFetch.mock.calls[0][1];
      const body = JSON.parse(calledInit.body);
      expect(body.status).toBe('SUSPENDED');
      expect(body.reason).toBe('Policy violation');
    });

    it('sends status without reason when not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ store: {}, previous_status: 'SUSPENDED', status_history: [] }),
      });

      await changeStoreStatus('store-1', 'ACTIVE');

      const calledInit = mockFetch.mock.calls[0][1];
      const body = JSON.parse(calledInit.body);
      expect(body.status).toBe('ACTIVE');
      expect(body.reason).toBeUndefined();
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ error: 'Invalid transition' }),
      });

      await expect(changeStoreStatus('store-1', 'INVALID')).rejects.toThrow();
    });
  });

  // =========================================================================
  // fetchStoreStatusHistory
  // =========================================================================

  describe('fetchStoreStatusHistory', () => {
    it('returns history array', async () => {
      const mockHistory = [
        { id: '1', old_status: 'ACTIVE', new_status: 'SUSPENDED', reason: 'Test', changed_by: null, changed_by_type: null, changed_at: '2024-01-01' },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ history: mockHistory }),
      });

      const result = await fetchStoreStatusHistory('store-1');
      expect(result).toHaveLength(1);
      expect(result[0].new_status).toBe('SUSPENDED');
    });

    it('calls correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ history: [] }),
      });

      await fetchStoreStatusHistory('store-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/stores/store-1/status-history'),
        expect.objectContaining({
          method: 'GET',
          cache: 'no-store',
        })
      );
    });

    it('returns empty array when history is not an array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ history: null }),
      });

      const result = await fetchStoreStatusHistory('store-1');
      expect(result).toEqual([]);
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Store not found' }),
      });

      await expect(fetchStoreStatusHistory('nonexistent')).rejects.toThrow();
    });
  });

  // =========================================================================
  // SA-P1-014: fetchStoreSettings
  // =========================================================================

  describe('fetchStoreSettings', () => {
    const mockSettings = {
      storeId: 'store-1',
      name: 'Test Store',
      code: 'TST001',
      storeType: null,
      status: 'ACTIVE',
      statusReason: null,
      statusUpdatedAt: null,
      address: '123 Main St',
      contactName: 'John',
      contactPhone: '+911234567890',
      contactEmail: 'john@test.com',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      location: null,
      upiVpa: 'test@upi',
      upiVpaUpdatedAt: '2024-01-15',
      allowedPaymentMethods: ['CASH', 'UPI', 'DUE'],
      creditEnabled: false,
      creditLimit: 0,
      bnplEnabled: false,
      bnplCreditLimit: 5000000,
      bnplMaxDays: 7,
      deviceBound: true,
      kycComplete: true,
      upiComplete: true,
      adminApproved: true,
      activeDeviceCount: 1,
      posDeviceId: null,
      kycStatus: 'VERIFIED',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      scanLookupV2Enabled: false,
      featureFlags: [{ flag_key: 'scan_v2', enabled: true, scope_type: 'global', description: null }],
      createdAt: '2024-01-01',
      updatedAt: '2024-01-15',
    };

    it('returns store settings on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ settings: mockSettings }),
      });

      const result = await fetchStoreSettings('store-1');
      expect(result).toEqual(mockSettings);
    });

    it('calls correct URL with encoded storeId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ settings: mockSettings }),
      });

      await fetchStoreSettings('store/special');
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/admin/stores/store%2Fspecial/settings');
    });

    it('throws on missing settings data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ settings: null }),
      });

      await expect(fetchStoreSettings('store-1')).rejects.toThrow('Invalid store settings response');
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Store not found' }),
      });

      await expect(fetchStoreSettings('nonexistent')).rejects.toThrow();
    });

    it('uses GET method', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ settings: mockSettings }),
      });

      await fetchStoreSettings('store-1');
      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    });
  });
});
