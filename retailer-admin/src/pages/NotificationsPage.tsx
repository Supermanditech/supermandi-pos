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
      if (res.status === 401) return;
      if (!res.ok) throw new Error(`Failed to load notifications: ${res.status}`);
      const data = await safeJson<{ data?: any[]; pagination?: { total?: number } }>(res, { data: [], pagination: { total: 0 } });
      setNotifications(data?.data || []);
      setTotal(data?.pagination?.total || 0);
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
      case 'order_status': return <Truck size={18} className="notif-icon-blue" />;
      case 'stock_alert': return <Package size={18} className="notif-icon-orange" />;
      case 'grn_mismatch': case 'grn_excess': return <AlertTriangle size={18} className="notif-icon-red" />;
      case 'payment_reminder': return <CreditCard size={18} className="notif-icon-purple" />;
      default: return <Bell size={18} className="notif-icon-muted" />;
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="notif-page">
      <div className="notif-header">
        <div>
          <h1 className="notif-title">Notifications</h1>
          <p className="notif-subtitle">
            {total} total {unreadCount > 0 && `(${unreadCount} unread)`}
          </p>
        </div>
        <div className="notif-actions">
          {unreadCount > 0 && (
            <button
              aria-label="Mark all notifications as read"
              onClick={markAllAsRead}
              className="btn btn-secondary notif-action-btn"
            >
              <CheckCheck size={14} /> Mark all read
            </button>
          )}
          {/* REQ.AUDIT.W5.RETAILER.NOTIFICATIONS-REFRESH-NO-DEBOUNCE.001: disable during loading */}
          <button
            aria-label="Refresh notifications list"
            onClick={fetchNotifications}
            disabled={loading}
            className="btn btn-secondary notif-action-btn"
          >
            <RefreshCw size={14} /> {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-error notif-error-bar">
          <p>{error}</p>
          <button aria-label="Retry loading notifications" onClick={() => { setError(null); fetchNotifications(); }} className="notif-error-retry">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="notif-loading">Loading notifications...</div>
      ) : notifications.length === 0 && !error ? (
        <div className="notif-empty">
          <Bell size={48} className="notif-empty-icon" />
          <p className="notif-empty-title">No notifications yet</p>
          <p className="notif-empty-desc">You'll see order updates, stock alerts, and payment reminders here.</p>
        </div>
      ) : (
        <div className="notif-list">
          {notifications.map((n) => (
            <div
              key={n.id}
              role="button"
              tabIndex={0}
              onClick={() => !n.isRead && markAsRead(n.id)}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !n.isRead) { e.preventDefault(); markAsRead(n.id); } }}
              className={`notif-card${!n.isRead ? ' notif-card--unread' : ''}`}
            >
              <div className="notif-card-icon">{getIcon(n.type)}</div>
              <div className="notif-card-body">
                <div className="notif-card-header">
                  <h3 className={`notif-card-title${!n.isRead ? ' notif-card-title--unread' : ''}`}>{n.title}</h3>
                  <span className="notif-card-time">
                    {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="notif-card-text">{n.body}</p>
              </div>
              {!n.isRead && (
                <div className="notif-unread-dot" />
              )}
            </div>
          ))}

          {total > limit && (
            <div className="notif-pagination">
              <button
                aria-label="Previous page of notifications"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                className="btn btn-secondary btn-sm"
              >
                Previous
              </button>
              <span className="notif-page-info">
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <button
                aria-label="Next page of notifications"
                disabled={offset + limit >= total}
                onClick={() => setOffset((o) => o + limit)}
                className="btn btn-secondary btn-sm"
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
