// SuperAdmin — Test MaintenanceTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MaintenanceTab } from '../../tabs/MaintenanceTab';
import type { MaintenanceStatus } from '../../api/maintenance';

// Mock the maintenance API module
const mockFetchMaintenanceStatus = vi.fn();
const mockToggleMaintenanceMode = vi.fn();

vi.mock('../../api/maintenance', () => ({
  fetchMaintenanceStatus: () => mockFetchMaintenanceStatus(),
  toggleMaintenanceMode: (enabled: boolean, message?: string) => mockToggleMaintenanceMode(enabled, message),
}));

describe('MaintenanceTab', () => {
  const disabledStatus: MaintenanceStatus = {
    enabled: false,
    message: null,
    updated_at: null,
  };

  const enabledStatus: MaintenanceStatus = {
    enabled: true,
    message: 'Scheduled maintenance in progress',
    updated_at: '2024-01-15T10:30:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchMaintenanceStatus.mockResolvedValue(disabledStatus);
  });

  // =========================================================================
  // Loading state
  // =========================================================================

  describe('loading state', () => {
    it('shows loading message initially', async () => {
      mockFetchMaintenanceStatus.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(disabledStatus), 100))
      );

      render(<MaintenanceTab />);

      expect(screen.getByText('Loading maintenance status...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Loading maintenance status...')).not.toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Status display — disabled
  // =========================================================================

  describe('status display — disabled', () => {
    it('renders system online banner', async () => {
      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByText('System is ONLINE')).toBeInTheDocument();
      });
    });

    it('shows enable button when disabled', async () => {
      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByTestId('maintenance-enable-btn')).toBeInTheDocument();
      });
    });

    it('does not show disable button when already disabled', async () => {
      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.queryByTestId('maintenance-disable-btn')).not.toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Status display — enabled
  // =========================================================================

  describe('status display — enabled', () => {
    beforeEach(() => {
      mockFetchMaintenanceStatus.mockResolvedValue(enabledStatus);
    });

    it('renders maintenance active banner', async () => {
      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByText('Maintenance Mode is ACTIVE')).toBeInTheDocument();
      });
    });

    it('shows the custom maintenance message', async () => {
      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getAllByText('Scheduled maintenance in progress').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows disable button when enabled', async () => {
      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByTestId('maintenance-disable-btn')).toBeInTheDocument();
      });
    });

    it('does not show enable button when already enabled', async () => {
      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.queryByTestId('maintenance-enable-btn')).not.toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Error state
  // =========================================================================

  describe('error state', () => {
    it('displays error message on fetch failure', async () => {
      mockFetchMaintenanceStatus.mockRejectedValue(new Error('Network error'));

      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByTestId('maintenance-error')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      mockFetchMaintenanceStatus.mockRejectedValue(new Error('Network error'));

      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('retries on Retry button click', async () => {
      mockFetchMaintenanceStatus
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(disabledStatus);

      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(mockFetchMaintenanceStatus).toHaveBeenCalledTimes(2);
      });
    });
  });

  // =========================================================================
  // Toggle interaction
  // =========================================================================

  describe('toggle interaction', () => {
    it('shows confirmation dialog when enable button clicked', async () => {
      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByTestId('maintenance-enable-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('maintenance-enable-btn'));

      await waitFor(() => {
        expect(screen.getAllByText('Enable Maintenance Mode').length).toBeGreaterThanOrEqual(2);
      });
    });

    it('shows confirmation dialog when disable button clicked', async () => {
      mockFetchMaintenanceStatus.mockResolvedValue(enabledStatus);

      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByTestId('maintenance-disable-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('maintenance-disable-btn'));

      await waitFor(() => {
        expect(screen.getAllByText('Disable Maintenance Mode').length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // =========================================================================
  // Message input
  // =========================================================================

  describe('message input', () => {
    it('renders message textarea', async () => {
      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByTestId('maintenance-message-input')).toBeInTheDocument();
      });
    });

    it('shows character count', async () => {
      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByText('0/500')).toBeInTheDocument();
      });
    });

    it('updates character count on input', async () => {
      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByTestId('maintenance-message-input')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('maintenance-message-input'), {
        target: { value: 'hello' },
      });

      expect(screen.getByText('5/500')).toBeInTheDocument();
    });

    it('populates message from fetched status', async () => {
      mockFetchMaintenanceStatus.mockResolvedValue(enabledStatus);

      render(<MaintenanceTab />);

      await waitFor(() => {
        const textarea = screen.getByTestId('maintenance-message-input') as HTMLTextAreaElement;
        expect(textarea.value).toBe('Scheduled maintenance in progress');
      });
    });
  });

  // =========================================================================
  // Refresh button
  // =========================================================================

  describe('refresh button', () => {
    it('renders refresh button', async () => {
      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });
    });

    it('calls fetchMaintenanceStatus on refresh click', async () => {
      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Refresh'));

      await waitFor(() => {
        expect(mockFetchMaintenanceStatus).toHaveBeenCalledTimes(2);
      });
    });
  });

  // =========================================================================
  // Tab section wrapper
  // =========================================================================

  describe('section wrapper', () => {
    it('renders with correct test ID', async () => {
      render(<MaintenanceTab />);

      expect(screen.getByTestId('maintenance-tab')).toBeInTheDocument();
    });

    it('renders section heading', async () => {
      render(<MaintenanceTab />);

      expect(screen.getByText('System Maintenance')).toBeInTheDocument();
    });

    it('renders description text', async () => {
      render(<MaintenanceTab />);

      expect(screen.getByText(/Toggle maintenance mode/)).toBeInTheDocument();
    });
  });
});
