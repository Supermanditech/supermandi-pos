import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RetailerOnboardingPage from '../pages/RetailerOnboardingPage';

vi.mock('../lib/firebase', () => ({
  setupRecaptcha: vi.fn(),
  sendOtp: vi.fn().mockResolvedValue(true),
  verifyOtp: vi.fn().mockResolvedValue('mock-id-token'),
  isFirebaseReady: vi.fn().mockReturnValue(true),
  cleanup: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  API_GATEWAY_BASE: 'http://localhost:3000',
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

vi.mock('../components/BuildStamp', () => ({
  BuildStamp: () => <span data-testid="build-stamp">v1.0</span>,
}));

describe('RetailerOnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial phone step', () => {
    render(<MemoryRouter><RetailerOnboardingPage /></MemoryRouter>);
    // Should show phone number input
    const phoneInput = screen.getByPlaceholderText(/phone|mobile|9876/i);
    expect(phoneInput).toBeInTheDocument();
  });

  it('renders branding', () => {
    render(<MemoryRouter><RetailerOnboardingPage /></MemoryRouter>);
    // "SuperMandi" appears in multiple places (header logo, footer copyright, subtitle text)
    const brandingElems = screen.getAllByText(/SuperMandi/i);
    expect(brandingElems.length).toBeGreaterThan(0);
  });

  it('renders build stamp', () => {
    render(<MemoryRouter><RetailerOnboardingPage /></MemoryRouter>);
    expect(screen.getByTestId('build-stamp')).toBeInTheDocument();
  });

  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><RetailerOnboardingPage /></MemoryRouter>);
    expect(container.firstChild).toBeTruthy();
  });
});
