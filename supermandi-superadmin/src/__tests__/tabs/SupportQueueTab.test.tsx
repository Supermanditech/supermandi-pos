// SuperAdmin — Test SupportQueueTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SupportQueueTab } from '../../tabs/SupportQueueTab';

// Mock authToken and errorSanitizer (used by local apiFetch)
const mockFetchWithTimeout = vi.fn();

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test' }),
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock('../../api/errorSanitizer', () => ({
  parseError: vi.fn(async () => 'API Error'),
}));

const mockConversations = [
  {
    id: 'conv-1', type: 'support', title: 'Billing Issue',
    storeId: 'store-1', isActive: true,
    lastMessageAt: '2026-01-15T14:30:00Z',
    lastMessagePreview: 'I need help with my invoice',
    createdAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'conv-2', type: 'support', title: null,
    storeId: 'store-2', isActive: false,
    lastMessageAt: null, lastMessagePreview: null,
    createdAt: '2026-01-14T08:00:00Z',
  },
];

const mockMessages = [
  { id: 'msg-1', senderId: 'user-1', senderType: 'retailer', messageType: 'text', content: 'Help me please', createdAt: '2026-01-15T14:00:00Z' },
  { id: 'msg-2', senderId: 'admin-1', senderType: 'admin', messageType: 'text', content: 'Sure, how can I help?', createdAt: '2026-01-15T14:05:00Z' },
];

const mockTemplates = [
  { id: 't-1', name: 'Welcome', category: 'onboarding', channel: 'both', language: 'en', bodyTemplate: 'Welcome to SuperMandi!', variables: [], isActive: true },
  { id: 't-2', name: 'Order Update', category: 'transactional', channel: 'whatsapp', language: 'en', bodyTemplate: 'Your order {{orderId}} is ready', variables: ['orderId'], isActive: false },
];

function okResponse(data: unknown) {
  return { ok: true, json: () => Promise.resolve(data) };
}

describe('SupportQueueTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: queue view loads conversations
    mockFetchWithTimeout.mockResolvedValue(okResponse({ conversations: mockConversations }));
  });

  it('renders header', async () => {
    render(<SupportQueueTab />);
    await waitFor(() => {
      // "Support Queue" appears as both h2 header and toggle button
      expect(screen.getAllByText('Support Queue').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows loading state initially', () => {
    mockFetchWithTimeout.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(okResponse({ conversations: [] })), 100))
    );
    render(<SupportQueueTab />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders view toggle buttons', async () => {
    render(<SupportQueueTab />);
    // "Support Queue" appears as both h2 header and toggle button
    expect(screen.getAllByText('Support Queue').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Templates')).toBeInTheDocument();
  });

  it('renders status filter buttons', async () => {
    render(<SupportQueueTab />);
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('renders conversation list', async () => {
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
      expect(screen.getByText('I need help with my invoice')).toBeInTheDocument();
    });
  });

  it('shows Support Chat for conversations without title', async () => {
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Support Chat')).toBeInTheDocument();
    });
  });

  it('shows Open/Resolved badges', async () => {
    render(<SupportQueueTab />);
    await waitFor(() => {
      // "Open" and "Resolved" appear as both filter buttons and conversation badges
      expect(screen.getAllByText('Open').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('Resolved').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows empty state when no conversations', async () => {
    mockFetchWithTimeout.mockResolvedValue(okResponse({ conversations: [] }));
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('No open support conversations')).toBeInTheDocument();
    });
  });

  it('shows placeholder when no conversation selected', async () => {
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Select a conversation to view messages')).toBeInTheDocument();
    });
  });

  it('loads messages when conversation clicked', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations })) // initial queue load
      .mockResolvedValueOnce(okResponse({ messages: mockMessages })); // messages on click

    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Billing Issue'));

    await waitFor(() => {
      expect(screen.getByText('Help me please')).toBeInTheDocument();
      expect(screen.getByText('Sure, how can I help?')).toBeInTheDocument();
    });
  });

  it('shows action buttons when conversation selected', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations }))
      .mockResolvedValueOnce(okResponse({ messages: mockMessages }));

    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Billing Issue'));

    await waitFor(() => {
      expect(screen.getByText('Assign to Me')).toBeInTheDocument();
      expect(screen.getByText('Resolve')).toBeInTheDocument();
    });
  });

  it('shows reply input when conversation selected', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations }))
      .mockResolvedValueOnce(okResponse({ messages: [] }));

    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Billing Issue'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a reply...')).toBeInTheDocument();
      expect(screen.getByText('Send')).toBeInTheDocument();
    });
  });

  it('shows error on fetch failure', async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error('Network error'));
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('switches to templates view', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations })) // initial queue
      .mockResolvedValueOnce(okResponse({ templates: mockTemplates })); // templates fetch

    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Templates'));

    await waitFor(() => {
      expect(screen.getByText('Message Templates')).toBeInTheDocument();
      expect(screen.getByText('Welcome')).toBeInTheDocument();
      expect(screen.getByText('Order Update')).toBeInTheDocument();
    });
  });

  it('shows template details', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: [] }))
      .mockResolvedValueOnce(okResponse({ templates: mockTemplates }));

    render(<SupportQueueTab />);
    fireEvent.click(screen.getByText('Templates'));

    await waitFor(() => {
      expect(screen.getByText('onboarding')).toBeInTheDocument();
      expect(screen.getByText('transactional')).toBeInTheDocument();
      expect(screen.getByText('both')).toBeInTheDocument();
      expect(screen.getByText('whatsapp')).toBeInTheDocument();
    });
  });

  it('shows empty templates state', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: [] }))
      .mockResolvedValueOnce(okResponse({ templates: [] }));

    render(<SupportQueueTab />);
    fireEvent.click(screen.getByText('Templates'));

    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument();
    });
  });

  it('changes status filter', async () => {
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });

    // "Resolved" appears as both filter button and conversation badge — click the first one (filter)
    const resolvedButtons = screen.getAllByText('Resolved');
    fireEvent.click(resolvedButtons[0]);
    // Should trigger new fetch with resolved status
    await waitFor(() => {
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2); // initial + filter change
    });
  });
});
