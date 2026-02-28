/**
 * ENV-001: Config Health Indicator Component
 *
 * Displays current environment configuration status.
 * Shows API URL, Firebase configuration status, and version info.
 * Only visible in development mode or when there's a configuration error.
 */

import { useEffect, useState } from 'react';

interface ConfigStatus {
  apiBaseUrl: string;
  firebaseConfigured: boolean;
  gitSha: string;
  buildTime: string;
  isValid: boolean;
  errors: string[];
}

function checkConfig(): ConfigStatus {
  const errors: string[] = [];

  // Check API base URL
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  if (!apiBaseUrl) {
    errors.push('VITE_API_BASE_URL is not configured');
  }

  // Check Firebase config
  const firebaseApiKey = import.meta.env.VITE_FIREBASE_API_KEY || '';
  const firebaseProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || '';
  const firebaseConfigured = Boolean(firebaseApiKey && firebaseProjectId);
  if (!firebaseConfigured) {
    errors.push('Firebase is not fully configured');
  }

  // Version info
  const gitSha = import.meta.env.VITE_GIT_SHA || 'dev';
  const buildTime = import.meta.env.VITE_BUILD_TIME || new Date().toISOString();

  return {
    apiBaseUrl: apiBaseUrl || 'NOT CONFIGURED',
    firebaseConfigured,
    gitSha,
    buildTime,
    isValid: errors.length === 0,
    errors,
  };
}

export function ConfigHealth() {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const status = checkConfig();
    setConfig(status);

    // Only show banner if there are errors or in development
    if (!status.isValid || import.meta.env.DEV) {
      setVisible(true);
    }
  }, []);

  // Don't render if not visible or no config errors in production
  if (!visible || !config) {
    return null;
  }

  // In production, only show if there are errors
  if (!import.meta.env.DEV && config.isValid) {
    return null;
  }

  return (
    <div
      className="config-health"
      style={{ backgroundColor: config.isValid ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)' }}
    >
      <div>
        <strong>Config:</strong> API: {config.apiBaseUrl} | Firebase: {config.firebaseConfigured ? 'OK' : 'NOT CONFIGURED'} | SHA: {config.gitSha}
      </div>
      <button
        onClick={() => setVisible(false)}
        className="config-health-dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}

/**
 * Hook to get current config status
 */
export function useConfigHealth() {
  const [config, setConfig] = useState<ConfigStatus | null>(null);

  useEffect(() => {
    setConfig(checkConfig());
  }, []);

  return config;
}

/**
 * Get config info for debugging
 */
export function getConfigInfo(): ConfigStatus {
  return checkConfig();
}

export default ConfigHealth;
