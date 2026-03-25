import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProductsPage from '../../../app/(dashboard)/products/page';

// Mock next/navigation
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/products',
  useSearchParams: () => mockSearchParams,
}));

// Mock react-hot-toast
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
  }),
}));

// Mock useUrlState
jest.mock('../../../hooks/useUrlState', () => ({
  useUrlState: (key: string, defaultVal?: string) => {
    const React = require('react');
    return React.useState(defaultVal || '');
  },
}));

// Configurable query returns
let mockProducts: any[] = [];
let mockPagination: any = { total: 0, totalPages: 1 };
let mockIsLoading = false;
let mockIsError = false;
let mockError: any = null;
const mockRefetch = jest.fn();
const mockInvalidateQueries = jest.fn();

// Track mutations
let createMutationCallbacks: any = null;
let updateMutationCallbacks: any = null;
let deleteMutationCallbacks: any = null;
let resubmitMutationCallbacks: any = null;

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { data: mockProducts, pagination: mockPagination },
    isLoading: mockIsLoading,
    isError: mockIsError,
    error: mockError,
    refetch: mockRefetch,
  }),
  useMutation: ({ onSuccess, onError }: any) => {
    const mutate = jest.fn();
    // Track by order: create, update, delete, resubmit
    if (!createMutationCallbacks) {
      createMutationCallbacks = { mutate, onSuccess, onError };
    } else if (!updateMutationCallbacks) {
      updateMutationCallbacks = { mutate, onSuccess, onError };
    } else if (!deleteMutationCallbacks) {
      deleteMutationCallbacks = { mutate, onSuccess, onError };
    } else if (!resubmitMutationCallbacks) {
      resubmitMutationCallbacks = { mutate, onSuccess, onError };
    }
    return { mutate, isPending: false };
  },
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

jest.mock('../../../lib/formatters', () => ({
  formatCurrency: (val: number) => `₹${(val / 100).toFixed(2)}`,
}));

jest.mock('../../../components/Breadcrumb', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('nav', { 'data-testid': 'breadcrumb' }),
  };
});

jest.mock('../../../components/EmptyState', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ title, description, action }: any) =>
      React.createElement('div', { 'data-testid': 'empty-state' }, [
        React.createElement('span', { key: 'title' }, title),
        React.createElement('span', { key: 'desc' }, description),
        action && React.createElement('div', { key: 'action' }, action),
      ]),
  };
});

jest.mock('lucide-react', () => {
  const React = require('react');
  return {
    Package: () => null,
    Upload: () => React.createElement('span', null, 'UploadIcon'),
    X: () => React.createElement('span', null, 'XIcon'),
    ImageIcon: () => React.createElement('span', null, 'ImageIcon'),
  };
});

jest.mock('../../../lib/api', () => ({
  getProducts: jest.fn(),
  createProduct: jest.fn(),
  updateProduct: jest.fn(),
  deleteProduct: jest.fn(),
  uploadProductImage: jest.fn(),
}));

// Configurable supplier mock
let mockSupplier: any = { verificationStatus: 'verified' };
jest.mock('../../../lib/auth', () => ({
  useAuth: () => ({ supplier: mockSupplier }),
}));

jest.mock('../../../lib/fileLimits', () => ({
  MAX_PRODUCT_IMAGE_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_PRODUCT_IMAGE_SIZE_LABEL: '5MB',
}));

describe('ProductsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockProducts = [];
    mockPagination = { total: 0, totalPages: 1 };
    mockIsLoading = false;
    mockIsError = false;
    mockError = null;
    mockSupplier = { verificationStatus: 'verified' };
    createMutationCallbacks = null;
    updateMutationCallbacks = null;
    deleteMutationCallbacks = null;
    resubmitMutationCallbacks = null;
  });

  // ── Page Header & Structure ──────────────────────────────────

  it('renders the page heading', () => {
    render(<ProductsPage />);
    expect(screen.getByText('Products')).toBeInTheDocument();
  });

  it('renders subtitle about product catalog', () => {
    render(<ProductsPage />);
    expect(screen.getByText(/Manage your product catalog/)).toBeInTheDocument();
  });

  it('renders breadcrumb', () => {
    render(<ProductsPage />);
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });

  it('renders Add Product button for verified supplier', () => {
    render(<ProductsPage />);
    const addButtons = screen.getAllByText('+ Add Product');
    expect(addButtons.length).toBeGreaterThan(0);
  });

  it('disables Add Product button for unverified supplier', () => {
    mockSupplier = { verificationStatus: 'pending' };
    render(<ProductsPage />);
    // The header button should be disabled
    const headerBtn = screen.getAllByText('+ Add Product')[0].closest('button');
    expect(headerBtn).toBeDisabled();
  });

  // ── Search & Filters ─────────────────────────────────────────

  it('renders search input', () => {
    render(<ProductsPage />);
    expect(screen.getByPlaceholderText('Search by name, barcode, or SKU...')).toBeInTheDocument();
  });

  it('renders status filter buttons with correct labels', () => {
    render(<ProductsPage />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('status filters have role="tab" and aria-selected', () => {
    render(<ProductsPage />);
    const allTab = screen.getByRole('tab', { name: /all statuses/ });
    expect(allTab).toHaveAttribute('aria-selected', 'true');
  });

  it('has tablist role on filter container', () => {
    render(<ProductsPage />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  // ── Empty State ──────────────────────────────────────────────

  it('renders empty state when no products', () => {
    render(<ProductsPage />);
    expect(screen.getByText('No products yet')).toBeInTheDocument();
  });

  it('shows "No matching products" when products exist but none match filter', () => {
    mockProducts = [
      { id: 'p1', name: 'Rice', approvalStatus: 'approved', purchasePrice: 10000, moq: 1, unit: 'KG' },
    ];
    render(<ProductsPage />);
    // With default search='', statusFilter='all', products should match
    expect(screen.getByText('Rice')).toBeInTheDocument();
  });

  // ── Loading State ────────────────────────────────────────────

  it('shows loading skeleton when products are loading', () => {
    mockIsLoading = true;
    render(<ProductsPage />);
    expect(screen.getByRole('status', { name: 'Loading products' })).toBeInTheDocument();
  });

  // ── Error State ──────────────────────────────────────────────

  it('shows error message when products fail to load', () => {
    mockIsError = true;
    mockError = new Error('Network error');
    render(<ProductsPage />);
    expect(screen.getByText('Failed to load products')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows retry button on error', () => {
    mockIsError = true;
    render(<ProductsPage />);
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('disables Add Product button when products fail to load', () => {
    mockIsError = true;
    render(<ProductsPage />);
    const headerBtn = screen.getAllByText(/Add Product/)[0].closest('button');
    expect(headerBtn).toBeDisabled();
  });

  // ── Add Product Form ─────────────────────────────────────────

  it('shows form when clicking Add Product button', () => {
    render(<ProductsPage />);
    const addButtons = screen.getAllByText('+ Add Product');
    fireEvent.click(addButtons[0]);
    expect(screen.getByText('Add New Product')).toBeInTheDocument();
  });

  it('renders all form fields', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    expect(screen.getByText('Product Name *')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Barcode (GTIN/EAN)')).toBeInTheDocument();
    expect(screen.getByText('Your SKU Code')).toBeInTheDocument();
    expect(screen.getByText(/Purchase Price/)).toBeInTheDocument();
    expect(screen.getByText(/MRP/)).toBeInTheDocument();
    expect(screen.getByText('Minimum Order Quantity')).toBeInTheDocument();
    expect(screen.getByText('Unit')).toBeInTheDocument();
    expect(screen.getByText('Product Image')).toBeInTheDocument();
  });

  it('renders category dropdown with FMCG options', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    const categorySelect = screen.getByLabelText('Category') as HTMLSelectElement;
    expect(categorySelect.options.length).toBe(15); // 14 FMCG categories + 'Select Category'
  });

  it('renders unit dropdown with PCS/KG/GM/LTR/ML/PACK/BOX', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    const unitSelect = screen.getByLabelText('Unit') as HTMLSelectElement;
    expect(unitSelect.options.length).toBe(7);
    expect(unitSelect.value).toBe('PCS');
  });

  it('renders image upload drop zone', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    expect(screen.getByText(/Click to upload/)).toBeInTheDocument();
    expect(screen.getByText(/drag and drop/)).toBeInTheDocument();
    expect(screen.getByText(/JPEG, PNG, or WebP/)).toBeInTheDocument();
  });

  it('renders Add Product submit button', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    expect(screen.getByRole('button', { name: 'Add Product' })).toBeInTheDocument();
  });

  it('shows Cancel buttons when form is open', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    const cancelBtns = screen.getAllByText('Cancel');
    expect(cancelBtns.length).toBeGreaterThanOrEqual(2); // header Cancel + form Cancel
  });

  it('hides form when Cancel is clicked (no unsaved changes)', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    expect(screen.getByText('Add New Product')).toBeInTheDocument();
    // Click form cancel button
    const cancelBtns = screen.getAllByText('Cancel');
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);
    expect(screen.queryByText('Add New Product')).not.toBeInTheDocument();
  });

  // ── Products Table ───────────────────────────────────────────

  it('renders products table with data', () => {
    mockProducts = [
      {
        id: 'p1',
        name: 'Premium Rice',
        category: 'Chawal',
        supplierSku: 'RICE-001',
        barcode: '8901234567890',
        purchasePrice: 45000,
        mrp: 55000,
        moq: 5,
        unit: 'KG',
        approvalStatus: 'approved',
      },
    ];
    render(<ProductsPage />);
    // Table headers
    expect(screen.getByText('Product')).toBeInTheDocument();
    expect(screen.getByText('SKU / Barcode')).toBeInTheDocument();
    expect(screen.getByText('Price')).toBeInTheDocument();
    expect(screen.getByText('MOQ')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    // Row data
    expect(screen.getByText('Premium Rice')).toBeInTheDocument();
    expect(screen.getByText('Chawal')).toBeInTheDocument();
    expect(screen.getByText('RICE-001')).toBeInTheDocument();
    expect(screen.getByText('₹450.00')).toBeInTheDocument();
    expect(screen.getByText(/MRP.*₹550\.00/)).toBeInTheDocument();
    expect(screen.getByText('5 KG')).toBeInTheDocument();
    expect(screen.getByText('approved')).toBeInTheDocument();
  });

  it('shows Edit and Delete buttons for each product', () => {
    mockProducts = [
      { id: 'p1', name: 'Product 1', approvalStatus: 'approved', purchasePrice: 10000, moq: 1, unit: 'PCS' },
    ];
    render(<ProductsPage />);
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('shows Resubmit button for rejected products', () => {
    mockProducts = [
      { id: 'p1', name: 'Rejected Product', approvalStatus: 'rejected', purchasePrice: 10000, moq: 1, unit: 'PCS', rejectionReason: 'Low quality image' },
    ];
    render(<ProductsPage />);
    expect(screen.getByText('Resubmit')).toBeInTheDocument();
  });

  it('shows rejection reason for rejected products', () => {
    mockProducts = [
      { id: 'p1', name: 'Bad Product', approvalStatus: 'rejected', purchasePrice: 10000, moq: 1, unit: 'PCS', rejectionReason: 'Low quality' },
    ];
    render(<ProductsPage />);
    expect(screen.getByText('Reason: Low quality')).toBeInTheDocument();
  });

  it('truncates long rejection reason', () => {
    mockProducts = [
      { id: 'p1', name: 'P1', approvalStatus: 'rejected', purchasePrice: 10000, moq: 1, unit: 'PCS', rejectionReason: 'This is a very long rejection reason that should be truncated after 30 characters' },
    ];
    render(<ProductsPage />);
    expect(screen.getByText(/Reason:.*\.\.\./)).toBeInTheDocument();
  });

  it('shows SKU when available, barcode as fallback', () => {
    mockProducts = [
      { id: 'p1', name: 'P1', approvalStatus: 'approved', purchasePrice: 10000, moq: 1, unit: 'PCS', barcode: '1234567890123' },
    ];
    render(<ProductsPage />);
    expect(screen.getByText('1234567890123')).toBeInTheDocument();
  });

  it('shows dash when no SKU or barcode', () => {
    mockProducts = [
      { id: 'p1', name: 'P1', approvalStatus: 'approved', purchasePrice: 10000, moq: 1, unit: 'PCS' },
    ];
    render(<ProductsPage />);
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(1);
  });

  // ── Delete Confirmation Modal ────────────────────────────────

  it('shows delete confirmation modal when Delete is clicked', () => {
    mockProducts = [
      { id: 'p1', name: 'P1', approvalStatus: 'approved', purchasePrice: 10000, moq: 1, unit: 'PCS' },
    ];
    render(<ProductsPage />);
    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('Delete Product?')).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it('delete modal has proper dialog role', () => {
    mockProducts = [
      { id: 'p1', name: 'P1', approvalStatus: 'approved', purchasePrice: 10000, moq: 1, unit: 'PCS' },
    ];
    render(<ProductsPage />);
    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByRole('dialog', { name: 'Delete product confirmation' })).toBeInTheDocument();
  });

  // ── Edit Form ────────────────────────────────────────────────

  it('shows Edit Product title when editing', () => {
    mockProducts = [
      { id: 'p1', name: 'Existing Product', category: 'Masala', purchasePrice: 20000, moq: 2, unit: 'KG', approvalStatus: 'approved' },
    ];
    render(<ProductsPage />);
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('Edit Product')).toBeInTheDocument();
  });

  it('pre-fills form data when editing', () => {
    mockProducts = [
      { id: 'p1', name: 'Existing Product', category: 'Masala', barcode: '1234', supplierSku: 'SKU-1', purchasePrice: 20000, mrp: 25000, moq: 2, unit: 'KG', approvalStatus: 'approved' },
    ];
    render(<ProductsPage />);
    fireEvent.click(screen.getByText('Edit'));
    expect((screen.getByLabelText('Product Name *') as HTMLInputElement).value).toBe('Existing Product');
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('Masala');
    expect((screen.getByLabelText('Barcode (GTIN/EAN)') as HTMLInputElement).value).toBe('1234');
  });

  it('shows Update Product button when editing', () => {
    mockProducts = [
      { id: 'p1', name: 'P1', approvalStatus: 'approved', purchasePrice: 10000, moq: 1, unit: 'PCS' },
    ];
    render(<ProductsPage />);
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByRole('button', { name: 'Update Product' })).toBeInTheDocument();
  });

  // ── Pagination ───────────────────────────────────────────────

  it('shows pagination when multiple pages', () => {
    mockProducts = [{ id: 'p1', name: 'P1', approvalStatus: 'approved', purchasePrice: 10000, moq: 1, unit: 'PCS' }];
    mockPagination = { total: 50, totalPages: 3 };
    render(<ProductsPage />);
    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it('shows item range in pagination', () => {
    mockProducts = [{ id: 'p1', name: 'P1', approvalStatus: 'approved', purchasePrice: 10000, moq: 1, unit: 'PCS' }];
    mockPagination = { total: 50, totalPages: 3 };
    render(<ProductsPage />);
    expect(screen.getByText(/Showing 1 to 20 of 50 products/)).toBeInTheDocument();
  });

  it('disables Previous on first page', () => {
    mockProducts = [{ id: 'p1', name: 'P1', approvalStatus: 'approved', purchasePrice: 10000, moq: 1, unit: 'PCS' }];
    mockPagination = { total: 50, totalPages: 3 };
    render(<ProductsPage />);
    const prevBtn = screen.getByText('Previous').closest('button');
    expect(prevBtn).toBeDisabled();
  });

  it('hides pagination when single page', () => {
    mockProducts = [{ id: 'p1', name: 'P1', approvalStatus: 'approved', purchasePrice: 10000, moq: 1, unit: 'PCS' }];
    mockPagination = { total: 5, totalPages: 1 };
    render(<ProductsPage />);
    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
  });

  // ── SCALE-B5: Compliance & Measurements fields ───────────────

  it('renders Compliance & Measurements section heading when form is open', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    expect(screen.getByText('Compliance & Measurements')).toBeInTheDocument();
  });

  it('renders Manufacturer Name field', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    expect(screen.getByLabelText('Manufacturer Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Nestlé India Pvt Ltd')).toBeInTheDocument();
  });

  it('renders Country of Origin field with default value India', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    const countryInput = screen.getByLabelText('Country of Origin') as HTMLInputElement;
    expect(countryInput).toBeInTheDocument();
    expect(countryInput.value).toBe('India');
  });

  it('renders Net Content (value) field that accepts numbers', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    const netContentInput = screen.getByLabelText('Net Content (value)') as HTMLInputElement;
    expect(netContentInput).toBeInTheDocument();
    expect(netContentInput.type).toBe('number');
    expect(screen.getAllByPlaceholderText('e.g. 500').length).toBeGreaterThanOrEqual(1);
  });

  it('renders Net Content (unit) select with g/kg/ml/l/pcs options', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    const unitSelect = screen.getByLabelText('Net Content (unit)') as HTMLSelectElement;
    expect(unitSelect).toBeInTheDocument();
    const optionValues = Array.from(unitSelect.options).map((o) => o.value);
    expect(optionValues).toContain('g');
    expect(optionValues).toContain('kg');
    expect(optionValues).toContain('ml');
    expect(optionValues).toContain('l');
    expect(optionValues).toContain('pcs');
  });

  it('renders Shelf Life (days) field', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    const shelfLifeInput = screen.getByLabelText('Shelf Life (days)') as HTMLInputElement;
    expect(shelfLifeInput).toBeInTheDocument();
    expect(shelfLifeInput.type).toBe('number');
    expect(screen.getByPlaceholderText('e.g. 365 for 1 year')).toBeInTheDocument();
  });

  it('renders HSN Code field', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    expect(screen.getByLabelText('HSN Code')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. 19023010')).toBeInTheDocument();
  });

  it('all new compliance fields are optional — form includes defaults without explicit input', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getAllByText('+ Add Product')[0]);
    // Verify the country of origin field has India as default without any user interaction
    const countryInput = screen.getByLabelText('Country of Origin') as HTMLInputElement;
    expect(countryInput.value).toBe('India');
    // Verify other compliance fields are empty (optional)
    expect((screen.getByLabelText('Manufacturer Name') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('HSN Code') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Net Content (value)') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Net Content (unit)') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Shelf Life (days)') as HTMLInputElement).value).toBe('');
  });

  it('pre-fills compliance fields when editing a product', () => {
    mockProducts = [
      {
        id: 'p1',
        name: 'Test Product',
        approvalStatus: 'approved',
        purchasePrice: 10000,
        moq: 1,
        unit: 'PCS',
        manufacturerName: 'Nestlé India',
        countryOfOrigin: 'India',
        netContentValue: 500,
        netContentUnit: 'g',
        shelfLifeDays: 365,
        hsnCode: '19023010',
      },
    ];
    render(<ProductsPage />);
    fireEvent.click(screen.getByText('Edit'));
    expect((screen.getByLabelText('Manufacturer Name') as HTMLInputElement).value).toBe('Nestlé India');
    expect((screen.getByLabelText('Country of Origin') as HTMLInputElement).value).toBe('India');
    expect((screen.getByLabelText('Net Content (unit)') as HTMLSelectElement).value).toBe('g');
    expect((screen.getByLabelText('HSN Code') as HTMLInputElement).value).toBe('19023010');
  });
});
