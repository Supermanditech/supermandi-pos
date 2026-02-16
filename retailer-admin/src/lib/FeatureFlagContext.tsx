// RCAT-FIX-004: Feature flag context for retailer-admin portal
// Fetches flags from backend and provides via React context
// Matches POS feature flag resolution: global defaults + store overrides

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authFetch, safeJson } from './api';
import { useAuth } from './AuthContext';

interface FeatureFlags {
  buyEnabled: boolean;
  reorderEnabled: boolean;
  bnplEnabled: boolean;
  creditEnabled: boolean;
  voiceEnabled: boolean;
  categoryBrowsingEnabled: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  buyEnabled: true,
  reorderEnabled: true,
  bnplEnabled: true,
  creditEnabled: false,
  voiceEnabled: false,
  categoryBrowsingEnabled: true,
};

interface FeatureFlagContextType {
  flags: FeatureFlags;
  loading: boolean;
  refresh: () => void;
}

const FeatureFlagContext = createContext<FeatureFlagContextType>({
  flags: DEFAULT_FLAGS,
  loading: true,
  refresh: () => {},
});

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, isAuthenticated } = useAuth();
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);

  const fetchFlags = useCallback(async () => {
    if (!isAuthenticated) {
      setFlags(DEFAULT_FLAGS);
      setLoading(false);
      return;
    }

    try {
      const res = await authFetch(
        '/api/v1/retailer-admin/feature-flags',
        accessToken
      );
      if (res.ok) {
        const json = await safeJson(res, {} as any);
        if (json.success && json.data?.features) {
          setFlags({ ...DEFAULT_FLAGS, ...json.data.features });
        }
      }
    } catch {
      // Network error — keep defaults
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAuthenticated]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  return (
    <FeatureFlagContext.Provider value={{ flags, loading, refresh: fetchFlags }}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlagContextType {
  return useContext(FeatureFlagContext);
}

export function useFeatureFlag(key: keyof FeatureFlags): boolean {
  const { flags } = useContext(FeatureFlagContext);
  return flags[key] ?? true;
}
