import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VariantManager from '../components/VariantManager';

// Mock AuthContext
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({
    accessToken: 'test-token',
  }),
}));

// Mock formatters
vi.mock('../lib/formatters', () => ({
  formatCurrency: (v: number) => `Rs ${(v / 100).toFixed(2)}`,
}));

// Mock api
const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

describe('VariantManager', () => {
  const defaultProps = {
    storeProductId: 'sp-1',
    productName: 'Test Product',
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress window.confirm in tests
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows loading state initially', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    render(<VariantManager {...defaultProps} />);
    expect(screen.getByText('Loading variants...')).toBeInTheDocument();
  });

  it('shows product name in header', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    render(<VariantManager {...defaultProps} />);
    expect(screen.getByText('Test Product')).toBeInTheDocument();
    expect(screen.getByText('Retail Variants')).toBeInTheDocument();
  });

  it('shows empty state when no variants', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: [] }),
    });
    render(<VariantManager {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('No variants defined yet.')).toBeInTheDocument();
    });
  });

  it('renders variant list when data loads', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        data: [
          { id: 'v1', storeProductId: 'sp-1', variantLabel: '1 kg', variantQty: 1, baseUnit: 'KG', sellPriceMinor: 5000, barcode: 'BC001', isActive: true, sortOrder: 1 },
        ],
      }),
    });
    render(<VariantManager {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('1 kg')).toBeInTheDocument();
      expect(screen.getByText('KG')).toBeInTheDocument();
      expect(screen.getByText('BC001')).toBeInTheDocument();
    });
  });

  it('shows add variant form when button clicked', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: [] }),
    });
    render(<VariantManager {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('+ Add Variant')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('+ Add Variant'));
    // After clicking, both a heading "Add Variant" and a button "Add Variant" exist
    expect(screen.getByRole('heading', { name: 'Add Variant' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. 1 kg')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: [] }),
    });
    render(<VariantManager {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Close')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Close'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows error message on network failure', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Network error'));
    render(<VariantManager {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Network error loading variants')).toBeInTheDocument();
    });
  });

  it('shows error when API returns failure', async () => {
    mockAuthFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: false, error: { message: 'Server error' } }),
    });
    render(<VariantManager {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});
