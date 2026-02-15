import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProductsPage from '../../../app/(dashboard)/products/page';

// Mock next/navigation
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/products',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock useUrlState
jest.mock('../../../hooks/useUrlState', () => ({
  useUrlState: (key: string, defaultVal?: string) => {
    const React = require('react');
    return React.useState(defaultVal || '');
  },
}));

// Mock react-query
const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { data: [], pagination: { total: 0, totalPages: 1 } },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
  useMutation: ({ onSuccess }: any) => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

// Mock formatters
jest.mock('../../../lib/formatters', () => ({
  formatCurrency: (val: number) => `Rs. ${(val / 100).toFixed(2)}`,
}));

// Mock Breadcrumb
jest.mock('../../../components/Breadcrumb', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('nav', { 'data-testid': 'breadcrumb' }),
  };
});

// Mock EmptyState
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

// Mock lucide-react
jest.mock('lucide-react', () => {
  const React = require('react');
  return {
    Package: () => null,
    Upload: () => React.createElement('span', null, 'UploadIcon'),
    X: () => React.createElement('span', null, 'XIcon'),
    ImageIcon: () => React.createElement('span', null, 'ImageIcon'),
  };
});

// Mock API
jest.mock('../../../lib/api', () => ({
  getProducts: jest.fn(),
  createProduct: jest.fn(),
  updateProduct: jest.fn(),
  deleteProduct: jest.fn(),
  uploadProductImage: jest.fn(),
}));

describe('ProductsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the page heading', () => {
    render(<ProductsPage />);
    expect(screen.getByText('Products')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<ProductsPage />);
    expect(screen.getByText(/Manage your product catalog/)).toBeInTheDocument();
  });

  it('renders Add Product button', () => {
    render(<ProductsPage />);
    const addButtons = screen.getAllByText('+ Add Product');
    expect(addButtons.length).toBeGreaterThan(0);
  });

  it('shows the add form when clicking Add Product', () => {
    render(<ProductsPage />);
    // Click the header button (first one), not the EmptyState action
    const addButtons = screen.getAllByText('+ Add Product');
    fireEvent.click(addButtons[0]);
    expect(screen.getByText('Add New Product')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<ProductsPage />);
    expect(screen.getByPlaceholderText('Search by name, barcode, or SKU...')).toBeInTheDocument();
  });

  it('renders status filter buttons', () => {
    render(<ProductsPage />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('renders empty state when no products', () => {
    render(<ProductsPage />);
    expect(screen.getByText('No products yet')).toBeInTheDocument();
  });

  it('renders breadcrumb', () => {
    render(<ProductsPage />);
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });

  it('renders form fields when form is open', () => {
    render(<ProductsPage />);
    const addButtons = screen.getAllByText('+ Add Product');
    fireEvent.click(addButtons[0]);
    expect(screen.getByText('Product Name *')).toBeInTheDocument();
    expect(screen.getByText('Barcode (GTIN/EAN)')).toBeInTheDocument();
    expect(screen.getByText('Your SKU Code')).toBeInTheDocument();
    expect(screen.getByText(/Purchase Price/)).toBeInTheDocument();
    expect(screen.getByText('Minimum Order Quantity')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Product Image')).toBeInTheDocument();
  });

  it('shows Cancel button when form is open', () => {
    render(<ProductsPage />);
    const addButtons = screen.getAllByText('+ Add Product');
    fireEvent.click(addButtons[0]);
    const cancelBtns = screen.getAllByText('Cancel');
    expect(cancelBtns.length).toBeGreaterThan(0);
  });
});
