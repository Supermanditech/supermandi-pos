// SuperAdmin — Test registrationEvents API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.com');

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'X-Request-ID': 'uuid' }),
  fetchWithTimeout: vi.fn(),
}));

describe('registrationEvents module', () => {
  let mod: typeof import('../../api/registrationEvents');
  let authMock: { fetchWithTimeout: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../api/registrationEvents');
    authMock = (await import('../../api/authToken')) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchRegistrationEvents', () => {
    it('fetches events with default params', async () => {
      const mockData = { events: [], pagination: { total: 0, limit: 50, offset: 0 } };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await mod.fetchRegistrationEvents();
      expect(result).toEqual(mockData);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/registration-events'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('includes filter params', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ events: [], pagination: { total: 0, limit: 10, offset: 5 } }),
      });

      await mod.fetchRegistrationEvents({ limit: 10, offset: 5, source: 'PORTAL', outcome: 'SUCCESS', storeId: 's1' });
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=5');
      expect(url).toContain('source=PORTAL');
      expect(url).toContain('outcome=SUCCESS');
      expect(url).toContain('storeId=s1');
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(mod.fetchRegistrationEvents()).rejects.toThrow('Session expired');
    });

    it('throws on other errors', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(mod.fetchRegistrationEvents()).rejects.toThrow('Failed to fetch registration events (500)');
    });
  });

  describe('sendEnrollmentCodeToStore', () => {
    it('sends POST and returns enrollment response', async () => {
      const mockResp = {
        enrollmentCode: 'ABC123',
        expiresAt: '2026-02-17T00:00:00Z',
        qrPayload: 'qr-data',
        notification: { smsSent: true, emailSent: false, smsError: null, emailError: null },
      };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => mockResp,
      });

      const result = await mod.sendEnrollmentCodeToStore('store-1');
      expect(result).toEqual(mockResp);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/stores/store-1/send-enrollment-code'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({ ok: false, status: 401 });

      await expect(mod.sendEnrollmentCodeToStore('s1')).rejects.toThrow('Session expired');
    });

    it('throws on 404', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({ ok: false, status: 404 });

      await expect(mod.sendEnrollmentCodeToStore('s1')).rejects.toThrow('Store not found');
    });

    it('throws message from error body', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'No phone on file' }),
      });

      await expect(mod.sendEnrollmentCodeToStore('s1')).rejects.toThrow('No phone on file');
    });
  });

  describe('fetchRegistrationSummary', () => {
    it('returns summary on success', async () => {
      const mockData = { total: 42, bySource: { PORTAL: { SUCCESS: 10 } } };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await mod.fetchRegistrationSummary();
      expect(result).toEqual(mockData);
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({ ok: false, status: 401 });
      await expect(mod.fetchRegistrationSummary()).rejects.toThrow('Session expired');
    });

    it('throws on other errors', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({ ok: false, status: 500 });
      await expect(mod.fetchRegistrationSummary()).rejects.toThrow('Failed to fetch registration summary (500)');
    });
  });
});
