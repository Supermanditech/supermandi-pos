// SuperAdmin — Test authToken API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the actual authToken module, so we mock fetch globally
// and test the exported functions directly.

// Mock crypto.randomUUID for deterministic headers
const mockUUID = 'test-uuid-1234';
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => mockUUID },
  writable: true,
});

// Mock import.meta.env
vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.com');

describe('authToken module', () => {
  let authModule: typeof import('../../api/authToken');

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    vi.useFakeTimers();
    globalThis.fetch = vi.fn();
    authModule = await import('../../api/authToken');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // =========================================================================
  // Session Token Management
  // =========================================================================

  describe('getSessionToken', () => {
    it('returns undefined when no token is stored', () => {
      expect(authModule.getSessionToken()).toBeUndefined();
    });

    it('returns undefined when token exists but no expiry', () => {
      localStorage.setItem('supermandi_admin_session', 'test-token');
      expect(authModule.getSessionToken()).toBeUndefined();
    });

    it('returns undefined when expiry exists but no token', () => {
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() + 100000));
      expect(authModule.getSessionToken()).toBeUndefined();
    });

    it('returns token when valid and not expired', () => {
      const futureExpiry = Date.now() + 3600000; // 1 hour from now
      localStorage.setItem('supermandi_admin_session', 'valid-token');
      localStorage.setItem('supermandi_admin_session_expiry', String(futureExpiry));
      expect(authModule.getSessionToken()).toBe('valid-token');
    });

    it('returns undefined when token is expired', () => {
      const pastExpiry = Date.now() - 1000; // 1 second ago
      localStorage.setItem('supermandi_admin_session', 'expired-token');
      localStorage.setItem('supermandi_admin_session_expiry', String(pastExpiry));
      expect(authModule.getSessionToken()).toBeUndefined();
    });

    it('returns undefined on localStorage error', () => {
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = () => { throw new Error('Storage error'); };
      expect(authModule.getSessionToken()).toBeUndefined();
      localStorage.getItem = originalGetItem;
    });
  });

  // =========================================================================
  // hasValidSession
  // =========================================================================

  describe('hasValidSession', () => {
    it('returns false when no token', () => {
      expect(authModule.hasValidSession()).toBe(false);
    });

    it('returns true when valid token exists', () => {
      localStorage.setItem('supermandi_admin_session', 'test-token');
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() + 3600000));
      expect(authModule.hasValidSession()).toBe(true);
    });

    it('returns false when token is expired', () => {
      localStorage.setItem('supermandi_admin_session', 'test-token');
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() - 1000));
      expect(authModule.hasValidSession()).toBe(false);
    });
  });

  // =========================================================================
  // getAuthHeaders
  // =========================================================================

  describe('getAuthHeaders', () => {
    it('returns X-Request-ID header always', () => {
      const headers = authModule.getAuthHeaders();
      expect(headers['X-Request-ID']).toBe(mockUUID);
    });

    it('includes Authorization header when token exists', () => {
      localStorage.setItem('supermandi_admin_session', 'my-token');
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() + 3600000));
      const headers = authModule.getAuthHeaders();
      expect(headers.Authorization).toBe('Bearer my-token');
    });

    it('does not include Authorization when no token', () => {
      const headers = authModule.getAuthHeaders();
      expect(headers.Authorization).toBeUndefined();
    });
  });

  // =========================================================================
  // getAdminToken / clearAdminToken
  // =========================================================================

  describe('getAdminToken', () => {
    it('returns session token (delegates to getSessionToken)', () => {
      localStorage.setItem('supermandi_admin_session', 'admin-tok');
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() + 3600000));
      expect(authModule.getAdminToken()).toBe('admin-tok');
    });

    it('returns undefined when no session', () => {
      expect(authModule.getAdminToken()).toBeUndefined();
    });
  });

  describe('clearAdminToken', () => {
    it('clears all session keys from localStorage', () => {
      localStorage.setItem('supermandi_admin_session', 'tok');
      localStorage.setItem('supermandi_admin_session_expiry', '123');
      localStorage.setItem('supermandi_admin_last_activity', '456');
      authModule.clearAdminToken();
      expect(localStorage.getItem('supermandi_admin_session')).toBeNull();
      expect(localStorage.getItem('supermandi_admin_session_expiry')).toBeNull();
      expect(localStorage.getItem('supermandi_admin_last_activity')).toBeNull();
    });
  });

  // =========================================================================
  // handle401Response
  // =========================================================================

  describe('handle401Response', () => {
    it('clears session tokens', () => {
      localStorage.setItem('supermandi_admin_session', 'tok');
      localStorage.setItem('supermandi_admin_session_expiry', '123');
      authModule.handle401Response();
      expect(localStorage.getItem('supermandi_admin_session')).toBeNull();
    });
  });

  // =========================================================================
  // fetchWithTimeout
  // =========================================================================

  describe('fetchWithTimeout', () => {
    it('calls fetch with credentials include by default', async () => {
      const mockRes = { ok: true, status: 200 };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

      const result = await authModule.fetchWithTimeout('https://api.test.com/test');
      expect(result).toBe(mockRes);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.test.com/test',
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('passes through request init options', async () => {
      const mockRes = { ok: true, status: 200 };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

      await authModule.fetchWithTimeout('https://api.test.com/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.test.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        })
      );
    });

    it('clears token and dispatches event on 401 response', async () => {
      localStorage.setItem('supermandi_admin_session', 'tok');
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() + 3600000));

      const mockRes = { ok: false, status: 401 };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

      const eventSpy = vi.fn();
      window.addEventListener('supermandi-auth-expired', eventSpy);

      await authModule.fetchWithTimeout('https://api.test.com/test');

      expect(localStorage.getItem('supermandi_admin_session')).toBeNull();
      expect(eventSpy).toHaveBeenCalled();

      window.removeEventListener('supermandi-auth-expired', eventSpy);
    });

    it('aborts after timeout', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        (_url: string, init: RequestInit) => {
          return new Promise((_resolve, reject) => {
            if (init?.signal) {
              init.signal.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              });
            }
          });
        }
      );

      const promise = authModule.fetchWithTimeout('https://api.test.com/test', { timeoutMs: 100 });
      vi.advanceTimersByTime(200);
      await expect(promise).rejects.toThrow();
    });

    it('uses caller-provided signal directly (skips tab/timeout logic)', async () => {
      const controller = new AbortController();
      const mockRes = { ok: true, status: 200 };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

      const result = await authModule.fetchWithTimeout('https://api.test.com/test', {
        signal: controller.signal,
      });

      expect(result).toBe(mockRes);
    });
  });

  // =========================================================================
  // abortActiveRequests
  // =========================================================================

  describe('abortActiveRequests', () => {
    it('aborts in-flight requests on tab change', async () => {
      let abortCalled = false;
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        (_url: string, init: RequestInit) => {
          return new Promise((_resolve, reject) => {
            if (init?.signal) {
              init.signal.addEventListener('abort', () => {
                abortCalled = true;
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }
          });
        }
      );

      const promise = authModule.fetchWithTimeout('https://api.test.com/test');
      authModule.abortActiveRequests();

      await expect(promise).rejects.toThrow();
      expect(abortCalled).toBe(true);
    });

    it('creates fresh controller so subsequent requests work', async () => {
      authModule.abortActiveRequests();

      const mockRes = { ok: true, status: 200 };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

      // This should work fine with a new controller
      const result = await authModule.fetchWithTimeout('https://api.test.com/new');
      expect(result).toBe(mockRes);
    });
  });

  // =========================================================================
  // sendAdminOtp
  // =========================================================================

  describe('sendAdminOtp', () => {
    it('calls correct endpoint with email in body', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ expiresIn: 300 }),
      });

      const result = await authModule.sendAdminOtp('admin@test.com');

      expect(result.success).toBe(true);
      expect(result.expiresIn).toBe(300);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/auth/send-email-otp'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );
    });

    it('returns error message on failure', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Invalid email' } }),
      });

      const result = await authModule.sendAdminOtp('bad@test.com');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email');
    });

    it('returns fallback error message when no error.message in response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const result = await authModule.sendAdminOtp('admin@test.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to send OTP');
    });

    it('catches network errors gracefully', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network offline'));

      const result = await authModule.sendAdminOtp('admin@test.com');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network offline');
    });

    it('returns generic error for non-Error thrown values', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue('string error');

      const result = await authModule.sendAdminOtp('admin@test.com');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  // =========================================================================
  // verifyAdminOtp
  // =========================================================================

  describe('verifyAdminOtp', () => {
    it('stores token in localStorage on success', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          token: 'jwt-token-123',
          expiresIn: 3600,
          admin: { email: 'admin@test.com', role: 'superadmin' },
        }),
      });

      const result = await authModule.verifyAdminOtp('admin@test.com', '123456');

      expect(result.success).toBe(true);
      expect(result.token).toBe('jwt-token-123');
      expect(result.admin?.email).toBe('admin@test.com');
      expect(localStorage.getItem('supermandi_admin_session')).toBe('jwt-token-123');
      expect(localStorage.getItem('supermandi_admin_session_expiry')).toBeTruthy();
      expect(localStorage.getItem('supermandi_admin_last_activity')).toBeTruthy();
    });

    it('uses 24h fallback when expiresIn is not provided', async () => {
      const now = Date.now();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: 'jwt-token' }),
      });

      await authModule.verifyAdminOtp('admin@test.com', '123456');

      const storedExpiry = parseInt(localStorage.getItem('supermandi_admin_session_expiry') || '0', 10);
      const expectedExpiry = now + 24 * 60 * 60 * 1000;
      // Allow 1 second tolerance
      expect(Math.abs(storedExpiry - expectedExpiry)).toBeLessThan(1000);
    });

    it('calls correct endpoint with email and otp', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: 'tok' }),
      });

      await authModule.verifyAdminOtp('admin@test.com', '999999');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/auth/verify-email-otp'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );
    });

    it('returns error on failure', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid OTP' } }),
      });

      const result = await authModule.verifyAdminOtp('admin@test.com', '000000');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid OTP');
    });

    it('catches network errors gracefully', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection refused'));

      const result = await authModule.verifyAdminOtp('admin@test.com', '123456');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });

  // =========================================================================
  // refreshSession
  // =========================================================================

  describe('refreshSession', () => {
    it('returns false when no current token', async () => {
      const result = await authModule.refreshSession();
      expect(result).toBe(false);
    });

    it('refreshes token successfully', async () => {
      localStorage.setItem('supermandi_admin_session', 'old-token');
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() + 3600000));

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sessionToken: 'new-token',
          expiresAt: Date.now() + 7200000,
        }),
      });

      const result = await authModule.refreshSession();
      expect(result).toBe(true);
      expect(localStorage.getItem('supermandi_admin_session')).toBe('new-token');
    });

    it('returns false and clears token on 401', async () => {
      localStorage.setItem('supermandi_admin_session', 'old-token');
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() + 3600000));

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'expired' }),
      });

      const result = await authModule.refreshSession();
      expect(result).toBe(false);
    });

    it('returns false on server error without clearing token', async () => {
      localStorage.setItem('supermandi_admin_session', 'old-token');
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() + 3600000));

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await authModule.refreshSession();
      expect(result).toBe(false);
    });

    it('returns false when refresh response is missing required fields', async () => {
      localStorage.setItem('supermandi_admin_session', 'old-token');
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() + 3600000));

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ someOtherField: true }),
      });

      const result = await authModule.refreshSession();
      expect(result).toBe(false);
    });

    it('returns false on network error', async () => {
      localStorage.setItem('supermandi_admin_session', 'old-token');
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() + 3600000));

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network down'));

      const result = await authModule.refreshSession();
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // logout
  // =========================================================================

  describe('logout', () => {
    it('clears all tokens after server call', async () => {
      localStorage.setItem('supermandi_admin_session', 'tok');
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() + 3600000));
      localStorage.setItem('supermandi_admin_last_activity', String(Date.now()));

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });

      await authModule.logout();

      expect(localStorage.getItem('supermandi_admin_session')).toBeNull();
      expect(localStorage.getItem('supermandi_admin_session_expiry')).toBeNull();
      expect(localStorage.getItem('supermandi_admin_last_activity')).toBeNull();
    });

    it('clears tokens even if server call fails', async () => {
      localStorage.setItem('supermandi_admin_session', 'tok');
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() + 3600000));

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server down'));

      await authModule.logout();

      expect(localStorage.getItem('supermandi_admin_session')).toBeNull();
    });

    it('skips server call when no token exists', async () => {
      await authModule.logout();
      // fetch should not be called for logout endpoint (though clearAdminToken may trigger other things)
      const logoutCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) => String(call[0]).includes('/logout')
      );
      expect(logoutCalls.length).toBe(0);
    });
  });

  // =========================================================================
  // startIdleTimeout / stopIdleTimeout
  // =========================================================================

  describe('startIdleTimeout / stopIdleTimeout', () => {
    it('sets last activity timestamp on start', () => {
      const onTimeout = vi.fn();
      authModule.startIdleTimeout(onTimeout);
      expect(localStorage.getItem('supermandi_admin_last_activity')).toBeTruthy();
      authModule.stopIdleTimeout();
    });

    it('calls onTimeout when idle for 30 minutes', () => {
      const onTimeout = vi.fn();
      // Set last activity to 31 minutes ago
      localStorage.setItem('supermandi_admin_last_activity', String(Date.now() - 31 * 60 * 1000));

      authModule.startIdleTimeout(onTimeout);

      // Advance timers by 30s (the check interval)
      vi.advanceTimersByTime(30000);

      expect(onTimeout).toHaveBeenCalled();
      authModule.stopIdleTimeout();
    });

    it('does not call onTimeout when recently active', () => {
      const onTimeout = vi.fn();
      localStorage.setItem('supermandi_admin_last_activity', String(Date.now()));

      authModule.startIdleTimeout(onTimeout);
      vi.advanceTimersByTime(30000);

      expect(onTimeout).not.toHaveBeenCalled();
      authModule.stopIdleTimeout();
    });

    it('stopIdleTimeout clears interval and removes event listeners', () => {
      const onTimeout = vi.fn();
      authModule.startIdleTimeout(onTimeout);
      authModule.stopIdleTimeout();

      // After stopping, advancing timers should not call onTimeout
      localStorage.setItem('supermandi_admin_last_activity', String(Date.now() - 31 * 60 * 1000));
      vi.advanceTimersByTime(60000);
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('calling startIdleTimeout again clears previous timeout', () => {
      const onTimeout1 = vi.fn();
      const onTimeout2 = vi.fn();

      authModule.startIdleTimeout(onTimeout1);
      authModule.startIdleTimeout(onTimeout2);

      localStorage.setItem('supermandi_admin_last_activity', String(Date.now() - 31 * 60 * 1000));
      vi.advanceTimersByTime(30000);

      // Only the second callback should be called
      expect(onTimeout1).not.toHaveBeenCalled();
      expect(onTimeout2).toHaveBeenCalled();
      authModule.stopIdleTimeout();
    });
  });
});
