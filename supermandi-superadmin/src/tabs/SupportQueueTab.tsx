// T-300: SuperAdmin Support Queue
// View and manage support conversations
// T-302: Message template management UI

import { useState, useEffect, useCallback, useRef } from 'react';
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

function formatTimestamp(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' });
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // R2-FIX SQ-004: Per-action loading state for assign/resolve
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const selectConvRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);

  // R3-SUP_Q-004: Auto-clear error after 10 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 10_000);
    return () => clearTimeout(timer);
  }, [error]);

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
    if (view === 'queue') {
      // R1-FIX: Clear selected conversation when filter/view changes to avoid stale data
      setSelectedConvId(null);
      setMessages([]);
      setReplyText('');
      fetchQueue();
    } else {
      fetchTemplates();
    }
  }, [view, fetchQueue, fetchTemplates]);

  // R3-SUP_Q-010: Auto-scroll message thread to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // R3-SUP_Q-017: Focus detail panel when conversation selected (enables Escape key)
  useEffect(() => {
    if (selectedConvId) detailPanelRef.current?.focus();
  }, [selectedConvId]);

  const selectConversation = async (convId: string) => {
    const token = ++selectConvRef.current;
    setSelectedConvId(convId);
    setMessagesLoading(true);
    setReplyText('');
    try {
      const result = await apiFetch(`/api/v1/chat/conversations/${convId}/messages?limit=100`);
      if (selectConvRef.current !== token) return; // stale response guard
      // API returns messages newest-first; reverse to show chronological order (oldest at top)
      setMessages((result.messages || []).slice().reverse());
    } catch (err: unknown) {
      if (selectConvRef.current !== token) return;
      setMessages([]);
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      if (selectConvRef.current === token) setMessagesLoading(false);
    }
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedConvId || sending) return;
    setSending(true);
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
    } finally {
      setSending(false);
    }
  };

  const assignToMe = async (convId: string) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/v1/chat/support/${convId}/assign`, {
        method: 'POST',
        // R3-SUP_Q-005: Use 'SuperAdmin Agent' as default (no user-name context available)
        body: JSON.stringify({ agentName: 'SuperAdmin Agent' }),
      });
      fetchQueue();
      if (selectedConvId === convId) selectConversation(convId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign');
    } finally {
      setActionLoading(false);
    }
  };

  const resolveConversation = async (convId: string) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/v1/chat/support/${convId}/resolve`, { method: 'POST' });
      fetchQueue();
      setSelectedConvId(null);
      setMessages([]);
    } catch (err: unknown) {
      // R3-SUP_Q-006: On resolve failure, do NOT clear selected conversation (preserve context)
      setError(err instanceof Error ? err.message : 'Failed to resolve');
      fetchQueue();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="sa-p-24">
      {/* View Toggle */}
      <div className="sa-flex-between sa-mb-16">
        <h2 className="sa-text-xl sa-fw-600">
          {view === 'queue' ? 'Support Queue' : 'Message Templates'}
        </h2>
        <div className="sa-flex sa-gap-8">
          <button
            onClick={() => setView('queue')}
            className={`sa-btn-sm sa-border sa-radius-6 ${view === 'queue' ? 'sa-text-md' : 'sa-text-md sa-text-muted'}`}
            style={{
              background: view === 'queue' ? 'var(--color-primary-dark)' : 'var(--color-surface)',
              color: view === 'queue' ? 'var(--color-text-inverse)' : undefined,
              cursor: 'pointer',
            }}
          >Support Queue</button>
          <button
            onClick={() => setView('templates')}
            className={`sa-btn-sm sa-border sa-radius-6 ${view === 'templates' ? 'sa-text-md' : 'sa-text-md sa-text-muted'}`}
            style={{
              background: view === 'templates' ? 'var(--color-primary-dark)' : 'var(--color-surface)',
              color: view === 'templates' ? 'var(--color-text-inverse)' : undefined,
              cursor: 'pointer',
            }}
          >Templates</button>
        </div>
      </div>

      {error && (
        <div className="sa-alert-error sa-mb-16">
          {error}
        </div>
      )}

      {view === 'queue' ? (
        <>
          {/* Status Filter */}
          <div className="sa-flex sa-gap-8 sa-mb-16">
            {(['open', 'resolved', 'all'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`sa-btn-sm sa-border sa-radius-6 ${statusFilter === s ? 'sa-fw-600' : ''}`}
                style={{
                  background: statusFilter === s ? 'var(--color-primary-light)' : 'var(--color-surface)',
                  color: statusFilter === s ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                }}
              >{s.charAt(0).toUpperCase() + s.slice(1)}</button>
            ))}
          </div>

          <div className="sa-flex sa-gap-16 sa-support-layout" style={{ height: 'calc(100vh - 240px)' }}>
            {/* Conversation List */}
            <div className="sa-scroll-y sa-support-convlist" style={{ width: 300, borderRight: '1px solid var(--color-border)' }}>
              {loading ? (
                <div className="sa-p-24 sa-text-muted sa-text-center">Loading...</div>
              ) : conversations.length === 0 ? (
                <div className="sa-p-24 sa-text-muted sa-text-center sa-text-md">
                  No {statusFilter} support conversations
                </div>
              ) : conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => selectConversation(conv.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectConversation(conv.id); } }}
                  tabIndex={0}
                  role="button"
                  className={`sa-p-12 sa-border-b ${selectedConvId === conv.id ? 'sa-row-highlight' : ''}`}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="sa-flex-between">
                    <span className="sa-fw-500 sa-text-md">{conv.title || 'Support Chat'}</span>
                    <span className="sa-text-xs sa-text-muted">{formatTimestamp(conv.lastMessageAt)}</span>
                  </div>
                  <div className="sa-text-sm sa-text-muted sa-mt-4 sa-nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {conv.lastMessagePreview || 'No messages'}
                  </div>
                  <span className={`sa-mt-4 ${conv.isActive ? 'sa-badge-ok' : 'sa-badge-muted'}`}>{conv.isActive ? 'Open' : 'Resolved'}</span>
                </div>
              ))}
            </div>

            {/* Message Thread */}
            {/* R3-SUP_Q-017: Escape key closes conversation detail */}
            <div
              className="sa-flex-col"
              style={{ flex: 1 }}
              ref={detailPanelRef}
              tabIndex={-1}
              onKeyDown={(e) => { if (e.key === 'Escape' && selectedConvId) { setSelectedConvId(null); setMessages([]); } }}
            >
              {!selectedConvId ? (
                <div className="sa-flex-center sa-text-muted" style={{ flex: 1 }}>
                  Select a conversation to view messages
                </div>
              ) : (
                <>
                  {/* Actions */}
                  <div className="sa-flex sa-gap-8 sa-py-8 sa-border-b">
                    <button onClick={() => assignToMe(selectedConvId)} disabled={actionLoading} className="sa-btn-ghost-sm">
                      {actionLoading ? 'Processing...' : 'Assign to Me'}
                    </button>
                    <button onClick={() => setConfirmDialog({ title: 'Resolve Conversation', message: 'Mark this conversation as resolved? The customer will no longer see it as active.', confirmLabel: 'Resolve', variant: 'warning', onConfirm: () => { setConfirmDialog(null); resolveConversation(selectedConvId); } })} disabled={actionLoading} className="sa-btn-success-sm">
                      Resolve
                    </button>
                  </div>

                  {/* Messages */}
                  <div className="sa-scroll-y sa-p-12" style={{ flex: 1 }}>
                    {messagesLoading && <div className="sa-text-center sa-text-muted sa-p-12">Loading messages...</div>}
                    {messages.map(msg => (
                      <div key={msg.id} className="sa-mb-8">
                        {msg.senderType === 'system' ? (
                          <div className="sa-text-center sa-text-sm sa-text-muted" style={{ fontStyle: 'italic' }}>
                            {msg.content}
                          </div>
                        ) : (
                          <div className={msg.senderType === 'support' || msg.senderType === 'admin' ? 'sa-msg-sent' : 'sa-msg-received'}>
                            <div className="sa-msg-bubble" style={{
                              background: msg.senderType === 'support' || msg.senderType === 'admin' ? 'var(--color-primary-dark)' : 'var(--color-surface)',
                              color: msg.senderType === 'support' || msg.senderType === 'admin' ? 'var(--color-text-inverse)' : 'var(--color-text-primary)',
                              border: msg.senderType === 'support' || msg.senderType === 'admin' ? 'none' : '1px solid var(--color-border)',
                            }}>
                              <div className="sa-text-xs" style={{ opacity: 0.7, marginBottom: 2 }}>{msg.senderType}</div>
                              <div className="sa-text-md">{msg.content}</div>
                              <div className="sa-msg-time sa-text-right">{formatTimestamp(msg.createdAt)}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {/* R3-SUP_Q-010: Scroll anchor */}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Reply */}
                  <div className="sa-flex sa-gap-8 sa-py-8 sa-border-t">
                    <input
                      id="filter-support-reply"
                      aria-label="Reply message"
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendReply())}
                      placeholder="Type a reply..."
                      className="sa-input sa-radius-6 sa-text-md"
                      style={{ flex: 1, outline: 'none' }}
                    />
                    <button onClick={sendReply} disabled={!replyText.trim() || sending} className="sa-btn-sm sa-radius-6 sa-text-md" style={{
                      padding: '0.5rem 1rem', border: 'none',
                      background: replyText.trim() && !sending ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
                      color: 'var(--color-text-inverse)', cursor: sending ? 'not-allowed' : 'pointer',
                    }}>{sending ? 'Sending...' : 'Send'}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Templates View */
        <table className="table">
          <thead>
            <tr>
              <th className="sa-th">Name</th>
              <th className="sa-th">Category</th>
              <th className="sa-th">Channel</th>
              <th className="sa-th">Template Body</th>
              <th className="sa-th" style={{ textAlign: 'center' }}>Active</th>
            </tr>
          </thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id}>
                <td className="sa-td sa-td--bold">{t.name}</td>
                <td className="sa-td">
                  <span className="sa-badge-muted">{t.category}</span>
                </td>
                <td className="sa-td">
                  <span className={t.channel === 'both' ? 'sa-badge-info' : 'sa-badge-muted'}>{t.channel}</span>
                </td>
                <td className="sa-td sa-text-muted sa-nowrap" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.bodyTemplate}
                </td>
                <td className="sa-td" style={{ textAlign: 'center' }}>
                  <span className={`sa-dot ${t.isActive ? 'sa-dot--success' : 'sa-dot--muted'}`} />
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={5} className="sa-p-24 sa-text-center sa-text-muted">No templates found</td>
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
