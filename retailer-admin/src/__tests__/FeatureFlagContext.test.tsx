import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, renderHook } from '@testing-library/react';
import { FeatureFlagProvider, useFeatureFlags, useFeatureFlag } from '../lib/FeatureFlagContext';

const mockAuthFetch = vi.fn();

vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}));

let mockIsAuthenticated = true;
let mockAccessToken: string | null = 'test-token';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({
    accessToken: mockAccessToken,
    isAuthenticated: mockIsAuthenticated,
  }),
}));

describe('FeatureFlagContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    mockAccessToken = 'test-token';
  });

  describe('FeatureFlagProvider', () => {
    it('renders children', () => {
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { features: {} } }),
      });
      render(
        <FeatureFlagProvider>
          <div data-testid="child">Child</div>
        </FeatureFlagProvider>
      );
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('fetches flags when authenticated', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { features: { buyEnabled: false, voiceEnabled: true } },
        }),
      });
      render(
        <FeatureFlagProvider>
          <FlagDisplay />
        </FeatureFlagProvider>
      );
      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalledWith(
          '/api/v1/retailer-admin/feature-flags',
          'test-token'
        );
      });
    });

    it('uses default flags when not authenticated', async () => {
      mockIsAuthenticated = false;
      mockAccessToken = null;
      render(
        <FeatureFlagProvider>
          <FlagDisplay />
        </FeatureFlagProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });
      // Should not have called the API
      expect(mockAuthFetch).not.toHaveBeenCalled();
    });

    it('uses default flags on network error', async () => {
      mockAuthFetch.mockRejectedValue(new Error('Network fail'));
      render(
        <FeatureFlagProvider>
          <FlagDisplay />
        </FeatureFlagProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });
    });
  });
});

// Helper component to display flag context values in tests
function FlagDisplay() {
  const { flags, loading } = useFeatureFlags();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="buyEnabled">{String(flags.buyEnabled)}</span>
      <span data-testid="voiceEnabled">{String(flags.voiceEnabled)}</span>
    </div>
  );
}
