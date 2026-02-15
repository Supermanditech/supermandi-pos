// SuperAdmin — Test users API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.com');

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'X-Request-ID': 'uuid' }),
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../api/errorSanitizer', () => ({
  parseError: vi.fn().mockResolvedValue('Request failed'),
}));

describe('users module', () => {
  let mod: typeof import('../../api/users');
  let authMock: { fetchWithTimeout: ReturnType<typeof vi.fn> };
  let errorMock: { parseError: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../api/users');
    authMock = (await import('../../api/authToken')) as any;
    errorMock = (await import('../../api/errorSanitizer')) as any;
    errorMock.parseError.mockResolvedValue('Request failed');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchUsers', () => {
    it('returns paginated user list', async () => {
      const mockUsers = [{ id: 'u1', name: 'Admin', email: 'a@test.com', phone: null, actor_type: 'platform', actor_id: null, status: 'active', created_at: '2026-01-01', updated_at: '2026-01-01' }];
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ users: mockUsers, total: 1, limit: 50, offset: 0 }),
      });

      const result = await mod.fetchUsers();
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('includes pagination params', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ users: [], total: 0 }),
      });

      await mod.fetchUsers({ limit: 25, offset: 50 });
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).toContain('limit=25');
      expect(url).toContain('offset=50');
    });

    it('returns empty array when users field is missing', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await mod.fetchUsers();
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('throws on API error', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(mod.fetchUsers()).rejects.toThrow('Request failed');
    });
  });

  describe('patchUser', () => {
    it('sends PATCH with status update', async () => {
      const mockUser = { id: 'u1', name: 'Admin', email: 'a@test.com', phone: null, actor_type: 'platform', actor_id: null, status: 'suspended', created_at: '2026-01-01', updated_at: '2026-01-02' };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ user: mockUser }),
      });

      const result = await mod.patchUser('u1', { status: 'suspended' });
      expect(result.status).toBe('suspended');
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/users/u1'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'suspended' }) })
      );
    });

    it('throws when user field is missing in response', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(mod.patchUser('u1', { status: 'active' })).rejects.toThrow('User response missing');
    });

    it('throws on API error', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(mod.patchUser('u1', { status: 'active' })).rejects.toThrow('Request failed');
    });
  });

  describe('createUser', () => {
    it('sends POST with user data', async () => {
      const mockUser = { id: 'u2', name: 'New User', email: 'new@test.com', phone: null, actor_type: 'store', actor_id: null, status: 'active', created_at: '2026-01-01', updated_at: '2026-01-01' };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ user: mockUser }),
      });

      const result = await mod.createUser({ name: 'New User', email: 'new@test.com' });
      expect(result.name).toBe('New User');
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/users'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws when user field is missing', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(mod.createUser({ name: 'X' })).rejects.toThrow('User response missing');
    });

    it('throws on API error', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({}),
      });

      await expect(mod.createUser({ name: 'X' })).rejects.toThrow('Request failed');
    });
  });
});
