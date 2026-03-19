'use client';

/**
 * V3-FIX-187: Supplier allocations management page
 * Lists allocations, shows detail, allows status transitions.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  listAllocations,
  getAllocation,
  updateAllocationStatus,
  type SupplierAllocation,
} from '@/lib/demandAllocations';

const STATUS_ACTIONS: Record<string, { label: string; nextStatus: string }[]> = {
  triggered: [
    { label: 'Accept', nextStatus: 'accepted' },
    { label: 'Partial Accept', nextStatus: 'partial_accepted' },
    { label: 'Reject', nextStatus: 'rejected' },
  ],
  accepted: [{ label: 'Mark Dispatched', nextStatus: 'dispatched' }],
  partial_accepted: [{ label: 'Mark Dispatched', nextStatus: 'dispatched' }],
  dispatched: [{ label: 'Mark Delivered', nextStatus: 'delivered' }],
};

const STATUS_COLORS: Record<string, string> = {
  pending_trigger: '#94a3b8',
  triggered: '#f59e0b',
  accepted: '#22c55e',
  partial_accepted: '#eab308',
  rejected: '#ef4444',
  dispatched: '#3b82f6',
  delivered: '#10b981',
  grn_completed: '#6b7280',
};

export default function AllocationsPage() {
  const [allocations, setAllocations] = useState<SupplierAllocation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupplierAllocation | null>(null);

  const fetchAllocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { status?: string; limit?: number } = { limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const result = await listAllocations(params);
      setAllocations(result.allocations);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load allocations');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchAllocations(); }, [fetchAllocations]);

  const handleTransition = async (allocationId: string, nextStatus: string) => {
    setTransitioning(allocationId);
    setError(null);
    try {
      await updateAllocationStatus(allocationId, nextStatus);
      await fetchAllocations();
      if (selectedId === allocationId) {
        const updated = await getAllocation(allocationId);
        setDetail(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transition failed');
    } finally {
      setTransitioning(null);
    }
  };

  const handleViewDetail = async (id: string) => {
    setSelectedId(id);
    try {
      const d = await getAllocation(id);
      setDetail(d);
    } catch {
      setDetail(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Allocations</h1>

      <div className="flex gap-3 mb-4 items-center">
        <label className="text-sm font-medium">Filter by status:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="">All</option>
          {Object.keys(STATUS_COLORS).map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500">Total: {total}</span>
      </div>

      {loading && <p className="text-gray-500">Loading allocations...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && allocations.length === 0 && !error && (
        <p className="text-gray-500">No allocations found</p>
      )}

      {allocations.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Order</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Updated</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.id} className="border-b hover:bg-gray-50">
                <td className="p-2">
                  <button
                    onClick={() => handleViewDetail(a.id)}
                    className="text-blue-600 hover:underline font-mono text-xs"
                  >
                    {a.retailerOrderId.slice(0, 12)}...
                  </button>
                </td>
                <td className="p-2">
                  <span
                    className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
                    style={{ backgroundColor: STATUS_COLORS[a.status] || '#6b7280' }}
                  >
                    {a.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="p-2 text-xs text-gray-500">
                  {a.updatedAt ? new Date(a.updatedAt).toLocaleDateString() : '—'}
                </td>
                <td className="p-2 flex gap-1">
                  {(STATUS_ACTIONS[a.status] || []).map((action) => (
                    <button
                      key={action.nextStatus}
                      onClick={() => handleTransition(a.id, action.nextStatus)}
                      disabled={transitioning === a.id}
                      className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {transitioning === a.id ? '...' : action.label}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {detail && (
        <div className="mt-6 p-4 border rounded bg-gray-50">
          <h3 className="font-bold mb-2">Allocation Detail</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><strong>ID:</strong> {detail.id}</div>
            <div><strong>Order:</strong> {detail.retailerOrderId}</div>
            <div><strong>Status:</strong> {detail.status}</div>
            <div><strong>Store:</strong> {detail.storeId}</div>
            <div><strong>Triggered:</strong> {detail.triggeredAt || '—'}</div>
            <div><strong>Accepted:</strong> {detail.acceptedAt || '—'}</div>
            <div><strong>Dispatched:</strong> {detail.dispatchedAt || '—'}</div>
            <div><strong>Delivered:</strong> {detail.deliveredAt || '—'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
