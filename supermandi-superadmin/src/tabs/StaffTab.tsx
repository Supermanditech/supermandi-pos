// SA-001: Staff management tab extracted from App.tsx
import type { StaffMember } from "../api/staff";
import type { StoreRecord } from "../api/stores";
import { formatDateTime } from "../lib/formatters";

interface StaffTabProps {
  staffList: StaffMember[];
  staffLoading: boolean;
  staffError: string;
  staffStoreId: string;
  staffActionLoading: string | null;
  showAddStaff: boolean;
  newStaffName: string;
  newStaffPhone: string;
  newStaffPin: string;
  newStaffRole: "CASHIER" | "STOCK_MANAGER" | "MANAGER";
  resetPinStaffId: string | null;
  resetPinValue: string;
  storeDirectory: StoreRecord[];
  setStaffStoreId: (v: string) => void;
  setStaffList: (v: StaffMember[]) => void;
  setShowAddStaff: (v: boolean) => void;
  setNewStaffName: (v: string) => void;
  setNewStaffPhone: (v: string) => void;
  setNewStaffPin: (v: string) => void;
  setNewStaffRole: (v: "CASHIER" | "STOCK_MANAGER" | "MANAGER") => void;
  setResetPinStaffId: (v: string | null) => void;
  setResetPinValue: (v: string) => void;
  refreshStaff: () => void;
  handleAddStaff: () => void;
  handleToggleStaffActive: (staffId: string, currentlyActive: boolean) => void;
  handleResetPin: () => void;
  handleStaffRoleChange: (staffId: string, newRole: "CASHIER" | "STOCK_MANAGER" | "MANAGER") => void;
  staffSuccess: string;
}

export function StaffTab({
  staffList, staffLoading, staffError, staffStoreId, staffActionLoading,
  showAddStaff, newStaffName, newStaffPhone, newStaffPin, newStaffRole,
  resetPinStaffId, resetPinValue, storeDirectory,
  setStaffStoreId, setStaffList, setShowAddStaff,
  setNewStaffName, setNewStaffPhone, setNewStaffPin, setNewStaffRole,
  setResetPinStaffId, setResetPinValue,
  refreshStaff, handleAddStaff, handleToggleStaffActive, handleResetPin,
  handleStaffRoleChange, staffSuccess,
}: StaffTabProps) {
  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">Store Staff Management</div>
        <div className="muted">Add, edit, and manage POS staff per store</div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <select
          value={staffStoreId}
          onChange={(e) => { setStaffStoreId(e.target.value); setStaffList([]); }}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
        >
          <option value="">Select a store...</option>
          {storeDirectory.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.id.slice(0, 8)})</option>
          ))}
        </select>
        <button className="btn" onClick={() => refreshStaff()} disabled={!staffStoreId || staffLoading}>
          {staffLoading ? "Loading..." : "Load Staff"}
        </button>
        {staffStoreId && (
          <button className="btnSuccess" onClick={() => setShowAddStaff(true)}>
            + Add Staff
          </button>
        )}
      </div>

      {staffError && <div className="alertDanger" style={{ marginBottom: 12 }}>{staffError}</div>}
      {staffSuccess && <div style={{ color: '#16a34a', background: '#f0fdf4', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{staffSuccess}</div>}

      {showAddStaff && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Add New Staff Member</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>Name</label>
              <input type="text" value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} placeholder="Staff name" style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>Phone (10 digits)</label>
              <input type="tel" inputMode="numeric" pattern="\d{10}" value={newStaffPhone} onChange={(e) => setNewStaffPhone(e.target.value.replace(/\D/g, ''))} placeholder="9876543210" maxLength={10} style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>PIN (4-6 digits)</label>
              <input type="password" inputMode="numeric" pattern="\d{4,6}" value={newStaffPin} onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, ''))} placeholder="1234" maxLength={6} style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>Role</label>
              <select value={newStaffRole} onChange={(e) => setNewStaffRole(e.target.value as any)} style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
                <option value="CASHIER">CASHIER (sell only)</option>
                <option value="STOCK_MANAGER">STOCK_MANAGER (sell + stock-in)</option>
                <option value="MANAGER">MANAGER (all operations)</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btnSuccess" onClick={handleAddStaff} disabled={staffActionLoading === "add"}>
              {staffActionLoading === "add" ? "Adding..." : "Add Staff"}
            </button>
            <button className="btnGhost" onClick={() => setShowAddStaff(false)}>Cancel</button>
          </div>
        </div>
      )}

      {staffList.length > 0 && (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Phone</th><th>Role</th><th>Status</th><th>Sales</th><th>Stock-Ins</th><th>Created</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staffList.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.phone}</td>
                  <td>
                    {/* #186.15: Inline role change dropdown */}
                    <select
                      value={s.role}
                      onChange={(e) => handleStaffRoleChange(s.id, e.target.value as "CASHIER" | "STOCK_MANAGER" | "MANAGER")}
                      disabled={staffActionLoading === s.id}
                      style={{ padding: "2px 6px", borderRadius: 6, fontSize: 11, fontWeight: 600, border: "1px solid #d1d5db", background: s.role === "MANAGER" ? "#dbeafe" : s.role === "STOCK_MANAGER" ? "#fef3c7" : "#f1f5f9", color: s.role === "MANAGER" ? "#1e40af" : s.role === "STOCK_MANAGER" ? "#92400e" : "#475569", cursor: "pointer" }}
                    >
                      <option value="CASHIER">CASHIER</option>
                      <option value="STOCK_MANAGER">STOCK_MANAGER</option>
                      <option value="MANAGER">MANAGER</option>
                    </select>
                  </td>
                  <td>
                    <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: s.is_active ? "#dcfce7" : "#fee2e2", color: s.is_active ? "#166534" : "#991b1b" }}>
                      {s.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{s.sales_count}</td>
                  <td>{s.stock_in_count}</td>
                  <td style={{ fontSize: 12 }}>{formatDateTime(s.created_at)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className={s.is_active ? "btnDanger btnSm" : "btnSuccess btnSm"} onClick={() => { if (s.is_active && !confirm(`Deactivate staff member "${s.display_name}"?`)) return; handleToggleStaffActive(s.id, s.is_active); }} disabled={staffActionLoading === s.id} style={{ fontSize: 11, padding: "2px 8px" }}>
                        {s.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button className="btn btnSm" onClick={() => { setResetPinStaffId(s.id); setResetPinValue(""); }} disabled={staffActionLoading === s.id} style={{ fontSize: 11, padding: "2px 8px" }}>
                        Reset PIN
                      </button>
                    </div>
                    {resetPinStaffId === s.id && (
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        <input type="password" inputMode="numeric" pattern="\d{4,6}" value={resetPinValue} onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, ''))} placeholder="New PIN" maxLength={6} style={{ width: 80, padding: "2px 6px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 12 }} />
                        <button className="btnSuccess btnSm" onClick={handleResetPin} style={{ fontSize: 11, padding: "2px 6px" }}>Save</button>
                        <button className="btnGhost btnSm" onClick={() => setResetPinStaffId(null)} style={{ fontSize: 11, padding: "2px 6px" }}>Cancel</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {staffStoreId && !staffLoading && staffList.length === 0 && !staffError && (
        <div className="muted" style={{ textAlign: "center", padding: 32 }}>
          No staff members found for this store. Click "Add Staff" to create one.
        </div>
      )}
    </section>
  );
}
