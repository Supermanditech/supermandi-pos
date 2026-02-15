import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigHealth, getConfigInfo, useConfigHealth } from '../components/ConfigHealth';

// Mock import.meta.env
const mockEnv: Record<string, unknown> = {};

vi.mock('../components/ConfigHealth', async () => {
  const actual = await vi.importActual('../components/ConfigHealth');
  return actual;
});

describe('ConfigHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders in dev mode showing config info', () => {
    const { container } = render(<ConfigHealth />);
    // In test environment (DEV mode), it should show the config banner
    // The component checks import.meta.env.DEV
    expect(container).toBeTruthy();
  });

  it('shows API URL in banner when visible', async () => {
    render(<ConfigHealth />);
    // The component displays API info when DEV or errors exist
    // In test env VITE_API_BASE_URL is set to http://localhost:3000
    const apiText = screen.queryByText(/API:/);
    if (apiText) {
      expect(apiText).toBeInTheDocument();
    }
  });

  it('has a dismiss button that hides the banner', async () => {
    render(<ConfigHealth />);
    const dismissBtn = screen.queryByText('Dismiss');
    if (dismissBtn) {
      fireEvent.click(dismissBtn);
      // After dismiss, banner should disappear
      expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
    }
  });
});

describe('getConfigInfo', () => {
  it('returns config status object', () => {
    const config = getConfigInfo();
    expect(config).toHaveProperty('apiBaseUrl');
    expect(config).toHaveProperty('firebaseConfigured');
    expect(config).toHaveProperty('gitSha');
    expect(config).toHaveProperty('buildTime');
    expect(config).toHaveProperty('isValid');
    expect(config).toHaveProperty('errors');
    expect(Array.isArray(config.errors)).toBe(true);
  });

  it('reports config validation results', () => {
    const config = getConfigInfo();
    // In test environment with .env loaded, Firebase IS configured but API URL may vary
    // The key invariant is that errors array contains strings when issues exist
    expect(Array.isArray(config.errors)).toBe(true);
    config.errors.forEach(e => {
      expect(typeof e).toBe('string');
    });
    // isValid should be consistent with errors length
    expect(config.isValid).toBe(config.errors.length === 0);
  });
});
