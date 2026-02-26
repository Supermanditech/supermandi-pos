// T-244: Reorder dashboard — fixed to match T-243 canonical schema (migration 007 + 150)
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import Breadcrumb from '../components/Breadcrumb';
import EmptyState from '../components/EmptyState';
import { PackageCheck, RefreshCw, Settings, AlertTriangle } from 'lucide-react';

// =============================================================================
// TYPES (matching T-243 backend response)
// =============================================================================

interface ReorderSettings {
  storeId: string;
  reorderEnabled: boolean;
  requireApproval: boolean;
  notifyOnLowStock: boolean;
  autoApproveThreshold: number | null;
  defaultLeadDays: number;
  updatedAt: string | null;
}

interface Suggestion {
  storeProductId: string;
  productId: string;
  productName: string;
  category: string | null;
  unit: string | null;
  currentStock: number;
  minStock: number;
  targetStock: number;
  maxReorderQty: number | null;
  purchasePrice: number | null;
  sellPrice: number | null;
}

interface PendingReorder {
  id: string;
  storeId: string;
  productId: string;
  productName: string;
  currentStock: number;
  minThreshold: number;
  targetStock: number;
  suggestedQuantity: number;
  supplierName: string | null;
  unitPrice: number | null;
  status: string;
  expiresAt: string;
  createdAt: string;
}

function formatCurrency(minor: number | null): string {
  if (minor == null) return '\u2014';
  return '\u20B9' + (minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ReorderPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<'suggestions' | 'pending' | 'settings'>('suggestions');

  // Settings state (matches canonical schema)
  const [_settings, setSettings] = useState<ReorderSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaveSuccess, setSettingsSaveSuccess] = useState(false);
  const [editEnabled, setEditEnabled] = useState(true);
  const [editRequireApproval, setEditRequireApproval] = useState(true);
  const [editNotifyLowStock, setEditNotifyLowStock] = useState(true);
  const [editAutoApproveThreshold, setEditAutoApproveThreshold] = useState('');
  const [editDefaultLeadDays, setEditDefaultLeadDays] = useState(3);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');

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
        setEditEnabled(data.data.reorderEnabled);
        setEditRequireApproval(data.data.requireApproval);
        setEditNotifyLowStock(data.data.notifyOnLowStock);
        setEditAutoApproveThreshold(data.data.autoApproveThreshold != null ? String(data.data.autoApproveThreshold) : '');
        setEditDefaultLeadDays(data.data.defaultLeadDays);
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
          reorderEnabled: editEnabled,
          requireApproval: editRequireApproval,
          notifyOnLowStock: editNotifyLowStock,
          autoApproveThreshold: editAutoApproveThreshold ? Number(editAutoApproveThreshold) : null,
          defaultLeadDays: editDefaultLeadDays,
        }),
      });
      if (!response.ok) throw new Error('Failed to save settings');
      const data = await safeJson<{ data: ReorderSettings }>(response);
      if (data?.data) setSettings(data.data);
      setSettingsSaveSuccess(true);
      setTimeout(() => setSettingsSaveSuccess(false), 3000);
    } catch (e: any) {
      setSettingsError(e?.message || 'Failed to save');
    } finally {
      setSettingsSaving(false);
    }
  }, [accessToken, editEnabled, editRequireApproval, editNotifyLowStock, editAutoApproveThreshold, editDefaultLeadDays]);

  const fetchSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    setSuggestionsError('');
    try {
      const response = await authFetch('/api/v1/retailer-admin/reorder/suggestions', accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch suggestions');
      const data = await safeJson<{ data: Suggestion[]; total: number }>(response);
      if (data) {
        setSuggestions(data.data || []);
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
      {/* R6.RET.015: Use absolute path consistent with other pages */}
      <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Reorder Suggestions' }]} />
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
            {t === 'suggestions' ? 'Low Stock' : t === 'pending' ? `Pending Reorders${pending.length > 0 ? ` (${pending.length})` : ''}` : 'Settings'}
          </button>
        ))}
      </div>

      {/* Suggestions Tab */}
      {activeTab === 'suggestions' && (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: '#666' }}>Products below their reorder threshold (per-product policy)</span>
            <button aria-label="Refresh reorder suggestions" onClick={fetchSuggestions} disabled={suggestionsLoading} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
              <RefreshCw size={14} className={suggestionsLoading ? 'spin' : ''} /> Refresh
            </button>
          </div>
          {suggestionsError && <div className="error-banner" style={{ marginBottom: 12 }}>{suggestionsError}</div>}
          {!suggestionsLoading && suggestions.length === 0 ? (
            <EmptyState icon={<PackageCheck size={32} />} title="All stocked up!" description="No products are below their reorder threshold." />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Current</th>
                    <th>Min</th>
                    <th>Target</th>
                    <th>Max Qty</th>
                    <th>Purchase</th>
                    <th>Sell</th>
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
                      <td>{s.minStock}</td>
                      <td>{s.targetStock}</td>
                      <td>{s.maxReorderQty ?? '\u2014'}</td>
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
            <button aria-label="Refresh pending reorders" onClick={fetchPending} disabled={pendingLoading} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={14} className={pendingLoading ? 'spin' : ''} /> Refresh
            </button>
          </div>
          {pendingError && <div className="error-banner" style={{ marginBottom: 12 }}>{pendingError}</div>}
          {/* RET-C4-018: Show loading state for pending tab */}
          {pendingLoading && pending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>Loading pending reorders...</div>
          ) : !pendingLoading && pending.length === 0 ? (
            <EmptyState icon={<PackageCheck size={32} />} title="No pending reorders" description="Pending reorder requests will appear here when the system detects low stock." />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Current</th>
                    <th>Min</th>
                    <th>Target</th>
                    <th>Suggested Qty</th>
                    <th>Supplier</th>
                    <th>Unit Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 500 }}>{p.productName}</td>
                      <td>
                        <span style={{ color: p.currentStock === 0 ? '#dc2626' : '#f59e0b', fontWeight: 600 }}>
                          {p.currentStock}
                        </span>
                      </td>
                      <td>{p.minThreshold}</td>
                      <td>{p.targetStock}</td>
                      <td style={{ fontWeight: 600, color: '#2563eb' }}>{p.suggestedQuantity}</td>
                      <td>{p.supplierName || '\u2014'}</td>
                      <td>{formatCurrency(p.unitPrice)}</td>
                      <td><span className={`badge ${p.status === 'fulfilled' ? 'badge-success' : p.status === 'approved' ? 'badge-info' : p.status === 'expired' || p.status === 'dismissed' ? 'badge-secondary' : 'badge-warning'}`}>{p.status}</span></td>
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
          {settingsSaveSuccess && <div style={{ background: '#dcfce7', color: '#166534', padding: '0.75rem 1rem', borderRadius: '0.375rem', marginBottom: 12, fontSize: '0.875rem' }}>Reorder settings saved successfully</div>}
          {settingsError && <div className="error-banner" style={{ marginBottom: 12 }}>{settingsError}</div>}
          {!settingsLoading && (
            <div className="card" style={{ padding: 24, maxWidth: 520 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Settings size={18} />
                <h3 style={{ margin: 0 }}>Reorder Settings</h3>
              </div>
              <div style={{ display: 'grid', gap: 16 }}>
                {/* RET-C4-015: Disable all inputs during save */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={editEnabled} onChange={(e) => setEditEnabled(e.target.checked)} disabled={settingsSaving} />
                  <span>Enable reorder suggestions</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={editRequireApproval} onChange={(e) => setEditRequireApproval(e.target.checked)} disabled={settingsSaving} />
                  <span>Require approval before creating POs</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={editNotifyLowStock} onChange={(e) => setEditNotifyLowStock(e.target.checked)} disabled={settingsSaving} />
                  <span>Notify on low stock</span>
                </label>
                <div>
                  <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>Auto-approve threshold (amount in ₹, leave blank to disable)</label>
                  <input type="number" min={0} value={editAutoApproveThreshold} onChange={(e) => setEditAutoApproveThreshold(e.target.value)} placeholder="No auto-approve" style={{ width: 180 }} disabled={settingsSaving} />
                  <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>Orders below this value auto-approve</span>
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>Default lead time (days)</label>
                  <input type="number" min={1} max={90} value={editDefaultLeadDays} onChange={(e) => setEditDefaultLeadDays(Number(e.target.value))} style={{ width: 120 }} disabled={settingsSaving} />
                </div>
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
