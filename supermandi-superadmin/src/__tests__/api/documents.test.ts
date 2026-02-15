// SuperAdmin — Test documents API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchPendingDocuments,
  fetchDocument,
  fetchEntityDocuments,
  approveDocument,
  rejectDocument,
  getDocumentViewUrl,
  fetchDocumentBlob,
} from '../../api/documents';

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

describe('documents API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchPendingDocuments
  // =========================================================================

  describe('fetchPendingDocuments', () => {
    it('returns pending documents with pagination', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          documents: [
            { id: 'doc-1', entity_type: 'store', entity_id: 'store-1', document_type: 'gst_cert', file_name: 'gst.pdf', file_size: 1024, content_type: 'application/pdf', status: 'pending', uploaded_at: '2024-01-01', view_url: '/view/1' },
          ],
          pagination: { total: 1, limit: 50, offset: 0 },
        }),
      });

      const result = await fetchPendingDocuments();
      expect(result.documents).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('passes entity_type filter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ documents: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      });

      await fetchPendingDocuments('supplier');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('entity_type=supplier');
    });

    it('passes limit and offset', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ documents: [], pagination: { total: 0, limit: 10, offset: 20 } }),
      });

      await fetchPendingDocuments(undefined, 10, 20);

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=20');
    });

    it('uses default limit=50 offset=0', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ documents: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      });

      await fetchPendingDocuments();

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('limit=50');
      expect(calledUrl).toContain('offset=0');
    });

    it('calls pending endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ documents: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      });

      await fetchPendingDocuments();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/documents/pending'),
        expect.any(Object)
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(fetchPendingDocuments()).rejects.toThrow();
    });
  });

  // =========================================================================
  // fetchDocument
  // =========================================================================

  describe('fetchDocument', () => {
    it('returns single document record', async () => {
      const mockDoc = {
        id: 'doc-1',
        entity_type: 'store',
        entity_id: 'store-1',
        document_type: 'pan_card',
        file_name: 'pan.pdf',
        file_size: 2048,
        content_type: 'application/pdf',
        status: 'pending',
        uploaded_at: '2024-01-01',
        view_url: '/view/1',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockDoc,
      });

      const result = await fetchDocument('doc-1');
      expect(result.id).toBe('doc-1');
      expect(result.document_type).toBe('pan_card');
    });

    it('encodes documentId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'doc/special' }),
      });

      await fetchDocument('doc/special');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('doc%2Fspecial');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(fetchDocument('nonexistent')).rejects.toThrow();
    });
  });

  // =========================================================================
  // fetchEntityDocuments
  // =========================================================================

  describe('fetchEntityDocuments', () => {
    it('returns entity documents for store', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          entity_type: 'store',
          entity_id: 'store-1',
          documents: [{ id: 'doc-1', status: 'approved' }],
        }),
      });

      const result = await fetchEntityDocuments('store', 'store-1');
      expect(result.entity_type).toBe('store');
      expect(result.documents).toHaveLength(1);
    });

    it('calls correct endpoint for supplier', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ entity_type: 'supplier', entity_id: 'sup-1', documents: [] }),
      });

      await fetchEntityDocuments('supplier', 'sup-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/documents/entity/supplier/sup-1'),
        expect.any(Object)
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(fetchEntityDocuments('store', 'nonexistent')).rejects.toThrow();
    });
  });

  // =========================================================================
  // approveDocument
  // =========================================================================

  describe('approveDocument', () => {
    it('sends PATCH to verify endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Document approved' }),
      });

      const result = await approveDocument('doc-1');
      expect(result.success).toBe(true);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/documents/doc-1/verify'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('includes auth and content-type headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'ok' }),
      });

      await approveDocument('doc-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({}),
      });

      await expect(approveDocument('doc-1')).rejects.toThrow();
    });
  });

  // =========================================================================
  // rejectDocument
  // =========================================================================

  describe('rejectDocument', () => {
    it('sends PATCH with rejection reason', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Rejected' }),
      });

      const result = await rejectDocument('doc-1', 'Blurry image');
      expect(result.success).toBe(true);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/documents/doc-1/reject'),
        expect.objectContaining({ method: 'PATCH' })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.reason).toBe('Blurry image');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({}),
      });

      await expect(rejectDocument('doc-1', 'reason')).rejects.toThrow();
    });
  });

  // =========================================================================
  // getDocumentViewUrl
  // =========================================================================

  describe('getDocumentViewUrl', () => {
    it('returns correct view URL', () => {
      const url = getDocumentViewUrl('doc-123');
      expect(url).toContain('/api/v1/documents/doc-123');
    });
  });

  // =========================================================================
  // fetchDocumentBlob
  // =========================================================================

  describe('fetchDocumentBlob', () => {
    it('returns blob URL from document', async () => {
      const mockBlob = new Blob(['image data'], { type: 'image/png' });
      mockFetch.mockResolvedValue({
        ok: true,
        blob: async () => mockBlob,
      });

      // jsdom does not provide URL.createObjectURL, so define it first
      if (!URL.createObjectURL) (URL as any).createObjectURL = vi.fn();
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');

      const result = await fetchDocumentBlob('doc-1');
      expect(result).toBe('blob:test-url');

      vi.restoreAllMocks();
    });

    it('calls document endpoint with auth headers', async () => {
      const mockBlob = new Blob(['data']);
      mockFetch.mockResolvedValue({
        ok: true,
        blob: async () => mockBlob,
      });

      // jsdom does not provide URL.createObjectURL, so define it first
      if (!URL.createObjectURL) (URL as any).createObjectURL = vi.fn();
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');

      await fetchDocumentBlob('doc-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/documents/doc-1'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );

      vi.restoreAllMocks();
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403 });
      await expect(fetchDocumentBlob('doc-1')).rejects.toThrow('Failed to load document (403)');
    });
  });
});
