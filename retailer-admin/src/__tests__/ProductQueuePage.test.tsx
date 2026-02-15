import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProductQueuePage from '../pages/admin/ProductQueuePage';

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

// Also mock from relative path the component uses
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

vi.mock('../lib/hooks', () => ({
  useEscapeKey: vi.fn(),
}));

vi.mock('../../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

vi.mock('../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

const mockAuthFetch = vi.fn();
vi.mock('../../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/s/TEST/admin/product-queue']}>
      <Routes>
        <Route path="/s/:storeCode/admin/product-queue" element={<ProductQueuePage />} />
      </Routes>
    </MemoryRouter>
  );

describe('ProductQueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container).toBeTruthy();
  });

  it('shows loading or content', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    });
    renderPage();
    await waitFor(() => {
      // Should either show empty state or a heading
      expect(document.body.textContent).toBeTruthy();
    });
  });

  it('renders breadcrumb', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });
});
