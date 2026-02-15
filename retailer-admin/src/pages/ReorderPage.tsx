// T-230: Auto-reorder suggestions page for retailer-admin
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import Breadcrumb from '../components/Breadcrumb';
import EmptyState from '../components/EmptyState';
import { PackageCheck, RefreshCw, Settings, AlertTriangle } from 'lucide-react';

interface ReorderSettings {
  storeId: string;
  isEnabled: boolean;
  lowStockThreshold: number;
  reorderWindowDays: number;
  autoCreatePo: boolean;
}

interface Suggestion {
  storeProductId: string;
  productId: string;
  productName: string;
  category: string | null;
  unit: string | null;
  currentStock: number;
  purchasePrice: number | null;
  sellPrice: number | null;
  threshold: number;
}

interface PendingReorder {
  id: string;
  productId: string;
  productName: string;
  currentStock: number;
  threshold: number;
  suggestedQty: number;
  status: string;
  createdAt: string;
}

function formatCurrency(minor: number | null): string {
  if (minor == null) return '\u2014';
  return '\u20B9' + (minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function ReorderPage() {
  const { accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<'suggestions' | 'pending' | 'settings'>('suggestions');

  // Settings state
  const [settings, setSettings] = useState<ReorderSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [editThreshold, setEditThreshold] = useState(10);
  const [editWindowDays, setEditWindowDays] = useState(7);
  const [editEnabled, setEditEnabled] = useState(false);
  const [editAutoPo, setEditAutoPo] = useState(false);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [threshold, setThreshold] = useState(10);

  // Pending state
  const [pending, setPending] = useState<PendingReorder[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState('');

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError('');
    try {
      const response = await authFetch('/api/v1/retailer-admin/reorder/settings', accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await safeJson<{ data: ReorderSettings }>(response);
      if (data?.data) {
        setSettings(data.data);
        setEditThreshold(data.data.lowStockThreshold);
        setEditWindowDays(data.data.reorderWindowDays);
        setEditEnabled(data.data.isEnabled);
        setEditAutoPo(data.data.autoCreatePo);
      }
    } catch (e: any) {
      setSettingsError(e?.message || 'Failed to load settings');
    } finally {
      setSettingsLoading(false);
    }
  }, [accessToken]);

  const saveSettings = useCallback(async () => {
    setSettingsSaving(true);
    setSettingsError('');
    try {
      const response = await authFetch('/api/v1/retailer-admin/reorder/settings', accessToken, {
        method: 'PUT',
        body: JSON.stringify({
          isEnabled: editEnabled,
          lowStockThreshold: editThreshold,
          reorderWindowDays: editWindowDays,
          autoCreatePo: editAutoPo,
        }),
      });
      if (!response.ok) throw new Error('Failed to save settings');
      const data = await safeJson<{ data: ReorderSettings }>(response);
      if (data?.data) setSettings(data.data);
    } catch (e: any) {
      setSettingsError(e?.message || 'Failed to save');
    } finally {
      setSettingsSaving(false);
    }
  }, [accessToken, editEnabled, editThreshold, editWindowDays, editAutoPo]);

  const fetchSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    setSuggestionsError('');
    try {
      const response = await authFetch('/api/v1/retailer-admin/reorder/suggestions', accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch suggestions');
      const data = await safeJson<{ data: Suggestion[]; total: number; threshold: number }>(response);
      if (data) {
        setSuggestions(data.data || []);
        setThreshold(data.threshold || 10);
      }
    } catch (e: any) {
      setSuggestionsError(e?.message || 'Failed to load suggestions');
    } finally {
      setSuggestionsLoading(false);
    }
  }, [accessToken]);

  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError('');
    try {
      const response = await authFetch('/api/v1/retailer-admin/reorder/pending', accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch pending');
      const data = await safeJson<{ data: PendingReorder[] }>(response);
      if (data) setPending(data.data || []);
    } catch (e: any) {
      setPendingError(e?.message || 'Failed to load pending');
    } finally {
      setPendingLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchSettings();
    fetchSuggestions();
  }, [fetchSettings, fetchSuggestions]);

  useEffect(() => {
    if (activeTab === 'pending') fetchPending();
  }, [activeTab, fetchPending]);

  return (
    <div>
      <Breadcrumb items={[{ label: 'Reorder Suggestions' }]} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Reorder Suggestions</h2>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #eee', paddingBottom: 0 }}>
        {(['suggestions', 'pending', 'settings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === t ? 600 : 400,
              borderBottom: activeTab === t ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === t ? '#2563eb' : '#666', background: 'transparent', marginBottom: -2,
            }}
          >
            {t === 'suggestions' ? 'Low Stock' : t === 'pending' ? 'Pending Reorders' : 'Settings'}
          </button>
        ))}
      </div>

      {/* Suggestions Tab */}
      {activeTab === 'suggestions' && (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: '#666' }}>Products at or below <strong>{threshold} units</strong></span>
            <button onClick={fetchSuggestions} disabled={suggestionsLoading} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
              <RefreshCw size={14} className={suggestionsLoading ? 'spin' : ''} /> Refresh
            </button>
          </div>
          {suggestionsError && <div className="error-banner" style={{ marginBottom: 12 }}>{suggestionsError}</div>}
          {!suggestionsLoading && suggestions.length === 0 ? (
            <EmptyState icon={<PackageCheck size={32} />} title="All stocked up!" description="No products are below the reorder threshold." />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Current Stock</th>
                    <th>Threshold</th>
                    <th>Unit</th>
                    <th>Purchase Price</th>
                    <th>Sell Price</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s) => (
                    <tr key={s.storeProductId}>
                      <td style={{ fontWeight: 500 }}>{s.productName}</td>
                      <td>{s.category || '\u2014'}</td>
                      <td>
                        <span style={{ color: s.currentStock === 0 ? '#dc2626' : '#f59e0b', fontWeight: 600 }}>
                          {s.currentStock === 0 && <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                          {s.currentStock}
                        </span>
                      </td>
                      <td>{s.threshold}</td>
                      <td>{s.unit || '\u2014'}</td>
                      <td>{formatCurrency(s.purchasePrice)}</td>
                      <td>{formatCurrency(s.sellPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {suggestionsLoading && <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>Loading...</div>}
        </div>
      )}

      {/* Pending Tab */}
      {activeTab === 'pending' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={fetchPending} disabled={pendingLoading} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={14} className={pendingLoading ? 'spin' : ''} /> Refresh
            </button>
          </div>
          {pendingError && <div className="error-banner" style={{ marginBottom: 12 }}>{pendingError}</div>}
          {!pendingLoading && pending.length === 0 ? (
            <EmptyState icon={<PackageCheck size={32} />} title="No pending reorders" description="Pending reorder requests will appear here." />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Current Stock</th>
                    <th>Threshold</th>
                    <th>Suggested Qty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 500 }}>{p.productName}</td>
                      <td>{p.currentStock}</td>
                      <td>{p.threshold}</td>
                      <td style={{ fontWeight: 600, color: '#2563eb' }}>{p.suggestedQty}</td>
                      <td><span className="badge badge-warning">{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pendingLoading && <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>Loading...</div>}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div>
          {settingsLoading && <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>Loading settings...</div>}
          {settingsError && <div className="error-banner" style={{ marginBottom: 12 }}>{settingsError}</div>}
          {!settingsLoading && (
            <div className="card" style={{ padding: 24, maxWidth: 480 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Settings size={18} />
                <h3 style={{ margin: 0 }}>Reorder Settings</h3>
              </div>
              <div style={{ display: 'grid', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={editEnabled} onChange={(e) => setEditEnabled(e.target.checked)} />
                  <span>Enable auto-reorder suggestions</span>
                </label>
                <div>
                  <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>Low stock threshold (units)</label>
                  <input type="number" min={1} max={999} value={editThreshold} onChange={(e) => setEditThreshold(Number(e.target.value))} style={{ width: 120 }} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>Reorder window (days)</label>
                  <input type="number" min={1} max={90} value={editWindowDays} onChange={(e) => setEditWindowDays(Number(e.target.value))} style={{ width: 120 }} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={editAutoPo} onChange={(e) => setEditAutoPo(e.target.checked)} />
                  <span>Auto-create purchase orders</span>
                </label>
                <button onClick={saveSettings} disabled={settingsSaving} className="btn-primary" style={{ width: 'fit-content' }}>
                  {settingsSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
