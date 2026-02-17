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
  const { accessToken } = useAuth();

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
    try {
      const res = await authFetch(`/api/v1/chat/conversations/${convId}/messages?limit=100`, accessToken);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await safeJson<any>(res);
      setMessages((json?.messages || []).slice().reverse());
      // Mark as read
      authFetch(`/api/v1/chat/conversations/${convId}/read`, accessToken, { method: 'PATCH' }).catch(() => {});
    } catch {
      setMessages([]);
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
        body: JSON.stringify({ displayName: 'Store Owner' }),
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
      <div style={{ padding: '0 1rem' }}>
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Messages' }]} />
      </div>
      <header className="page-header">
        <h1 className="page-title">Messages</h1>
        <button className="btn btn-secondary" onClick={createSupport} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Headphones size={16} /> Contact Support
        </button>
      </header>

      <div className="page-content" style={{ display: 'flex', height: 'calc(100vh - 180px)', gap: 0 }}>
        {error && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: '#fee2e2', color: '#991b1b', padding: '0.5rem 1rem', fontSize: '0.85rem', zIndex: 10 }}>
            {error} <button onClick={() => setError(null)} style={{ marginLeft: 8, fontWeight: 600 }}>Dismiss</button>
          </div>
        )}

        {/* Conversation List */}
        <div className="card" style={{ width: 320, borderRadius: '0.375rem 0 0 0.375rem', overflow: 'auto', borderRight: '1px solid var(--border)' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
          ) : conversations.length === 0 ? (
            <EmptyState icon={<MessageSquare size={24} />} title="No conversations" description="Start a chat with a supplier or contact support." />
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                style={{
                  padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                  background: selectedId === conv.id ? 'var(--bg-alt)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                    {conv.title || conv.otherParticipantName || 'Chat'}
                  </span>
                  {conv.unreadCount > 0 && (
                    <span style={{
                      minWidth: 18, height: 18, borderRadius: 9, background: 'var(--primary)',
                      color: '#fff', fontSize: '0.65rem', fontWeight: 700, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                    }}>{conv.unreadCount}</span>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {conv.lastMessagePreview || 'No messages'} · {formatTime(conv.lastMessageAt)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Message Thread */}
        <div className="card" style={{ flex: 1, borderRadius: '0 0.375rem 0.375rem 0', display: 'flex', flexDirection: 'column' }}>
          {!selectedId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Select a conversation
            </div>
          ) : (
            <>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                {selected?.title || selected?.otherParticipantName || 'Chat'}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                {messages.map(msg => {
                  const isOwn = msg.senderType === 'retailer';
                  const isSystem = msg.senderType === 'system';

                  if (isSystem) {
                    return (
                      <div key={msg.id} style={{ textAlign: 'center', margin: '0.5rem 0', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        {msg.content}
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom: '0.5rem' }}>
                      <div style={{
                        maxWidth: '70%', padding: '0.5rem 0.75rem', borderRadius: 12,
                        background: isOwn ? 'var(--primary)' : '#fff',
                        color: isOwn ? '#fff' : 'var(--text)',
                        border: isOwn ? 'none' : '1px solid var(--border)',
                      }}>
                        {msg.attachmentName && (
                          <div style={{ fontSize: '0.75rem', marginBottom: 2 }}>
                            {msg.messageType === 'image' ? '📷' : '📎'} {msg.attachmentName}
                          </div>
                        )}
                        {msg.content && <div style={{ fontSize: '0.875rem' }}>{msg.content}</div>}
                        <div style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: 2, textAlign: 'right' }}>
                          {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Type a message..."
                  className="form-input"
                  style={{ flex: 1 }}
                />
                <button
                  onClick={handleSend}
                  disabled={!text.trim() || sending}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
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
