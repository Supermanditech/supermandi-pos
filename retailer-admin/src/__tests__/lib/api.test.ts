import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  authFetch,
  parseJsonResponse,
  safeJson,
  safeJsonWithError,
  hasAuthCookie,
  logoutApi,
  onAuthFailure,
  createRetailerApplication,
  verifyRetailerOtp,
  lookupRetailerRegistration,
} from '../../lib/api';

// Store original fetch
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// Helper to create mock Response
function mockResponse(body: unknown, init?: ResponseInit): Response {
  const responseInit = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  };
  const res = new Response(JSON.stringify(body), responseInit);
  return res;
}

// ── authFetch ─────────────────────────────────────────────────────────────

describe('authFetch', () => {
  it('sends request with credentials include', async () => {
    const mockRes = mockResponse({ success: true });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

    await authFetch('/api/v1/retailer-admin/store', 'test-token');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1]).toMatchObject({
      credentials: 'include',
      cache: 'no-store',
    });
  });

  it('adds Authorization header when accessToken provided', async () => {
    const mockRes = mockResponse({ success: true });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

    await authFetch('/api/v1/retailer-admin/store', 'my-token-123');

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers).toMatchObject({
      Authorization: 'Bearer my-token-123',
    });
  });

  it('does not add Authorization header when token is null', async () => {
    const mockRes = mockResponse({ success: true });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

    await authFetch('/api/v1/retailer-admin/store', null);

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers.Authorization).toBeUndefined();
  });

  it('adds Content-Type header when body is provided', async () => {
    const mockRes = mockResponse({ success: true });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

    await authFetch('/api/v1/retailer-admin/store', 'token', {
      method: 'POST',
      body: JSON.stringify({ data: 'test' }),
    });

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers['Content-Type']).toBe('application/json');
  });

  it('notifies auth failure listeners on 401 for retailer-admin non-auth requests', async () => {
    const mockRes = mockResponse({ error: 'Unauthorized' }, { status: 401 });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

    const listener = vi.fn();
    const unsubscribe = onAuthFailure(listener);

    await authFetch('/api/v1/retailer-admin/store', 'token');

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does NOT notify auth failure on 401 for auth requests', async () => {
    const mockRes = mockResponse({ error: 'Unauthorized' }, { status: 401 });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

    const listener = vi.fn();
    const unsubscribe = onAuthFailure(listener);

    await authFetch('/api/v1/retailer-admin/auth/login', 'token');

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  // RET-C4-001: Broadened 401 handling — all /api/ paths now trigger logout
  it('notifies auth failure on 401 for any /api/ path (not just retailer-admin)', async () => {
    const mockRes = mockResponse({ error: 'Unauthorized' }, { status: 401 });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

    const listener = vi.fn();
    const unsubscribe = onAuthFailure(listener);

    await authFetch('/api/v1/some-other-service/data', 'token');

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does NOT notify auth failure on 401 for non-api paths', async () => {
    const mockRes = mockResponse({ error: 'Unauthorized' }, { status: 401 });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

    const listener = vi.fn();
    const unsubscribe = onAuthFailure(listener);

    await authFetch('/some-external-url', 'token');

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('returns the response object', async () => {
    const mockRes = mockResponse({ data: 'hello' });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

    const result = await authFetch('/api/v1/retailer-admin/store', 'token');
    expect(result).toBe(mockRes);
  });

  it('handles timeout via AbortController', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, opts?: RequestInit) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve(mockResponse({})), 100000);
          opts?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        })
    );

    // Use very short timeout
    const promise = authFetch('/api/v1/retailer-admin/store', 'token', {
      timeoutMs: 1,
    } as any);

    await expect(promise).rejects.toThrow();
  });

  it('cleans up listener via returned unsubscribe function', async () => {
    const listener = vi.fn();
    const unsubscribe = onAuthFailure(listener);

    // Unsubscribe before triggering 401
    unsubscribe();

    const mockRes = mockResponse({}, { status: 401 });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockRes);

    await authFetch('/api/v1/retailer-admin/store', 'token');
    expect(listener).not.toHaveBeenCalled();
  });
});

// ── parseJsonResponse ────────────────────────────────────────────────────

describe('parseJsonResponse', () => {
  it('parses successful JSON response', async () => {
    const res = mockResponse({ data: { id: '1', name: 'Test' } });
    const result = await parseJsonResponse(res);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ id: '1', name: 'Test' });
  });

  it('returns error for non-ok response', async () => {
    const res = mockResponse(
      { error: { code: 'NOT_FOUND', message: 'Resource not found' } },
      { status: 404 }
    );
    const result = await parseJsonResponse(res);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
    expect(result.error?.message).toBe('Resource not found');
  });

  it('returns unknown error for non-ok without error object', async () => {
    const res = mockResponse({ message: 'fail' }, { status: 500 });
    const result = await parseJsonResponse(res);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN');
  });

  it('handles parse error gracefully', async () => {
    const res = new Response('not json', { status: 200 });
    const result = await parseJsonResponse(res);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PARSE_ERROR');
  });

  it('extracts data from data wrapper', async () => {
    const res = mockResponse({ data: [1, 2, 3] });
    const result = await parseJsonResponse<number[]>(res);
    expect(result.data).toEqual([1, 2, 3]);
  });

  it('falls back to full json when no data wrapper', async () => {
    const res = mockResponse({ id: '123', name: 'direct' });
    const result = await parseJsonResponse(res);
    expect(result.data).toEqual({ id: '123', name: 'direct' });
  });
});

// ── safeJson ─────────────────────────────────────────────────────────────

describe('safeJson', () => {
  it('returns parsed JSON for valid response', async () => {
    const res = mockResponse({ key: 'value' });
    const result = await safeJson(res);
    expect(result).toEqual({ key: 'value' });
  });

  it('returns null fallback for non-JSON response', async () => {
    const res = new Response('<html>Error</html>', {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await safeJson(res);
    expect(result).toBeNull();
    warnSpy.mockRestore();
  });

  it('returns custom fallback when parse fails', async () => {
    const res = new Response('bad', { status: 500 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await safeJson(res, { default: true });
    expect(result).toEqual({ default: true });
    warnSpy.mockRestore();
  });
});

// ── safeJsonWithError ────────────────────────────────────────────────────

describe('safeJsonWithError', () => {
  it('returns data for ok response', async () => {
    const res = mockResponse({ value: 42 });
    const result = await safeJsonWithError(res);
    expect(result.data).toEqual({ value: 42 });
    expect(result.error).toBeNull();
  });

  it('returns error for non-ok response with error object', async () => {
    const res = mockResponse(
      { error: { code: 'INVALID', message: 'Bad request' } },
      { status: 400 }
    );
    const result = await safeJsonWithError(res);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('INVALID');
    expect(result.error?.message).toBe('Bad request');
  });

  it('returns error for non-ok response with message field', async () => {
    const res = mockResponse({ message: 'Something failed' }, { status: 422 });
    const result = await safeJsonWithError(res);
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Something failed');
  });

  it('returns parse error for non-JSON 500 response', async () => {
    const res = new Response('<html>500</html>', { status: 500 });
    const result = await safeJsonWithError(res);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('PARSE_ERROR');
    expect(result.error?.message).toContain('Server error');
  });

  it('returns parse error for non-JSON 400 response', async () => {
    const res = new Response('bad', { status: 400 });
    const result = await safeJsonWithError(res);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('PARSE_ERROR');
    expect(result.error?.message).toContain('parse');
  });
});

// ── hasAuthCookie ────────────────────────────────────────────────────────

describe('hasAuthCookie', () => {
  it('returns true when sm_auth cookie is present', () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'sm_auth=abc123; other=val',
    });
    expect(hasAuthCookie()).toBe(true);
  });

  it('returns false when sm_auth cookie is absent', () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'other=val; session=xyz',
    });
    expect(hasAuthCookie()).toBe(false);
  });

  it('returns false when no cookies exist', () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
    expect(hasAuthCookie()).toBe(false);
  });
});

// ── logoutApi ────────────────────────────────────────────────────────────

describe('logoutApi', () => {
  it('sends POST to logout endpoint', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));

    await logoutApi();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('/api/v1/retailer-admin/auth/logout');
    expect(callArgs[1].method).toBe('POST');
    expect(callArgs[1].credentials).toBe('include');
  });

  it('does not throw when fetch fails (fire-and-forget)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    // Should not throw
    await expect(logoutApi()).resolves.toBeUndefined();
    warnSpy.mockRestore();
  });
});

// ── createRetailerApplication ────────────────────────────────────────────

describe('createRetailerApplication', () => {
  it('sends POST with application data', async () => {
    const mockApp = {
      success: true,
      application: { id: 'app-1', status: 'DRAFT' },
      nextStep: 'VERIFY_PHONE',
      message: 'Created',
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse(mockApp));

    const result = await createRetailerApplication({
      phone: '+919876543210',
      businessName: 'My Store',
      ownerName: 'Owner',
      gstin: '22AAAAA0000A1Z5',
    });

    expect(result.success).toBe(true);
    expect(result.application.id).toBe('app-1');

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].method).toBe('POST');
    expect(callArgs[1].credentials).toBe('include');
    const body = JSON.parse(callArgs[1].body);
    expect(body.phone).toBe('+919876543210');
    expect(body.businessName).toBe('My Store');
  });

  it('throws on non-ok response', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ error: { message: 'Phone already registered' } }, { status: 409 })
    );

    await expect(createRetailerApplication({
      phone: '+919876543210',
      businessName: 'Store',
      ownerName: 'Owner',
      gstin: '',
    })).rejects.toThrow('Phone already registered');
    warnSpy.mockRestore();
  });

  it('throws generic error when no error message', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({}, { status: 500 })
    );

    await expect(createRetailerApplication({
      phone: '+91',
      businessName: 'S',
      ownerName: 'O',
      gstin: '',
    })).rejects.toThrow(/Registration failed/);
    warnSpy.mockRestore();
  });
});

// ── verifyRetailerOtp ────────────────────────────────────────────────────

describe('verifyRetailerOtp', () => {
  it('sends POST with idToken and applicationId', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ success: true, nextStep: 'UPLOAD_DOCUMENTS', message: 'Verified' })
    );

    const result = await verifyRetailerOtp({
      idToken: 'firebase-id-token',
      applicationId: 'app-123',
    });

    expect(result.success).toBe(true);
    expect(result.nextStep).toBe('UPLOAD_DOCUMENTS');

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.idToken).toBe('firebase-id-token');
    expect(body.applicationId).toBe('app-123');
  });

  it('throws on failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ error: { message: 'Invalid OTP' } }, { status: 400 })
    );

    await expect(verifyRetailerOtp({
      idToken: 'bad',
      applicationId: 'app-1',
    })).rejects.toThrow('Invalid OTP');
    warnSpy.mockRestore();
  });
});

// ── lookupRetailerRegistration ───────────────────────────────────────────

describe('lookupRetailerRegistration', () => {
  it('sends POST with phone number (no PII in URL)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ exists: true, application_id: 'app-x', status: 'ACTIVE', action: 'LOGIN_ALLOWED' })
    );

    const result = await lookupRetailerRegistration('+919876543210');

    expect(result.exists).toBe(true);
    expect(result.action).toBe('LOGIN_ALLOWED');

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].method).toBe('POST');
    const body = JSON.parse(callArgs[1].body);
    expect(body.phone).toBe('+919876543210');
  });

  it('returns non-existent lookup result', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ exists: false, action: 'REGISTER_REQUIRED' })
    );

    const result = await lookupRetailerRegistration('+910000000000');
    expect(result.exists).toBe(false);
    expect(result.action).toBe('REGISTER_REQUIRED');
  });

  it('throws on server error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({}, { status: 500 })
    );

    await expect(lookupRetailerRegistration('+91x')).rejects.toThrow(/Lookup failed/);
    warnSpy.mockRestore();
  });
});
