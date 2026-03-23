/**
 * V3-OWNER-023: Retailer-admin staff management page
 * Owner can: list, create, edit, activate/deactivate, reset PIN for store staff.
 * Uses /api/v1/retailer-admin/staff endpoints.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { authFetch } from '../lib/api';

type StaffMember = {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  is_owner: boolean;
  last_login_at: string | null;
  created_at: string;
};

const ROLES = ['CASHIER', 'STOCK_MANAGER', 'MANAGER'] as const;

/** GCP-STG-0418: Page size for client-side staff pagination */
const STAFF_PAGE_SIZE = 20;

export default function StaffPage() {
  const { accessToken, store } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // GCP-STG-0418: Pagination state
  const [currentPage, setCurrentPage] = useState(0);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState<string>('CASHIER');
  const [creating, setCreating] = useState(false);

  // GCP-STG-0417: Inline error message instead of alert()
  const [actionError, setActionError] = useState<string | null>(null);

  // Reset PIN state
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPin, setResetPin] = useState('');

  // Edit staff state
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/v1/retailer-admin/staff', accessToken);
      if (!res.ok) throw new Error('Failed to load staff');
      const data = await res.json();
      setStaff(data.staff ?? []);
      setError(null);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const handleCreate = async () => {
    if (!newName.trim() || !newPin || !/^\d{4,6}$/.test(newPin)) return;
    setCreating(true);
    try {
      const res = await authFetch('/api/v1/retailer-admin/staff', accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), pin: newPin, role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data?.error?.message ?? 'Failed to create staff');
        return;
      }
      setActionError(null);
      setNewName(''); setNewPin(''); setNewRole('CASHIER'); setShowCreate(false);
      await fetchStaff();
    } catch { setActionError('Network error'); }
    finally { setCreating(false); }
  };

  const handleEdit = async (staffId: string) => {
    if (!editName.trim() || editName.trim().length < 2) { setActionError('Name must be at least 2 characters'); return; }
    try {
      const res = await authFetch(`/api/v1/retailer-admin/staff/${staffId}`, accessToken, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), role: editRole }),
      });
      if (!res.ok) { const d = await res.json(); setActionError(d?.error?.message ?? 'Failed to update'); return; }
      setActionError(null); setEditTarget(null); setEditName(''); setEditRole('');
      await fetchStaff();
    } catch { setActionError('Network error'); }
  };

  const handleToggleActive = async (staffId: string) => {
    try {
      const res = await authFetch(`/api/v1/retailer-admin/staff/${staffId}`, accessToken, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !staff.find(s => s.id === staffId)?.is_active }),
      });
      if (!res.ok) { const d = await res.json(); setActionError(d?.error?.message ?? 'Failed'); return; }
      setActionError(null);
      await fetchStaff();
    } catch { setActionError('Network error'); }
  };

  const handleResetPin = async (staffId: string) => {
    if (!resetPin || !/^\d{4,6}$/.test(resetPin)) { setActionError('PIN must be 4-6 digits'); return; }
    try {
      const res = await authFetch(`/api/v1/retailer-admin/staff/${staffId}/reset-pin`, accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: resetPin }),
      });
      if (!res.ok) { const d = await res.json(); setActionError(d?.error?.message ?? 'Failed to reset PIN'); return; }
      setActionError(null); setResetTarget(null); setResetPin('');
    } catch { setActionError('Network error'); }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Staff Management</h1>
          <p style={{ color: '#64748B', margin: '4px 0 0' }}>
            {store?.name ?? 'Store'} · {staff.filter(s => s.is_active).length} active staff
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{ padding: '10px 20px', backgroundColor: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
        >
          + Add Staff
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ padding: 20, backgroundColor: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0', marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>New Staff Member</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)}
              style={{ flex: 1, minWidth: 150, padding: 10, borderRadius: 8, border: '1px solid #CBD5E1' }} />
            <input placeholder="PIN (4-6 digits)" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              type="password" maxLength={6}
              style={{ width: 140, padding: 10, borderRadius: 8, border: '1px solid #CBD5E1' }} />
            <select value={newRole} onChange={e => setNewRole(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: '1px solid #CBD5E1' }}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={handleCreate} disabled={creating}
              style={{ padding: '10px 20px', backgroundColor: '#16A34A', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', opacity: creating ? 0.6 : 1 }}>
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ padding: 16, backgroundColor: '#FEF2F2', color: '#DC2626', borderRadius: 8, marginBottom: 16 }}>{error}</div>}
      {/* GCP-STG-0417: Inline action error replaces alert() */}
      {actionError && <div style={{ padding: 12, backgroundColor: '#FEF2F2', color: '#DC2626', borderRadius: 8, marginBottom: 12, fontSize: 14 }}>{actionError}</div>}
      {loading && <p style={{ textAlign: 'center', color: '#64748B', padding: 40 }}>Loading staff...</p>}

      {/* Staff list */}
      {!loading && staff.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, backgroundColor: '#F8FAFC', borderRadius: 12 }}>
          <p style={{ fontSize: 36, margin: '0 0 8px' }}>👥</p>
          <p style={{ fontWeight: 700, color: '#475569' }}>No staff yet</p>
          <p style={{ color: '#94A3B8', fontSize: 14 }}>Add staff members so they can log into the POS with their PIN.</p>
        </div>
      )}

      {/* GCP-STG-0418: Paginate staff list client-side */}
      {staff.slice(currentPage * STAFF_PAGE_SIZE, (currentPage + 1) * STAFF_PAGE_SIZE).map(s => (
        <div key={s.id} style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: 16,
          backgroundColor: '#fff', borderRadius: 12, border: '1px solid #E2E8F0',
          marginBottom: 8, opacity: s.is_active ? 1 : 0.5,
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: s.is_owner ? '#DBEAFE' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: s.is_owner ? '#2563EB' : '#475569', fontSize: 18 }}>
            {s.name[0]?.toUpperCase() ?? '?'}
          </div>
          <div style={{ flex: 1 }}>
            {editTarget === s.id ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name"
                  style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 14 }} />
                <select value={editRole} onChange={e => setEditRole(e.target.value)}
                  style={{ padding: 6, borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button onClick={() => handleEdit(s.id)} style={{ padding: '6px 12px', backgroundColor: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                <button onClick={() => setEditTarget(null)} style={{ padding: '6px 12px', backgroundColor: '#E2E8F0', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 700 }}>{s.name} {s.is_owner && <span style={{ fontSize: 11, color: '#2563EB', backgroundColor: '#DBEAFE', padding: '2px 6px', borderRadius: 4 }}>Owner</span>}</div>
                <div style={{ fontSize: 13, color: '#64748B' }}>{s.role} · {s.is_active ? 'Active' : 'Inactive'}{s.last_login_at ? ` · Last login: ${new Date(s.last_login_at).toLocaleDateString()}` : ''}</div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {resetTarget === s.id ? (
              <>
                <input placeholder="New PIN" value={resetPin} onChange={e => setResetPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  type="password" maxLength={6}
                  style={{ width: 100, padding: 8, borderRadius: 6, border: '1px solid #CBD5E1' }} />
                <button onClick={() => handleResetPin(s.id)} style={{ padding: '8px 12px', backgroundColor: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                <button onClick={() => { setResetTarget(null); setResetPin(''); }} style={{ padding: '8px 12px', backgroundColor: '#E2E8F0', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              </>
            ) : (
              <>
                {!s.is_owner && editTarget !== s.id && (
                  <button onClick={() => { setEditTarget(s.id); setEditName(s.name); setEditRole(s.role); }} style={{ padding: '8px 12px', backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Edit</button>
                )}
                <button onClick={() => setResetTarget(s.id)} style={{ padding: '8px 12px', backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Reset PIN</button>
                {!s.is_owner && (
                  <button onClick={() => handleToggleActive(s.id)} style={{ padding: '8px 12px', backgroundColor: s.is_active ? '#FEF2F2' : '#F0FDF4', color: s.is_active ? '#DC2626' : '#16A34A', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {s.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ))}

      {/* GCP-STG-0418: Pagination controls */}
      {(() => {
        const totalPages = Math.ceil(staff.length / STAFF_PAGE_SIZE);
        if (totalPages <= 1) return null;
        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, padding: '8px 0' }}>
            <span style={{ fontSize: 13, color: '#64748B' }}>
              Showing {currentPage * STAFF_PAGE_SIZE + 1}–{Math.min((currentPage + 1) * STAFF_PAGE_SIZE, staff.length)} of {staff.length}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setCurrentPage(p => p - 1)}
                disabled={currentPage === 0}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: currentPage === 0 ? '#F1F5F9' : '#fff', cursor: currentPage === 0 ? 'default' : 'pointer', fontSize: 13 }}
              >
                Previous
              </button>
              <span style={{ fontSize: 13, lineHeight: '36px', color: '#475569' }}>
                Page {currentPage + 1} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={currentPage >= totalPages - 1}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: currentPage >= totalPages - 1 ? '#F1F5F9' : '#fff', cursor: currentPage >= totalPages - 1 ? 'default' : 'pointer', fontSize: 13 }}
              >
                Next
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
