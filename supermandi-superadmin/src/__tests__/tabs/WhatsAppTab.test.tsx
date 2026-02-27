// SuperAdmin — Test WhatsAppTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatsAppTab } from '../../tabs/WhatsAppTab';
import type { WhatsAppStats, WhatsAppLogEntry, WhatsAppCtaConfig } from '../../api/whatsapp';

// Mock the whatsapp API module
const mockFetchStatus = vi.fn();
const mockFetchStats = vi.fn();
const mockFetchLogs = vi.fn();
const mockSendMessage = vi.fn();
const mockSendBroadcast = vi.fn();
const mockFetchCtaConfig = vi.fn();
const mockUpdateCtaConfig = vi.fn();

vi.mock('../../api/whatsapp', () => ({
  fetchWhatsAppStatus: () => mockFetchStatus(),
  fetchWhatsAppStats: () => mockFetchStats(),
  fetchWhatsAppLogs: (...args: unknown[]) => mockFetchLogs(...args),
  sendWhatsAppMessage: (...args: unknown[]) => mockSendMessage(...args),
  sendWhatsAppBroadcast: (...args: unknown[]) => mockSendBroadcast(...args),
  fetchWhatsAppCtaConfig: () => mockFetchCtaConfig(),
  updateWhatsAppCtaConfig: (...args: unknown[]) => mockUpdateCtaConfig(...args),
}));

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

const mockStats: WhatsAppStats = {
  totalMessages: 150, sent: 120, delivered: 100, read: 80,
  failed: 5, fromPos: 90, fromAdmin: 60, last24h: 12, last7d: 45,
};

const mockLog: WhatsAppLogEntry = {
  id: 'log-1', storeId: 'store-1', senderType: 'pos', recipientType: 'retailer',
  recipientPhone: '9876543210', messageType: 'text', templateName: null,
  contentPreview: 'Your order is ready', wamid: 'wam-123',
  deliveryStatus: 'delivered', deliveryErrorCode: null,
  deliveredAt: '2026-01-15T10:05:00Z', readAt: null,
  contextType: 'order_update', contextId: 'ord-1',
  createdAt: '2026-01-15T10:00:00Z',
};

const mockCtaConfig: WhatsAppCtaConfig = {
  enabled: true, superadminNumber: '919251893684',
  superadminMessage: 'Hi, I need help with SuperMandi',
  companyNumber: '919876543210', companyMessage: 'Hi SuperMandi',
  updatedAt: '2026-01-15T10:00:00Z', updatedBy: 'admin',
};

describe('WhatsAppTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchStatus.mockResolvedValue({ configured: true });
    mockFetchStats.mockResolvedValue(mockStats);
    mockFetchLogs.mockResolvedValue({ data: [mockLog], total: 1 });
    mockFetchCtaConfig.mockResolvedValue(mockCtaConfig);
  });

  it('shows loading state initially', () => {
    mockFetchStatus.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ configured: true }), 100))
    );
    mockFetchStats.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockStats), 100))
    );
    mockFetchLogs.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ data: [], total: 0 }), 100))
    );
    render(<WhatsAppTab />);
    expect(screen.getByText('Loading messages...')).toBeInTheDocument();
  });

  it('shows connected status banner', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('WhatsApp Cloud API Connected')).toBeInTheDocument();
    });
  });

  it('shows not configured banner', async () => {
    mockFetchStatus.mockResolvedValue({ configured: false });
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('WhatsApp Not Configured')).toBeInTheDocument();
    });
  });

  it('renders stats cards', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('150')).toBeInTheDocument(); // totalMessages
      expect(screen.getByText('Total')).toBeInTheDocument();
      // "Sent", "Delivered", "Read", "Failed" also appear in filter options
      expect(screen.getAllByText('Sent').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Delivered').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Read').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Last 24h')).toBeInTheDocument();
      expect(screen.getByText('Last 7d')).toBeInTheDocument();
    });
  });

  it('renders message log table', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('Your order is ready')).toBeInTheDocument();
      expect(screen.getByText('9876543210')).toBeInTheDocument();
      expect(screen.getByText('delivered')).toBeInTheDocument();
      expect(screen.getByText('order_update')).toBeInTheDocument();
    });
  });

  it('shows no messages state', async () => {
    mockFetchLogs.mockResolvedValue({ data: [], total: 0 });
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('No messages found')).toBeInTheDocument();
    });
  });

  it('renders send message form', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('Send Message')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('+91 98765 43210')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });
  });

  it('renders filter dropdowns', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('All Senders')).toBeInTheDocument();
      expect(screen.getByText('All Statuses')).toBeInTheDocument();
      expect(screen.getByText('All Types')).toBeInTheDocument();
    });
  });

  it('shows error on fetch failure', async () => {
    mockFetchStatus.mockRejectedValue(new Error('Network error'));
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  it('renders broadcast toggle button', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      // "Broadcast" appears as both toggle button and filter option
      expect(screen.getAllByText('Broadcast').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('expands broadcast form on click', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getAllByText('Broadcast').length).toBeGreaterThanOrEqual(1);
    });
    // Click the button (first match), not the filter option
    const broadcastElements = screen.getAllByText('Broadcast');
    // Find the button element
    const broadcastBtn = broadcastElements.find(el => el.tagName === 'BUTTON');
    fireEvent.click(broadcastBtn || broadcastElements[0]);
    expect(screen.getByText(/max 50 recipients/)).toBeInTheDocument();
    expect(screen.getByText('Send Broadcast')).toBeInTheDocument();
  });

  it('shows refresh button', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
  });

  it('calls loadData on refresh click', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Refresh'));
    // Initial load + refresh = 2 calls each
    await waitFor(() => {
      expect(mockFetchStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('shows message count', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('1 message')).toBeInTheDocument();
    });
  });

  describe('CTA Config', () => {
    it('renders CTA config section', async () => {
      render(<WhatsAppTab />);
      await waitFor(() => {
        expect(screen.getByText('Landing Page WhatsApp CTA Config')).toBeInTheDocument();
      });
    });

    it('shows current CTA config values', async () => {
      render(<WhatsAppTab />);
      await waitFor(() => {
        expect(screen.getByText('919251893684')).toBeInTheDocument();
        expect(screen.getByText('919876543210')).toBeInTheDocument();
        expect(screen.getByText('Enabled')).toBeInTheDocument();
      });
    });

    it('shows edit button', async () => {
      render(<WhatsAppTab />);
      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
      });
    });

    it('switches to edit mode', async () => {
      render(<WhatsAppTab />);
      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Widget Enabled')).toBeInTheDocument();
      expect(screen.getByText('Save & Apply Live')).toBeInTheDocument();
    });

    it('shows CTA loading state', () => {
      mockFetchCtaConfig.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockCtaConfig), 100))
      );
      render(<WhatsAppTab />);
      expect(screen.getByText('Loading config...')).toBeInTheDocument();
    });

    it('shows CTA error state', async () => {
      mockFetchCtaConfig.mockRejectedValue(new Error('CTA load failed'));
      render(<WhatsAppTab />);
      await waitFor(() => {
        expect(screen.getByText(/CTA load failed/)).toBeInTheDocument();
      });
    });
  });
});
