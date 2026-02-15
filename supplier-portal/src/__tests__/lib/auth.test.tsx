import { renderHook, waitFor } from '@testing-library/react';
import { useAuth, AuthProvider } from '../../lib/auth';
import * as api from '../../lib/api';

// Mock Next.js router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Mock API functions
jest.mock('../../lib/api', () => ({
  clearAuthToken: jest.fn(),
  logoutApi: jest.fn(),
  getSupplierProfile: jest.fn(),
  refreshAccessToken: jest.fn(),
  hasAuthCookie: jest.fn(),
}));

describe('Auth Context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('provides auth context values', async () => {
    (api.hasAuthCookie as jest.Mock).mockReturnValue(false);

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current).toHaveProperty('supplier');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('isAuthenticated');
    expect(result.current).toHaveProperty('logout');
    expect(result.current).toHaveProperty('refreshProfile');
  });

  it('sets supplier when auth cookie exists and profile fetch succeeds', async () => {
    const mockSupplier = {
      id: '123',
      name: 'Test Supplier',
      email: 'test@example.com',
    };

    (api.hasAuthCookie as jest.Mock).mockReturnValue(true);
    (api.getSupplierProfile as jest.Mock).mockResolvedValue(mockSupplier);

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.supplier).toEqual(mockSupplier);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('clears supplier when no auth cookie exists', async () => {
    (api.hasAuthCookie as jest.Mock).mockReturnValue(false);

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.supplier).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('handles profile fetch failure by clearing auth', async () => {
    (api.hasAuthCookie as jest.Mock).mockReturnValue(true);
    (api.getSupplierProfile as jest.Mock).mockRejectedValue(new Error('Fetch failed'));

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.supplier).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(api.clearAuthToken).toHaveBeenCalled();
  });

  it('logout clears auth and redirects to login', async () => {
    (api.hasAuthCookie as jest.Mock).mockReturnValue(false);

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    result.current.logout();

    expect(api.logoutApi).toHaveBeenCalled();
    expect(api.clearAuthToken).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('checks idle timeout and logs out if expired', async () => {
    const now = Date.now();
    const thirtyOneMinutesAgo = now - 31 * 60 * 1000;

    localStorage.setItem('supplier_last_activity', String(thirtyOneMinutesAgo));
    (api.hasAuthCookie as jest.Mock).mockReturnValue(true);

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.supplier).toBeNull();
    expect(api.clearAuthToken).toHaveBeenCalled();
    expect(localStorage.getItem('supplier_last_activity')).toBeNull();
  });

  it('allows login if last activity is within idle timeout', async () => {
    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000;
    const mockSupplier = {
      id: '123',
      name: 'Test Supplier',
      email: 'test@example.com',
    };

    localStorage.setItem('supplier_last_activity', String(tenMinutesAgo));
    (api.hasAuthCookie as jest.Mock).mockReturnValue(true);
    (api.getSupplierProfile as jest.Mock).mockResolvedValue(mockSupplier);

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.supplier).toEqual(mockSupplier);
    expect(result.current.isAuthenticated).toBe(true);
  });
});
