// SuperAdmin — Test applications API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchApplications, fetchApplicationDetail, approveApplication, rejectApplication } from '../../api/applications';

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

describe('applications API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchApplications
  // =========================================================================

  describe('fetchApplications', () => {
    it('returns paginated applications', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'app-1',
              entityType: 'retailer',
              phone: '+91999',
              businessName: 'Test Mart',
              ownerName: 'Owner',
              gstin: '12ABCDE1234Z5',
              status: 'KYC_SUBMITTED',
              createdAt: '2024-01-01',
              updatedAt: '2024-01-01',
            },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      });

      const result = await fetchApplications();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].businessName).toBe('Test Mart');
      expect(result.total).toBe(1);
    });

    it('passes entityType filter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], total: 0 }),
      });

      await fetchApplications({ entityType: 'supplier' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('entity_type=supplier');
    });

    it('passes status filter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], total: 0 }),
      });

      await fetchApplications({ status: 'KYC_SUBMITTED' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('status=KYC_SUBMITTED');
    });

    it('passes pagination params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], total: 0 }),
      });

      await fetchApplications({ limit: 10, offset: 20 });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=20');
    });

    it('returns empty items when data is not array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: null, total: 0 }),
      });

      const result = await fetchApplications();
      expect(result.items).toEqual([]);
    });

    it('uses default pagination values when missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const result = await fetchApplications();
      expect(result.total).toBe(0);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(fetchApplications()).rejects.toThrow('Request failed (500)');
    });

    it('includes auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], total: 0 }),
      });

      await fetchApplications();

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
  });

  // =========================================================================
  // fetchApplicationDetail
  // =========================================================================

  describe('fetchApplicationDetail', () => {
    it('returns application detail with documents and history', async () => {
      const mockDetail = {
        application: {
          id: 'app-1',
          entityType: 'retailer',
          status: 'KYC_SUBMITTED',
          phone: '+91999',
          businessName: 'Test',
          ownerName: 'Owner',
          gstin: '12ABCDE',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        documents: [{ id: 'doc-1', documentType: 'pan_card', fileUrl: '/doc/1', fileName: 'pan.pdf', fileSize: 1024, status: 'pending', createdAt: '2024-01-01' }],
        statusHistory: [{ oldStatus: 'DRAFT', newStatus: 'KYC_SUBMITTED', createdAt: '2024-01-01' }],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockDetail,
      });

      const result = await fetchApplicationDetail('app-1');
      expect(result.application.id).toBe('app-1');
      expect(result.documents).toHaveLength(1);
      expect(result.statusHistory).toHaveLength(1);
    });

    it('calls correct endpoint with encoded ID', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ application: {}, documents: [], statusHistory: [] }),
      });

      await fetchApplicationDetail('app/special');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/admin/applications/app%2Fspecial');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(fetchApplicationDetail('nonexistent')).rejects.toThrow();
    });
  });

  // =========================================================================
  // approveApplication
  // =========================================================================

  describe('approveApplication', () => {
    it('sends POST to approve endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, approvedEntityId: 'entity-1', message: 'Approved' }),
      });

      const result = await approveApplication('app-1', { notes: 'LGTM' });
      expect(result.success).toBe(true);
      expect(result.approvedEntityId).toBe('entity-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/applications/app-1/approve'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('sends empty object when no notes provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await approveApplication('app-1');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({});
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({}),
      });

      await expect(approveApplication('app-1')).rejects.toThrow();
    });
  });

  // =========================================================================
  // rejectApplication
  // =========================================================================

  describe('rejectApplication', () => {
    it('sends POST with rejection reason', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Rejected' }),
      });

      const result = await rejectApplication('app-1', { reason: 'Incomplete documents' });
      expect(result.success).toBe(true);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.reason).toBe('Incomplete documents');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/applications/app-1/reject'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({}),
      });

      await expect(rejectApplication('app-1', { reason: 'Bad' })).rejects.toThrow();
    });
  });
});
