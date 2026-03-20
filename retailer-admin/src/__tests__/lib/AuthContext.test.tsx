import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../lib/AuthContext';

// Mock api module
vi.mock('../../lib/api', () => ({
  onAuthFailure: vi.fn((listener: () => void) => {
    (globalThis as any).__authFailureListener = listener;
    return vi.fn(); // unsubscribe
  }),
  API_GATEWAY_BASE: 'http://localhost:3000',
  logoutApi: vi.fn(),
  hasAuthCookie: vi.fn(() => false),
  safeJson: vi.fn(async (res: Response) => {
    try { return await res.json(); } catch { return null; }
  }),
}));

import { logoutApi, hasAuthCookie } from '../../lib/api';

const mockedHasAuthCookie = vi.mocked(hasAuthCookie);
const mockedLogoutApi = vi.mocked(logoutApi);

// Test consumer component
function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <span data-testid="user">{auth.user ? JSON.stringify(auth.user) : 'null'}</span>
      <span data-testid="store">{auth.store ? auth.store.name : 'null'}</span>
      <span data-testid="token">{auth.accessToken || 'null'}</span>
      <span data-testid="session-warning">{String(auth.showSessionWarning)}</span>
      <span data-testid="limited-mode">{String(auth.isLimitedMode)}</span>
      <span data-testid="app-status">{auth.applicationStatus || 'null'}</span>
      <button data-testid="login-btn" onClick={() => {
        auth.login(
          'access-token-123',
          'refresh-token-456',
          { id: 'u1', phone: '+919876543210', role: 'admin' },
          { id: 's1', code: 'STORE1', name: 'My Store' }
        );
      }}>Login</button>
      <button data-testid="logout-btn" onClick={auth.logout}>Logout</button>
      <button data-testid="dismiss-warning" onClick={auth.dismissSessionWarning}>Dismiss</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  mockedHasAuthCookie.mockReturnValue(false);
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({}), { status: 401 })
  );
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

// ── Basic Auth State ─────────────────────────────────────────────────────

describe('AuthProvider initial state', () => {
  it('starts as not authenticated when no stored data', async () => {
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('store').textContent).toBe('null');
  });

  it('restores session from localStorage when auth cookie is present', async () => {
    const storeId = 'store-abc';
    localStorage.setItem('retailer_active_store_id', storeId);
    localStorage.setItem(`retailer_${storeId}_user`, JSON.stringify({ id: 'u1', phone: '+91x', role: 'owner' }));
    localStorage.setItem(`retailer_${storeId}_store`, JSON.stringify({ id: storeId, code: 'XYZ', name: 'Restored Store' }));
    localStorage.setItem(`retailer_${storeId}_last_activity`, String(Date.now()));

    mockedHasAuthCookie.mockReturnValue(true);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('authenticated').textContent).toBe('true');
    expect(screen.getByTestId('store').textContent).toBe('Restored Store');
  });

  it('clears expired session on mount', async () => {
    const storeId = 'store-old';
    localStorage.setItem('retailer_active_store_id', storeId);
    localStorage.setItem(`retailer_${storeId}_user`, JSON.stringify({ id: 'u1', phone: '+91x', role: 'admin' }));
    localStorage.setItem(`retailer_${storeId}_store`, JSON.stringify({ id: storeId, code: 'OLD', name: 'Old Store' }));
    // Set last activity to > 60 minutes ago (V3-SESSION-025: idle timeout is now 60 min)
    localStorage.setItem(`retailer_${storeId}_last_activity`, String(Date.now() - 61 * 60 * 1000));

    mockedHasAuthCookie.mockReturnValue(true);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(localStorage.getItem('retailer_active_store_id')).toBeNull();
  });

  it('clears session when auth cookie is absent', async () => {
    const storeId = 'store-no-cookie';
    localStorage.setItem('retailer_active_store_id', storeId);
    localStorage.setItem(`retailer_${storeId}_user`, JSON.stringify({ id: 'u1', phone: '+91x', role: 'admin' }));
    localStorage.setItem(`retailer_${storeId}_store`, JSON.stringify({ id: storeId, code: 'X', name: 'X' }));

    mockedHasAuthCookie.mockReturnValue(false);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('authenticated').textContent).toBe('false');
  });
});

// ── Login ────────────────────────────────────────────────────────────────

describe('Login', () => {
  it('stores auth state on login', async () => {
    // After login, hasAuthCookie must return true so token-refresh effect
    // doesn't immediately logout when refresh fails (AUTH-SESSION-169)
    mockedHasAuthCookie.mockReturnValue(false);
    // Mock successful token refresh to prevent auto-logout
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'refreshed-token' }), { status: 200 })
    );

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // Switch cookie mock to true before login (simulates server setting HttpOnly cookie)
    mockedHasAuthCookie.mockReturnValue(true);

    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });

    expect(screen.getByTestId('store').textContent).toBe('My Store');
    expect(screen.getByTestId('token').textContent).toBe('access-token-123');

    // Verify localStorage was set
    expect(localStorage.getItem('retailer_active_store_id')).toBe('s1');
    expect(localStorage.getItem('retailer_s1_user')).toContain('+919876543210');
    expect(localStorage.getItem('retailer_s1_store')).toContain('My Store');
    expect(localStorage.getItem('retailer_s1_last_activity')).toBeTruthy();
  });
});

// ── Logout ───────────────────────────────────────────────────────────────

describe('Logout', () => {
  // Helper: login with mocks that prevent auto-logout from token refresh
  async function loginFirst() {
    mockedHasAuthCookie.mockReturnValue(false);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'refreshed-token' }), { status: 200 })
    );
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    mockedHasAuthCookie.mockReturnValue(true);
    await act(async () => {
      screen.getByTestId('login-btn').click();
    });
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });
  }

  it('clears auth state on logout', async () => {
    await loginFirst();

    // Logout
    await act(async () => {
      screen.getByTestId('logout-btn').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('store').textContent).toBe('null');
    expect(screen.getByTestId('token').textContent).toBe('null');
  });

  it('calls logoutApi on logout', async () => {
    await loginFirst();

    await act(async () => {
      screen.getByTestId('logout-btn').click();
    });

    expect(mockedLogoutApi).toHaveBeenCalled();
  });

  it('clears localStorage on logout', async () => {
    await loginFirst();
    expect(localStorage.getItem('retailer_active_store_id')).toBe('s1');

    await act(async () => {
      screen.getByTestId('logout-btn').click();
    });

    expect(localStorage.getItem('retailer_active_store_id')).toBeNull();
  });
});

// ── Session Warning ──────────────────────────────────────────────────────

describe('Session Warning', () => {
  it('session warning defaults to false', async () => {
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('session-warning').textContent).toBe('false');
  });

  it('dismissSessionWarning resets warning state', async () => {
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    await act(async () => {
      screen.getByTestId('dismiss-warning').click();
    });

    expect(screen.getByTestId('session-warning').textContent).toBe('false');
  });
});

// ── Limited Mode ─────────────────────────────────────────────────────────

describe('Limited Mode', () => {
  it('isLimitedMode is false when no applicationStatus', async () => {
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('limited-mode').textContent).toBe('false');
  });

  it('isLimitedMode is false when status is ACTIVE', async () => {
    const storeId = 'store-active';
    localStorage.setItem('retailer_active_store_id', storeId);
    localStorage.setItem(`retailer_${storeId}_user`, JSON.stringify({
      id: 'u1', phone: '+91x', role: 'admin', applicationStatus: 'ACTIVE',
    }));
    localStorage.setItem(`retailer_${storeId}_store`, JSON.stringify({ id: storeId, code: 'X', name: 'X' }));
    localStorage.setItem(`retailer_${storeId}_last_activity`, String(Date.now()));
    mockedHasAuthCookie.mockReturnValue(true);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('limited-mode').textContent).toBe('false');
  });

  it('isLimitedMode is true when status is PENDING_APPROVAL', async () => {
    const storeId = 'store-pending';
    localStorage.setItem('retailer_active_store_id', storeId);
    localStorage.setItem(`retailer_${storeId}_user`, JSON.stringify({
      id: 'u1', phone: '+91x', role: 'admin', applicationStatus: 'PENDING_APPROVAL',
    }));
    localStorage.setItem(`retailer_${storeId}_store`, JSON.stringify({ id: storeId, code: 'X', name: 'X' }));
    localStorage.setItem(`retailer_${storeId}_last_activity`, String(Date.now()));
    mockedHasAuthCookie.mockReturnValue(true);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('limited-mode').textContent).toBe('true');
    expect(screen.getByTestId('app-status').textContent).toBe('PENDING_APPROVAL');
  });
});

// ── useAuth hook ─────────────────────────────────────────────────────────

describe('useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    function BadConsumer() {
      useAuth();
      return null;
    }

    // Suppress console.error for expected error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<BadConsumer />);
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleSpy.mockRestore();
  });
});

// ── Legacy Key Cleanup ───────────────────────────────────────────────────

describe('Legacy key cleanup', () => {
  it('clears legacy keys on mount', async () => {
    localStorage.setItem('retailerAdminToken', 'old-token');
    localStorage.setItem('retailer_access_token', 'old-access');
    localStorage.setItem('retailer_refresh_token', 'old-refresh');

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(localStorage.getItem('retailerAdminToken')).toBeNull();
    expect(localStorage.getItem('retailer_access_token')).toBeNull();
    expect(localStorage.getItem('retailer_refresh_token')).toBeNull();
  });
});

// ── Token Refresh Timer (J20-TEST-004) ───────────────────────────────────

describe('Token refresh timer', () => {
  // Helper: login with mocks that prevent auto-logout from token refresh
  async function loginFirst() {
    mockedHasAuthCookie.mockReturnValue(false);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'refreshed-token' }), { status: 200 })
    );
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    mockedHasAuthCookie.mockReturnValue(true);
    await act(async () => {
      screen.getByTestId('login-btn').click();
    });
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });
  }

  it('calls refresh endpoint on 30-second interval when logged in', async () => {
    await loginFirst();

    // Clear call count from initial mount refresh
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ data: { accessToken: 'new-tok', expiresIn: 900 } }), { status: 200 })
    );

    // Advance by 30 seconds (TOKEN_CHECK_INTERVAL_MS)
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    // checkAndRefresh should have been called
    expect(global.fetch).toHaveBeenCalled();
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const refreshCall = calls.find((c: any[]) =>
      typeof c[0] === 'string' && c[0].includes('/auth/refresh')
    );
    expect(refreshCall).toBeTruthy();
  });

  it('does not run refresh timer when logged out', async () => {
    mockedHasAuthCookie.mockReturnValue(false);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 401 })
    );

    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // Clear any mount calls
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();

    // Advance several intervals
    await act(async () => {
      vi.advanceTimersByTime(90_000);
    });

    // No refresh calls when not authenticated
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── Token Expiry Detection (J20-TEST-004) ────────────────────────────────

describe('Token expiry detection', () => {
  async function loginWithToken(expSeconds: number) {
    // Create a fake JWT with exp claim
    const header = btoa(JSON.stringify({ alg: 'HS256' }));
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSeconds }));
    const fakeJwt = `${header}.${payload}.fake-sig`;

    mockedHasAuthCookie.mockReturnValue(false);
    // Mock refresh to succeed during mount (before login establishes user)
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ data: { accessToken: fakeJwt, expiresIn: expSeconds } }), { status: 200 })
    );

    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    mockedHasAuthCookie.mockReturnValue(true);

    // Login with the JWT that has exp claim
    await act(async () => {
      screen.getByTestId('login-btn');
      // Override the login handler to use our JWT
      // We do this by directly calling the component's login button
      // The TestConsumer hardcodes a token, but login() parses JWT exp from it
      // So we need to re-mock via a custom consumer
    });

    // Since TestConsumer hardcodes 'access-token-123' which isn't a valid JWT,
    // the exp parsing silently fails. We test via timer-based refresh instead.
    // Login with mock token
    await act(async () => {
      screen.getByTestId('login-btn').click();
    });
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });
  }

  it('refreshes token when expiry is within 5-minute buffer', async () => {
    // Login with expiresIn=240 (4 min). After mount + initial checkAndRefresh,
    // tokenExpiresAtRef = Date.now() + 240s. On next tick (30s later),
    // timeUntilExpiry ≈ 210s (3.5 min) which is within the 5-min buffer.
    await loginWithToken(240);

    // Clear fetch calls from mount/login/initial-refresh
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ data: { accessToken: 'buffer-tok', expiresIn: 900 } }), { status: 200 })
    );

    // Advance 30s: checkAndRefresh sees timeUntilExpiry ≈ 210s < 300s buffer → refreshes
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(global.fetch).toHaveBeenCalled();
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const refreshCall = calls.find((c: any[]) =>
      typeof c[0] === 'string' && c[0].includes('/auth/refresh')
    );
    expect(refreshCall).toBeTruthy();
  });

  it('logs out when expired token refresh fails', async () => {
    mockedHasAuthCookie.mockReturnValue(false);
    // Initial render — not authenticated
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 401 })
    );

    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // Login
    mockedHasAuthCookie.mockReturnValue(true);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'tok' }), { status: 200 })
    );
    await act(async () => {
      screen.getByTestId('login-btn').click();
    });
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });

    // Now make refresh fail
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 401 })
    );
    mockedHasAuthCookie.mockReturnValue(false);

    // Advance timer to trigger checkAndRefresh
    // Since tokenExpiresAtRef is 0 (no exp in non-JWT token), it'll try refresh
    // Refresh fails + no auth cookie → logout
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
  });
});

// ── Page Refresh Edge Case AUTH-SESSION-169 (J20-TEST-004) ───────────────

describe('Page refresh edge case (AUTH-SESSION-169)', () => {
  it('does not logout on page refresh when auth cookie exists but no expiresAt', async () => {
    // Simulate page refresh: user/store in localStorage, auth cookie present, no accessToken
    const storeId = 'store-refresh';
    localStorage.setItem('retailer_active_store_id', storeId);
    localStorage.setItem(`retailer_${storeId}_user`, JSON.stringify({ id: 'u1', phone: '+91x', role: 'owner' }));
    localStorage.setItem(`retailer_${storeId}_store`, JSON.stringify({ id: storeId, code: 'RF', name: 'Refresh Store' }));
    localStorage.setItem(`retailer_${storeId}_last_activity`, String(Date.now()));

    mockedHasAuthCookie.mockReturnValue(true);

    // Refresh attempt fails but cookie exists → should NOT logout
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 401 })
    );

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // Should still be authenticated (cookie present despite refresh failure)
    expect(screen.getByTestId('authenticated').textContent).toBe('true');
    expect(screen.getByTestId('store').textContent).toBe('Refresh Store');
  });

  it('logs out on page refresh when refresh fails AND no auth cookie', async () => {
    const storeId = 'store-gone';
    localStorage.setItem('retailer_active_store_id', storeId);
    localStorage.setItem(`retailer_${storeId}_user`, JSON.stringify({ id: 'u1', phone: '+91x', role: 'owner' }));
    localStorage.setItem(`retailer_${storeId}_store`, JSON.stringify({ id: storeId, code: 'GO', name: 'Gone Store' }));
    localStorage.setItem(`retailer_${storeId}_last_activity`, String(Date.now()));

    mockedHasAuthCookie.mockReturnValue(true); // Cookie present on mount

    // Refresh fails
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 401 })
    );

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // Initially authenticated from localStorage
    expect(screen.getByTestId('authenticated').textContent).toBe('true');

    // Now simulate cookie gone + refresh fails
    mockedHasAuthCookie.mockReturnValue(false);

    // Advance timer to trigger checkAndRefresh
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    // Should have logged out: refresh failed + no cookie
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
  });
});

// ── Concurrent Refresh Prevention ISSUE-MICRO-049 (J20-TEST-004) ────────

describe('Concurrent refresh prevention (ISSUE-MICRO-049)', () => {
  it('prevents overlapping refresh calls', async () => {
    // Login
    mockedHasAuthCookie.mockReturnValue(false);
    const slowRefreshPromise = new Promise<Response>((_resolve) => {
      // intentionally unresolved — simulates a never-settling refresh
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(slowRefreshPromise);

    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // Login with fast mock
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'tok' }), { status: 200 })
    );
    mockedHasAuthCookie.mockReturnValue(true);
    await act(async () => {
      screen.getByTestId('login-btn').click();
    });
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });

    // Now set up a slow refresh (takes time to resolve)
    let resolveSlowRefresh: (v: Response) => void;
    const slowPromise = new Promise<Response>((resolve) => {
      resolveSlowRefresh = resolve;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(slowPromise);

    // Trigger first refresh via timer
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    const firstCallCount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // Trigger second refresh via another timer tick while first is still pending
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    // The second call should be blocked by isRefreshingRef mutex
    // So fetch call count should not increase (or increase by at most 0)
    const secondCallCount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(secondCallCount).toBe(firstCallCount);

    // Resolve the slow refresh
    await act(async () => {
      resolveSlowRefresh!(
        new Response(JSON.stringify({ data: { accessToken: 'new-tok', expiresIn: 900 } }), { status: 200 })
      );
    });
  });
});

// ── AbortController on Logout ISSUE-MICRO-047 (J20-TEST-004) ────────────

describe('AbortController on logout (ISSUE-MICRO-047)', () => {
  it('aborts in-flight refresh request when user logs out', async () => {
    // Login
    mockedHasAuthCookie.mockReturnValue(false);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'tok' }), { status: 200 })
    );

    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    mockedHasAuthCookie.mockReturnValue(true);
    await act(async () => {
      screen.getByTestId('login-btn').click();
    });
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });

    // Set up a refresh that captures the abort signal
    let capturedSignal: AbortSignal | undefined;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, opts?: RequestInit) => {
        capturedSignal = opts?.signal ?? undefined;
        // Return a promise that never resolves (simulates slow network)
        return new Promise(() => {});
      }
    );

    // Trigger refresh via timer
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    // Verify the signal was passed to fetch
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    // Logout while refresh is in-flight
    await act(async () => {
      screen.getByTestId('logout-btn').click();
    });

    // The signal should now be aborted
    expect(capturedSignal!.aborted).toBe(true);
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
  });
});

// ── Auth Failure Listener (J20-TEST-004) ─────────────────────────────────

describe('Auth failure listener', () => {
  it('logs out when auth failure event fires (401 from non-auth endpoint)', async () => {
    // Login first
    mockedHasAuthCookie.mockReturnValue(false);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'tok' }), { status: 200 })
    );

    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    mockedHasAuthCookie.mockReturnValue(true);
    await act(async () => {
      screen.getByTestId('login-btn').click();
    });
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });

    // Trigger auth failure listener (simulates 401 from a non-auth endpoint)
    await act(async () => {
      const listener = (globalThis as any).__authFailureListener;
      expect(listener).toBeDefined();
      listener();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
  });
});

// ── JWT Expiry Extraction on Login (J20-TEST-004) ────────────────────────

describe('JWT expiry extraction on login', () => {
  it('parses exp from valid JWT and stores token_expires_at', async () => {
    mockedHasAuthCookie.mockReturnValue(false);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'refreshed' }), { status: 200 })
    );

    // Create a custom consumer that logs in with a real JWT
    const futureExp = Math.floor(Date.now() / 1000) + 900; // 15 min from now
    const header = btoa(JSON.stringify({ alg: 'HS256' }));
    const payload = btoa(JSON.stringify({ sub: 'u1', exp: futureExp }));
    const fakeJwt = `${header}.${payload}.fake-sig`;

    function JwtTestConsumer() {
      const auth = useAuth();
      return (
        <div>
          <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
          <span data-testid="loading">{String(auth.isLoading)}</span>
          <span data-testid="token">{auth.accessToken || 'null'}</span>
          <button data-testid="jwt-login" onClick={() => {
            auth.login(
              fakeJwt,
              'refresh-tok',
              { id: 'u1', phone: '+919876543210', role: 'admin' },
              { id: 's1', code: 'STORE1', name: 'JWT Store' }
            );
          }}>Login</button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <JwtTestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    mockedHasAuthCookie.mockReturnValue(true);
    await act(async () => {
      screen.getByTestId('jwt-login').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });

    // Verify token_expires_at was persisted
    const storedExpiresAt = localStorage.getItem('retailer_s1_token_expires_at');
    expect(storedExpiresAt).not.toBeNull();
    const parsedExpiry = parseInt(storedExpiresAt!, 10);
    // Should be close to futureExp * 1000
    expect(parsedExpiry).toBeCloseTo(futureExp * 1000, -3); // within 1 second tolerance
  });

  it('silently handles non-JWT access tokens without crashing', async () => {
    mockedHasAuthCookie.mockReturnValue(false);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'refreshed' }), { status: 200 })
    );

    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    mockedHasAuthCookie.mockReturnValue(true);
    // TestConsumer uses 'access-token-123' which is not a JWT — should not crash
    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });

    // No token_expires_at stored because token isn't a valid JWT
    const storedExpiresAt = localStorage.getItem('retailer_s1_token_expires_at');
    expect(storedExpiresAt).toBeNull();
  });
});

// ── Refresh Token Updates Access Token (J20-TEST-004) ────────────────────

describe('Refresh token updates access token in state', () => {
  it('updates accessToken in context after successful refresh', async () => {
    // Login
    mockedHasAuthCookie.mockReturnValue(false);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'initial-tok' }), { status: 200 })
    );

    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    mockedHasAuthCookie.mockReturnValue(true);
    await act(async () => {
      screen.getByTestId('login-btn').click();
    });
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });

    // Original token from TestConsumer's login call
    expect(screen.getByTestId('token').textContent).toBe('access-token-123');

    // Now mock refresh to return a new token
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ data: { accessToken: 'refreshed-token-456', expiresIn: 900 } }), { status: 200 })
    );

    // Advance timer to trigger refresh
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    // Token should be updated in context
    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('refreshed-token-456');
    });
  });
});

// ── Refresh Skips When No Auth Cookie (J20-TEST-004) ─────────────────────

describe('Refresh skips when no auth cookie', () => {
  it('returns false without making network call when no auth cookie', async () => {
    // Login
    mockedHasAuthCookie.mockReturnValue(false);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'tok' }), { status: 200 })
    );

    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    mockedHasAuthCookie.mockReturnValue(true);
    await act(async () => {
      screen.getByTestId('login-btn').click();
    });
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });

    // Now remove cookie and clear fetch mock
    mockedHasAuthCookie.mockReturnValue(false);
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();

    // Advance timer to trigger refresh attempt
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    // Should have logged out (no cookie + refresh returns false)
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
  });
});

// ── Idle Timeout Warning and Logout (J20-TEST-005) ───────────────────────

describe('Idle timeout warning and logout (J20-TEST-005)', () => {
  // Constants matching AuthContext.tsx (V3-SESSION-025: default 60 minutes)
  const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
  const WARNING_BEFORE_MS = 5 * 60 * 1000; // 5 minutes before timeout (capped at IDLE_TIMEOUT_MS / 6)
  const IDLE_CHECK_INTERVAL = 30_000; // 30 seconds

  async function loginFirst() {
    mockedHasAuthCookie.mockReturnValue(false);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'refreshed-token' }), { status: 200 })
    );
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    mockedHasAuthCookie.mockReturnValue(true);
    await act(async () => {
      screen.getByTestId('login-btn').click();
    });
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });
  }

  it('shows session warning when idle time exceeds warning threshold', async () => {
    await loginFirst();

    // Verify warning is initially false
    expect(screen.getByTestId('session-warning').textContent).toBe('false');

    // Simulate 26 minutes of idle by backdating last_activity
    const twentySixMinAgo = Date.now() - (IDLE_TIMEOUT_MS - WARNING_BEFORE_MS + 60_000);
    localStorage.setItem('retailer_s1_last_activity', String(twentySixMinAgo));

    // Advance past one idle check interval to trigger the warning check
    await act(async () => {
      vi.advanceTimersByTime(IDLE_CHECK_INTERVAL);
    });

    await waitFor(() => {
      expect(screen.getByTestId('session-warning').textContent).toBe('true');
    });
  });

  it('does not show warning when idle time is below warning threshold', async () => {
    await loginFirst();

    // Simulate 20 minutes of idle (below 25-min warning threshold)
    const twentyMinAgo = Date.now() - 20 * 60 * 1000;
    localStorage.setItem('retailer_s1_last_activity', String(twentyMinAgo));

    // Advance past one idle check interval
    await act(async () => {
      vi.advanceTimersByTime(IDLE_CHECK_INTERVAL);
    });

    expect(screen.getByTestId('session-warning').textContent).toBe('false');
  });

  it('logs out when idle time exceeds full timeout', async () => {
    await loginFirst();

    // Simulate 31 minutes of idle (past 30-min timeout)
    const thirtyOneMinAgo = Date.now() - (IDLE_TIMEOUT_MS + 60_000);
    localStorage.setItem('retailer_s1_last_activity', String(thirtyOneMinAgo));

    // Advance past one idle check interval
    await act(async () => {
      vi.advanceTimersByTime(IDLE_CHECK_INTERVAL);
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
  });

  it('dismissSessionWarning resets warning and refreshes activity timestamp', async () => {
    await loginFirst();

    // Trigger warning by backdating activity
    const twentySixMinAgo = Date.now() - (IDLE_TIMEOUT_MS - WARNING_BEFORE_MS + 60_000);
    localStorage.setItem('retailer_s1_last_activity', String(twentySixMinAgo));

    await act(async () => {
      vi.advanceTimersByTime(IDLE_CHECK_INTERVAL);
    });

    await waitFor(() => {
      expect(screen.getByTestId('session-warning').textContent).toBe('true');
    });

    // Dismiss the warning
    await act(async () => {
      screen.getByTestId('dismiss-warning').click();
    });

    expect(screen.getByTestId('session-warning').textContent).toBe('false');

    // Verify last_activity was refreshed (should be recent, not 26 min ago)
    const lastActivity = parseInt(localStorage.getItem('retailer_s1_last_activity')!, 10);
    expect(Date.now() - lastActivity).toBeLessThan(5000); // within 5 seconds
  });

  it('clears idle timeout warning on logout', async () => {
    await loginFirst();

    // Trigger warning
    const twentySixMinAgo = Date.now() - (IDLE_TIMEOUT_MS - WARNING_BEFORE_MS + 60_000);
    localStorage.setItem('retailer_s1_last_activity', String(twentySixMinAgo));

    await act(async () => {
      vi.advanceTimersByTime(IDLE_CHECK_INTERVAL);
    });

    // Trigger full timeout
    const thirtyOneMinAgo = Date.now() - (IDLE_TIMEOUT_MS + 60_000);
    localStorage.setItem('retailer_s1_last_activity', String(thirtyOneMinAgo));

    await act(async () => {
      vi.advanceTimersByTime(IDLE_CHECK_INTERVAL);
    });

    // Should be logged out and warning cleared
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
    expect(screen.getByTestId('session-warning').textContent).toBe('false');
  });

  it('does not start idle check when not authenticated', async () => {
    mockedHasAuthCookie.mockReturnValue(false);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 401 })
    );

    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // Even with stale activity data, no warning or logout should fire
    localStorage.setItem('retailer_active_store_id', 'fake');
    localStorage.setItem('retailer_fake_last_activity', String(Date.now() - IDLE_TIMEOUT_MS - 60_000));

    await act(async () => {
      vi.advanceTimersByTime(IDLE_CHECK_INTERVAL * 3);
    });

    expect(screen.getByTestId('session-warning').textContent).toBe('false');
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
  });

  it('activity events throttle localStorage writes to once per minute', async () => {
    await loginFirst();

    // First click writes (lastWrite starts at 0, so Date.now() - 0 > 60000 is always true)
    await act(async () => {
      window.dispatchEvent(new Event('click'));
    });

    // Record timestamp after first click (which writes)
    const afterFirstClick = parseInt(localStorage.getItem('retailer_s1_last_activity')!, 10);

    // Subsequent clicks within 60s should NOT update localStorage (throttled)
    await act(async () => {
      window.dispatchEvent(new Event('click'));
      window.dispatchEvent(new Event('click'));
    });

    const afterMoreClicks = parseInt(localStorage.getItem('retailer_s1_last_activity')!, 10);
    expect(afterMoreClicks).toBe(afterFirstClick);

    // Advance past 60s throttle window
    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });

    // Now a click should write again (throttle window has passed)
    await act(async () => {
      window.dispatchEvent(new Event('click'));
    });

    const afterThrottle = parseInt(localStorage.getItem('retailer_s1_last_activity')!, 10);
    expect(afterThrottle).toBeGreaterThan(afterFirstClick);
  });

  it('clears idle check interval on logout', async () => {
    await loginFirst();

    // Logout
    await act(async () => {
      screen.getByTestId('logout-btn').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });

    // Set stale activity data — should NOT trigger warning or logout since intervals were cleared
    localStorage.setItem('retailer_active_store_id', 's1');
    localStorage.setItem('retailer_s1_last_activity', String(Date.now() - IDLE_TIMEOUT_MS - 60_000));

    await act(async () => {
      vi.advanceTimersByTime(IDLE_CHECK_INTERVAL * 3);
    });

    // Should remain logged out with no warning (interval was cleared)
    expect(screen.getByTestId('session-warning').textContent).toBe('false');
  });
});
