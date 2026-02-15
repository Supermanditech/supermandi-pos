// SuperAdmin — Test staff API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.com');

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'X-Request-ID': 'uuid' }),
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../api/errorSanitizer', () => ({
  sanitizeErrorMessage: (raw: string | null, fallback: string) => raw || fallback,
}));

describe('staff module', () => {
  let mod: typeof import('../../api/staff');
  let authMock: { fetchWithTimeout: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../api/staff');
    authMock = (await import('../../api/authToken')) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchStoreStaff', () => {
    it('fetches staff list for store', async () => {
      const mockData = { staff: [{ id: 's1', name: 'John', phone: '9999', role: 'CASHIER', is_active: true, created_at: '2026-01-01', sales_count: 5, stock_in_count: 2 }] };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await mod.fetchStoreStaff('store-1');
      expect(result.staff).toHaveLength(1);
      expect(result.staff[0].name).toBe('John');
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/stores/store-1/staff'),
        expect.any(Object)
      );
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await expect(mod.fetchStoreStaff('s1')).rejects.toThrow('Unauthorized');
    });
  });

  describe('createStaff', () => {
    it('sends POST with staff data', async () => {
      const input = { name: 'Jane', phone: '8888888888', pin: '1234', role: 'MANAGER' };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ staff: { id: 's2', ...input, is_active: true } }),
      });

      const result = await mod.createStaff('store-1', input);
      expect(result.staff.name).toBe('Jane');
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/stores/store-1/staff'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify(input) })
      );
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await expect(mod.createStaff('s1', { name: 'X', phone: '1', pin: '1', role: 'CASHIER' })).rejects.toThrow('Unauthorized');
    });

    it('throws error message from response', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Phone already exists' }),
      });

      await expect(mod.createStaff('s1', { name: 'X', phone: '1', pin: '1', role: 'CASHIER' })).rejects.toThrow('Phone already exists');
    });
  });

  describe('updateStaff', () => {
    it('sends PATCH with updates', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ staff: { id: 's1', name: 'Updated', role: 'MANAGER' } }),
      });

      const result = await mod.updateStaff('store-1', 's1', { name: 'Updated', role: 'MANAGER' });
      expect(result.staff.name).toBe('Updated');
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/stores/store-1/staff/s1'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('throws on failure', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Staff not found' }),
      });

      await expect(mod.updateStaff('s1', 'x', { name: 'Y' })).rejects.toThrow('Staff not found');
    });
  });

  describe('resetStaffPin', () => {
    it('sends POST to reset pin', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({ ok: true });

      await mod.resetStaffPin('store-1', 's1', '5678');
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/stores/store-1/staff/s1/reset-pin'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ pin: '5678' }) })
      );
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await expect(mod.resetStaffPin('s1', 'x', '1234')).rejects.toThrow('Unauthorized');
    });

    it('throws error from response', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'PIN too short' }),
      });

      await expect(mod.resetStaffPin('s1', 'x', '12')).rejects.toThrow('PIN too short');
    });
  });
});
