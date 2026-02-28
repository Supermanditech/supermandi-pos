/**
 * Phase 8: Retailer Admin Notifications Page
 * In-app notification center showing push notification history
 * STG-219: Replaced hardcoded hex colors with CSS variables for dark mode
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import { Bell, CheckCheck, RefreshCw, AlertTriangle, Package, CreditCard, Truck } from 'lucide-react';
import { logger } from '../lib/logger';

interface Notification {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  type: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const { accessToken } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchNotifications = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/v1/retailer-admin/notifications?limit=${limit}&offset=${offset}`, accessToken);
      if (res.ok) {
        const data = await safeJson<{ data?: any[]; pagination?: { total?: number } }>(res, { data: [], pagination: { total: 0 } });
        setNotifications(data?.data || []);
        setTotal(data?.pagination?.total || 0);
      }
    } catch (err) {
      logger.error('Failed to fetch notifications:', err);
      setError('Failed to load notifications. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, offset]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // RET-C4-007: Validate response before optimistic UI update
  const markAsRead = async (id: string) => {
    if (!accessToken) return;
    try {
      const res = await authFetch(`/api/v1/retailer-admin/notifications/${id}/read`, accessToken, { method: 'PUT' });
      if (!res.ok) throw new Error(`${res.status}`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n));
    } catch {
      setError('Failed to mark notification as read');
    }
  };

  const markAllAsRead = async () => {
    if (!accessToken) return;
    try {
      const res = await authFetch('/api/v1/retailer-admin/notifications/read-all', accessToken, { method: 'PUT' });
      if (!res.ok) throw new Error(`${res.status}`);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
    } catch {
      setError('Failed to mark all as read');
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'order_status': return <Truck size={18} style={{ color: '#3b82f6' }} />;
      case 'stock_alert': return <Package size={18} style={{ color: '#f97316' }} />;
      case 'grn_mismatch': case 'grn_excess': return <AlertTriangle size={18} style={{ color: '#ef4444' }} />;
      case 'payment_reminder': return <CreditCard size={18} style={{ color: '#8b5cf6' }} />;
      default: return <Bell size={18} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>Notifications</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {total} total {unreadCount > 0 && `(${unreadCount} unread)`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {unreadCount > 0 && (
            <button
              aria-label="Mark all notifications as read"
              onClick={markAllAsRead}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.75rem', fontSize: '0.8125rem' }}
            >
              <CheckCheck size={14} /> Mark all read
            </button>
          )}
          {/* REQ.AUDIT.W5.RETAILER.NOTIFICATIONS-REFRESH-NO-DEBOUNCE.001: disable during loading */}
          <button
            aria-label="Refresh notifications list"
            onClick={fetchNotifications}
            disabled={loading}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            <RefreshCw size={14} /> {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-error" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: '0.875rem' }}>{error}</p>
          <button aria-label="Retry loading notifications" onClick={() => { setError(null); fetchNotifications(); }} style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading notifications...</div>
      ) : notifications.length === 0 && !error ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Bell size={48} style={{ color: 'var(--border)', margin: '0 auto 1rem' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem' }}>No notifications yet</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: '0.25rem', opacity: 0.7 }}>You'll see order updates, stock alerts, and payment reminders here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.isRead && markAsRead(n.id)}
              style={{
                display: 'flex', gap: '0.75rem', padding: '0.875rem 1rem',
                background: n.isRead ? 'var(--surface)' : '#f0fdf4',
                border: `1px solid ${n.isRead ? 'var(--border)' : '#bbf7d0'}`,
                borderRadius: '0.5rem', cursor: n.isRead ? 'default' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ flexShrink: 0, marginTop: '0.125rem' }}>{getIcon(n.type)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: n.isRead ? 500 : 600, color: 'var(--text)' }}>{n.title}</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '0.5rem' }}>
                    {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.4 }}>{n.body}</p>
              </div>
              {!n.isRead && (
                <div style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: '#10b981', marginTop: '0.375rem' }} />
              )}
            </div>
          ))}

          {total > limit && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                aria-label="Previous page of notifications"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                className="btn btn-secondary"
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem', opacity: offset === 0 ? 0.5 : 1 }}
              >
                Previous
              </button>
              <span style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <button
                aria-label="Next page of notifications"
                disabled={offset + limit >= total}
                onClick={() => setOffset((o) => o + limit)}
                className="btn btn-secondary"
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem', opacity: offset + limit >= total ? 0.5 : 1 }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
