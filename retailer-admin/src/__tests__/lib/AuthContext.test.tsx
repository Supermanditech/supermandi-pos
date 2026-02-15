import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../lib/AuthContext';
import React from 'react';

// Mock api module
vi.mock('../../lib/api', () => ({
  onAuthFailure: vi.fn((listener: () => void) => {
    (globalThis as any).__authFailureListener = listener;
    return vi.fn(); // unsubscribe
  }),
  API_GATEWAY_BASE: 'http://localhost:3000',
  logoutApi: vi.fn(),
  hasAuthCookie: vi.fn(() => false),
  safeJson: vi.fn(),
}));

import { logoutApi, hasAuthCookie, safeJson } from '../../lib/api';

const mockedHasAuthCookie = vi.mocked(hasAuthCookie);
const mockedLogoutApi = vi.mocked(logoutApi);
const mockedSafeJson = vi.mocked(safeJson);

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
    // Set last activity to > 30 minutes ago
    localStorage.setItem(`retailer_${storeId}_last_activity`, String(Date.now() - 31 * 60 * 1000));

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
