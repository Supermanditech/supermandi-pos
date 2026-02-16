import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReorderPage from '../pages/ReorderPage';

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

vi.mock('lucide-react', () => ({
  PackageCheck: () => <span>PackageCheckIcon</span>,
  RefreshCw: ({ className }: { className?: string }) => <span className={className}>RefreshIcon</span>,
  Settings: () => <span>SettingsIcon</span>,
  AlertTriangle: () => <span>AlertIcon</span>,
  CreditCard: () => <span>CreditCardIcon</span>,
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

describe('ReorderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page content', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><ReorderPage /></MemoryRouter>);
    // The page should render with breadcrumb
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });

  it('renders without crashing', () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: { settings: { reorderEnabled: false }, suggestions: [], pending: [] } }),
    });
    const { container } = render(<MemoryRouter><ReorderPage /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
