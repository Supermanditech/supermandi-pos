// SA-P2-008: Test imports API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchImportJobs } from '../../api/imports';

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

describe('imports API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  describe('fetchImportJobs', () => {
    it('returns paginated import list', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          imports: [
            { id: 'imp-1', store_id: 's1', file_name: 'test.csv', status: 'committed', total_rows: 10 },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      });

      const result = await fetchImportJobs();
      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].id).toBe('imp-1');
      expect(result.total).toBe(1);
    });

    it('passes status filter param', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ imports: [], total: 0 }),
      });

      await fetchImportJobs({ status: 'failed' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('status=failed');
    });

    it('passes storeId filter param', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ imports: [], total: 0 }),
      });

      await fetchImportJobs({ storeId: 'store-1' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('storeId=store-1');
    });

    it('passes pagination params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ imports: [], total: 0 }),
      });

      await fetchImportJobs({ limit: 10, offset: 20 });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=20');
    });

    it('returns empty imports when field is missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await fetchImportJobs();
      expect(result.imports).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('includes auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ imports: [], total: 0 }),
      });

      await fetchImportJobs();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          cache: 'no-store',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(fetchImportJobs()).rejects.toThrow();
    });

    it('handles json parse failure gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      const result = await fetchImportJobs();
      expect(result.imports).toEqual([]);
    });

    it('uses default pagination values when missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ imports: [] }),
      });

      const result = await fetchImportJobs();
      expect(result.total).toBe(0);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });
  });
});
