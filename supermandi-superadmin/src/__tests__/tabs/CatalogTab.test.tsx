// SuperAdmin — Test CatalogTab component (SA-P2-006 + GCP-STG-0071/0075/0090)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CatalogTab } from '../../tabs/CatalogTab';

// Mock the catalog API
const mockFetchCategories = vi.fn();
const mockFetchProducts = vi.fn();
const mockOverrideProductCategory = vi.fn();
const mockUpdateProductConversion = vi.fn();
const mockApproveProduct = vi.fn();
const mockRejectProduct = vi.fn();
const mockEditProductMetadata = vi.fn();

vi.mock('../../api/catalog', () => ({
  fetchCategories: (...args: unknown[]) => mockFetchCategories(...args),
  fetchProducts: (...args: unknown[]) => mockFetchProducts(...args),
  overrideProductCategory: (...args: unknown[]) => mockOverrideProductCategory(...args),
  updateProductConversion: (...args: unknown[]) => mockUpdateProductConversion(...args),
  approveProduct: (...args: unknown[]) => mockApproveProduct(...args),
  rejectProduct: (...args: unknown[]) => mockRejectProduct(...args),
  editProductMetadata: (...args: unknown[]) => mockEditProductMetadata(...args),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock formatters
vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
  formatCurrency: vi.fn((v: number) => `Rs ${v}`),
}));

// Mock TableSkeleton
vi.mock('../../components/TableSkeleton', () => ({
  TableSkeleton: () => <div data-testid="table-skeleton">Loading...</div>,
}));

const sampleProduct = {
  id: 'p1',
  name: 'Tata Salt 1kg',
  displayName: 'Tata Salt 1kg',
  originalCategory: 'Grocery',
  editedCategory: null as string | null,
  currentCategory: 'Grocery',
  brand: 'Tata',
  barcode: '8901030000000',
  supplierSku: 'TS-001',
  purchasePrice: 2300,
  mrp: 2700,
  approvalStatus: 'approved',
  supplierId: 's1',
  supplierName: 'Tata Distributors',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

const sampleCategories = [
  { category: 'Grocery', productCount: 42 },
  { category: 'Dairy', productCount: 15 },
];

describe('CatalogTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCategories.mockResolvedValue([]);
    mockFetchProducts.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 50, total: 0, hasMore: false },
      filters: { search: null, category: null },
    });
  });

  // ── Header ──────────────────────────────────────────────────

  it('renders header', async () => {
    render(<CatalogTab />);
    expect(screen.getByText('Product Catalog')).toBeTruthy();
  });

  it('renders description text', async () => {
    render(<CatalogTab />);
    expect(screen.getByText(/Browse, approve\/reject, set margins/)).toBeTruthy();
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows loading skeleton initially', () => {
    mockFetchProducts.mockReturnValue(new Promise(() => {})); // Never resolves
    render(<CatalogTab />);
    expect(screen.getByTestId('table-skeleton')).toBeTruthy();
  });

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty state when no products', async () => {
    render(<CatalogTab />);
    await waitFor(() => {
      expect(screen.getByText(/No products found/)).toBeTruthy();
    });
  });

  it('shows empty state with role=status', async () => {
    render(<CatalogTab />);
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeTruthy();
    });
  });

  // ── Error State ─────────────────────────────────────────────

  it('shows error message on fetch failure', async () => {
    mockFetchProducts.mockRejectedValue(new Error('Network error'));
    render(<CatalogTab />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchProducts.mockRejectedValue(new Error('Server error'));
    render(<CatalogTab />);
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeTruthy();
    });
  });

  // ── Products Table ──────────────────────────────────────────

  it('renders products in table', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText('Tata Salt 1kg')).toBeTruthy();
      expect(screen.getByText('Grocery')).toBeTruthy();
      expect(screen.getByText('Tata')).toBeTruthy();
      expect(screen.getByText('Tata Distributors')).toBeTruthy();
    });
  });

  it('renders approval status badge', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText('approved')).toBeTruthy();
    });
  });

  it('shows Edit button for each product', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy();
    });
  });

  it('shows original category hint when override exists', async () => {
    const overriddenProduct = { ...sampleProduct, editedCategory: 'Staples', currentCategory: 'Staples' };
    mockFetchProducts.mockResolvedValue({
      data: [overriddenProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText(/Original: Grocery/)).toBeTruthy();
    });
  });

  // ── Category Chips ──────────────────────────────────────────

  it('renders category filter chips', async () => {
    mockFetchCategories.mockResolvedValue(sampleCategories);
    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText(/Grocery \(42\)/)).toBeTruthy();
      expect(screen.getByText(/Dairy \(15\)/)).toBeTruthy();
    });
  });

  it('renders All chip with total count', async () => {
    mockFetchCategories.mockResolvedValue(sampleCategories);
    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText(/All \(57\)/)).toBeTruthy();
    });
  });

  // ── Search ──────────────────────────────────────────────────

  it('renders search input', () => {
    render(<CatalogTab />);
    expect(screen.getByPlaceholderText(/Search by product name/)).toBeTruthy();
  });

  it('has search input with aria-label', () => {
    render(<CatalogTab />);
    expect(screen.getByLabelText('Search products')).toBeTruthy();
  });

  // ── Pagination ──────────────────────────────────────────────

  it('renders pagination info', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText(/Showing 1-1 of 1 products/)).toBeTruthy();
    });
  });

  it('disables Previous button on first page', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => {
      const prevBtn = screen.getByText('Previous');
      expect(prevBtn).toBeTruthy();
      expect((prevBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('disables Next button when no more pages', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => {
      const nextBtn = screen.getByText('Next');
      expect(nextBtn).toBeTruthy();
      expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  // ── Edit Modal ──────────────────────────────────────────────

  it('opens edit modal when Edit clicked', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => {
      fireEvent.click(screen.getByText('Edit'));
    });

    await waitFor(() => {
      expect(screen.getByText('Edit Product')).toBeTruthy();
      expect(screen.getByLabelText(/Category/)).toBeTruthy();
    });
  });

  it('shows product name in modal', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => fireEvent.click(screen.getByText('Edit')));

    await waitFor(() => {
      expect(screen.getAllByText('Tata Salt 1kg').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Cancel and Save Changes buttons in modal', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => fireEvent.click(screen.getByText('Edit')));

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeTruthy();
      expect(screen.getByText('Save Changes')).toBeTruthy();
    });
  });

  it('shows Clear Override button when editedCategory exists', async () => {
    const overriddenProduct = { ...sampleProduct, editedCategory: 'Staples', currentCategory: 'Staples' };
    mockFetchProducts.mockResolvedValue({
      data: [overriddenProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => fireEvent.click(screen.getByText('Edit')));

    await waitFor(() => {
      expect(screen.getByText('Clear Override')).toBeTruthy();
    });
  });

  it('does not show Clear Override when no override exists', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => fireEvent.click(screen.getByText('Edit')));

    await waitFor(() => {
      expect(screen.queryByText('Clear Override')).toBeNull();
    });
  });

  it('closes modal on Cancel', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => fireEvent.click(screen.getByText('Edit')));
    await waitFor(() => expect(screen.getByText('Edit Product')).toBeTruthy());

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Edit Product')).toBeNull();
    });
  });

  it('modal has correct aria attributes', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => fireEvent.click(screen.getByText('Edit')));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeTruthy();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
    });
  });

  // ── Table accessibility ─────────────────────────────────────

  it('table has aria-label', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => {
      const table = screen.getByLabelText('Catalog products');
      expect(table).toBeTruthy();
    });
  });

  it('edit button has accessible label', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByLabelText('Edit Tata Salt 1kg')).toBeTruthy();
    });
  });

  // ── Table headers ───────────────────────────────────────────

  it('renders all column headers', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText('Product')).toBeTruthy();
      expect(screen.getByText('Category')).toBeTruthy();
      expect(screen.getByText('Brand')).toBeTruthy();
      expect(screen.getByText('Price')).toBeTruthy();
      expect(screen.getByText('Supplier')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Actions')).toBeTruthy();
    });
  });

  // ── SKU display ─────────────────────────────────────────────

  it('shows supplier SKU under product name', async () => {
    mockFetchProducts.mockResolvedValue({
      data: [sampleProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText('SKU: TS-001')).toBeTruthy();
    });
  });
});
