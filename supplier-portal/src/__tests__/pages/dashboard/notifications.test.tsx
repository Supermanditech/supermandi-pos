import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationsPage from '../../../app/(dashboard)/notifications/page';

// Mock Breadcrumb
jest.mock('../../../components/Breadcrumb', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('nav', { 'data-testid': 'breadcrumb' }),
  };
});

// Mock lucide-react
jest.mock('lucide-react', () => {
  const React = require('react');
  const mockIcon = (name: string) => ({ size, className, ...props }: any) =>
    React.createElement('svg', { 'data-testid': `icon-${name}`, ...props });
  return {
    Bell: mockIcon('Bell'),
    Check: mockIcon('Check'),
    CheckCheck: mockIcon('CheckCheck'),
    RefreshCw: mockIcon('RefreshCw'),
    Truck: mockIcon('Truck'),
    Package: mockIcon('Package'),
    AlertTriangle: mockIcon('AlertTriangle'),
  };
});

// Mock fetch for notifications API
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn().mockReturnValue('test-token'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('NotificationsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: [],
        pagination: { total: 0 },
      }),
    });
  });

  it('renders the page heading', async () => {
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });
  });

  it('renders Refresh button', async () => {
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
  });

  it('shows empty state when no notifications', async () => {
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    });
  });

  it('shows total count', async () => {
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText(/0 total/)).toBeInTheDocument();
    });
  });

  it('renders breadcrumb', async () => {
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
    });
  });

  it('renders loading state initially', () => {
    // Don't resolve fetch immediately
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<NotificationsPage />);
    expect(screen.getByText('Loading notifications...')).toBeInTheDocument();
  });
});
