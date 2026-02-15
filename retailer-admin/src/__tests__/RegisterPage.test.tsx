import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegisterPage from '../pages/RegisterPage';

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
  createRetailerApplication: vi.fn(),
  verifyRetailerOtp: vi.fn(),
  uploadDocument: vi.fn(),
  submitRetailerKyc: vi.fn(),
  lookupRetailerRegistration: vi.fn(),
}));

vi.mock('../components/BuildStamp', () => ({
  BuildStamp: () => <span data-testid="build-stamp">v1.0</span>,
}));

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial phone step', () => {
    render(<MemoryRouter><RegisterPage /></MemoryRouter>);
    // The register page should show phone input first
    const phoneInputs = screen.getAllByRole('textbox');
    expect(phoneInputs.length).toBeGreaterThan(0);
  });

  it('renders branding header', () => {
    render(<MemoryRouter><RegisterPage /></MemoryRouter>);
    // "SuperMandi" appears in multiple places (header logo, footer copyright, subtitle text)
    const brandingElems = screen.getAllByText(/SuperMandi/i);
    expect(brandingElems.length).toBeGreaterThan(0);
  });

  it('has sign in link', () => {
    render(<MemoryRouter><RegisterPage /></MemoryRouter>);
    const signInLinks = screen.getAllByText(/Sign In|Login/i);
    expect(signInLinks.length).toBeGreaterThan(0);
  });

  it('renders build stamp', () => {
    render(<MemoryRouter><RegisterPage /></MemoryRouter>);
    expect(screen.getByTestId('build-stamp')).toBeInTheDocument();
  });
});
