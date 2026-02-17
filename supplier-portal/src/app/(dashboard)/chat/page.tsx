// T-295: Supplier Portal Chat UI
// Two-panel layout: conversation list (left) + message thread (right)

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MessageSquare, Send, ArrowLeft, Search, Headphones } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
// UIUX-SUP-006: Use centralized apiFetch (auth via HttpOnly cookies, 401 redirect, 30s timeout)
import { apiFetch as globalApiFetch } from '@/lib/api';

interface Conversation {
  id: string;
  type: string;
  title: string | null;
  storeId: string | null;
  supplierId: string | null;
  isActive: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  isMuted: boolean;
  otherParticipantName: string | null;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderType: string;
  messageType: string;
  content: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  isDeleted: boolean;
  createdAt: string;
}

// UIUX-SUP-006: Thin wrapper adapting globalApiFetch to the JSON-in/JSON-out shape used by react-query below
async function chatApiFetch(url: string, options?: RequestInit): Promise<unknown> {
  return globalApiFetch(url, options);
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' });
}

export default function SupplierChatPage() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch conversations
  const { data: convData, isLoading: convLoading } = useQuery({
    queryKey: ['supplier-conversations'],
    queryFn: () => chatApiFetch('/api/v1/chat/conversations?limit=100'),
    refetchInterval: 10000,
  });

  const conversations: Conversation[] = convData?.conversations || [];
  const selectedConv = conversations.find(c => c.id === selectedConvId);

  // Fetch messages for selected conversation
  const { data: msgData, isLoading: msgLoading } = useQuery({
    queryKey: ['supplier-messages', selectedConvId],
    queryFn: () => selectedConvId ? chatApiFetch(`/api/v1/chat/conversations/${selectedConvId}/messages?limit=100`) : null,
    enabled: !!selectedConvId,
    refetchInterval: 5000,
  });

  const messages: ChatMessage[] = (msgData?.messages || []).slice().reverse();

  // Mark as read when selecting conversation
  useEffect(() => {
    if (selectedConvId) {
      chatApiFetch(`/api/v1/chat/conversations/${selectedConvId}/read`, { method: 'PATCH' }).catch(() => {});
    }
  }, [selectedConvId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Send message
  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      return chatApiFetch(`/api/v1/chat/conversations/${selectedConvId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: text, messageType: 'text' }),
      });
    },
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['supplier-messages', selectedConvId] });
      queryClient.invalidateQueries({ queryKey: ['supplier-conversations'] });
    },
    // UIUX-SUP-008: Show error feedback instead of silently losing message
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send message. Please try again.');
    },
  });

  const handleSend = useCallback(() => {
    const trimmed = messageText.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  }, [messageText, sendMutation]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Filter conversations by search
  const filteredConversations = searchTerm
    ? conversations.filter(c =>
        (c.title || c.otherParticipantName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.lastMessagePreview || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : conversations;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', background: '#f8fafc' }}>
      {/* Left Panel: Conversation List */}
      <div style={{ width: 340, borderRight: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 600 }}>Messages</h2>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: 9, color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%', padding: '0.5rem 0.5rem 0.5rem 2rem', borderRadius: 8,
                border: '1px solid #e2e8f0', fontSize: '0.85rem', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {convLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>
          ) : filteredConversations.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
              No conversations yet
            </div>
          ) : (
            filteredConversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                style={{
                  padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem',
                  borderBottom: '1px solid #f1f5f9',
                  background: selectedConvId === conv.id ? '#f0f9ff' : 'transparent',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 20,
                  background: conv.type === 'support' ? '#f5f3ff' : '#f0fdf4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {conv.type === 'support' ? (
                    <Headphones size={18} color="#7c3aed" />
                  ) : (
                    <MessageSquare size={18} color="#16a34a" />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 500, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.title || conv.otherParticipantName || 'Conversation'}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', flexShrink: 0 }}>
                      {formatTime(conv.lastMessageAt)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.lastMessagePreview || 'No messages'}
                    </span>
                    {conv.unreadCount > 0 && (
                      <span style={{
                        minWidth: 18, height: 18, borderRadius: 9, background: '#16a34a',
                        color: '#fff', fontSize: '0.65rem', fontWeight: 700, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0,
                      }}>
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Panel: Message Thread */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!selectedConvId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState
              icon={MessageSquare}
              title="Select a conversation"
              description="Choose a conversation from the list to view messages"
            />
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
                {selectedConv?.title || selectedConv?.otherParticipantName || 'Chat'}
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {selectedConv?.type === 'support' ? 'Support' : 'Direct'}
              </span>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
              {msgLoading ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>Loading messages...</div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No messages yet. Start the conversation!</div>
              ) : (
                messages.map(msg => {
                  const isSystem = msg.senderType === 'system';
                  const isOwn = msg.senderType === 'supplier';

                  if (isSystem) {
                    return (
                      <div key={msg.id} style={{ textAlign: 'center', margin: '0.5rem 0' }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', background: '#f1f5f9', padding: '0.25rem 0.75rem', borderRadius: 8 }}>
                          {msg.content}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom: '0.5rem' }}>
                      <div style={{
                        maxWidth: '70%', padding: '0.5rem 0.75rem', borderRadius: 12,
                        background: isOwn ? '#16a34a' : '#fff',
                        color: isOwn ? '#fff' : '#1e293b',
                        border: isOwn ? 'none' : '1px solid #e2e8f0',
                        borderBottomRightRadius: isOwn ? 4 : 12,
                        borderBottomLeftRadius: isOwn ? 12 : 4,
                      }}>
                        {msg.attachmentName && (
                          <div style={{ fontSize: '0.75rem', color: isOwn ? 'rgba(255,255,255,0.8)' : '#64748b', marginBottom: 4 }}>
                            {msg.messageType === 'image' ? '📷' : '📎'} {msg.attachmentName}
                          </div>
                        )}
                        {msg.content && <div style={{ fontSize: '0.85rem', lineHeight: 1.4 }}>{msg.content}</div>}
                        <div style={{ fontSize: '0.65rem', color: isOwn ? 'rgba(255,255,255,0.6)' : '#94a3b8', marginTop: 2, textAlign: 'right' }}>
                          {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #e2e8f0', background: '#fff', display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <textarea
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                style={{
                  flex: 1, padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #e2e8f0',
                  fontSize: '0.85rem', resize: 'none', maxHeight: 100, outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleSend}
                disabled={!messageText.trim() || sendMutation.isPending}
                style={{
                  padding: '0.5rem', borderRadius: 8, border: 'none',
                  background: messageText.trim() ? '#16a34a' : '#94a3b8',
                  color: '#fff', cursor: messageText.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Send size={18} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
