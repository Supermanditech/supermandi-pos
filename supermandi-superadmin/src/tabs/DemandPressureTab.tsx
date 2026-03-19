/**
 * V3-HARDEN-185: SuperAdmin demand pressure dashboard tab
 * Consumes GET /admin/demand-signals/pressure and renders cross-store demand data.
 */

import { useState, useEffect, useCallback } from 'react';
import { getDemandPressure, recomputeDemandSignals, type DemandPressureItem } from '../api/demandSignals';

export function DemandPressureTab() {
  const [pressure, setPressure] = useState<DemandPressureItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [computedAt, setComputedAt] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDemandPressure(50);
      setPressure(data.pressure);
      setComputedAt(data.computedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load demand pressure');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      await recomputeDemandSignals();
      await fetchData();
    } catch {
      setError('Recompute failed');
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3>Demand Pressure — Cross-Store</h3>
        <button onClick={handleRecompute} disabled={recomputing}>
          {recomputing ? 'Recomputing...' : 'Recompute'}
        </button>
      </div>

      {loading && <p>Loading demand pressure...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!loading && !error && pressure.length === 0 && <p>No products need reorder across stores</p>}

      {computedAt && <p style={{ fontSize: 12, color: '#888' }}>Last computed: {computedAt}</p>}

      {pressure.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 8 }}>Product</th>
              <th style={{ textAlign: 'right', padding: 8 }}>Stores Needing Reorder</th>
              <th style={{ textAlign: 'right', padding: 8 }}>Avg Days of Stock</th>
              <th style={{ textAlign: 'right', padding: 8 }}>Pending Inbound</th>
            </tr>
          </thead>
          <tbody>
            {pressure.map((item) => (
              <tr key={item.productId} data-testid={`pressure-row-${item.productId}`}>
                <td style={{ padding: 8 }}>{item.productName}</td>
                <td style={{ textAlign: 'right', padding: 8 }}>{item.storesNeedingReorder} / {item.totalStores}</td>
                <td style={{ textAlign: 'right', padding: 8 }}>{item.avgDaysOfStock}</td>
                <td style={{ textAlign: 'right', padding: 8 }}>{item.totalPendingInbound}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
