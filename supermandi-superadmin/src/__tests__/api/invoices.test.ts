// SuperAdmin — Test invoices API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listInvoices,
  getInvoice,
  createPurchaseInvoice,
  createSaleInvoice,
  createCommissionInvoice,
  createSupplierSaleInvoice,
  issueInvoice,
  recordPayment,
  cancelInvoice,
  downloadInvoicePdf,
  getInvoicePdfUrl,
} from '../../api/invoices';

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer mock-token', 'X-Request-ID': 'test-id' })),
  fetchWithTimeout: vi.fn((url: string, init?: RequestInit) => {
    const mockFetch = (globalThis as any).__mockFetch;
    if (!mockFetch) throw new Error('Mock fetch not set up');
    return mockFetch(url, init);
  }),
}));

describe('invoices API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // listInvoices
  // =========================================================================

  describe('listInvoices', () => {
    it('returns invoice list with total', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'inv-1', invoiceNumber: 'INV/2024/001' }],
          total: 1,
        }),
      });

      const result = await listInvoices();
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('passes filter params as query string', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], total: 0 }),
      });

      await listInvoices({
        invoiceModel: 'buy_resell',
        invoiceType: 'purchase',
        status: 'draft',
        limit: 10,
        offset: 20,
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('invoiceModel=buy_resell');
      expect(calledUrl).toContain('invoiceType=purchase');
      expect(calledUrl).toContain('status=draft');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=20');
    });

    it('omits undefined/null/empty filter values', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], total: 0 }),
      });

      await listInvoices({ invoiceModel: undefined, status: undefined });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).not.toContain('invoiceModel');
      expect(calledUrl).not.toContain('status');
    });

    it('includes auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], total: 0 }),
      });

      await listInvoices();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await expect(listInvoices()).rejects.toThrow('Failed to list invoices: 500');
    });

    it('returns empty data array when data field is missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await listInvoices();
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('passes seller/buyer filters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], total: 0 }),
      });

      await listInvoices({ sellerType: 'platform', sellerId: 'sel-1', buyerType: 'store', buyerId: 'buy-1' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('sellerType=platform');
      expect(calledUrl).toContain('sellerId=sel-1');
    });
  });

  // =========================================================================
  // getInvoice
  // =========================================================================

  describe('getInvoice', () => {
    it('returns invoice detail', async () => {
      const mockInvoice = {
        id: 'inv-1',
        invoiceNumber: 'INV/2024/001',
        items: [],
        payments: [],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockInvoice }),
      });

      const result = await getInvoice('inv-1');
      expect(result.invoiceNumber).toBe('INV/2024/001');
    });

    it('calls correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: 'inv-1' } }),
      });

      await getInvoice('inv-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/invoices/inv-1'),
        expect.any(Object)
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      await expect(getInvoice('nonexistent')).rejects.toThrow('Failed to get invoice: 404');
    });
  });

  // =========================================================================
  // createPurchaseInvoice
  // =========================================================================

  describe('createPurchaseInvoice', () => {
    it('sends POST with purchase invoice data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: 'inv-new', invoiceNumber: 'INV/2024/002' } }),
      });

      const result = await createPurchaseInvoice({
        supplierId: 's1',
        items: [{ productId: 'p1', quantity: 10 }],
        purchaseOrderNumber: 'PO-001',
      });

      expect(result.invoiceNumber).toBe('INV/2024/002');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/invoices/purchase'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400 });
      await expect(createPurchaseInvoice({ supplierId: 's1', items: [] })).rejects.toThrow();
    });
  });

  // =========================================================================
  // createSaleInvoice
  // =========================================================================

  describe('createSaleInvoice', () => {
    it('sends POST to sale endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: 'inv-sale' } }),
      });

      await createSaleInvoice({
        storeId: 'store-1',
        items: [{ productId: 'p1', quantity: 5 }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/invoices/sale'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await expect(createSaleInvoice({ storeId: 'store-1', items: [] })).rejects.toThrow();
    });
  });

  // =========================================================================
  // createCommissionInvoice
  // =========================================================================

  describe('createCommissionInvoice', () => {
    it('sends POST to commission endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: 'inv-comm' } }),
      });

      await createCommissionInvoice({
        supplierId: 's1',
        items: [{ productId: 'p1', quantity: 10 }],
        platformFeePercent: 8,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/invoices/commission'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // =========================================================================
  // createSupplierSaleInvoice
  // =========================================================================

  describe('createSupplierSaleInvoice', () => {
    it('sends POST to supplier-sale endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: 'inv-ss' } }),
      });

      await createSupplierSaleInvoice({
        supplierId: 's1',
        items: [{ productId: 'p1', quantity: 10 }],
        platformFeePercent: 5,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/invoices/supplier-sale'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // =========================================================================
  // issueInvoice
  // =========================================================================

  describe('issueInvoice', () => {
    it('sends POST to issue endpoint', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await issueInvoice('inv-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/invoices/inv-1/issue'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 422 });
      await expect(issueInvoice('inv-1')).rejects.toThrow('Failed to issue invoice: 422');
    });
  });

  // =========================================================================
  // recordPayment
  // =========================================================================

  describe('recordPayment', () => {
    it('sends POST with payment data', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await recordPayment('inv-1', {
        amountMinor: 50000,
        paymentMode: 'UPI',
        paymentReference: 'TXN123',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/invoices/inv-1/payment'),
        expect.objectContaining({ method: 'POST' })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.amountMinor).toBe(50000);
      expect(body.paymentMode).toBe('UPI');
      expect(body.paymentReference).toBe('TXN123');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400 });
      await expect(recordPayment('inv-1', { amountMinor: 100, paymentMode: 'CASH' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // cancelInvoice
  // =========================================================================

  describe('cancelInvoice', () => {
    it('sends POST with reason', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await cancelInvoice('inv-1', 'Duplicate');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/invoices/inv-1/cancel'),
        expect.objectContaining({ method: 'POST' })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.reason).toBe('Duplicate');
    });

    it('sends POST without reason', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await cancelInvoice('inv-1');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.reason).toBeUndefined();
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 422 });
      await expect(cancelInvoice('inv-1')).rejects.toThrow();
    });
  });

  // =========================================================================
  // getInvoicePdfUrl
  // =========================================================================

  describe('getInvoicePdfUrl', () => {
    it('returns correct PDF URL', () => {
      const url = getInvoicePdfUrl('inv-1');
      expect(url).toContain('/api/v1/admin/invoices/inv-1/pdf');
    });
  });

  // =========================================================================
  // downloadInvoicePdf
  // =========================================================================

  describe('downloadInvoicePdf', () => {
    it('creates download link with blob URL', async () => {
      const mockBlob = new Blob(['PDF content'], { type: 'application/pdf' });
      mockFetch.mockResolvedValue({
        ok: true,
        blob: async () => mockBlob,
      });

      // Mock DOM methods
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockReturnValue(null as any);
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockReturnValue(null as any);
      // jsdom does not provide URL.createObjectURL / revokeObjectURL, so define them first
      if (!URL.createObjectURL) (URL as any).createObjectURL = vi.fn();
      if (!URL.revokeObjectURL) (URL as any).revokeObjectURL = vi.fn();
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');

      await downloadInvoicePdf('inv-1', 'INV/2024/001');

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(mockLink.download).toBe('INV-2024-001.pdf');
      expect(mockLink.click).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-url');

      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
      revokeObjectURLSpy.mockRestore();
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      await expect(downloadInvoicePdf('inv-1', 'INV/2024/001')).rejects.toThrow('Failed to download PDF: 404');
    });
  });
});
