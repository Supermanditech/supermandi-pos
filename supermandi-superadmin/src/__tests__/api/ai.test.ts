// SuperAdmin — Test ai API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.com');

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'X-Request-ID': 'uuid' }),
  fetchWithTimeout: vi.fn(),
}));

describe('ai module', () => {
  let aiModule: typeof import('../../api/ai');
  let authMock: { fetchWithTimeout: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    aiModule = await import('../../api/ai');
    authMock = (await import('../../api/authToken')) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('askAi', () => {
    it('sends POST with question and returns answer', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ answer: 'The answer is 42' }),
      });

      const result = await aiModule.askAi('What is the meaning of life?');
      expect(result.answer).toBe('The answer is 42');
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/ai'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws if question is empty', async () => {
      await expect(aiModule.askAi('')).rejects.toThrow('Question is required');
      await expect(aiModule.askAi('   ')).rejects.toThrow('Question is required');
    });

    it('throws on 401 response', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await expect(aiModule.askAi('test')).rejects.toThrow('Unauthorized');
    });

    it('throws with error message from response body', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Model overloaded' }),
      });

      await expect(aiModule.askAi('test')).rejects.toThrow('Model overloaded');
    });

    it('throws fallback error when no error in body', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

      await expect(aiModule.askAi('test')).rejects.toThrow('AI failed (503)');
    });

    it('returns empty string when answer is missing', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const result = await aiModule.askAi('test');
      expect(result.answer).toBe('');
    });
  });

  describe('fetchAiHealth', () => {
    it('returns configured status', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ configured: true }),
      });

      const result = await aiModule.fetchAiHealth();
      expect(result.configured).toBe(true);
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await expect(aiModule.fetchAiHealth()).rejects.toThrow('Unauthorized');
    });

    it('throws with error from response', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Key missing' }),
      });

      await expect(aiModule.fetchAiHealth()).rejects.toThrow('Key missing');
    });

    it('returns false when configured field is missing', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const result = await aiModule.fetchAiHealth();
      expect(result.configured).toBe(false);
    });
  });
});
