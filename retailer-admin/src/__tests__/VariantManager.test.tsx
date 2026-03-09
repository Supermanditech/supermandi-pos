import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

// Shared variant fixtures
const variantV1 = {
  id: 'v1', storeProductId: 'sp-1', variantLabel: '1 kg', variantQty: 1,
  baseUnit: 'KG', sellPriceMinor: 5000, barcode: 'BC001', isActive: true, sortOrder: 1,
};
const variantV2 = {
  id: 'v2', storeProductId: 'sp-1', variantLabel: '500 gm', variantQty: 0.5,
  baseUnit: 'GM', sellPriceMinor: 2500, barcode: 'BC002', isActive: true, sortOrder: 2,
};

describe('VariantManager', () => {
  const defaultProps = {
    storeProductId: 'sp-1',
    productName: 'Test Product',
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  // Helper: mock a single load response
  function mockLoadVariants(variants: unknown[] = []) {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: variants }),
    });
  }

  // Helper: render and wait for load to complete
  async function renderLoaded(variants: unknown[] = []) {
    mockLoadVariants(variants);
    render(<VariantManager {...defaultProps} />);
    await waitFor(() => {
      expect(screen.queryByText('Loading variants...')).not.toBeInTheDocument();
    });
  }

  // Helper: open add form and fill fields
  function fillAddForm(fields: { label?: string; qty?: string; price?: string; unit?: string }) {
    if (fields.label !== undefined) {
      fireEvent.change(screen.getByPlaceholderText('e.g. 1 kg'), { target: { value: fields.label } });
    }
    if (fields.qty !== undefined) {
      fireEvent.change(screen.getByPlaceholderText('e.g. 1'), { target: { value: fields.qty } });
    }
    if (fields.price !== undefined) {
      fireEvent.change(screen.getByPlaceholderText('e.g. 50'), { target: { value: fields.price } });
    }
    if (fields.unit !== undefined) {
      const selects = screen.getAllByRole('combobox');
      fireEvent.change(selects[0], { target: { value: fields.unit } });
    }
  }

  // Helper: extract POST/PATCH/DELETE body from mock calls
  function findCallByMethod(method: string) {
    return mockAuthFetch.mock.calls.find(
      (c: unknown[]) => (c[2] as { method?: string })?.method === method
    );
  }

  // ── Loading & Display (existing smoke coverage) ────────────────────────

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
    await renderLoaded([]);
    expect(screen.getByText('No variants defined yet.')).toBeInTheDocument();
  });

  it('renders variant list when data loads', async () => {
    await renderLoaded([variantV1]);
    expect(screen.getByText('1 kg')).toBeInTheDocument();
    expect(screen.getByText('KG')).toBeInTheDocument();
    expect(screen.getByText('BC001')).toBeInTheDocument();
  });

  it('shows add variant form when button clicked', async () => {
    await renderLoaded([]);
    fireEvent.click(screen.getByText('+ Add Variant'));
    expect(screen.getByRole('heading', { name: 'Add Variant' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. 1 kg')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    await renderLoaded([]);
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

  // ── Add Variant Submit ────────────────────────────────────────────────

  describe('Add variant submit', () => {
    it('submits new variant and shows success message', async () => {
      await renderLoaded([]);
      fireEvent.click(screen.getByText('+ Add Variant'));
      fillAddForm({ label: '2 kg', qty: '2', price: '100' });

      // Mock POST success then reload
      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: [{ id: 'v-new' }] }),
      });
      mockLoadVariants([variantV1]);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
      });

      await waitFor(() => {
        expect(screen.getByText('Variant added')).toBeInTheDocument();
      });

      const postCall = findCallByMethod('POST');
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall![2] as { body: string }).body);
      expect(body.variants[0].label).toBe('2 kg');
      expect(body.variants[0].qty).toBe(2);
      expect(body.variants[0].baseUnit).toBe('KG');
      expect(body.variants[0].sellPriceMinor).toBe(10000);
    });

    it('resets form after successful add', async () => {
      await renderLoaded([]);
      fireEvent.click(screen.getByText('+ Add Variant'));
      fillAddForm({ label: '2 kg', qty: '2', price: '100' });

      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: [] }),
      });
      mockLoadVariants([]);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
      });

      await waitFor(() => {
        expect(screen.getByText('Variant added')).toBeInTheDocument();
      });

      // Form hidden — toggle button visible again
      expect(screen.getByText('+ Add Variant')).toBeInTheDocument();
    });

    it('shows error when add API fails', async () => {
      await renderLoaded([]);
      fireEvent.click(screen.getByText('+ Add Variant'));
      fillAddForm({ label: '2 kg', qty: '2', price: '100' });

      mockAuthFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Duplicate label' } }),
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
      });

      await waitFor(() => {
        expect(screen.getByText('Duplicate label')).toBeInTheDocument();
      });
    });

    it('shows network error on add failure', async () => {
      await renderLoaded([]);
      fireEvent.click(screen.getByText('+ Add Variant'));
      fillAddForm({ label: '2 kg', qty: '2', price: '100' });

      mockAuthFetch.mockRejectedValueOnce(new Error('fail'));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
      });

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows "Adding..." while submitting', async () => {
      await renderLoaded([]);
      fireEvent.click(screen.getByText('+ Add Variant'));
      fillAddForm({ label: '2 kg', qty: '2', price: '100' });

      mockAuthFetch.mockReturnValueOnce(new Promise(() => {}));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
      });

      expect(screen.getByText('Adding...')).toBeInTheDocument();
    });

    it('hides add form when Cancel clicked', async () => {
      await renderLoaded([]);
      fireEvent.click(screen.getByText('+ Add Variant'));
      expect(screen.getByRole('heading', { name: 'Add Variant' })).toBeInTheDocument();

      // The Cancel button in the add form
      const cancelButtons = screen.getAllByText('Cancel');
      fireEvent.click(cancelButtons[0]);

      expect(screen.queryByRole('heading', { name: 'Add Variant' })).not.toBeInTheDocument();
      expect(screen.getByText('+ Add Variant')).toBeInTheDocument();
    });

    it('selects unit from dropdown', async () => {
      await renderLoaded([]);
      fireEvent.click(screen.getByText('+ Add Variant'));
      fillAddForm({ label: '500 ml', qty: '0.5', price: '30', unit: 'ML' });

      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: [] }),
      });
      mockLoadVariants([]);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
      });

      const postCall = findCallByMethod('POST');
      const body = JSON.parse((postCall![2] as { body: string }).body);
      expect(body.variants[0].baseUnit).toBe('ML');
    });
  });

  // ── Validation Errors ─────────────────────────────────────────────────

  describe('Validation errors', () => {
    it('shows error when label is empty', async () => {
      await renderLoaded([]);
      fireEvent.click(screen.getByText('+ Add Variant'));
      fillAddForm({ label: '', qty: '1', price: '50' });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
      });

      expect(screen.getByText('Please fill all required fields')).toBeInTheDocument();
      expect(mockAuthFetch).toHaveBeenCalledTimes(1); // only the initial load
    });

    it('shows error when quantity is empty', async () => {
      await renderLoaded([]);
      fireEvent.click(screen.getByText('+ Add Variant'));
      fillAddForm({ label: '1 kg', qty: '', price: '50' });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
      });

      expect(screen.getByText('Please fill all required fields')).toBeInTheDocument();
    });

    it('shows error when price is empty', async () => {
      await renderLoaded([]);
      fireEvent.click(screen.getByText('+ Add Variant'));
      fillAddForm({ label: '1 kg', qty: '1', price: '' });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
      });

      expect(screen.getByText('Please fill all required fields')).toBeInTheDocument();
    });

    it('shows error when quantity is zero', async () => {
      await renderLoaded([]);
      fireEvent.click(screen.getByText('+ Add Variant'));
      fillAddForm({ label: '1 kg', qty: '0', price: '50' });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
      });

      expect(screen.getByText('Quantity must be a positive number')).toBeInTheDocument();
    });

    it('shows error when quantity is negative', async () => {
      await renderLoaded([]);
      fireEvent.click(screen.getByText('+ Add Variant'));
      fillAddForm({ label: '1 kg', qty: '-1', price: '50' });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
      });

      expect(screen.getByText('Quantity must be a positive number')).toBeInTheDocument();
    });
  });

  // ── Edit In-Place ─────────────────────────────────────────────────────

  describe('Edit in-place', () => {
    it('switches to edit mode when Edit clicked', async () => {
      await renderLoaded([variantV1]);
      await waitFor(() => {
        expect(screen.getByText('1 kg')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));

      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      // Label input pre-populated
      expect(screen.getByDisplayValue('1 kg')).toBeInTheDocument();
      // Price converted from paise to rupees (5000 → 50)
      expect(screen.getByDisplayValue('50')).toBeInTheDocument();
    });

    it('submits edit and shows success', async () => {
      await renderLoaded([variantV1]);
      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));
      fireEvent.change(screen.getByDisplayValue('1 kg'), { target: { value: '2 kg' } });

      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      mockLoadVariants([{ ...variantV1, variantLabel: '2 kg' }]);

      await act(async () => {
        fireEvent.click(screen.getByText('Save'));
      });

      await waitFor(() => {
        expect(screen.getByText('Variant updated')).toBeInTheDocument();
      });

      const patchCall = findCallByMethod('PATCH');
      expect(patchCall).toBeTruthy();
      expect(patchCall![0]).toContain('/variants/v1');
    });

    it('cancels edit and returns to display mode', async () => {
      await renderLoaded([variantV1]);
      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));
      expect(screen.getByText('Save')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Cancel'));

      expect(screen.queryByText('Save')).not.toBeInTheDocument();
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('1 kg')).toBeInTheDocument();
    });

    it('shows error when edit API fails', async () => {
      await renderLoaded([variantV1]);
      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));

      mockAuthFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Conflict' } }),
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Save'));
      });

      await waitFor(() => {
        expect(screen.getByText('Conflict')).toBeInTheDocument();
      });
    });

    it('shows network error on edit failure', async () => {
      await renderLoaded([variantV1]);
      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));

      mockAuthFetch.mockRejectedValueOnce(new Error('fail'));

      await act(async () => {
        fireEvent.click(screen.getByText('Save'));
      });

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('validates empty label on edit', async () => {
      await renderLoaded([variantV1]);
      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));
      fireEvent.change(screen.getByDisplayValue('1 kg'), { target: { value: '' } });

      await act(async () => {
        fireEvent.click(screen.getByText('Save'));
      });

      expect(screen.getByText('Label is required')).toBeInTheDocument();
    });

    it('validates zero quantity on edit', async () => {
      await renderLoaded([variantV1]);
      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));
      fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '0' } });

      await act(async () => {
        fireEvent.click(screen.getByText('Save'));
      });

      expect(screen.getByText('Quantity must be positive')).toBeInTheDocument();
    });
  });

  // ── Remove (Deactivate) ───────────────────────────────────────────────

  describe('Remove variant', () => {
    it('calls DELETE and shows success on confirm', async () => {
      await renderLoaded([variantV1]);
      await waitFor(() => {
        expect(screen.getByText('Remove')).toBeInTheDocument();
      });

      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      mockLoadVariants([]);

      await act(async () => {
        fireEvent.click(screen.getByText('Remove'));
      });

      expect(window.confirm).toHaveBeenCalledWith('Deactivate this variant?');

      await waitFor(() => {
        expect(screen.getByText('Variant deactivated')).toBeInTheDocument();
      });

      const deleteCall = findCallByMethod('DELETE');
      expect(deleteCall).toBeTruthy();
      expect(deleteCall![0]).toContain('/variants/v1');
    });

    it('does not delete when confirm is cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      await renderLoaded([variantV1]);
      await waitFor(() => {
        expect(screen.getByText('Remove')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Remove'));
      });

      // Only the initial load call (no DELETE)
      expect(mockAuthFetch).toHaveBeenCalledTimes(1);
    });

    it('shows error when delete API fails', async () => {
      await renderLoaded([variantV1]);
      await waitFor(() => {
        expect(screen.getByText('Remove')).toBeInTheDocument();
      });

      mockAuthFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Cannot deactivate' } }),
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Remove'));
      });

      await waitFor(() => {
        expect(screen.getByText('Cannot deactivate')).toBeInTheDocument();
      });
    });

    it('shows network error on delete failure', async () => {
      await renderLoaded([variantV1]);
      await waitFor(() => {
        expect(screen.getByText('Remove')).toBeInTheDocument();
      });

      mockAuthFetch.mockRejectedValueOnce(new Error('fail'));

      await act(async () => {
        fireEvent.click(screen.getByText('Remove'));
      });

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  // ── Floating-Point Price Safety (FIX-018) ─────────────────────────────

  describe('FIX-018: floating-point price safety', () => {
    async function addVariantWithPrice(price: string): Promise<number> {
      await renderLoaded([]);
      fireEvent.click(screen.getByText('+ Add Variant'));
      fillAddForm({ label: 'Test', qty: '1', price });

      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: [] }),
      });
      mockLoadVariants([]);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
      });

      const postCall = findCallByMethod('POST');
      const body = JSON.parse((postCall![2] as { body: string }).body);
      return body.variants[0].sellPriceMinor;
    }

    it('converts "49.99" to 4999 paise (not 4998)', async () => {
      expect(await addVariantWithPrice('49.99')).toBe(4999);
    });

    it('converts "99.90" to 9990 paise', async () => {
      expect(await addVariantWithPrice('99.90')).toBe(9990);
    });

    it('converts "10" (no decimal) to 1000 paise', async () => {
      expect(await addVariantWithPrice('10')).toBe(1000);
    });

    it('converts "0.50" to 50 paise', async () => {
      expect(await addVariantWithPrice('0.50')).toBe(50);
    });

    it('converts "49.99" correctly on edit too', async () => {
      await renderLoaded([variantV1]);
      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));
      fireEvent.change(screen.getByDisplayValue('50'), { target: { value: '49.99' } });

      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      mockLoadVariants([variantV1]);

      await act(async () => {
        fireEvent.click(screen.getByText('Save'));
      });

      const patchCall = findCallByMethod('PATCH');
      const body = JSON.parse((patchCall![2] as { body: string }).body);
      expect(body.sellPriceMinor).toBe(4999);
    });
  });

  // ── Multiple Variants ─────────────────────────────────────────────────

  describe('Multiple variants', () => {
    it('renders multiple variants in table', async () => {
      await renderLoaded([variantV1, variantV2]);
      await waitFor(() => {
        expect(screen.getByText('1 kg')).toBeInTheDocument();
      });
      expect(screen.getByText('500 gm')).toBeInTheDocument();
      expect(screen.getByText('BC001')).toBeInTheDocument();
      expect(screen.getByText('BC002')).toBeInTheDocument();
    });

    it('shows formatted prices for all variants', async () => {
      await renderLoaded([variantV1, variantV2]);
      await waitFor(() => {
        expect(screen.getByText('1 kg')).toBeInTheDocument();
      });
      expect(screen.getByText('Rs 50.00')).toBeInTheDocument();
      expect(screen.getByText('Rs 25.00')).toBeInTheDocument();
    });
  });

  // ── X close button ────────────────────────────────────────────────────

  it('calls onClose when × header button clicked', async () => {
    await renderLoaded([]);
    const closeBtn = screen.getByText('×');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
