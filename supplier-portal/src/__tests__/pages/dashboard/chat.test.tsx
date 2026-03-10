import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SupplierChatPageWrapper from '../../../app/(dashboard)/chat/page';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// Configurable useQuery mock
let mockQueryData: Record<string, any> = {};
let mockQueryStates: Record<string, { isLoading?: boolean; isError?: boolean }> = {};
let mutateFn: jest.Mock;
let mutationPending = false;
let mutationError = false;
const mockInvalidateQueries = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[0];
    const states = mockQueryStates[key] || {};
    return {
      data: mockQueryData[key] ?? null,
      isLoading: states.isLoading ?? false,
      isError: states.isError ?? false,
    };
  },
  useMutation: (opts: any) => ({
    mutate: mutateFn,
    isPending: mutationPending,
    isError: mutationError,
  }),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

// Mock Breadcrumb
jest.mock('../../../components/Breadcrumb', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ items }: any) =>
      React.createElement('nav', { 'data-testid': 'breadcrumb' },
        items.map((item: any, i: number) =>
          React.createElement('span', { key: i }, item.label)
        )
      ),
  };
});

// Mock EmptyState
jest.mock('../../../components/EmptyState', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ title, description }: any) =>
      React.createElement('div', { 'data-testid': 'empty-state' }, [
        React.createElement('span', { key: 'title' }, title),
        React.createElement('span', { key: 'desc' }, description),
      ]),
  };
});

// Mock lucide-react
jest.mock('lucide-react', () => {
  const React = require('react');
  const mockIcon = (name: string) => (props: any) =>
    React.createElement('svg', { 'data-testid': `icon-${name}`, ...props });
  return {
    MessageSquare: mockIcon('MessageSquare'),
    Send: mockIcon('Send'),
    Search: mockIcon('Search'),
    Headphones: mockIcon('Headphones'),
    Image: mockIcon('Image'),
    Paperclip: mockIcon('Paperclip'),
  };
});

// Mock API
jest.mock('../../../lib/api', () => ({
  apiFetch: jest.fn(),
}));

// Sample data
const sampleConversation = {
  id: 'conv-001',
  type: 'support',
  title: 'Help with Order #123',
  storeId: null,
  supplierId: 'sup-001',
  isActive: true,
  lastMessageAt: '2026-03-10T10:00:00Z',
  lastMessagePreview: 'How can I help you?',
  unreadCount: 2,
  isMuted: false,
  otherParticipantName: 'SuperMandi Support',
};

const sampleConversationDirect = {
  id: 'conv-002',
  type: 'direct',
  title: null,
  storeId: 'store-001',
  supplierId: 'sup-001',
  isActive: true,
  lastMessageAt: '2026-03-09T08:00:00Z',
  lastMessagePreview: 'Order shipped',
  unreadCount: 0,
  isMuted: false,
  otherParticipantName: 'SuperMart Store',
};

describe('SupplierChatPageWrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryData = {};
    mockQueryStates = {};
    mutateFn = jest.fn();
    mutationPending = false;
    mutationError = false;
  });

  // ── Initial Render ────────────────────────────────────────────

  it('renders breadcrumb with Dashboard and Chat', () => {
    render(<SupplierChatPageWrapper />);
    const breadcrumb = screen.getByTestId('breadcrumb');
    expect(breadcrumb).toHaveTextContent('Dashboard');
    expect(breadcrumb).toHaveTextContent('Chat');
  });

  it('renders Messages heading', () => {
    render(<SupplierChatPageWrapper />);
    expect(screen.getByText('Messages')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<SupplierChatPageWrapper />);
    expect(screen.getByLabelText('Search conversations')).toBeInTheDocument();
  });

  it('renders empty state when no conversation selected', () => {
    render(<SupplierChatPageWrapper />);
    expect(screen.getByText('Select a conversation')).toBeInTheDocument();
    expect(screen.getByText(/Choose a conversation from the list/)).toBeInTheDocument();
  });

  // ── Loading State ─────────────────────────────────────────────

  it('renders loading skeleton when conversations loading', () => {
    mockQueryStates['supplier-conversations'] = { isLoading: true };
    const { container } = render(<SupplierChatPageWrapper />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(1);
  });

  // ── Empty Conversations ───────────────────────────────────────

  it('shows no conversations message when list empty', () => {
    mockQueryData['supplier-conversations'] = { conversations: [] };
    render(<SupplierChatPageWrapper />);
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });

  // ── Conversation List ─────────────────────────────────────────

  it('renders conversation title', () => {
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversation] };
    render(<SupplierChatPageWrapper />);
    expect(screen.getByText('Help with Order #123')).toBeInTheDocument();
  });

  it('renders last message preview', () => {
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversation] };
    render(<SupplierChatPageWrapper />);
    expect(screen.getByText('How can I help you?')).toBeInTheDocument();
  });

  it('renders unread count badge', () => {
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversation] };
    render(<SupplierChatPageWrapper />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders Headphones icon for support type', () => {
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversation] };
    render(<SupplierChatPageWrapper />);
    expect(screen.getByTestId('icon-Headphones')).toBeInTheDocument();
  });

  it('renders MessageSquare icon for direct type', () => {
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversationDirect] };
    render(<SupplierChatPageWrapper />);
    // MessageSquare appears both in empty state and conversation list
    const icons = screen.getAllByTestId('icon-MessageSquare');
    expect(icons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders otherParticipantName when title is null', () => {
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversationDirect] };
    render(<SupplierChatPageWrapper />);
    expect(screen.getByText('SuperMart Store')).toBeInTheDocument();
  });

  it('renders multiple conversations', () => {
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversation, sampleConversationDirect] };
    render(<SupplierChatPageWrapper />);
    expect(screen.getByText('Help with Order #123')).toBeInTheDocument();
    expect(screen.getByText('SuperMart Store')).toBeInTheDocument();
  });

  it('hides unread badge when count is 0', () => {
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversationDirect] };
    render(<SupplierChatPageWrapper />);
    // Direct conversation has unreadCount: 0
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  // ── Search ────────────────────────────────────────────────────

  it('filters conversations by search term', () => {
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversation, sampleConversationDirect] };
    render(<SupplierChatPageWrapper />);
    const searchInput = screen.getByLabelText('Search conversations');
    fireEvent.change(searchInput, { target: { value: 'SuperMart' } });
    expect(screen.getByText('SuperMart Store')).toBeInTheDocument();
    expect(screen.queryByText('Help with Order #123')).not.toBeInTheDocument();
  });

  // ── Message Input ─────────────────────────────────────────────

  it('renders message input when conversation selected', () => {
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversation] };
    render(<SupplierChatPageWrapper />);
    fireEvent.click(screen.getByText('Help with Order #123'));
    expect(screen.getByLabelText('Message input')).toBeInTheDocument();
  });

  it('renders send button when conversation selected', () => {
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversation] };
    render(<SupplierChatPageWrapper />);
    fireEvent.click(screen.getByText('Help with Order #123'));
    expect(screen.getByLabelText('Send message')).toBeInTheDocument();
  });

  it('disables send button when message is empty', () => {
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversation] };
    render(<SupplierChatPageWrapper />);
    fireEvent.click(screen.getByText('Help with Order #123'));
    expect(screen.getByLabelText('Send message')).toBeDisabled();
  });

  it('shows thread header with conversation title', () => {
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversation] };
    render(<SupplierChatPageWrapper />);
    fireEvent.click(screen.getByText('Help with Order #123'));
    // The thread header shows the conversation title + type label
    expect(screen.getByText('Support')).toBeInTheDocument();
  });

  it('shows send error hint when mutation fails', () => {
    mutationError = true;
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversation] };
    render(<SupplierChatPageWrapper />);
    fireEvent.click(screen.getByText('Help with Order #123'));
    expect(screen.getByText(/Failed to send.*press Send to retry/)).toBeInTheDocument();
  });

  // ── No Messages ───────────────────────────────────────────────

  it('shows no messages prompt when conversation has no messages', () => {
    mockQueryData['supplier-conversations'] = { conversations: [sampleConversation] };
    mockQueryData['supplier-messages'] = { messages: [] };
    render(<SupplierChatPageWrapper />);
    fireEvent.click(screen.getByText('Help with Order #123'));
    expect(screen.getByText(/No messages yet.*Start the conversation/)).toBeInTheDocument();
  });

  // ── Edge Cases ────────────────────────────────────────────────

  it('renders conversation with No messages preview', () => {
    mockQueryData['supplier-conversations'] = { conversations: [{ ...sampleConversation, lastMessagePreview: null }] };
    render(<SupplierChatPageWrapper />);
    expect(screen.getByText('No messages')).toBeInTheDocument();
  });
});
