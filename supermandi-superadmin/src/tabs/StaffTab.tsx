// SA-001: Staff management tab extracted from App.tsx
import { useState } from "react";
import { ConfirmDialog, type ConfirmDialogConfig } from "../components/ConfirmDialog";
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
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);
  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">Store Staff Management</div>
        <div className="muted">Add, edit, and manage POS staff per store</div>
      </div>

      <div className="sa-flex sa-gap-8 sa-mb-16">
        <label htmlFor="filter-staff-store" className="sa-sr-only">Store</label>
        <select
          id="filter-staff-store"
          value={staffStoreId}
          onChange={(e) => { setStaffStoreId(e.target.value); setStaffList([]); }}
          className="sa-select sa-radius-6"
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

      {staffError && <div className="banner sa-mb-12" role="alert">{staffError}</div>}
      {staffSuccess && <div className="sa-alert-success sa-mb-12">{staffSuccess}</div>}

      {showAddStaff && (
        <div className="sa-section sa-bg-surface-alt">
          <div className="sa-fw-600 sa-mb-12">Add New Staff Member</div>
          <div className="sa-grid-2">
            <div>
              <label className="sa-form-label">Name</label>
              <input type="text" value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} placeholder="Staff name" className="sa-input sa-w-full sa-radius-6" />
            </div>
            <div>
              <label className="sa-form-label">Phone (10 digits)</label>
              <input type="tel" inputMode="numeric" pattern="\d{10}" value={newStaffPhone} onChange={(e) => setNewStaffPhone(e.target.value.replace(/\D/g, ''))} placeholder="9876543210" maxLength={10} className="sa-input sa-w-full sa-radius-6" />
            </div>
            <div>
              <label className="sa-form-label">PIN (4-6 digits)</label>
              <input type="password" inputMode="numeric" pattern="\d{4,6}" value={newStaffPin} onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, ''))} placeholder="1234" maxLength={6} className="sa-input sa-w-full sa-radius-6" />
            </div>
            <div>
              <label className="sa-form-label">Role</label>
              <select value={newStaffRole} onChange={(e) => setNewStaffRole(e.target.value as any)} className="sa-select sa-w-full sa-radius-6" aria-label="Staff role">
                <option value="CASHIER">CASHIER (sell only)</option>
                <option value="STOCK_MANAGER">STOCK_MANAGER (sell + stock-in)</option>
                <option value="MANAGER">MANAGER (all operations)</option>
              </select>
            </div>
          </div>
          <div className="sa-flex sa-gap-8 sa-mt-12">
            <button className="btnSuccess" onClick={handleAddStaff} disabled={staffActionLoading === "add" || !newStaffName.trim() || !newStaffPhone.trim() || !newStaffPin.trim() || !newStaffRole}>
              {staffActionLoading === "add" ? "Adding..." : "Add Staff"}
            </button>
            <button className="btnGhost" onClick={() => { setShowAddStaff(false); setNewStaffName(""); setNewStaffPhone(""); setNewStaffPin(""); setNewStaffRole("CASHIER"); }}>Cancel</button>
          </div>
        </div>
      )}

      {staffList.length > 0 && (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Phone</th><th>Role</th><th>Status</th><th>Sales</th><th>Stock-Ins</th><th>Created</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staffList.map((s) => (
                <tr key={s.id}>
                  <td className="sa-fw-600">{s.name}</td>
                  <td>{s.phone}</td>
                  <td>
                    {/* #186.15: Inline role change dropdown */}
                    <select
                      value={s.role}
                      aria-label={`Role for ${s.name}`}
                      onChange={(e) => {
                        const newRole = e.target.value as "CASHIER" | "STOCK_MANAGER" | "MANAGER";
                        if (newRole === s.role) return;
                        setConfirmDialog({
                          title: "Change Staff Role",
                          message: `Change ${s.name}'s role from ${s.role} to ${newRole}?`,
                          confirmLabel: "Change Role",
                          variant: newRole === "MANAGER" ? "warning" : "info",
                          onConfirm: () => { setConfirmDialog(null); handleStaffRoleChange(s.id, newRole); },
                        });
                      }}
                      disabled={staffActionLoading === s.id}
                      className="sa-text-xs sa-fw-600 sa-radius-6 sa-border"
                      style={{ padding: "2px 6px", background: s.role === "MANAGER" ? "var(--color-primary-light)" : s.role === "STOCK_MANAGER" ? "var(--color-warning-soft)" : "var(--color-surface-alt)", color: s.role === "MANAGER" ? "var(--color-primary-dark)" : s.role === "STOCK_MANAGER" ? "var(--color-warning-dark)" : "var(--color-text-secondary)", cursor: "pointer" }}
                    >
                      <option value="CASHIER">CASHIER</option>
                      <option value="STOCK_MANAGER">STOCK_MANAGER</option>
                      <option value="MANAGER">MANAGER</option>
                    </select>
                  </td>
                  <td>
                    <span className={s.is_active ? "sa-badge-ok" : "sa-badge-error"}>
                      {s.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{s.sales_count || 0}</td>
                  <td>{s.stock_in_count || 0}</td>
                  <td className="sa-text-sm">{formatDateTime(s.created_at)}</td>
                  <td>
                    <div className="sa-flex sa-gap-6">
                      <button className={s.is_active ? "btnDanger sa-btn-xs" : "btnSuccess sa-btn-xs"} onClick={() => handleToggleStaffActive(s.id, s.is_active)} disabled={staffActionLoading === s.id}>
                        {s.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button className="btnGhost sa-btn-xs" onClick={() => { setResetPinStaffId(s.id); setResetPinValue(""); }} disabled={staffActionLoading === s.id}>
                        Reset PIN
                      </button>
                    </div>
                    {resetPinStaffId === s.id && (
                      <div className="sa-flex sa-gap-4 sa-mt-4">
                        <input type="password" inputMode="numeric" pattern="\d{4,6}" value={resetPinValue} onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, ''))} placeholder="New PIN" maxLength={6} className="sa-input--sm sa-radius-4 sa-border" style={{ width: 80 }} />
                        <button className="btnSuccess sa-btn-xs" onClick={handleResetPin} disabled={!resetPinValue || resetPinValue.length < 4}>Save</button>
                        <button className="btnGhost sa-btn-xs" onClick={() => setResetPinStaffId(null)}>Cancel</button>
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
        <div className="muted sa-text-center sa-p-20">
          No staff members found for this store. Click "Add Staff" to create one.
        </div>
      )}
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />}
    </section>
  );
}
