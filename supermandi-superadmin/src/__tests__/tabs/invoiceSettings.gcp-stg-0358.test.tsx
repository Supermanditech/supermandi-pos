// GCP-STG-0358: Invoice Template Settings UI — test
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchInvoiceSettings, updateInvoiceSettings } from '../../api/stores';
import type { InvoiceSettings } from '../../api/stores';

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

const MOCK_SETTINGS: InvoiceSettings = {
  logoUrl: null,
  headerText: 'Test Store',
  footerText: 'Thank you!',
  termsAndConditions: 'All sales final.',
  showGstin: true,
  showHsn: false,
  autoSendWhatsApp: true,
  autoSendOnSale: true,
  autoSendOnPo: false,
  autoSendOnGrn: false,
};

describe('GCP-STG-0358: Invoice Settings API', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchInvoiceSettings
  // =========================================================================

  describe('fetchInvoiceSettings', () => {
    it('returns invoice settings on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ invoiceSettings: MOCK_SETTINGS }),
      });

      const result = await fetchInvoiceSettings('store-1');
      expect(result.headerText).toBe('Test Store');
      expect(result.footerText).toBe('Thank you!');
      expect(result.showGstin).toBe(true);
      expect(result.showHsn).toBe(false);
      expect(result.autoSendWhatsApp).toBe(true);
      expect(result.autoSendOnSale).toBe(true);
    });

    it('calls correct endpoint with encoded storeId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ invoiceSettings: MOCK_SETTINGS }),
      });

      await fetchInvoiceSettings('store/special');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/v1/admin/stores/store%2Fspecial/invoice-settings');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'store not found' }),
      });

      await expect(fetchInvoiceSettings('store-bad')).rejects.toThrow('Request failed (404)');
    });

    it('returns empty object when invoiceSettings is null', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ invoiceSettings: null }),
      });

      const result = await fetchInvoiceSettings('store-1');
      expect(result).toEqual({});
    });
  });

  // =========================================================================
  // updateInvoiceSettings
  // =========================================================================

  describe('updateInvoiceSettings', () => {
    it('sends PATCH with settings body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      const update: Partial<InvoiceSettings> = { headerText: 'New Header', showGstin: false };
      await updateInvoiceSettings('store-1', update);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/v1/admin/stores/store-1/invoice-settings');
      expect(init.method).toBe('PATCH');
      const body = JSON.parse(init.body);
      expect(body.headerText).toBe('New Header');
      expect(body.showGstin).toBe(false);
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Failed to update' }),
      });

      await expect(
        updateInvoiceSettings('store-1', { headerText: 'x' })
      ).rejects.toThrow('Request failed (500)');
    });

    it('encodes storeId in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      await updateInvoiceSettings('store/special', { footerText: 'bye' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('store%2Fspecial');
    });
  });

  // =========================================================================
  // Type shape validation
  // =========================================================================

  describe('InvoiceSettings type shape', () => {
    it('has all expected fields from migration 215', () => {
      const keys = Object.keys(MOCK_SETTINGS);
      expect(keys).toContain('logoUrl');
      expect(keys).toContain('headerText');
      expect(keys).toContain('footerText');
      expect(keys).toContain('termsAndConditions');
      expect(keys).toContain('showGstin');
      expect(keys).toContain('showHsn');
      expect(keys).toContain('autoSendWhatsApp');
      expect(keys).toContain('autoSendOnSale');
      expect(keys).toContain('autoSendOnPo');
      expect(keys).toContain('autoSendOnGrn');
    });
  });
});
