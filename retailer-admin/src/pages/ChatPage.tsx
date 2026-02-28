// T-294: Retailer Admin Chat Page
// Web version of chat for retailer admin portal

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import Breadcrumb from '../components/Breadcrumb';
import EmptyState from '../components/EmptyState';
import { MessageSquare, Send, Headphones } from 'lucide-react';

interface Conversation {
  id: string;
  type: string;
  title: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  otherParticipantName: string | null;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderType: string;
  messageType: string;
  content: string | null;
  attachmentName: string | null;
  createdAt: string;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' });
}

export default function ChatPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken, store } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await authFetch('/api/v1/chat/conversations?limit=100', accessToken);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await safeJson<any>(res);
      setConversations(json?.conversations || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const selectConversation = async (convId: string) => {
    if (!accessToken) return;
    setSelectedId(convId);
    // REQ.AUDIT.W5.RETAILER.CHAT-STALE-ERROR-ON-CONVO-SWITCH.001: clear stale error on conversation switch
    setError(null);
    try {
      const res = await authFetch(`/api/v1/chat/conversations/${convId}/messages?limit=100`, accessToken);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await safeJson<any>(res);
      setMessages((json?.messages || []).slice().reverse());
      // Mark as read
      authFetch(`/api/v1/chat/conversations/${convId}/read`, accessToken, { method: 'PATCH' }).catch(() => {});
    } catch {
      // RET-C4-005: Show error on message fetch failure
      setMessages([]);
      setError('Failed to load messages. Please try again.');
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    if (!text.trim() || !selectedId || !accessToken || sending) return;
    setSending(true);
    try {
      const res = await authFetch(`/api/v1/chat/conversations/${selectedId}/messages`, accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text.trim(), messageType: 'text' }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      // RET-C4-003: Clear error after successful send
      setError(null);
      setText('');
      selectConversation(selectedId);
      fetchConversations();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const createSupport = async () => {
    if (!accessToken) return;
    try {
      const res = await authFetch('/api/v1/chat/conversations/support', accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // STG-068: Include storeId so the conversation is linked to this store
        body: JSON.stringify({ displayName: 'Store Owner', storeId: store?.id }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await safeJson<any>(res);
      if (json?.conversation?.id) {
        fetchConversations();
        selectConversation(json.conversation.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create support chat');
    }
  };

  const selected = conversations.find(c => c.id === selectedId);

  return (
    <>
      <div className="breadcrumb-wrap">
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Messages' }]} />
      </div>
      <header className="page-header">
        <h1 className="page-title">Messages</h1>
        <button aria-label="Contact support via chat" className="btn btn-secondary btn-icon" onClick={createSupport}>
          <Headphones size={16} /> Contact Support
        </button>
      </header>

      <div className="page-content chat-layout">
        {error && (
          <div className="chat-error-bar">
            {error} <button aria-label="Dismiss chat error" onClick={() => setError(null)} className="chat-error-dismiss">Dismiss</button>
          </div>
        )}

        {/* Conversation List */}
        <div className="card chat-convo-list">
          {loading ? (
            <div className="text-center-muted">Loading...</div>
          ) : conversations.length === 0 ? (
            <EmptyState icon={<MessageSquare size={24} />} title="No conversations" description="Start a chat with a supplier or contact support." />
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={`chat-convo-item${selectedId === conv.id ? ' chat-convo-item--active' : ''}`}
              >
                <div className="chat-convo-header">
                  <span className="chat-convo-name">
                    {conv.title || conv.otherParticipantName || 'Chat'}
                  </span>
                  {conv.unreadCount > 0 && (
                    <span className="chat-unread-badge">{conv.unreadCount}</span>
                  )}
                </div>
                <div className="chat-convo-preview">
                  {conv.lastMessagePreview || 'No messages'} · {formatTime(conv.lastMessageAt)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Message Thread */}
        <div className="card chat-msg-panel">
          {!selectedId ? (
            <div className="chat-no-selection">
              Select a conversation
            </div>
          ) : (
            <>
              <div className="chat-header">
                {selected?.title || selected?.otherParticipantName || 'Chat'}
              </div>
              <div className="chat-messages">
                {messages.map(msg => {
                  const isOwn = msg.senderType === 'retailer';
                  const isSystem = msg.senderType === 'system';

                  if (isSystem) {
                    return (
                      <div key={msg.id} className="chat-system-msg">
                        {msg.content}
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className={`chat-msg-row${isOwn ? ' chat-msg-row--own' : ''}`}>
                      <div className={`chat-bubble${isOwn ? ' chat-bubble--own' : ' chat-bubble--other'}`}>
                        {msg.attachmentName && (
                          <div className="chat-attachment-label">
                            {msg.messageType === 'image' ? '📷' : '📎'} {msg.attachmentName}
                          </div>
                        )}
                        {msg.content && <div className="chat-msg-content">{msg.content}</div>}
                        <div className="chat-msg-time">
                          {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              <div className="chat-input-bar">
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Type a message..."
                  className="form-input flex-1"
                />
                <button
                  aria-label="Send chat message"
                  onClick={handleSend}
                  disabled={!text.trim() || sending}
                  className="btn btn-primary btn-icon"
                >
                  <Send size={16} /> Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
