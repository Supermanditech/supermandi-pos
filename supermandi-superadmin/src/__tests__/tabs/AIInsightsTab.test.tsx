// SuperAdmin — Test AIInsightsTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AIInsightsTab } from '../../tabs/AIInsightsTab';

// Mock authToken and errorSanitizer (used by local apiFetch)
const mockFetchWithTimeout = vi.fn();

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test' }),
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock('../../api/errorSanitizer', () => ({
  parseError: vi.fn(async () => 'API Error'),
}));

function okResponse(data: unknown) {
  return { ok: true, json: () => Promise.resolve(data) };
}
function errResponse() {
  return { ok: false, json: () => Promise.resolve({ error: 'Server Error' }) };
}

describe('AIInsightsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no storeId so fetchData is a no-op
    mockFetchWithTimeout.mockResolvedValue(okResponse({ anomalies: [], alerts: [] }));
  });

  it('renders header', () => {
    render(<AIInsightsTab />);
    expect(screen.getByText('AI Intelligence')).toBeInTheDocument();
  });

  it('renders view toggle buttons', () => {
    render(<AIInsightsTab />);
    expect(screen.getByText('Anomalies')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
    expect(screen.getByText('Jobs')).toBeInTheDocument();
  });

  it('shows store ID input on anomalies view', () => {
    render(<AIInsightsTab />);
    expect(screen.getByPlaceholderText('Enter Store ID...')).toBeInTheDocument();
  });

  it('shows empty state without store ID', () => {
    render(<AIInsightsTab />);
    expect(screen.getByText('Enter a Store ID to view anomalies')).toBeInTheDocument();
  });

  it('shows loading state when fetching', async () => {
    mockFetchWithTimeout.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(okResponse({ anomalies: [] })), 100))
    );
    render(<AIInsightsTab />);

    const input = screen.getByPlaceholderText('Enter Store ID...');
    fireEvent.change(input, { target: { value: 'store-1' } });
    fireEvent.click(screen.getByText('Load'));

    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  it('renders anomalies table with data', async () => {
    const anomalies = [{
      id: 'a1', storeId: 's1', anomalyType: 'price_spike', severity: 'warning',
      description: 'Price increased 200%', metadata: {}, isReviewed: false,
      detectedAt: '2026-01-15T10:00:00Z',
    }];
    mockFetchWithTimeout.mockResolvedValue(okResponse({ anomalies }));

    render(<AIInsightsTab />);
    const input = screen.getByPlaceholderText('Enter Store ID...');
    fireEvent.change(input, { target: { value: 'store-1' } });
    fireEvent.click(screen.getByText('Load'));

    await waitFor(() => {
      expect(screen.getByText('price spike')).toBeInTheDocument();
      expect(screen.getByText('warning')).toBeInTheDocument();
      expect(screen.getByText('Price increased 200%')).toBeInTheDocument();
    });
  });

  it('shows no anomalies message with store ID', async () => {
    mockFetchWithTimeout.mockResolvedValue(okResponse({ anomalies: [] }));

    render(<AIInsightsTab />);
    const input = screen.getByPlaceholderText('Enter Store ID...');
    fireEvent.change(input, { target: { value: 'store-1' } });
    fireEvent.click(screen.getByText('Load'));

    await waitFor(() => {
      expect(screen.getByText('No anomalies detected')).toBeInTheDocument();
    });
  });

  it('shows error banner on fetch failure', async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error('Network error'));

    render(<AIInsightsTab />);
    const input = screen.getByPlaceholderText('Enter Store ID...');
    fireEvent.change(input, { target: { value: 'store-1' } });
    fireEvent.click(screen.getByText('Load'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('switches to alerts view', async () => {
    render(<AIInsightsTab />);
    fireEvent.click(screen.getByText('Alerts'));
    expect(screen.getByText('Enter a Store ID to view alerts')).toBeInTheDocument();
  });

  it('renders alert cards', async () => {
    const alerts = [{
      id: 'al1', storeId: 's1', alertType: 'stock_low', severity: 'critical',
      title: 'Low Stock Alert', message: 'Tomatoes below threshold',
      isRead: false, createdAt: '2026-01-15T10:00:00Z',
    }];
    mockFetchWithTimeout.mockResolvedValue(okResponse({ alerts }));

    render(<AIInsightsTab />);
    fireEvent.click(screen.getByText('Alerts'));

    const input = screen.getByPlaceholderText('Enter Store ID...');
    fireEvent.change(input, { target: { value: 'store-1' } });
    fireEvent.click(screen.getByText('Load'));

    await waitFor(() => {
      expect(screen.getByText('Low Stock Alert')).toBeInTheDocument();
      expect(screen.getByText('Tomatoes below threshold')).toBeInTheDocument();
    });
  });

  it('switches to jobs view and shows job buttons', () => {
    render(<AIInsightsTab />);
    fireEvent.click(screen.getByText('Jobs'));

    expect(screen.getByText('Run Alert Analysis')).toBeInTheDocument();
    expect(screen.getByText('Run Demand Forecasting')).toBeInTheDocument();
    expect(screen.getByText('Run Smart Reorder')).toBeInTheDocument();
    expect(screen.getByText('Run Auto Daily Closing')).toBeInTheDocument();
    expect(screen.getByText('Run Customer Insights')).toBeInTheDocument();
    expect(screen.getByText('Run Anomaly Detection')).toBeInTheDocument();
    expect(screen.getByText('Run Recommendations')).toBeInTheDocument();
  });

  it('hides store ID input in jobs view', () => {
    render(<AIInsightsTab />);
    fireEvent.click(screen.getByText('Jobs'));
    expect(screen.queryByPlaceholderText('Enter Store ID...')).not.toBeInTheDocument();
  });

  it('runs a job and shows result', async () => {
    mockFetchWithTimeout.mockResolvedValue(okResponse({ processed: 5 }));

    render(<AIInsightsTab />);
    fireEvent.click(screen.getByText('Jobs'));
    fireEvent.click(screen.getByText('Run Alert Analysis'));

    await waitFor(() => {
      // Result shown in <pre>: "Run Alert Analysis: {"processed":5}"
      expect(screen.getByText(/processed.*5/)).toBeInTheDocument();
    });
  });

  it('shows error when job fails', async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error('Job failed'));

    render(<AIInsightsTab />);
    fireEvent.click(screen.getByText('Jobs'));
    fireEvent.click(screen.getByText('Run Alert Analysis'));

    await waitFor(() => {
      expect(screen.getByText('Job failed')).toBeInTheDocument();
    });
  });

  it('disables load button without store ID', () => {
    render(<AIInsightsTab />);
    const loadBtn = screen.getByText('Load');
    expect(loadBtn).toBeDisabled();
  });
});
