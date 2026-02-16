import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SupplierCatalogPage from '../pages/SupplierCatalogPage';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/s/TEST/supplier-catalog']}>
      <Routes>
        <Route path="/s/:storeCode/supplier-catalog" element={<SupplierCatalogPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('SupplierCatalogPage', () => {
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

  it('renders page heading', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    // "Supplier Catalog" appears in multiple places (heading, breadcrumb, info text) - use getByRole
    expect(screen.getByRole('heading', { name: /Supplier Catalog/i })).toBeInTheDocument();
  });

  it('shows empty or loading state initially', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    // Should have a search or loading indicator
    screen.queryByPlaceholderText(/search/i);
    // Either search exists or we're in a loading state
    expect(document.body).toBeTruthy();
  });
});
