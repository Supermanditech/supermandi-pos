/**
 * V3-FIX-187: SuperAdmin allocation dashboard tab
 * Consumes GET /admin/allocations/summary and renders status breakdown.
 */

import { useState, useEffect, useCallback } from 'react';
import { getAllocationSummary, getStoreAllocations, transitionAllocation, type AllocationSummary, type AllocationRecord } from '../api/allocations';

export function AllocationsDashboardTab() {
  const [summary, setSummary] = useState<AllocationSummary | null>(null);
  const [storeAllocations, setStoreAllocations] = useState<AllocationRecord[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  // GCP-STG-0426: Client-side pagination for drill-down (page size 20)
  const ALLOC_PAGE_SIZE = 20;
  const [allocPage, setAllocPage] = useState(0);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllocationSummary();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load allocation summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const handleDrillDown = async (storeId: string) => {
    setSelectedStoreId(storeId);
    setAllocPage(0);
    try {
      const data = await getStoreAllocations(storeId, { limit: 20 });
      setStoreAllocations(data.allocations);
    } catch {
      setStoreAllocations([]);
    }
  };

  const handleTransition = async (allocationId: string, newStatus: string) => {
    setTransitioning(allocationId);
    try {
      await transitionAllocation(allocationId, newStatus, 'admin override');
      if (selectedStoreId) await handleDrillDown(selectedStoreId);
      await fetchSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transition failed');
    } finally {
      setTransitioning(null);
    }
  };

  return (
    <div>
      <h3>Allocation Dashboard</h3>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {summary && (
        <div style={{ marginBottom: 16 }}>
          <p><strong>Total allocations:</strong> {summary.total}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(summary.byStatus).map(([status, count]) => (
              <div key={status} style={{ padding: '8px 16px', borderRadius: 8, background: '#f0f0f0' }}>
                <div style={{ fontWeight: 700 }}>{count}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label>Drill-down by store: </label>
        <input
          type="text"
          placeholder="Enter store ID"
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
          style={{ padding: 4, marginRight: 8 }}
        />
        <button onClick={() => handleDrillDown(selectedStoreId)} disabled={!selectedStoreId}>
          Load
        </button>
      </div>

      {storeAllocations.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 8 }}>ID</th>
              <th style={{ textAlign: 'left', padding: 8 }}>Order</th>
              <th style={{ textAlign: 'left', padding: 8 }}>Status</th>
              <th style={{ textAlign: 'left', padding: 8 }}>Updated</th>
              <th style={{ textAlign: 'left', padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* GCP-STG-0426: Paginated drill-down */}
            {storeAllocations.slice(allocPage * ALLOC_PAGE_SIZE, (allocPage + 1) * ALLOC_PAGE_SIZE).map((a) => (
              <tr key={a.id}>
                <td style={{ padding: 8, fontSize: 12, fontFamily: 'monospace' }}>{a.id.slice(0, 8)}</td>
                <td style={{ padding: 8, fontSize: 12 }}>{a.retailerOrderId.slice(0, 8)}</td>
                <td style={{ padding: 8 }}>{a.status}</td>
                <td style={{ padding: 8, fontSize: 12 }}>{a.updatedAt}</td>
                <td style={{ padding: 8 }}>
                  {a.status === 'pending_trigger' && (
                    <button disabled={transitioning === a.id} onClick={() => handleTransition(a.id, 'triggered')}>
                      {transitioning === a.id ? '...' : 'Trigger'}
                    </button>
                  )}
                  {a.status === 'dispatched' && (
                    <button disabled={transitioning === a.id} onClick={() => handleTransition(a.id, 'delivered')}>
                      {transitioning === a.id ? '...' : 'Mark Delivered'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* GCP-STG-0426: Pagination controls */}
        {storeAllocations.length > ALLOC_PAGE_SIZE && (() => {
          const totalPages = Math.ceil(storeAllocations.length / ALLOC_PAGE_SIZE);
          return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '8px 0' }}>
              <button disabled={allocPage === 0} onClick={() => setAllocPage(p => p - 1)}>Prev</button>
              <span style={{ fontSize: 13, color: '#666' }}>Page {allocPage + 1} of {totalPages}</span>
              <button disabled={allocPage >= totalPages - 1} onClick={() => setAllocPage(p => p + 1)}>Next</button>
            </div>
          );
        })()}
      )}
    </div>
  );
}
