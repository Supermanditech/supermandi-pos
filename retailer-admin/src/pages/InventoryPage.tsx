import { useState } from 'react';

interface LedgerEntry {
  id: string;
  date: string;
  product: string;
  type: 'INWARD' | 'OUTWARD' | 'ADJUSTMENT';
  quantity: number;
  reference: string;
  balance: number;
}

// Mock data
const mockLedger: LedgerEntry[] = [
  { id: '1', date: '2024-01-18 14:30', product: 'Parle-G 100g', type: 'OUTWARD', quantity: -5, reference: 'POS Sale #1234', balance: 145 },
  { id: '2', date: '2024-01-18 12:00', product: 'Tata Salt 1kg', type: 'INWARD', quantity: 50, reference: 'CSV Import #12', balance: 130 },
  { id: '3', date: '2024-01-18 11:45', product: 'Parle-G 100g', type: 'OUTWARD', quantity: -3, reference: 'POS Sale #1233', balance: 150 },
  { id: '4', date: '2024-01-18 10:00', product: 'Loose Rice', type: 'ADJUSTMENT', quantity: -2, reference: 'Damage Write-off', balance: 23 },
  { id: '5', date: '2024-01-17 16:00', product: 'Amul Butter 500g', type: 'INWARD', quantity: 20, reference: 'Purchase Order #45', balance: 32 },
];

export default function InventoryPage() {
  const [filter, setFilter] = useState<'all' | 'INWARD' | 'OUTWARD' | 'ADJUSTMENT'>('all');

  const filteredEntries = filter === 'all'
    ? mockLedger
    : mockLedger.filter(e => e.type === filter);

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Inventory Ledger</h1>
      </header>

      <div className="page-content">
        {/* Summary Stats */}
        <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <div className="stat-label">📦 Total SKUs</div>
            <div className="stat-value">1,234</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">⚠️ Low Stock</div>
            <div className="stat-value" style={{ color: 'var(--warning)' }}>23</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">🚫 Out of Stock</div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>5</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">📈 Today's Movements</div>
            <div className="stat-value">42</div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {(['all', 'INWARD', 'OUTWARD', 'ADJUSTMENT'] as const).map((f) => (
            <button
              key={f}
              className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Ledger Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Date/Time</th>
                <th>Product</th>
                <th>Type</th>
                <th>Qty Change</th>
                <th>Reference</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{entry.date}</td>
                  <td>{entry.product}</td>
                  <td>
                    <span className={`badge ${
                      entry.type === 'INWARD' ? 'badge-success' :
                      entry.type === 'OUTWARD' ? 'badge-warning' :
                      'badge-danger'
                    }`}>
                      {entry.type}
                    </span>
                  </td>
                  <td style={{
                    color: entry.quantity > 0 ? 'var(--success)' : 'var(--danger)',
                    fontWeight: '500'
                  }}>
                    {entry.quantity > 0 ? '+' : ''}{entry.quantity}
                  </td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{entry.reference}</td>
                  <td style={{ fontWeight: '500' }}>{entry.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Info Box */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#eff6ff', borderRadius: '0.5rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            💡 <strong>Note:</strong> Inventory changes are tracked through the ledger.
            Direct stock edits create ADJUSTMENT entries for audit trail.
          </p>
        </div>
      </div>
    </>
  );
}
