/**
 * V3-HARDEN-185: Retailer demand signals section
 * Renders demand signal data with reorder recommendations.
 * Consumed by ReorderPage or DashboardPage.
 */

import { useState, useEffect, useCallback } from 'react';
import { getDemandSignals, getDemandRecommendations, type DemandSignal, type ReorderRecommendation } from '../lib/demandSignals';

export function DemandSignalsSection() {
  const [signals, setSignals] = useState<DemandSignal[]>([]);
  const [recommendations, setRecommendations] = useState<ReorderRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'signals' | 'recommendations'>('signals');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (view === 'signals') {
        const data = await getDemandSignals({ needsReorder: true, sortBy: 'daysOfStock', limit: 20 });
        setSignals(data.signals);
      } else {
        const data = await getDemandRecommendations();
        setRecommendations(data.recommendations);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load demand data');
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setView('signals')}
          style={{ fontWeight: view === 'signals' ? 700 : 400 }}
        >
          Low Stock Signals
        </button>
        <button
          onClick={() => setView('recommendations')}
          style={{ fontWeight: view === 'recommendations' ? 700 : 400 }}
        >
          Reorder Recommendations
        </button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {view === 'signals' && !loading && !error && (
        signals.length === 0
          ? <p>All stock levels healthy</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8 }}>Product</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Stock</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Daily Velocity</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Days Left</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s.productId}>
                    <td style={{ padding: 8 }}>{s.productName}</td>
                    <td style={{ textAlign: 'right', padding: 8 }}>{s.currentStock}</td>
                    <td style={{ textAlign: 'right', padding: 8 }}>{s.dailyVelocity}</td>
                    <td style={{ textAlign: 'right', padding: 8, color: s.daysOfStock <= 2 ? 'red' : undefined }}>{s.daysOfStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
      )}

      {view === 'recommendations' && !loading && !error && (
        recommendations.length === 0
          ? <p>No reorder recommendations</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8 }}>Product</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Suggested Qty</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Days Left</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Type</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((r) => (
                  <tr key={r.productId}>
                    <td style={{ padding: 8 }}>{r.productName}</td>
                    <td style={{ textAlign: 'right', padding: 8 }}>{r.suggestedQuantity}</td>
                    <td style={{ textAlign: 'right', padding: 8 }}>{r.daysOfStock}</td>
                    <td style={{ textAlign: 'right', padding: 8 }}>{r.isRepeat ? 'Repeat' : 'Fresh'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
      )}
    </div>
  );
}
