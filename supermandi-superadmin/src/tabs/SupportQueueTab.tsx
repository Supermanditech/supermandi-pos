// T-300: SuperAdmin Support Queue
// View and manage support conversations
// T-302: Message template management UI

import { useState, useEffect, useCallback } from 'react';
// UIUX-SA-001: Use centralized auth (getSessionToken + fetchWithTimeout) instead of wrong 'superadmin_token' key
// P2-4: Use getAuthHeaders() to include X-Request-ID correlation tracing
import { getAuthHeaders, fetchWithTimeout } from '../api/authToken';
// UIUX-SA-005: Use parseError for sanitized error messages instead of generic 'API error: {status}'
import { parseError } from '../api/errorSanitizer';
import { ConfirmDialog, type ConfirmDialogConfig } from '../components/ConfirmDialog';

interface SupportConversation {
  id: string;
  type: string;
  title: string | null;
  storeId: string | null;
  isActive: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderType: string;
  messageType: string;
  content: string | null;
  createdAt: string;
}

interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  channel: string;
  language: string;
  bodyTemplate: string;
  variables: string[];
  isActive: boolean;
}

// P2-4: Use getAuthHeaders() for full auth context (Authorization + X-Request-ID correlation)
// UIUX-SA-004: All chat admin routes use /api/v1/chat/ prefix
// fetchWithTimeout handles 401 auto-logout via handleAutoLogout()
async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetchWithTimeout(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...options?.headers },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function SupportQueueTab() {
  const [view, setView] = useState<'queue' | 'templates'>('queue');
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch(`/api/v1/chat/support/queue?status=${statusFilter}&limit=100`);
      setConversations(result.conversations || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const fetchTemplates = useCallback(async () => {
    try {
      const result = await apiFetch('/api/v1/chat/templates');
      setTemplates(result.templates || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    }
  }, []);

  useEffect(() => {
    if (view === 'queue') fetchQueue();
    else fetchTemplates();
  }, [view, fetchQueue, fetchTemplates]);

  const selectConversation = async (convId: string) => {
    setSelectedConvId(convId);
    try {
      const result = await apiFetch(`/api/v1/chat/conversations/${convId}/messages?limit=100`);
      // API returns messages newest-first; reverse to show chronological order (oldest at top)
      setMessages((result.messages || []).slice().reverse());
    } catch (err: unknown) {
      setMessages([]);
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    }
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedConvId) return;
    try {
      await apiFetch(`/api/v1/chat/conversations/${selectedConvId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: replyText.trim(), messageType: 'text' }),
      });
      setReplyText('');
      selectConversation(selectedConvId);
      fetchQueue();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    }
  };

  const assignToMe = async (convId: string) => {
    try {
      await apiFetch(`/api/v1/chat/support/${convId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ agentName: 'Admin' }),
      });
      fetchQueue();
      if (selectedConvId === convId) selectConversation(convId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign');
    }
  };

  const resolveConversation = async (convId: string) => {
    try {
      await apiFetch(`/api/v1/chat/support/${convId}/resolve`, { method: 'POST' });
      fetchQueue();
      setSelectedConvId(null);
      setMessages([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resolve');
    }
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* View Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
          {view === 'queue' ? 'Support Queue' : 'Message Templates'}
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setView('queue')}
            style={{
              padding: '0.4rem 0.8rem', borderRadius: 6, border: '1px solid #e2e8f0',
              background: view === 'queue' ? '#1e40af' : '#fff',
              color: view === 'queue' ? '#fff' : '#475569',
              cursor: 'pointer', fontSize: '0.8rem',
            }}
          >Support Queue</button>
          <button
            onClick={() => setView('templates')}
            style={{
              padding: '0.4rem 0.8rem', borderRadius: 6, border: '1px solid #e2e8f0',
              background: view === 'templates' ? '#1e40af' : '#fff',
              color: view === 'templates' ? '#fff' : '#475569',
              cursor: 'pointer', fontSize: '0.8rem',
            }}
          >Templates</button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem', borderRadius: 6, marginBottom: '1rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {view === 'queue' ? (
        <>
          {/* Status Filter */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {(['open', 'resolved', 'all'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '0.3rem 0.7rem', borderRadius: 6, border: '1px solid #e2e8f0',
                  background: statusFilter === s ? '#f0f9ff' : '#fff',
                  color: statusFilter === s ? '#1e40af' : '#475569',
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: statusFilter === s ? 600 : 400,
                }}
              >{s.charAt(0).toUpperCase() + s.slice(1)}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 240px)' }}>
            {/* Conversation List */}
            <div style={{ width: 300, borderRight: '1px solid #e2e8f0', overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: '2rem', color: '#64748b', textAlign: 'center' }}>Loading...</div>
              ) : conversations.length === 0 ? (
                <div style={{ padding: '2rem', color: '#64748b', textAlign: 'center', fontSize: '0.85rem' }}>
                  No {statusFilter} support conversations
                </div>
              ) : conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => selectConversation(conv.id)}
                  style={{
                    padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                    background: selectedConvId === conv.id ? '#f0f9ff' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{conv.title || 'Support Chat'}</span>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{formatTime(conv.lastMessageAt)}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.lastMessagePreview || 'No messages'}
                  </div>
                  <span style={{
                    fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: 4, marginTop: 4, display: 'inline-block',
                    background: conv.isActive ? '#dcfce7' : '#f1f5f9',
                    color: conv.isActive ? '#166534' : '#64748b',
                  }}>{conv.isActive ? 'Open' : 'Resolved'}</span>
                </div>
              ))}
            </div>

            {/* Message Thread */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {!selectedConvId ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                  Select a conversation to view messages
                </div>
              ) : (
                <>
                  {/* Actions */}
                  <div style={{ padding: '0.5rem 0', display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>
                    <button onClick={() => assignToMe(selectedConvId)} style={{ padding: '0.3rem 0.6rem', borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>
                      Assign to Me
                    </button>
                    <button onClick={() => setConfirmDialog({ title: 'Resolve Conversation', message: 'Mark this conversation as resolved? The customer will no longer see it as active.', confirmLabel: 'Resolve', variant: 'warning', onConfirm: () => { setConfirmDialog(null); resolveConversation(selectedConvId); } })} style={{ padding: '0.3rem 0.6rem', borderRadius: 4, border: '1px solid #dcfce7', background: '#f0fdf4', cursor: 'pointer', fontSize: '0.75rem', color: '#166534' }}>
                      Resolve
                    </button>
                  </div>

                  {/* Messages */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
                    {messages.map(msg => (
                      <div key={msg.id} style={{ marginBottom: '0.5rem' }}>
                        {msg.senderType === 'system' ? (
                          <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                            {msg.content}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: msg.senderType === 'support' || msg.senderType === 'admin' ? 'flex-end' : 'flex-start' }}>
                            <div style={{
                              maxWidth: '70%', padding: '0.5rem 0.75rem', borderRadius: 8,
                              background: msg.senderType === 'support' || msg.senderType === 'admin' ? '#1e40af' : '#fff',
                              color: msg.senderType === 'support' || msg.senderType === 'admin' ? '#fff' : '#1e293b',
                              border: msg.senderType === 'support' || msg.senderType === 'admin' ? 'none' : '1px solid #e2e8f0',
                            }}>
                              <div style={{ fontSize: '0.65rem', opacity: 0.7, marginBottom: 2 }}>{msg.senderType}</div>
                              <div style={{ fontSize: '0.85rem' }}>{msg.content}</div>
                              <div style={{ fontSize: '0.6rem', opacity: 0.5, marginTop: 2, textAlign: 'right' }}>{formatTime(msg.createdAt)}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Reply */}
                  <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0', borderTop: '1px solid #e2e8f0' }}>
                    <input
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendReply())}
                      placeholder="Type a reply..."
                      style={{ flex: 1, padding: '0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.85rem', outline: 'none' }}
                    />
                    <button onClick={sendReply} disabled={!replyText.trim()} style={{
                      padding: '0.5rem 1rem', borderRadius: 6, border: 'none',
                      background: replyText.trim() ? '#1e40af' : '#94a3b8',
                      color: '#fff', cursor: 'pointer', fontSize: '0.85rem',
                    }}>Send</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Templates View */
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Category</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Channel</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Template Body</th>
              <th style={{ textAlign: 'center', padding: '0.5rem' }}>Active</th>
            </tr>
          </thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.5rem', fontWeight: 500 }}>{t.name}</td>
                <td style={{ padding: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: 4, background: '#f1f5f9' }}>{t.category}</span>
                </td>
                <td style={{ padding: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: 4, background: t.channel === 'both' ? '#dbeafe' : '#f1f5f9' }}>{t.channel}</span>
                </td>
                <td style={{ padding: '0.5rem', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b' }}>
                  {t.bodyTemplate}
                </td>
                <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: t.isActive ? '#22c55e' : '#94a3b8' }} />
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No templates found</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {confirmDialog && (
        <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />
      )}
    </div>
  );
}
