import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProductsPage from '../../pages/ProductsPage';
import React from 'react';

// Mock AuthContext
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({
    store: { id: 's1', code: 'STORE1', name: 'My Store' },
    accessToken: 'test-token',
    isAuthenticated: true,
  }),
}));

// Mock api
const mockAuthFetch = vi.fn();
vi.mock('../../lib/api', () => ({
  authFetch: (...args: any[]) => mockAuthFetch(...args),
  safeJson: vi.fn((res: any) => res.json()),
  API_GATEWAY_BASE: 'http://localhost:3000',
}));

// Mock hooks
vi.mock('../../lib/hooks', () => ({
  useEscapeKey: vi.fn(),
}));

// Mock useUrlState
vi.mock('../../hooks/useUrlState', () => ({
  useUrlState: vi.fn(() => {
    const [val, setVal] = React.useState('');
    return [val, setVal];
  }),
}));

// Mock formatters
vi.mock('../../lib/formatters', () => ({
  formatCurrency: vi.fn((v: number) => `₹${(v / 100).toFixed(2)}`),
}));

// Mock Breadcrumb
vi.mock('../../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

// Mock VariantManager
vi.mock('../../components/VariantManager', () => ({
  default: ({ productName, onClose }: any) => (
    <div data-testid="variant-manager">
      <span>Variants for {productName}</span>
      <button onClick={onClose}>Close Variants</button>
    </div>
  ),
}));

// Mock EmptyState
vi.mock('../../components/EmptyState', () => ({
  default: ({ title, description, action }: any) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div data-testid="empty-action">{action}</div>}
    </div>
  ),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Package: () => <span>PackageIcon</span>,
}));

// Mock store API for categories
vi.mock('../../api/store', () => ({
  fetchCategories: vi.fn(),
}));

import { fetchCategories } from '../../api/store';
const mockedFetchCategories = vi.mocked(fetchCategories);

// ── Test Data ─────────────────────────────────────────────────────────────

const mockProducts = [
  {
    id: 'p1',
    barcode: '8901234567890',
    generatedBarcode: null,
    name: 'Rice 5kg',
    description: 'Basmati rice',
    mode: 'PACKAGED' as const,
    brand: 'India Gate',
    alias: 'चावल',
    sellPrice: 35000,
    purchasePrice: 30000,
    mrp: 38000,
    stock: 50,
    unit: 'PCS',
    supplierId: 'sup1',
    supplierName: 'Supplier A',
    categoryId: 'staples',
  },
  {
    id: 'p2',
    barcode: null,
    generatedBarcode: 'SM-STORE1-001',
    name: 'Loose Rice',
    description: '',
    mode: 'LOOSE_BULK' as const,
    brand: '',
    alias: '',
    sellPrice: 4500,
    purchasePrice: 4000,
    stock: 100,
    unit: 'KG',
    soldBy: 'WEIGHT',
    rateUnit: 'KG',
  },
];

const mockSuppliers = [
  { id: 'sup1', name: 'Supplier A', businessName: 'Supplier A Pvt Ltd', verificationStatus: 'verified' as const, isSupermandi: true, supplierCode: 'SUP001' },
  { id: 'sup2', name: 'Supplier B', businessName: 'Supplier B', verificationStatus: 'pending' as const, isSupermandi: false },
];

const mockCategories = {
  data: [
    { id: 'staples', labelEn: 'Staples', labelHi: null, iconKey: 'grain', sortOrder: 1, productCount: 5, stockValue: 10000 },
    { id: 'beverages', labelEn: 'Beverages', labelHi: null, iconKey: 'cup', sortOrder: 2, productCount: 3, stockValue: 5000 },
  ],
};

function createMockResponse(data: any, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  };
}

function renderProducts(path = '/s/STORE1/products') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/s/:storeCode/products" element={<ProductsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: Products API returns products, suppliers API returns suppliers
  mockAuthFetch.mockImplementation((url: string) => {
    if (url.includes('/products/bulk-paste/')) {
      return Promise.resolve(createMockResponse({ data: { previewRows: [], created: 0 } }));
    }
    if (url.includes('/products')) {
      return Promise.resolve(createMockResponse({ data: mockProducts }));
    }
    if (url.includes('/suppliers')) {
      return Promise.resolve(createMockResponse({ data: mockSuppliers }));
    }
    return Promise.resolve(createMockResponse({}));
  });

  mockedFetchCategories.mockResolvedValue(mockCategories as any);
});

// ── Page Rendering ────────────────────────────────────────────────────────

describe('ProductsPage rendering', () => {
  it('renders page title', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Products')).toBeInTheDocument();
    });
  });

  it('renders breadcrumb', () => {
    renderProducts();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });

  it('renders Add Product button', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('+ Add Product')).toBeInTheDocument();
    });
  });

  it('renders search input', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search by name or barcode...')).toBeInTheDocument();
    });
  });

  it('renders Bulk Paste Upload button', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Bulk Paste Upload')).toBeInTheDocument();
    });
  });
});

// ── Loading State ─────────────────────────────────────────────────────────

describe('Loading state', () => {
  it('shows loading text while fetching products', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/products')) {
        return new Promise(() => {}); // Never resolves
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ data: [] }));
      }
      return Promise.resolve(createMockResponse({}));
    });

    renderProducts();

    expect(screen.getByText('Loading products...')).toBeInTheDocument();
  });
});

// ── Product List ──────────────────────────────────────────────────────────

describe('Product list', () => {
  it('renders product names in table', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
      expect(screen.getByText('Loose Rice')).toBeInTheDocument();
    });
  });

  it('renders table headers', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Barcode')).toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Brand')).toBeInTheDocument();
      expect(screen.getByText('Mode')).toBeInTheDocument();
      expect(screen.getByText('Price')).toBeInTheDocument();
      expect(screen.getByText('Stock')).toBeInTheDocument();
      expect(screen.getByText('Supplier')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });

  it('displays product barcode', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('8901234567890')).toBeInTheDocument();
    });
  });

  it('displays generated barcode for loose products', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('SM-STORE1-001')).toBeInTheDocument();
    });
  });

  it('shows product brand', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('India Gate')).toBeInTheDocument();
    });
  });

  it('shows mode badges', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Packaged')).toBeInTheDocument();
      expect(screen.getByText('Loose')).toBeInTheDocument();
    });
  });

  it('shows supplier name', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Supplier A')).toBeInTheDocument();
    });
  });

  it('shows Edit and Delete buttons for each product', async () => {
    renderProducts();

    await waitFor(() => {
      const editButtons = screen.getAllByText('Edit');
      const deleteButtons = screen.getAllByText('Delete');
      expect(editButtons.length).toBe(2);
      expect(deleteButtons.length).toBe(2);
    });
  });

  it('shows Variants button only for LOOSE_BULK products', async () => {
    renderProducts();

    await waitFor(() => {
      const variantButtons = screen.getAllByText('Variants');
      expect(variantButtons.length).toBe(1); // Only for Loose Rice
    });
  });
});

// ── Empty State ───────────────────────────────────────────────────────────

describe('Empty state', () => {
  it('shows empty state when no products', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/products')) {
        return Promise.resolve(createMockResponse({ data: [] }));
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ data: [] }));
      }
      return Promise.resolve(createMockResponse({}));
    });

    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('No products yet')).toBeInTheDocument();
    });
  });

  it('shows empty search state when search has no results', async () => {
    // This test verifies the search filtering produces empty state
    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/products')) {
        return Promise.resolve(createMockResponse({ data: mockProducts }));
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ data: [] }));
      }
      return Promise.resolve(createMockResponse({}));
    });

    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    // Type a search that won't match anything
    const searchInput = screen.getByPlaceholderText('Search by name or barcode...');
    fireEvent.change(searchInput, { target: { value: 'zzzznonexistent' } });

    await waitFor(() => {
      expect(screen.getByText('No products match your search')).toBeInTheDocument();
    });
  });
});

// ── Error State ───────────────────────────────────────────────────────────

describe('Error state', () => {
  it('shows error when product fetch fails', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/products')) {
        return Promise.resolve(createMockResponse({ error: 'Server error' }, false, 500));
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ data: [] }));
      }
      return Promise.resolve(createMockResponse({}));
    });

    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Failed to load products. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows supplier fetch error in form', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/products')) {
        return Promise.resolve(createMockResponse({ data: mockProducts }));
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ error: 'Failed' }, false, 500));
      }
      return Promise.resolve(createMockResponse({}));
    });

    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    // Open the form to see the supplier error
    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText(/Failed to load suppliers/)).toBeInTheDocument();
    });
  });
});

// ── Add Product Form ──────────────────────────────────────────────────────

describe('Add product form', () => {
  it('opens form when Add Product button is clicked', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('+ Add Product')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText('Add New Product')).toBeInTheDocument();
    });
  });

  it('shows Cancel button when form is open', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('+ Add Product')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    // The main button should now say Cancel
    expect(screen.getByText('Cancel', { selector: '.btn.btn-primary' })).toBeInTheDocument();
  });

  it('renders product mode selector with PACKAGED and LOOSE_BULK', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText('Packaged (FMCG)')).toBeInTheDocument();
      expect(screen.getByText('Loose / Bulk')).toBeInTheDocument();
    });
  });

  it('renders form fields: name, brand, alias, unit, prices, stock', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText('Product Name *')).toBeInTheDocument();
      expect(screen.getAllByText('Brand').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Alias / Local Name')).toBeInTheDocument();
      expect(screen.getByText('Unit *')).toBeInTheDocument();
      expect(screen.getByText('Purchase (₹) *')).toBeInTheDocument();
      expect(screen.getByText('Sell (₹) *')).toBeInTheDocument();
      expect(screen.getByText('MRP (₹)')).toBeInTheDocument();
      expect(screen.getByText('Opening Stock')).toBeInTheDocument();
    });
  });

  it('shows Barcode field for PACKAGED mode', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText('Barcode (GTIN/EAN)')).toBeInTheDocument();
    });
  });

  it('shows LOOSE_BULK fields when mode switched', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText('Packaged (FMCG)')).toBeInTheDocument();
    });

    // Click on Loose / Bulk mode
    fireEvent.click(screen.getByText('Loose / Bulk'));

    await waitFor(() => {
      expect(screen.getByText('Sold By *')).toBeInTheDocument();
      expect(screen.getByText('Rate Unit *')).toBeInTheDocument();
    });
  });

  it('shows category dropdown in form', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText('Category')).toBeInTheDocument();
      expect(screen.getByText('Auto-detect from name')).toBeInTheDocument();
    });
  });

  it('shows supplier dropdown in form', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText('Supplier (optional)')).toBeInTheDocument();
      expect(screen.getByText('-- No supplier linked --')).toBeInTheDocument();
    });
  });

  it('shows only verified (isSupermandi) suppliers in dropdown', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      // Supplier A is isSupermandi=true, should appear
      expect(screen.getByText(/Supplier A Pvt Ltd/)).toBeInTheDocument();
    });
  });

  it('shows tax and compliance fields', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText('GST %')).toBeInTheDocument();
      expect(screen.getByText('HSN Code')).toBeInTheDocument();
    });
  });

  it('shows BNPL eligibility toggle', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText('BNPL Eligible')).toBeInTheDocument();
    });
  });

  it('shows Save Product button in create mode', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText('Save Product')).toBeInTheDocument();
    });
  });

  it('validates required product name on submit', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText('Save Product')).toBeInTheDocument();
    });

    // Try to submit without filling name — use form submit directly
    const form = screen.getByText('Save Product').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Product name is required')).toBeInTheDocument();
    });
  });

  it('validates required sell price on submit', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText('Save Product')).toBeInTheDocument();
    });

    // Fill name but not price
    const nameInput = screen.getByPlaceholderText('Enter product name');
    fireEvent.change(nameInput, { target: { value: 'Test Product' } });

    const form = screen.getByText('Save Product').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Valid sell price is required')).toBeInTheDocument();
    });
  });

  it('validates required purchase price on submit', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText('Save Product')).toBeInTheDocument();
    });

    // Fill name and sell price but not purchase price
    const nameInput = screen.getByPlaceholderText('Enter product name');
    fireEvent.change(nameInput, { target: { value: 'Test Product' } });

    // There are 3 price inputs, need to target sell price
    const priceInputs = screen.getAllByPlaceholderText('0.00');
    // purchasePrice is first, sellPrice is second, mrp is third
    fireEvent.change(priceInputs[1], { target: { value: '100' } });

    const form = screen.getByText('Save Product').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Valid purchase price is required for ledger tracking')).toBeInTheDocument();
    });
  });

  it('submits product successfully', async () => {
    const createResponse = {
      ok: true,
      data: {
        storeId: 's1',
        productId: 'new-p1',
        barcode: '1234567890123',
        generatedBarcode: null,
        ledgerEntryId: 'led1',
        storeProduct: {
          productId: 'new-p1',
          mode: 'PACKAGED',
          name: 'Test Product',
          sellPrice: 10000,
          purchasePrice: 8000,
          currentStock: 10,
        },
      },
    };

    mockAuthFetch.mockImplementation((url: string, _token: string, options?: any) => {
      if (url.includes('/products') && options?.method === 'POST') {
        return Promise.resolve(createMockResponse(createResponse));
      }
      if (url.includes('/products')) {
        return Promise.resolve(createMockResponse({ data: mockProducts }));
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ data: mockSuppliers }));
      }
      return Promise.resolve(createMockResponse({}));
    });

    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    const nameInput = screen.getByPlaceholderText('Enter product name');
    fireEvent.change(nameInput, { target: { value: 'Test Product' } });

    const priceInputs = screen.getAllByPlaceholderText('0.00');
    fireEvent.change(priceInputs[0], { target: { value: '80' } }); // purchase price
    fireEvent.change(priceInputs[1], { target: { value: '100' } }); // sell price

    const saveBtn = screen.getByText('Save Product');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Product created successfully! Synced to POS.')).toBeInTheDocument();
    });
  });
});

// ── Edit Product ──────────────────────────────────────────────────────────

describe('Edit product', () => {
  it('opens edit form with product data when Edit clicked', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]); // Edit first product (Rice 5kg)

    await waitFor(() => {
      expect(screen.getByText('Edit Product')).toBeInTheDocument();
      expect(screen.getByText('Update Product')).toBeInTheDocument();
    });
  });

  it('populates form with existing product data', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      const nameInput = screen.getByPlaceholderText('Enter product name') as HTMLInputElement;
      expect(nameInput.value).toBe('Rice 5kg');
    });
  });

  it('disables opening stock field in edit mode', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      const stockInput = screen.getByPlaceholderText('0') as HTMLInputElement;
      expect(stockInput.disabled).toBe(true);
    });
  });
});

// ── Delete Product ────────────────────────────────────────────────────────

describe('Delete product', () => {
  it('shows delete confirmation modal', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Delete Product?')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete this product/)).toBeInTheDocument();
    });
  });

  it('cancels delete when Cancel is clicked', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText('Delete Product?')).toBeInTheDocument();

    // Find Cancel button in the modal
    const cancelButtons = screen.getAllByText('Cancel');
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText('Delete Product?')).not.toBeInTheDocument();
    });
  });

  it('calls delete API when confirmed', async () => {
    mockAuthFetch.mockImplementation((url: string, _token: string, options?: any) => {
      if (url.includes('/products/p1') && options?.method === 'DELETE') {
        return Promise.resolve(createMockResponse({ ok: true }));
      }
      if (url.includes('/products')) {
        return Promise.resolve(createMockResponse({ data: mockProducts }));
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ data: mockSuppliers }));
      }
      return Promise.resolve(createMockResponse({}));
    });

    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText('Delete Product?')).toBeInTheDocument();

    const confirmBtn = screen.getByText('Delete Product');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText('Product deleted successfully!')).toBeInTheDocument();
    });
  });

  it('shows error when delete fails', async () => {
    mockAuthFetch.mockImplementation((url: string, _token: string, options?: any) => {
      if (options?.method === 'DELETE') {
        return Promise.resolve(createMockResponse(
          { error: { message: 'Cannot delete product with active orders' } },
          false,
          400
        ));
      }
      if (url.includes('/products')) {
        return Promise.resolve(createMockResponse({ data: mockProducts }));
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ data: mockSuppliers }));
      }
      return Promise.resolve(createMockResponse({}));
    });

    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    const confirmBtn = screen.getByText('Delete Product');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText('Cannot delete product with active orders')).toBeInTheDocument();
    });
  });
});

// ── Category Filter ───────────────────────────────────────────────────────

describe('Category filter', () => {
  it('renders Filter by Category label', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Filter by Category')).toBeInTheDocument();
    });
  });

  it('renders All filter button', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText(/^All \(/)).toBeInTheDocument();
    });
  });

  it('renders category buttons from API', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText(/Staples/)).toBeInTheDocument();
      expect(screen.getByText(/Beverages/)).toBeInTheDocument();
    });
  });

  it('shows loading text while categories load', async () => {
    mockedFetchCategories.mockReturnValue(new Promise(() => {})); // Never resolves

    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Loading categories...')).toBeInTheDocument();
    });
  });
});

// ── Bulk Upload ───────────────────────────────────────────────────────────

describe('Bulk upload', () => {
  it('opens bulk upload section when clicked', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Bulk Paste Upload')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Bulk Paste Upload'));

    await waitFor(() => {
      expect(screen.getByText('Bulk Product Upload')).toBeInTheDocument();
    });
  });

  it('renders bulk upload format instructions', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Bulk Paste Upload')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Bulk Paste Upload'));

    await waitFor(() => {
      expect(screen.getByText(/Paste product data/)).toBeInTheDocument();
      expect(screen.getByText(/Name, Barcode, Brand, SellPrice, PurchasePrice, MRP, Unit, Stock/)).toBeInTheDocument();
    });
  });

  it('has Preview and Import buttons', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Bulk Paste Upload')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Bulk Paste Upload'));

    await waitFor(() => {
      expect(screen.getByText(/Preview/)).toBeInTheDocument();
      expect(screen.getByText(/Import 0 Products/)).toBeInTheDocument();
    });
  });

  it('calls preview API when text is entered and Preview clicked', async () => {
    const previewResponse = {
      data: {
        previewRows: [
          { name: 'Test Product', barcode: '123', brand: 'TestBrand', sellPrice: 10000, purchasePrice: 8000, mrp: 12000, unit: 'PCS', stock: 10, mode: 'PACKAGED' },
        ],
        invalidCount: 0,
      },
    };

    mockAuthFetch.mockImplementation((url: string, _token: string, options?: any) => {
      if (url.includes('bulk-paste/preview') && options?.method === 'POST') {
        return Promise.resolve(createMockResponse(previewResponse));
      }
      if (url.includes('/products')) {
        return Promise.resolve(createMockResponse({ data: mockProducts }));
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ data: mockSuppliers }));
      }
      return Promise.resolve(createMockResponse({}));
    });

    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Bulk Paste Upload')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Bulk Paste Upload'));

    await waitFor(() => {
      expect(screen.getByText('Bulk Product Upload')).toBeInTheDocument();
    });

    // Enter bulk data
    const textarea = screen.getByPlaceholderText(/Amul Butter 500g/);
    fireEvent.change(textarea, { target: { value: 'Test Product, 123, TestBrand, 100, 80, 120, PCS, 10' } });

    // Click Preview
    const previewBtn = screen.getByText(/Preview/);
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        '/api/v1/retailer-admin/products/bulk-paste/preview',
        'test-token',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});

// ── Variant Manager ───────────────────────────────────────────────────────

describe('Variant manager', () => {
  it('opens variant manager for loose products', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Loose Rice')).toBeInTheDocument();
    });

    const variantBtn = screen.getByText('Variants');
    fireEvent.click(variantBtn);

    await waitFor(() => {
      expect(screen.getByTestId('variant-manager')).toBeInTheDocument();
      expect(screen.getByText('Variants for Loose Rice')).toBeInTheDocument();
    });
  });

  it('closes variant manager', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Loose Rice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Variants'));

    await waitFor(() => {
      expect(screen.getByTestId('variant-manager')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Close Variants'));

    await waitFor(() => {
      expect(screen.queryByTestId('variant-manager')).not.toBeInTheDocument();
    });
  });
});

// ── Search ────────────────────────────────────────────────────────────────

describe('Search filtering', () => {
  it('filters products by name', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
      expect(screen.getByText('Loose Rice')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search by name or barcode...');
    fireEvent.change(searchInput, { target: { value: '5kg' } });

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
      expect(screen.queryByText('Loose Rice')).not.toBeInTheDocument();
    });
  });

  it('filters products by barcode', async () => {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search by name or barcode...');
    fireEvent.change(searchInput, { target: { value: '8901234567890' } });

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
      expect(screen.queryByText('Loose Rice')).not.toBeInTheDocument();
    });
  });
});

// ── Barcode Validation ────────────────────────────────────────────────────

describe('Barcode validation', () => {
  async function openFormAndFillRequired() {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Product'));

    await waitFor(() => {
      expect(screen.getByText('Add New Product')).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText('Enter product name');
    fireEvent.change(nameInput, { target: { value: 'Barcode Test Product' } });

    const priceInputs = screen.getAllByPlaceholderText('0.00');
    fireEvent.change(priceInputs[0], { target: { value: '80' } });
    fireEvent.change(priceInputs[1], { target: { value: '100' } });
  }

  it('rejects invalid numeric barcode length (e.g. 10 digits)', async () => {
    await openFormAndFillRequired();

    const barcodeInput = screen.getByPlaceholderText('8901030865432');
    fireEvent.change(barcodeInput, { target: { value: '1234567890' } }); // 10 digits

    const saveBtn = screen.getByText('Save Product');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Numeric barcodes should be 8, 12, 13, or 14 digits/)).toBeInTheDocument();
    });
  });

  it('rejects barcode with special characters', async () => {
    await openFormAndFillRequired();

    const barcodeInput = screen.getByPlaceholderText('8901030865432');
    fireEvent.change(barcodeInput, { target: { value: 'ABC@#$%' } });

    const saveBtn = screen.getByText('Save Product');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Barcode can only contain letters, numbers, hyphens, and underscores/)).toBeInTheDocument();
    });
  });

  it('accepts valid EAN-13 barcode (13 digits)', async () => {
    mockAuthFetch.mockImplementation((url: string, _token: string, options?: any) => {
      if (options?.method === 'POST') {
        return Promise.resolve(createMockResponse({
          ok: true,
          data: {
            storeId: 's1',
            productId: 'new-p',
            barcode: '1234567890123',
            generatedBarcode: null,
            ledgerEntryId: null,
            storeProduct: { productId: 'new-p', mode: 'PACKAGED', name: 'Test', sellPrice: 10000, purchasePrice: 8000, currentStock: 0 },
          },
        }));
      }
      if (url.includes('/products')) {
        return Promise.resolve(createMockResponse({ data: mockProducts }));
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ data: mockSuppliers }));
      }
      return Promise.resolve(createMockResponse({}));
    });

    await openFormAndFillRequired();

    const barcodeInput = screen.getByPlaceholderText('8901030865432');
    fireEvent.change(barcodeInput, { target: { value: '1234567890123' } });

    const saveBtn = screen.getByText('Save Product');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Product created successfully! Synced to POS.')).toBeInTheDocument();
    });
  });

  it('accepts empty barcode (optional field)', async () => {
    mockAuthFetch.mockImplementation((url: string, _token: string, options?: any) => {
      if (options?.method === 'POST') {
        return Promise.resolve(createMockResponse({
          ok: true,
          data: {
            storeId: 's1',
            productId: 'new-p',
            barcode: null,
            generatedBarcode: null,
            ledgerEntryId: null,
            storeProduct: { productId: 'new-p', mode: 'PACKAGED', name: 'Test', sellPrice: 10000, purchasePrice: 8000, currentStock: 0 },
          },
        }));
      }
      if (url.includes('/products')) {
        return Promise.resolve(createMockResponse({ data: mockProducts }));
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ data: mockSuppliers }));
      }
      return Promise.resolve(createMockResponse({}));
    });

    await openFormAndFillRequired();

    // Don't fill barcode - it's optional
    const saveBtn = screen.getByText('Save Product');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Product created successfully! Synced to POS.')).toBeInTheDocument();
    });
  });

  it('accepts alphanumeric internal SKU barcode', async () => {
    mockAuthFetch.mockImplementation((url: string, _token: string, options?: any) => {
      if (options?.method === 'POST') {
        return Promise.resolve(createMockResponse({
          ok: true,
          data: {
            storeId: 's1',
            productId: 'new-p',
            barcode: 'SKU-ABC-123',
            generatedBarcode: null,
            ledgerEntryId: null,
            storeProduct: { productId: 'new-p', mode: 'PACKAGED', name: 'Test', sellPrice: 10000, purchasePrice: 8000, currentStock: 0 },
          },
        }));
      }
      if (url.includes('/products')) {
        return Promise.resolve(createMockResponse({ data: mockProducts }));
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ data: mockSuppliers }));
      }
      return Promise.resolve(createMockResponse({}));
    });

    await openFormAndFillRequired();

    const barcodeInput = screen.getByPlaceholderText('8901030865432');
    fireEvent.change(barcodeInput, { target: { value: 'SKU-ABC-123' } });

    const saveBtn = screen.getByText('Save Product');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Product created successfully! Synced to POS.')).toBeInTheDocument();
    });
  });
});

// ── API Error Handling ────────────────────────────────────────────────────

describe('API error handling on submit', () => {
  async function setupFormForSubmit() {
    renderProducts();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('+ Add Product'));
    });

    const nameInput = screen.getByPlaceholderText('Enter product name');
    fireEvent.change(nameInput, { target: { value: 'Error Test Product' } });

    const priceInputs = screen.getAllByPlaceholderText('0.00');
    fireEvent.change(priceInputs[0], { target: { value: '80' } });
    fireEvent.change(priceInputs[1], { target: { value: '100' } });
  }

  it('handles 409 conflict error', async () => {
    mockAuthFetch.mockImplementation((url: string, _token: string, options?: any) => {
      if (options?.method === 'POST') {
        return Promise.resolve(createMockResponse({}, false, 409));
      }
      if (url.includes('/products')) {
        return Promise.resolve(createMockResponse({ data: mockProducts }));
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ data: mockSuppliers }));
      }
      return Promise.resolve(createMockResponse({}));
    });

    await setupFormForSubmit();

    fireEvent.click(screen.getByText('Save Product'));

    await waitFor(() => {
      expect(screen.getByText(/This product was updated elsewhere/)).toBeInTheDocument();
    });
  });

  it('handles 422 validation error with details', async () => {
    mockAuthFetch.mockImplementation((url: string, _token: string, options?: any) => {
      if (options?.method === 'POST') {
        return Promise.resolve(createMockResponse(
          { error: { message: 'Validation failed', details: { sellPrice: 'must be positive', name: 'too short' } } },
          false,
          422
        ));
      }
      if (url.includes('/products')) {
        return Promise.resolve(createMockResponse({ data: mockProducts }));
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ data: mockSuppliers }));
      }
      return Promise.resolve(createMockResponse({}));
    });

    await setupFormForSubmit();

    fireEvent.click(screen.getByText('Save Product'));

    await waitFor(() => {
      expect(screen.getByText(/Validation error:/)).toBeInTheDocument();
    });
  });

  it('handles 500 server error', async () => {
    mockAuthFetch.mockImplementation((url: string, _token: string, options?: any) => {
      if (options?.method === 'POST') {
        return Promise.resolve(createMockResponse(
          { error: { message: 'Internal server error' } },
          false,
          500
        ));
      }
      if (url.includes('/products')) {
        return Promise.resolve(createMockResponse({ data: mockProducts }));
      }
      if (url.includes('/suppliers')) {
        return Promise.resolve(createMockResponse({ data: mockSuppliers }));
      }
      return Promise.resolve(createMockResponse({}));
    });

    await setupFormForSubmit();

    fireEvent.click(screen.getByText('Save Product'));

    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });
  });
});
