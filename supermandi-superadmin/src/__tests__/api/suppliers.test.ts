// SuperAdmin — Test suppliers API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchPendingSuppliers,
  fetchVerifiedSuppliers,
  verifySupplierRequest,
  rejectSupplierRequest,
  fetchPendingProducts,
  approveProduct,
  rejectProduct,
  editProduct,
  changeSupplierStatus,
  fetchSupplierStatusHistory,
  fetchBankChanges,
  verifyBankDetails,
  publishProduct,
  publishBulkProducts,
  toggleAutoApproval,
  batchProductAction,
} from '../../api/suppliers';

// Mock authToken module
vi.mock('../../api/authToken', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer mock-token', 'X-Request-ID': 'test-id' })),
  fetchWithTimeout: vi.fn((url: string, init?: RequestInit) => {
    const mockFetch = (globalThis as any).__mockFetch;
    if (!mockFetch) throw new Error('Mock fetch not set up');
    return mockFetch(url, init);
  }),
}));

vi.mock('../../api/errorSanitizer', () => ({
  parseError: vi.fn(async (res: Response) => `Request failed (${res.status})`),
}));

describe('suppliers API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchPendingSuppliers
  // =========================================================================

  describe('fetchPendingSuppliers', () => {
    it('returns paginated pending suppliers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 's1', status: 'pending', storeId: 'store-1', createdAt: '2024-01-01' }],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      });

      const result = await fetchPendingSuppliers();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('s1');
      expect(result.total).toBe(1);
    });

    it('passes pagination params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], total: 0 }),
      });

      await fetchPendingSuppliers({ limit: 10, offset: 5 });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=5');
    });

    it('returns empty items when data is not an array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: null }),
      });

      const result = await fetchPendingSuppliers();
      expect(result.items).toEqual([]);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(fetchPendingSuppliers()).rejects.toThrow();
    });
  });

  // =========================================================================
  // fetchVerifiedSuppliers
  // =========================================================================

  describe('fetchVerifiedSuppliers', () => {
    it('returns paginated verified suppliers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'vs1', gstin: '12ABCDE1234Z5', businessName: 'Test Corp', verificationStatus: 'VERIFIED', status: 'active' }],
          total: 1,
        }),
      });

      const result = await fetchVerifiedSuppliers();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].gstin).toBe('12ABCDE1234Z5');
    });

    it('passes search param', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], total: 0 }),
      });

      await fetchVerifiedSuppliers({ search: 'test' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('search=test');
    });

    it('passes all pagination params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], total: 0 }),
      });

      await fetchVerifiedSuppliers({ search: 'abc', limit: 25, offset: 50 });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('search=abc');
      expect(calledUrl).toContain('limit=25');
      expect(calledUrl).toContain('offset=50');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({}),
      });

      await expect(fetchVerifiedSuppliers()).rejects.toThrow();
    });
  });

  // =========================================================================
  // verifySupplierRequest
  // =========================================================================

  describe('verifySupplierRequest', () => {
    it('sends POST with supplierId to link', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await verifySupplierRequest('req-1', { supplierId: 'sup-1', notes: 'Verified' });
      expect(result.success).toBe(true);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/pending-suppliers/req-1/verify'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('sends POST with verifySupplier flag', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await verifySupplierRequest('req-2', { verifySupplier: true });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.verifySupplier).toBe(true);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad request' }),
      });

      await expect(verifySupplierRequest('req-1', {})).rejects.toThrow();
    });
  });

  // =========================================================================
  // rejectSupplierRequest
  // =========================================================================

  describe('rejectSupplierRequest', () => {
    it('sends POST with reason as notes', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      const result = await rejectSupplierRequest('req-1', { reason: 'Invalid GSTIN' });
      expect(result.success).toBe(true);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.notes).toBe('Invalid GSTIN');
    });

    it('calls reject endpoint', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await rejectSupplierRequest('req-1', {});

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/pending-suppliers/req-1/reject'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({}),
      });

      await expect(rejectSupplierRequest('req-1', {})).rejects.toThrow();
    });
  });

  // =========================================================================
  // fetchPendingProducts
  // =========================================================================

  describe('fetchPendingProducts', () => {
    it('returns pending products array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'p1', productName: 'Rice', purchasePrice: 5000, mrp: 6000, supplierId: 's1', supplierName: 'Vendor', createdAt: '2024-01-01' },
          ],
        }),
      });

      const result = await fetchPendingProducts();
      expect(result).toHaveLength(1);
      expect(result[0].productName).toBe('Rice');
    });

    it('returns empty array when data is not array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: null }),
      });

      const result = await fetchPendingProducts();
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(fetchPendingProducts()).rejects.toThrow();
    });
  });

  // =========================================================================
  // approveProduct / rejectProduct
  // =========================================================================

  describe('approveProduct', () => {
    it('sends POST to approve endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ productId: 'p1', approvalStatus: 'approved', approvedAt: '2024-01-01' }),
      });

      const result = await approveProduct('p1');
      expect(result.approvalStatus).toBe('approved');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/products/p1/approve'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
      await expect(approveProduct('p1')).rejects.toThrow();
    });
  });

  describe('rejectProduct', () => {
    it('sends POST with reason to reject endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ productId: 'p1', approvalStatus: 'rejected' }),
      });

      const result = await rejectProduct('p1', 'Low quality');
      expect(result.approvalStatus).toBe('rejected');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.reason).toBe('Low quality');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
      await expect(rejectProduct('p1', 'reason')).rejects.toThrow();
    });
  });

  // =========================================================================
  // editProduct
  // =========================================================================

  describe('editProduct', () => {
    it('sends PUT with edit fields', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          productId: 'p1',
          editedName: 'Updated Rice',
          bnplEligible: true,
          bnplMaxDays: 7,
          purchasePrice: 5000,
          retailerPrice: 5500,
        }),
      });

      const result = await editProduct('p1', {
        editedName: 'Updated Rice',
        superMandiMarginMinor: 500,
        bnplEligible: true,
        bnplMaxDays: 7,
        invoiceModel: 'buy_resell',
        hsnCode: '0713',
        gstRate: 5,
      });

      expect(result.editedName).toBe('Updated Rice');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/products/p1/edit'),
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
      await expect(editProduct('p1', {})).rejects.toThrow();
    });
  });

  // =========================================================================
  // publishProduct / publishBulkProducts
  // =========================================================================

  describe('publishProduct', () => {
    it('sends POST to publish endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          productId: 'p1',
          productName: 'Rice',
          supplierName: 'Vendor',
          publishedToStores: 3,
        }),
      });

      const result = await publishProduct('p1');
      expect(result.publishedToStores).toBe(3);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
      await expect(publishProduct('p1')).rejects.toThrow();
    });
  });

  describe('publishBulkProducts', () => {
    it('sends POST with supplierId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          supplierId: 's1',
          productsProcessed: 5,
          totalPublishedToStores: 15,
        }),
      });

      const result = await publishBulkProducts('s1');
      expect(result.productsProcessed).toBe(5);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.supplierId).toBe('s1');
    });
  });

  // =========================================================================
  // toggleAutoApproval
  // =========================================================================

  describe('toggleAutoApproval', () => {
    it('sends POST with enabled flag', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          supplierId: 's1',
          autoApproveProducts: true,
          message: 'Auto-approve enabled',
        }),
      });

      const result = await toggleAutoApproval('s1', true);
      expect(result.autoApproveProducts).toBe(true);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.enabled).toBe(true);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
      await expect(toggleAutoApproval('s1', true)).rejects.toThrow();
    });
  });

  // =========================================================================
  // changeSupplierStatus
  // =========================================================================

  describe('changeSupplierStatus', () => {
    it('sends PATCH with status and reason', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          supplier: { id: 's1', verificationStatus: 'SUSPENDED' },
          previousStatus: 'VERIFIED',
          newStatus: 'SUSPENDED',
        }),
      });

      const result = await changeSupplierStatus('s1', 'SUSPENDED', 'Fraud detected');
      expect(result.newStatus).toBe('SUSPENDED');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/suppliers/s1/verification-status'),
        expect.objectContaining({ method: 'PATCH' })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.status).toBe('SUSPENDED');
      expect(body.reason).toBe('Fraud detected');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 422, json: async () => ({}) });
      await expect(changeSupplierStatus('s1', 'INVALID')).rejects.toThrow();
    });
  });

  // =========================================================================
  // fetchSupplierStatusHistory
  // =========================================================================

  describe('fetchSupplierStatusHistory', () => {
    it('returns history array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          history: [{ id: '1', previousStatus: 'VERIFIED', newStatus: 'SUSPENDED', reason: 'Test', changedBy: null, changedByType: null, createdAt: '2024-01-01' }],
        }),
      });

      const result = await fetchSupplierStatusHistory('s1');
      expect(result).toHaveLength(1);
    });

    it('returns empty array when no history', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ history: null }),
      });

      const result = await fetchSupplierStatusHistory('s1');
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // fetchBankChanges / verifyBankDetails
  // =========================================================================

  describe('fetchBankChanges', () => {
    it('returns bank change entries', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'bc1', businessName: 'Corp', gstin: '12AAA1234Z5', bankVerificationStatus: 'pending', updatedAt: '2024-01-01' },
          ],
        }),
      });

      const result = await fetchBankChanges();
      expect(result).toHaveLength(1);
      expect(result[0].businessName).toBe('Corp');
    });

    it('returns empty array when no data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await fetchBankChanges();
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
      await expect(fetchBankChanges()).rejects.toThrow();
    });
  });

  describe('verifyBankDetails', () => {
    it('sends POST with approve action', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ supplierId: 's1', bankVerificationStatus: 'verified', action: 'approve' }),
      });

      const result = await verifyBankDetails('s1', 'approve');
      expect(result.action).toBe('approve');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/suppliers/s1/bank-verify'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('sends POST with reject action and reason', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ supplierId: 's1', bankVerificationStatus: 'rejected', action: 'reject' }),
      });

      await verifyBankDetails('s1', 'reject', 'Account mismatch');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.action).toBe('reject');
      expect(body.reason).toBe('Account mismatch');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
      await expect(verifyBankDetails('s1', 'approve')).rejects.toThrow();
    });
  });

  // =========================================================================
  // batchProductAction
  // =========================================================================

  describe('batchProductAction', () => {
    it('sends POST with product IDs and approve action', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ processed: 3, succeeded: 3, failed: 0, errors: [] }),
      });

      const result = await batchProductAction(['p1', 'p2', 'p3'], 'approve');
      expect(result.succeeded).toBe(3);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.productIds).toEqual(['p1', 'p2', 'p3']);
      expect(body.action).toBe('approve');
    });

    it('sends reject action with reason', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ processed: 2, succeeded: 2, failed: 0, errors: [] }),
      });

      await batchProductAction(['p1', 'p2'], 'reject', 'Quality issue');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.action).toBe('reject');
      expect(body.reason).toBe('Quality issue');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
      await expect(batchProductAction(['p1'], 'approve')).rejects.toThrow();
    });
  });
});
