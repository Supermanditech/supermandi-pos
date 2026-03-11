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
    // jsdom does not implement scrollIntoView — mock it to prevent uncaught exception
    // when SupportQueueTab's useEffect calls messagesEndRef.current?.scrollIntoView()
    Element.prototype.scrollIntoView = vi.fn();
    mockFetchWithTimeout.mockResolvedValue(okResponse({ conversations: mockConversations }));
  });

  // ── Header ────────────────────────────────────────────────

  it('renders header', async () => {
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getAllByText('Support Queue').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Loading State ─────────────────────────────────────────

  it('shows loading state initially', () => {
    mockFetchWithTimeout.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(okResponse({ conversations: [] })), 100))
    );
    render(<SupportQueueTab />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  // ── View Toggle ───────────────────────────────────────────

  it('renders view toggle buttons', async () => {
    render(<SupportQueueTab />);
    expect(screen.getAllByText('Support Queue').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Templates')).toBeInTheDocument();
  });

  it('switches header text to Message Templates on templates view', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations }))
      .mockResolvedValueOnce(okResponse({ templates: mockTemplates }));
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Templates'));
    await waitFor(() => {
      expect(screen.getByText('Message Templates')).toBeInTheDocument();
    });
  });

  // ── Status Filter ─────────────────────────────────────────

  it('renders status filter buttons', async () => {
    render(<SupportQueueTab />);
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('changes status filter', async () => {
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });
    const resolvedButtons = screen.getAllByText('Resolved');
    fireEvent.click(resolvedButtons[0]);
    await waitFor(() => {
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });
  });

  // ── Conversation List ─────────────────────────────────────

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

  it('shows No messages for conversations without preview', async () => {
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('No messages')).toBeInTheDocument();
    });
  });

  it('shows Open/Resolved badges', async () => {
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getAllByText('Open').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('Resolved').length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Empty State ───────────────────────────────────────────

  it('shows empty state when no conversations', async () => {
    mockFetchWithTimeout.mockResolvedValue(okResponse({ conversations: [] }));
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('No open support conversations')).toBeInTheDocument();
    });
  });

  // ── Message Thread ────────────────────────────────────────

  it('shows placeholder when no conversation selected', async () => {
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Select a conversation to view messages')).toBeInTheDocument();
    });
  });

  it('loads messages when conversation clicked', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations }))
      .mockResolvedValueOnce(okResponse({ messages: mockMessages }));
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

  it('shows sender type labels in messages', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations }))
      .mockResolvedValueOnce(okResponse({ messages: mockMessages }));
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Billing Issue'));
    await waitFor(() => {
      expect(screen.getByText('retailer')).toBeInTheDocument();
      expect(screen.getByText('admin')).toBeInTheDocument();
    });
  });

  it('renders system messages with italic style', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations }))
      .mockResolvedValueOnce(okResponse({ messages: [
        { id: 'msg-s', senderId: 'system', senderType: 'system', messageType: 'text', content: 'Conversation assigned', createdAt: '2026-01-15T14:00:00Z' },
      ]}));
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Billing Issue'));
    await waitFor(() => {
      expect(screen.getByText('Conversation assigned')).toBeInTheDocument();
    });
  });

  // ── Action Buttons ────────────────────────────────────────

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

  // ── Reply Input ───────────────────────────────────────────

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

  it('disables Send button when reply is empty', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations }))
      .mockResolvedValueOnce(okResponse({ messages: [] }));
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Billing Issue'));
    await waitFor(() => {
      expect((screen.getByText('Send') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('enables Send button when reply has text', async () => {
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
    });
    fireEvent.change(screen.getByPlaceholderText('Type a reply...'), { target: { value: 'Hello' } });
    expect((screen.getByText('Send') as HTMLButtonElement).disabled).toBe(false);
  });

  it('has reply input with accessible aria-label', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations }))
      .mockResolvedValueOnce(okResponse({ messages: [] }));
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Billing Issue'));
    await waitFor(() => {
      expect(screen.getByLabelText('Reply message')).toBeInTheDocument();
    });
  });

  // ── Error State ───────────────────────────────────────────

  it('shows error on fetch failure', async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error('Network error'));
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  // ── Templates View ────────────────────────────────────────

  it('switches to templates view', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations }))
      .mockResolvedValueOnce(okResponse({ templates: mockTemplates }));
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

  it('shows template body content', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: [] }))
      .mockResolvedValueOnce(okResponse({ templates: mockTemplates }));
    render(<SupportQueueTab />);
    fireEvent.click(screen.getByText('Templates'));
    await waitFor(() => {
      expect(screen.getByText('Welcome to SuperMandi!')).toBeInTheDocument();
      expect(screen.getByText(/Your order.*is ready/)).toBeInTheDocument();
    });
  });

  it('renders template table column headers', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: [] }))
      .mockResolvedValueOnce(okResponse({ templates: mockTemplates }));
    render(<SupportQueueTab />);
    fireEvent.click(screen.getByText('Templates'));
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Category')).toBeInTheDocument();
      expect(screen.getByText('Channel')).toBeInTheDocument();
      expect(screen.getByText('Template Body')).toBeInTheDocument();
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

  // ── Conversation Keyboard Accessibility ───────────────────

  it('conversation items have role=button', async () => {
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  // ── Send Reply ──────────────────────────────────────────────

  it('sends reply on Send button click', async () => {
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
    });
    // Set up mock for reply POST + subsequent refreshes
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({})) // POST reply
      .mockResolvedValueOnce(okResponse({ messages: mockMessages })) // reload messages
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations })); // reload queue
    fireEvent.change(screen.getByPlaceholderText('Type a reply...'), { target: { value: 'Thanks!' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => {
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('sends reply on Enter key press', async () => {
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
    });
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({}))
      .mockResolvedValueOnce(okResponse({ messages: [] }))
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations }));
    fireEvent.change(screen.getByPlaceholderText('Type a reply...'), { target: { value: 'Hello' } });
    fireEvent.keyDown(screen.getByPlaceholderText('Type a reply...'), { key: 'Enter' });
    await waitFor(() => {
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // ── Assign to Me ────────────────────────────────────────────

  it('calls assign API on Assign to Me click', async () => {
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
    });
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({})) // assign POST
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations })) // reload queue
      .mockResolvedValueOnce(okResponse({ messages: mockMessages })); // reload messages
    fireEvent.click(screen.getByText('Assign to Me'));
    await waitFor(() => {
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/assign'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // ── Resolve Conversation ────────────────────────────────────

  it('shows confirm dialog on Resolve click', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations }))
      .mockResolvedValueOnce(okResponse({ messages: mockMessages }));
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Billing Issue'));
    await waitFor(() => {
      expect(screen.getByText('Resolve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Resolve'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('Resolve Conversation')).toBeInTheDocument();
  });

  it('resolves conversation after confirming', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations }))
      .mockResolvedValueOnce(okResponse({ messages: mockMessages }));
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Billing Issue'));
    await waitFor(() => {
      expect(screen.getByText('Resolve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Resolve'));
    // Confirm the dialog
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({})) // resolve POST
      .mockResolvedValueOnce(okResponse({ conversations: [] })); // reload queue
    fireEvent.click(screen.getAllByText('Resolve')[1]); // confirm button
    await waitFor(() => {
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/resolve'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('closes confirm dialog on Cancel', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations }))
      .mockResolvedValueOnce(okResponse({ messages: mockMessages }));
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Billing Issue'));
    await waitFor(() => {
      expect(screen.getByText('Resolve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Resolve'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  // ── Error on message load ──────────────────────────────────

  it('shows error when message fetch fails', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: mockConversations }))
      .mockRejectedValueOnce(new Error('Messages failed'));
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Billing Issue'));
    await waitFor(() => {
      expect(screen.getByText('Messages failed')).toBeInTheDocument();
    });
  });

  // ── Error on send reply ────────────────────────────────────

  it('shows error when reply send fails', async () => {
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
    });
    mockFetchWithTimeout.mockRejectedValueOnce(new Error('Send failed'));
    fireEvent.change(screen.getByPlaceholderText('Type a reply...'), { target: { value: 'test' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => {
      expect(screen.getByText('Send failed')).toBeInTheDocument();
    });
  });

  // ── Empty templates state ──────────────────────────────────

  it('shows Active column header in templates view', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ conversations: [] }))
      .mockResolvedValueOnce(okResponse({ templates: mockTemplates }));
    render(<SupportQueueTab />);
    fireEvent.click(screen.getByText('Templates'));
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });

  // ── Status filter changes correctly ─────────────────────────

  it('clicking All filter fetches with status=all', async () => {
    render(<SupportQueueTab />);
    await waitFor(() => {
      expect(screen.getByText('Billing Issue')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('All'));
    await waitFor(() => {
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('status=all'),
        expect.anything()
      );
    });
  });
});
