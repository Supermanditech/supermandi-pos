import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CustomersPage from '../pages/CustomersPage';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: ({ items }: { items: { label: string }[] }) => <nav data-testid="breadcrumb">{items.map(i => i.label).join(' > ')}</nav>,
}));

vi.mock('../components/EmptyState', () => ({
  default: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  ),
}));

vi.mock('../lib/formatters', () => ({
  formatDateTime: (d: string) => new Date(d).toLocaleDateString(),
  formatCurrency: (v: number) => `Rs ${(v / 100).toFixed(2)}`,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Users: () => <span>UsersIcon</span>,
  RefreshCw: ({ className }: { className?: string }) => <span className={className}>RefreshIcon</span>,
  Search: () => <span>SearchIcon</span>,
  ChevronLeft: () => <span>ChevronLeftIcon</span>,
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

describe('CustomersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no customers', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ customers: [], total: 0 }),
    });
    render(<MemoryRouter><CustomersPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('No customers found')).toBeInTheDocument();
    });
  });

  it('renders customer list', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        customers: [
          { id: 'c1', name: 'John', phone: '9876543210', totalPurchasesMinor: 50000, visitCount: 3, lastVisitAt: null, creditLimitMinor: 10000, email: null, address: null, storeId: 's1', createdAt: '2026-01-01' },
        ],
        total: 1,
      }),
    });
    render(<MemoryRouter><CustomersPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('John')).toBeInTheDocument();
      expect(screen.getByText('9876543210')).toBeInTheDocument();
    });
  });

  it('shows customer count in header', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ customers: [], total: 5 }),
    });
    render(<MemoryRouter><CustomersPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Customers (5)')).toBeInTheDocument();
    });
  });

  it('shows search input', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ customers: [], total: 0 }),
    });
    render(<MemoryRouter><CustomersPage /></MemoryRouter>);
    expect(screen.getByPlaceholderText('Search name or phone...')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });
    render(<MemoryRouter><CustomersPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch customers|Failed to load customers/)).toBeInTheDocument();
    });
  });

  it('renders breadcrumb', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><CustomersPage /></MemoryRouter>);
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });
});
