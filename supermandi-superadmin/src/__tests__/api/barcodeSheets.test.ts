// SuperAdmin — Test barcodeSheets API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.com');

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'X-Request-ID': 'uuid' }),
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../api/errorSanitizer', () => ({
  sanitizeErrorMessage: (raw: string | null, fallback: string) => raw || fallback,
}));

describe('barcodeSheets module', () => {
  let mod: typeof import('../../api/barcodeSheets');
  let authMock: { fetchWithTimeout: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../api/barcodeSheets');
    authMock = (await import('../../api/authToken')) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchBarcodeSheetPdf', () => {
    it('returns blob on success', async () => {
      const mockBlob = new Blob(['pdf-data'], { type: 'application/pdf' });
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => mockBlob,
      });

      const result = await mod.fetchBarcodeSheetPdf({ storeId: 'store-1', tier: 'tier1' });
      expect(result).toBe(mockBlob);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('storeId=store-1'),
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: 'application/pdf' }),
        })
      );
    });

    it('includes tier in query params', async () => {
      const mockBlob = new Blob();
      authMock.fetchWithTimeout.mockResolvedValue({ ok: true, blob: async () => mockBlob });

      await mod.fetchBarcodeSheetPdf({ storeId: 's1', tier: 'tier2' });
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('tier=tier2'),
        expect.any(Object)
      );
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await expect(mod.fetchBarcodeSheetPdf({ storeId: 's1', tier: 'tier1' })).rejects.toThrow('Unauthorized');
    });

    it('throws sanitized error on non-401 failure', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Generation failed' }),
      });

      await expect(mod.fetchBarcodeSheetPdf({ storeId: 's1', tier: 'tier1' })).rejects.toThrow('Generation failed');
    });

    it('throws fallback when no error in response', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(mod.fetchBarcodeSheetPdf({ storeId: 's1', tier: 'tier1' })).rejects.toThrow('Request failed (404)');
    });
  });
});
