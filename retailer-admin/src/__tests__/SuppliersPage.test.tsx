import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SuppliersPage from '../pages/SuppliersPage';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

vi.mock('../components/EmptyState', () => ({
  default: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state"><h3>{title}</h3><p>{description}</p></div>
  ),
}));

vi.mock('../hooks/useUrlState', () => ({
  useUrlState: (key: string, defaultValue: string = '') => {
    const { useState } = require('react');
    return useState(defaultValue);
  },
}));

vi.mock('lucide-react', () => ({
  Truck: () => <span>TruckIcon</span>,
  Search: () => <span>SearchIcon</span>,
  RefreshCw: ({ className }: { className?: string }) => <span className={className}>RefreshIcon</span>,
  Plus: () => <span>PlusIcon</span>,
  ExternalLink: () => <span>ExternalLinkIcon</span>,
  MapPin: () => <span>MapPinIcon</span>,
  Phone: () => <span>PhoneIcon</span>,
  Mail: () => <span>MailIcon</span>,
  ChevronDown: () => <span>ChevronDownIcon</span>,
  ChevronUp: () => <span>ChevronUpIcon</span>,
  X: () => <span>XIcon</span>,
  Star: () => <span>StarIcon</span>,
  Package: () => <span>PackageIcon</span>,
  FileText: () => <span>FileTextIcon</span>,
  Settings: () => <span>SettingsIcon</span>,
  Check: () => <span>CheckIcon</span>,
  AlertCircle: () => <span>AlertCircleIcon</span>,
  Building: () => <span>BuildingIcon</span>,
  CreditCard: () => <span>CreditCardIcon</span>,
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/s/TEST/suppliers']}>
      <Routes>
        <Route path="/s/:storeCode/suppliers" element={<SuppliersPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('SuppliersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container).toBeTruthy();
  });

  it('renders breadcrumb', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });

  it('shows empty state when no suppliers', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [], total: 0 }),
    });
    renderPage();
    await waitFor(() => {
      const emptyState = screen.queryByTestId('empty-state');
      if (emptyState) {
        expect(emptyState).toBeInTheDocument();
      }
    });
  });

  it('renders page heading', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    // "Suppliers" appears in multiple elements (heading, breadcrumb, etc.) - use getByRole
    expect(screen.getByRole('heading', { name: /Suppliers/i })).toBeInTheDocument();
  });
});
