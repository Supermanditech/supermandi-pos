/**
 * SCALE-B3 + SCALE-B4: Retailer product table column tests
 * Tests: image thumbnail, pack/unit, purchase price, MRP, margin badge, GST%
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProductsPage from '../pages/ProductsPage';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({
    store: { id: 's1', code: 'STORE1', name: 'My Store' },
    accessToken: 'test-token',
    isAuthenticated: true,
  }),
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: any[]) => mockAuthFetch(...args),
  safeJson: vi.fn((res: any) => res.json()),
  API_GATEWAY_BASE: 'http://localhost:3000',
}));

vi.mock('../hooks/useUrlState', () => ({
  useUrlState: vi.fn(() => {
    const [val, setVal] = React.useState('');
    return [val, setVal];
  }),
}));

vi.mock('../lib/formatters', () => ({
  formatCurrency: vi.fn((v: number) => `₹${(v / 100).toFixed(2)}`),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

vi.mock('../components/VariantManager', () => ({
  default: ({ onClose }: any) => (
    <div data-testid="variant-manager">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('../components/EmptyState', () => ({
  default: ({ title }: any) => <div data-testid="empty-state">{title}</div>,
}));

vi.mock('lucide-react', () => ({
  Package: () => <span>PackageIcon</span>,
}));

vi.mock('../api/store', () => ({
  fetchCategories: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock('../hooks/useNavigationSafety', () => ({
  useUnsavedChanges: vi.fn(),
}));

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal product shape for column tests */
const makeProduct = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  barcode: '8901234567890',
  generatedBarcode: null,
  name: 'Test Product',
  mode: 'PACKAGED' as const,
  brand: 'Brand X',
  sellPrice: 10000,          // ₹100.00
  purchasePrice: 8000,       // ₹80.00
  mrp: 12000,                // ₹120.00
  stock: 50,
  unit: 'PCS',
  supplierName: 'Supplier A',
  gstPercent: 5,
  image_url: null,
  net_content_value: null,
  net_content_unit: null,
  packSize: null,
  packUnit: null,
  ...overrides,
});

/** Suppliers API response */
const suppliersResponse = { ok: true, json: async () => ({ data: [] }) };

/** Build products API response */
const productsResponse = (products: unknown[]) => ({
  ok: true,
  json: async () => ({ data: products }),
});

/** Render ProductsPage with mocked products */
const renderWithProducts = async (products: unknown[]) => {
  mockAuthFetch.mockImplementation((url: string) => {
    if (url.includes('/suppliers')) return Promise.resolve(suppliersResponse);
    if (url.includes('/products')) return Promise.resolve(productsResponse(products));
    return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
  });

  render(
    <MemoryRouter initialEntries={['/s/STORE1/products']}>
      <Routes>
        <Route path="/s/:storeCode/products" element={<ProductsPage />} />
      </Routes>
    </MemoryRouter>
  );

  // Wait for the table to appear (loading spinner gone, rows rendered)
  await waitFor(() => {
    expect(screen.getByRole('table')).toBeTruthy();
  }, { timeout: 3000 });
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SCALE-B4: Image column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders image thumbnail when image_url is set', async () => {
    const product = makeProduct({ image_url: 'https://cdn.example.com/rice.jpg' });
    await renderWithProducts([product]);

    await waitFor(() => {
      const img = screen.getByTestId('product-image-thumb') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toBe('https://cdn.example.com/rice.jpg');
    });
  });

  it('image thumbnail has correct dimensions (40x40)', async () => {
    const product = makeProduct({ image_url: 'https://cdn.example.com/rice.jpg' });
    await renderWithProducts([product]);

    await waitFor(() => {
      const img = screen.getByTestId('product-image-thumb') as HTMLImageElement;
      expect(img.style.width).toBe('40px');
      expect(img.style.height).toBe('40px');
      expect(img.style.objectFit).toBe('cover');
      expect(img.style.borderRadius).toBe('4px');
    });
  });

  it('renders placeholder box when image_url is null', async () => {
    const product = makeProduct({ image_url: null });
    await renderWithProducts([product]);

    await waitFor(() => {
      const placeholder = screen.getByTestId('product-image-placeholder');
      expect(placeholder).toBeTruthy();
      expect(placeholder.textContent).toBe('📦');
    });
  });

  it('renders placeholder box when image_url is undefined', async () => {
    const product = makeProduct({ image_url: undefined });
    await renderWithProducts([product]);

    await waitFor(() => {
      const placeholder = screen.getByTestId('product-image-placeholder');
      expect(placeholder).toBeTruthy();
    });
  });

  it('image column is first column in the table', async () => {
    const product = makeProduct({ image_url: null });
    await renderWithProducts([product]);

    await waitFor(() => {
      const headers = screen.getAllByRole('columnheader');
      expect(headers[0].textContent).toBe('Image');
    });
  });
});

describe('SCALE-B3: Pack/Unit column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows net_content_value + net_content_unit for PACKAGED product (e.g. "500g")', async () => {
    const product = makeProduct({
      mode: 'PACKAGED',
      net_content_value: 500,
      net_content_unit: 'g',
    });
    await renderWithProducts([product]);

    await waitFor(() => {
      const packCell = screen.getByTestId('product-pack-unit');
      expect(packCell.textContent).toBe('500g');
    });
  });

  it('shows "per KG" for LOOSE_BULK product with rateUnit KG', async () => {
    const product = makeProduct({
      mode: 'LOOSE_BULK',
      rateUnit: 'KG',
      soldBy: 'WEIGHT',
    });
    await renderWithProducts([product]);

    await waitFor(() => {
      const packCell = screen.getByTestId('product-pack-unit');
      expect(packCell.textContent).toBe('per KG');
    });
  });

  it('falls back to packSize+packUnit when net_content not set', async () => {
    const product = makeProduct({
      mode: 'PACKAGED',
      net_content_value: null,
      net_content_unit: null,
      packSize: 1,
      packUnit: 'kg',
    });
    await renderWithProducts([product]);

    await waitFor(() => {
      const packCell = screen.getByTestId('product-pack-unit');
      expect(packCell.textContent).toBe('1kg');
    });
  });
});

describe('SCALE-B3: Purchase price column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays purchase price in rupees (paise/100)', async () => {
    const product = makeProduct({ purchasePrice: 8000 }); // ₹80.00
    await renderWithProducts([product]);

    await waitFor(() => {
      const priceCell = screen.getByTestId('product-purchase-price');
      expect(priceCell.textContent).toBe('₹80.00');
    });
  });

  it('shows dash when purchase price is 0', async () => {
    const product = makeProduct({ purchasePrice: 0 });
    await renderWithProducts([product]);

    await waitFor(() => {
      const priceCell = screen.getByTestId('product-purchase-price');
      expect(priceCell.textContent).toBe('—');
    });
  });
});

describe('SCALE-B3: MRP column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays MRP in rupees when set', async () => {
    const product = makeProduct({ mrp: 12000 }); // ₹120.00
    await renderWithProducts([product]);

    await waitFor(() => {
      const mrpCell = screen.getByTestId('product-mrp');
      expect(mrpCell.textContent).toBe('₹120.00');
    });
  });

  it('shows "—" when MRP is null', async () => {
    const product = makeProduct({ mrp: null });
    await renderWithProducts([product]);

    await waitFor(() => {
      const mrpCell = screen.getByTestId('product-mrp');
      expect(mrpCell.textContent).toBe('—');
    });
  });

  it('shows "—" when MRP is undefined', async () => {
    const product = makeProduct({ mrp: undefined });
    await renderWithProducts([product]);

    await waitFor(() => {
      const mrpCell = screen.getByTestId('product-mrp');
      expect(mrpCell.textContent).toBe('—');
    });
  });
});

describe('SCALE-B3: Margin% column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows green badge when margin is positive', async () => {
    // sell=₹100, purchase=₹80 → margin = (100-80)/80*100 = 25%
    const product = makeProduct({ sellPrice: 10000, purchasePrice: 8000 });
    await renderWithProducts([product]);

    await waitFor(() => {
      const badge = screen.getByTestId('margin-badge-positive');
      expect(badge).toBeTruthy();
      expect(badge.textContent).toBe('25.0%');
      expect(badge.style.background).toContain('#d1fae5'); // green fallback
    });
  });

  it('shows red badge when margin is negative', async () => {
    // sell=₹80, purchase=₹100 → margin = (80-100)/100*100 = -20%
    const product = makeProduct({ sellPrice: 8000, purchasePrice: 10000 });
    await renderWithProducts([product]);

    await waitFor(() => {
      const badge = screen.getByTestId('margin-badge-negative');
      expect(badge).toBeTruthy();
      expect(badge.textContent).toBe('-20.0%');
    });
  });

  it('shows "—" when no purchase price is set', async () => {
    const product = makeProduct({ purchasePrice: 0 });
    await renderWithProducts([product]);

    await waitFor(() => {
      const cell = screen.getByTestId('margin-no-purchase');
      expect(cell.textContent).toBe('—');
    });
  });

  it('computes margin correctly with decimal precision', async () => {
    // sell=₹150, purchase=₹120 → margin = (150-120)/120*100 = 25.0%
    const product = makeProduct({ sellPrice: 15000, purchasePrice: 12000 });
    await renderWithProducts([product]);

    await waitFor(() => {
      const badge = screen.getByTestId('margin-badge-positive');
      expect(badge.textContent).toBe('25.0%');
    });
  });
});

describe('SCALE-B3: GST% column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays GST percentage when set', async () => {
    const product = makeProduct({ gstPercent: 18 });
    await renderWithProducts([product]);

    await waitFor(() => {
      const gstCell = screen.getByTestId('product-gst');
      expect(gstCell.textContent).toBe('18%');
    });
  });

  it('displays 0% GST correctly', async () => {
    const product = makeProduct({ gstPercent: 0 });
    await renderWithProducts([product]);

    await waitFor(() => {
      const gstCell = screen.getByTestId('product-gst');
      expect(gstCell.textContent).toBe('0%');
    });
  });

  it('shows "—" when GST is not set', async () => {
    const product = makeProduct({ gstPercent: undefined });
    await renderWithProducts([product]);

    await waitFor(() => {
      const gstCell = screen.getByTestId('product-gst');
      expect(gstCell.textContent).toBe('—');
    });
  });
});

describe('SCALE-B3: Owner-only view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('table is in retailer-admin — margin and purchase price columns are always present (owner view only)', async () => {
    const product = makeProduct({ sellPrice: 10000, purchasePrice: 8000 });
    await renderWithProducts([product]);

    await waitFor(() => {
      // Both margin and purchase cells should be in the DOM (owner portal — staff never accesses this)
      expect(screen.getByTestId('product-margin')).toBeTruthy();
      expect(screen.getByTestId('product-purchase-price')).toBeTruthy();
    });
  });
});
