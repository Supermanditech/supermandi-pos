'use client';

/**
 * Phase 8: Supplier Portal Notifications Page
 * In-app notification center for suppliers
 */

import { useState, useEffect, useCallback } from 'react';
import { Bell, Check, CheckCheck, RefreshCw, Truck, Package, AlertTriangle } from 'lucide-react';
import Breadcrumb from '@/components/Breadcrumb';

interface Notification {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  type: string;
  isRead: boolean;
  createdAt: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('supplier_token') : null;
      if (!token) return;

      const res = await fetch(`${API_BASE}/api/v1/supplier/notifications?limit=${limit}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setNotifications(data.data || []);
        setTotal(data.pagination?.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    const token = localStorage.getItem('supplier_token');
    if (!token) return;
    try {
      await fetch(`${API_BASE}/api/v1/supplier/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    } catch { /* ignore */ }
  };

  const markAllAsRead = async () => {
    const token = localStorage.getItem('supplier_token');
    if (!token) return;
    try {
      await fetch(`${API_BASE}/api/v1/supplier/notifications/read-all`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch { /* ignore */ }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'order_status': return <Truck size={18} className="text-blue-500" />;
      case 'delivery_update': return <Package size={18} className="text-green-500" />;
      case 'grn_mismatch': return <AlertTriangle size={18} className="text-red-500" />;
      default: return <Bell size={18} className="text-gray-500" />;
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="p-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Notifications' }]} />

      <div className="flex justify-between items-center mt-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} total {unreadCount > 0 && `(${unreadCount} unread)`}
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-green-50 text-green-700 border border-green-200 rounded-md hover:bg-green-100"
            >
              <CheckCheck size={14} /> Mark all read
            </button>
          )}
          <button
            onClick={fetchNotifications}
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-gray-50 text-gray-700 border border-gray-200 rounded-md hover:bg-gray-100"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12">
          <Bell size={48} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No notifications yet</p>
          <p className="text-gray-400 text-sm mt-1">You'll see order updates and delivery alerts here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.isRead && markAsRead(n.id)}
              className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                n.isRead ? 'bg-white border-gray-200' : 'bg-green-50 border-green-200 hover:bg-green-100'
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">{getIcon(n.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <h3 className={`text-sm ${n.isRead ? 'font-medium' : 'font-semibold'} text-gray-900`}>{n.title}</h3>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                    {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">{n.body}</p>
              </div>
              {!n.isRead && <div className="flex-shrink-0 w-2 h-2 rounded-full bg-green-500 mt-1.5" />}
            </div>
          ))}

          {total > limit && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                className="px-3 py-1.5 text-xs border rounded-md disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-xs text-gray-500">
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset((o) => o + limit)}
                className="px-3 py-1.5 text-xs border rounded-md disabled:opacity-50"
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
