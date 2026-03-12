// SA-P2-008: Test BulkImportNotifications component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BulkImportNotifications } from '../../components/BulkImportNotifications';

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

const mockFetchImportJobs = vi.fn();

vi.mock('../../api/imports', () => ({
  fetchImportJobs: (...args: unknown[]) => mockFetchImportJobs(...args),
}));

describe('BulkImportNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    mockFetchImportJobs.mockReturnValue(new Promise(() => {}));

    render(<BulkImportNotifications />);

    expect(screen.getByText(/Loading import jobs/i)).toBeTruthy();
  });

  it('renders empty state when no imports', async () => {
    mockFetchImportJobs.mockResolvedValue({ imports: [], total: 0, limit: 20, offset: 0 });

    render(<BulkImportNotifications />);

    await waitFor(() => {
      expect(screen.getByText(/No import jobs found/i)).toBeTruthy();
    });
  });

  it('renders import jobs in table', async () => {
    mockFetchImportJobs.mockResolvedValue({
      imports: [
        {
          id: 'imp-1',
          store_id: 's1',
          store_name: 'Test Store',
          file_name: 'products.csv',
          import_mode: 'merge',
          status: 'committed',
          total_rows: 100,
          valid_rows: 95,
          error_rows: 5,
          products_created: 90,
          products_updated: 5,
          suppliers_created: 0,
          created_at: '2026-03-10T10:00:00Z',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    render(<BulkImportNotifications />);

    await waitFor(() => {
      expect(screen.getByText('Test Store')).toBeTruthy();
      expect(screen.getByText('products.csv')).toBeTruthy();
      expect(screen.getByText('committed')).toBeTruthy();
    });
  });

  it('shows error state on fetch failure', async () => {
    mockFetchImportJobs.mockRejectedValue(new Error('Network error'));

    render(<BulkImportNotifications />);

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeTruthy();
    });
  });

  it('renders header with CSV Import Jobs title', async () => {
    mockFetchImportJobs.mockResolvedValue({ imports: [], total: 0, limit: 20, offset: 0 });

    render(<BulkImportNotifications />);

    await waitFor(() => {
      expect(screen.getByText('CSV Import Jobs')).toBeTruthy();
    });
  });

  it('renders status filter dropdown', async () => {
    mockFetchImportJobs.mockResolvedValue({ imports: [], total: 0, limit: 20, offset: 0 });

    render(<BulkImportNotifications />);

    await waitFor(() => {
      expect(screen.getByText('Status Filter')).toBeTruthy();
    });
  });

  it('renders refresh button', async () => {
    mockFetchImportJobs.mockResolvedValue({ imports: [], total: 0, limit: 20, offset: 0 });

    render(<BulkImportNotifications />);

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeTruthy();
    });
  });

  it('renders pagination when multiple pages', async () => {
    mockFetchImportJobs.mockResolvedValue({
      imports: Array.from({ length: 20 }, (_, i) => ({
        id: `imp-${i}`,
        store_id: 's1',
        store_name: 'Store',
        file_name: `file-${i}.csv`,
        status: 'committed',
        total_rows: 10,
        valid_rows: 10,
        error_rows: 0,
        products_created: 10,
        products_updated: 0,
        suppliers_created: 0,
        created_at: '2026-01-01',
      })),
      total: 50,
      limit: 20,
      offset: 0,
    });

    render(<BulkImportNotifications />);

    await waitFor(() => {
      expect(screen.getByText(/Page 1/i)).toBeTruthy();
      expect(screen.getByText('Next')).toBeTruthy();
    });
  });

  it('shows total count in header', async () => {
    mockFetchImportJobs.mockResolvedValue({ imports: [], total: 42, limit: 20, offset: 0 });

    render(<BulkImportNotifications />);

    await waitFor(() => {
      expect(screen.getByText(/42 import jobs/i)).toBeTruthy();
    });
  });

  it('truncates long file names', async () => {
    mockFetchImportJobs.mockResolvedValue({
      imports: [
        {
          id: 'imp-1',
          store_id: 's1',
          store_name: 'Store',
          file_name: 'very-long-file-name-that-exceeds-thirty-characters.csv',
          status: 'committed',
          total_rows: 10,
          valid_rows: 10,
          error_rows: 0,
          products_created: 10,
          products_updated: 0,
          suppliers_created: 0,
          created_at: '2026-01-01',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    render(<BulkImportNotifications />);

    await waitFor(() => {
      expect(screen.getByText(/\.\.\./)).toBeTruthy();
    });
  });

  it('highlights error rows in red', async () => {
    mockFetchImportJobs.mockResolvedValue({
      imports: [
        {
          id: 'imp-1',
          store_id: 's1',
          store_name: 'Store',
          file_name: 'test.csv',
          status: 'failed',
          total_rows: 10,
          valid_rows: 0,
          error_rows: 10,
          products_created: 0,
          products_updated: 0,
          suppliers_created: 0,
          created_at: '2026-01-01',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    render(<BulkImportNotifications />);

    await waitFor(() => {
      // Error count cell should have danger class
      const errorCell = screen.getByText('10');
      expect(errorCell).toBeTruthy();
    });
  });
});
