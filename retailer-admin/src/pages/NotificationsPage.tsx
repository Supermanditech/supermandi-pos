/**
 * Phase 8: Retailer Admin Notifications Page
 * In-app notification center showing push notification history
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import { Bell, CheckCheck, RefreshCw, AlertTriangle, Package, CreditCard, Truck } from 'lucide-react';

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
      console.error('Failed to fetch notifications:', err);
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
      case 'order_status': return <Truck size={18} className="text-blue-500" />;
      case 'stock_alert': return <Package size={18} className="text-orange-500" />;
      case 'grn_mismatch': case 'grn_excess': return <AlertTriangle size={18} className="text-red-500" />;
      case 'payment_reminder': return <CreditCard size={18} className="text-purple-500" />;
      default: return <Bell size={18} className="text-gray-500" />;
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1f2937' }}>Notifications</h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
            {total} total {unreadCount > 0 && `(${unreadCount} unread)`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {unreadCount > 0 && (
            <button
              aria-label="Mark all notifications as read"
              onClick={markAllAsRead}
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '0.375rem', cursor: 'pointer' }}
            >
              <CheckCheck size={14} /> Mark all read
            </button>
          )}
          <button
            aria-label="Refresh notifications list"
            onClick={fetchNotifications}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', background: '#f9fafb', color: '#374151', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ color: '#991b1b', fontSize: '0.875rem' }}>{error}</p>
          <button aria-label="Retry loading notifications" onClick={() => { setError(null); fetchNotifications(); }} style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>Loading notifications...</div>
      ) : notifications.length === 0 && !error ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Bell size={48} style={{ color: '#d1d5db', margin: '0 auto 1rem' }} />
          <p style={{ color: '#6b7280', fontSize: '0.9375rem' }}>No notifications yet</p>
          <p style={{ color: '#9ca3af', fontSize: '0.8125rem', marginTop: '0.25rem' }}>You'll see order updates, stock alerts, and payment reminders here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.isRead && markAsRead(n.id)}
              style={{
                display: 'flex', gap: '0.75rem', padding: '0.875rem 1rem',
                background: n.isRead ? '#fff' : '#f0fdf4',
                border: `1px solid ${n.isRead ? '#e5e7eb' : '#bbf7d0'}`,
                borderRadius: '0.5rem', cursor: n.isRead ? 'default' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ flexShrink: 0, marginTop: '0.125rem' }}>{getIcon(n.type)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: n.isRead ? 500 : 600, color: '#1f2937' }}>{n.title}</h3>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', flexShrink: 0, marginLeft: '0.5rem' }}>
                    {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p style={{ fontSize: '0.8125rem', color: '#4b5563', marginTop: '0.25rem', lineHeight: 1.4 }}>{n.body}</p>
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
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: offset === 0 ? 'not-allowed' : 'pointer', opacity: offset === 0 ? 0.5 : 1 }}
              >
                Previous
              </button>
              <span style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem', color: '#6b7280' }}>
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <button
                aria-label="Next page of notifications"
                disabled={offset + limit >= total}
                onClick={() => setOffset((o) => o + limit)}
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: offset + limit >= total ? 'not-allowed' : 'pointer', opacity: offset + limit >= total ? 0.5 : 1 }}
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
