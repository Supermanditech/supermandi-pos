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

vi.mock('../../components/ConfirmDialog', () => ({
  ConfirmDialog: ({ title, message, confirmLabel, onConfirm, onCancel }: {
    title: string; message: string; confirmLabel: string;
    onConfirm: () => void; onCancel: () => void;
  }) => (
    <div data-testid="confirm-dialog">
      <div>{title}</div>
      <div>{message}</div>
      <button onClick={onConfirm}>{confirmLabel}</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
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

  // ── Loading State ─────────────────────────────────────────

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

  // ── Status Banner ─────────────────────────────────────────

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

  // ── Stats Cards ───────────────────────────────────────────

  it('renders stats cards', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getAllByText('Sent').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Delivered').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Read').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Last 24h')).toBeInTheDocument();
      expect(screen.getByText('Last 7d')).toBeInTheDocument();
    });
  });

  it('renders stats values', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('120')).toBeInTheDocument(); // sent
      expect(screen.getByText('100')).toBeInTheDocument(); // delivered
      expect(screen.getByText('80')).toBeInTheDocument();  // read
      expect(screen.getByText('5')).toBeInTheDocument();   // failed
      expect(screen.getByText('12')).toBeInTheDocument();  // last24h
    });
  });

  // ── Message Log Table ─────────────────────────────────────

  it('renders message log table', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('Your order is ready')).toBeInTheDocument();
      expect(screen.getByText('9876543210')).toBeInTheDocument();
      expect(screen.getByText('delivered')).toBeInTheDocument();
      expect(screen.getByText('order_update')).toBeInTheDocument();
    });
  });

  it('renders table column headers', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('Time')).toBeInTheDocument();
      expect(screen.getByText('From')).toBeInTheDocument();
      expect(screen.getByText('To')).toBeInTheDocument();
      expect(screen.getByText('Phone')).toBeInTheDocument();
      expect(screen.getByText('Preview')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Context')).toBeInTheDocument();
    });
  });

  it('shows no messages state', async () => {
    mockFetchLogs.mockResolvedValue({ data: [], total: 0 });
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('No messages found')).toBeInTheDocument();
    });
  });

  // ── Send Message Form ─────────────────────────────────────

  it('renders send message form', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('Send Message')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('+91 98765 43210')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });
  });

  it('renders recipient type dropdown in send form', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByLabelText('Recipient Phone')).toBeInTheDocument();
      expect(screen.getByLabelText('Type')).toBeInTheDocument();
      expect(screen.getByLabelText('Message')).toBeInTheDocument();
    });
  });

  it('disables send button when fields are empty', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      const sendButtons = screen.getAllByText('Send');
      const sendBtn = sendButtons.find(el => el.tagName === 'BUTTON' && el.textContent === 'Send');
      expect(sendBtn).toBeTruthy();
      expect((sendBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  // ── Filter Dropdowns ──────────────────────────────────────

  it('renders filter dropdowns', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('All Senders')).toBeInTheDocument();
      expect(screen.getByText('All Statuses')).toBeInTheDocument();
      expect(screen.getByText('All Types')).toBeInTheDocument();
    });
  });

  it('has accessible labels for filter dropdowns', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByLabelText('Sender type')).toBeInTheDocument();
      expect(screen.getByLabelText('Delivery status')).toBeInTheDocument();
      expect(screen.getByLabelText('Context type')).toBeInTheDocument();
    });
  });

  // ── Error State ───────────────────────────────────────────

  it('shows error on fetch failure', async () => {
    mockFetchStatus.mockRejectedValue(new Error('Network error'));
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  // ── Broadcast ─────────────────────────────────────────────

  it('renders broadcast toggle button', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getAllByText('Broadcast').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('expands broadcast form on click', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getAllByText('Broadcast').length).toBeGreaterThanOrEqual(1);
    });
    const broadcastElements = screen.getAllByText('Broadcast');
    const broadcastBtn = broadcastElements.find(el => el.tagName === 'BUTTON');
    fireEvent.click(broadcastBtn || broadcastElements[0]);
    expect(screen.getByText(/max 50 recipients/)).toBeInTheDocument();
    expect(screen.getByText('Send Broadcast')).toBeInTheDocument();
  });

  it('shows phone numbers textarea in broadcast form', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getAllByText('Broadcast').length).toBeGreaterThanOrEqual(1);
    });
    const broadcastElements = screen.getAllByText('Broadcast');
    const broadcastBtn = broadcastElements.find(el => el.tagName === 'BUTTON');
    fireEvent.click(broadcastBtn || broadcastElements[0]);
    expect(screen.getByText('Phone Numbers (comma or newline separated)')).toBeInTheDocument();
  });

  it('toggles broadcast form to Hide Broadcast', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getAllByText('Broadcast').length).toBeGreaterThanOrEqual(1);
    });
    const broadcastElements = screen.getAllByText('Broadcast');
    const broadcastBtn = broadcastElements.find(el => el.tagName === 'BUTTON');
    fireEvent.click(broadcastBtn || broadcastElements[0]);
    expect(screen.getByText('Hide Broadcast')).toBeInTheDocument();
  });

  // ── Refresh ───────────────────────────────────────────────

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
    await waitFor(() => {
      expect(mockFetchStatus).toHaveBeenCalledTimes(2);
    });
  });

  // ── Message Count ─────────────────────────────────────────

  it('shows message count', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('1 message')).toBeInTheDocument();
    });
  });

  it('shows plural message count', async () => {
    mockFetchLogs.mockResolvedValue({ data: [mockLog, { ...mockLog, id: 'log-2' }], total: 2 });
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('2 messages')).toBeInTheDocument();
    });
  });

  it('shows zero messages count', async () => {
    mockFetchLogs.mockResolvedValue({ data: [], total: 0 });
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('0 messages')).toBeInTheDocument();
    });
  });

  // ── CTA Config ────────────────────────────────────────────

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

    it('shows superadmin and company messages', async () => {
      render(<WhatsAppTab />);
      await waitFor(() => {
        expect(screen.getByText(/Hi, I need help with SuperMandi/)).toBeInTheDocument();
        expect(screen.getByText(/Hi SuperMandi/)).toBeInTheDocument();
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

    it('shows superadmin number input in edit mode', async () => {
      render(<WhatsAppTab />);
      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));
      expect(screen.getByText(/Superadmin Number/)).toBeInTheDocument();
      expect(screen.getByText(/Company Number/)).toBeInTheDocument();
    });

    it('cancels edit mode', async () => {
      render(<WhatsAppTab />);
      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.getByText('Edit')).toBeInTheDocument();
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

    it('shows Disabled badge when CTA is disabled', async () => {
      mockFetchCtaConfig.mockResolvedValue({ ...mockCtaConfig, enabled: false });
      render(<WhatsAppTab />);
      await waitFor(() => {
        expect(screen.getByText('Disabled')).toBeInTheDocument();
      });
    });

    it('shows last updated info', async () => {
      render(<WhatsAppTab />);
      await waitFor(() => {
        expect(screen.getByText(/Last updated/)).toBeInTheDocument();
        expect(screen.getByText(/by admin/)).toBeInTheDocument();
      });
    });
  });

  // ── Pagination ────────────────────────────────────────────

  it('shows pagination when total exceeds page size', async () => {
    mockFetchLogs.mockResolvedValue({ data: Array(25).fill(mockLog).map((l, i) => ({ ...l, id: `log-${i}` })), total: 50 });
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });
  });

  it('does not show pagination for single page', async () => {
    render(<WhatsAppTab />);
    await waitFor(() => {
      expect(screen.getByText('1 message')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });
});
