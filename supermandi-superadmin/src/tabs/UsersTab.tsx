// SA-001: Users management tab extracted from App.tsx
import { useState } from "react";
import { ConfirmDialog, type ConfirmDialogConfig } from "../components/ConfirmDialog";
import type { UserRecord } from "../api/users";
import { TableSkeleton } from "../components/TableSkeleton";
import { formatDate } from "../lib/formatters";

interface UsersTabProps {
  userRecords: UserRecord[];
  usersLoading: boolean;
  usersError: string;
  userSearch: string;
  userStatusSaving: Record<string, boolean>;
  userActionError: string;
  showCreateUser: boolean;
  createUserForm: { name: string; email: string; phone: string; actor_type: string; actor_id: string };
  createUserLoading: boolean;
  createUserError: string;
  createUserSuccess: string;
  setUserSearch: (v: string) => void;
  setShowCreateUser: (v: boolean) => void;
  setCreateUserForm: (fn: (f: { name: string; email: string; phone: string; actor_type: string; actor_id: string }) => { name: string; email: string; phone: string; actor_type: string; actor_id: string }) => void;
  refreshUsers: () => void;
  requestUserStatusChange: (userId: string, newStatus: "active" | "inactive" | "suspended") => void;
  requestCreateUser: () => void;
}

export function UsersTab({
  userRecords, usersLoading, usersError, userSearch, userStatusSaving,
  userActionError, showCreateUser, createUserForm, createUserLoading,
  createUserError, createUserSuccess, setUserSearch, setShowCreateUser,
  setCreateUserForm, refreshUsers, requestUserStatusChange, requestCreateUser,
}: UsersTabProps) {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);
  return (
    <section className="card">
      <div className="cardHeader">
        <div>
          <div className="cardTitle">Users Management</div>
          <div className="muted">Manage platform users and their access</div>
        </div>
        <button onClick={() => setShowCreateUser(!showCreateUser)} style={{ background: showCreateUser ? "var(--color-text-secondary)" : "var(--color-primary)", color: "white" }}>
          {showCreateUser ? "Cancel" : "+ Create User"}
        </button>
      </div>

      {showCreateUser && (
        <div className="tableWrap sa-border-b" style={{ paddingBottom: 16 }}>
          <div className="sa-grid-auto">
            <div className="control">
              <label>Name *</label>
              <input value={createUserForm.name} onChange={(e) => setCreateUserForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" />
            </div>
            <div className="control">
              <label>Email *</label>
              <input type="email" value={createUserForm.email} onChange={(e) => setCreateUserForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@example.com" required />
            </div>
            <div className="control">
              <label>Phone</label>
              <input type="tel" value={createUserForm.phone} onChange={(e) => setCreateUserForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" />
            </div>
            <div className="control">
              <label>Type</label>
              <select value={createUserForm.actor_type} onChange={(e) => setCreateUserForm((f) => ({ ...f, actor_type: e.target.value }))}>
                <option value="store">Store</option>
                <option value="supplier">Supplier</option>
                <option value="platform">Platform Admin</option>
              </select>
            </div>
          </div>
          {(createUserForm.actor_type === "store" || createUserForm.actor_type === "supplier") && (
            <div className="control sa-mt-8">
              <label>{createUserForm.actor_type === "store" ? "Store" : "Supplier"} ID *</label>
              <input value={createUserForm.actor_id} onChange={(e) => setCreateUserForm((f) => ({ ...f, actor_id: e.target.value }))} placeholder={`Enter ${createUserForm.actor_type} UUID`} required />
            </div>
          )}
          {createUserForm.actor_type === "platform" && (
            <div className="sa-alert-warning sa-mt-8">
              Creating a Platform Admin grants full system access. Additional verification required.
            </div>
          )}
          <div className="sa-flex sa-gap-12 sa-mt-12">
            <button onClick={requestCreateUser} disabled={createUserLoading || !createUserForm.name.trim() || !createUserForm.email.trim()} className="btnSuccess">
              {createUserLoading ? "Creating..." : "Create User"}
            </button>
            {createUserError && <span className="errorText" role="alert">{createUserError}</span>}
            {createUserSuccess && <span className="sa-text-success sa-fw-600">{createUserSuccess}</span>}
          </div>
          <div className="muted sa-mt-8">* Name and Email are required.</div>
        </div>
      )}

      <div className="tableWrap">
        <div className="sa-flex sa-gap-8 sa-mb-12 sa-flex-wrap">
          <label htmlFor="filter-users-search" className="sa-sr-only">Search users</label>
          <input id="filter-users-search" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search by name, email, or phone..." className="sa-input" style={{ flex: 1, minWidth: 200 }} />
          <button onClick={refreshUsers} disabled={usersLoading}>{usersLoading ? "Loading..." : "Refresh"}</button>
        </div>
        {userActionError && <div className="errorText sa-mb-8" role="alert">{userActionError}</div>}
        {usersError && <div className="errorText sa-mb-8" role="alert">{usersError}</div>}
        {usersLoading ? (
          <TableSkeleton rows={5} columns={7} />
        ) : (
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>Type</th><th>Status</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {userRecords.filter((u) => { if (!userSearch.trim()) return true; const q = userSearch.toLowerCase().trim(); return u.name.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q)) || (u.phone && u.phone.includes(q)); }).map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email ?? "-"}</td>
                <td>{user.phone ?? "-"}</td>
                <td><span className="badge">{user.actor_type}</span></td>
                <td><span className={`badge ${user.status === "active" ? "badgeOk" : user.status === "suspended" ? "badgeError" : "badgeWarn"}`}>{user.status}</span></td>
                <td>{formatDate(user.created_at)}</td>
                <td>
                  <select value={user.status} onChange={(e) => {
                    const newStatus = e.target.value as "active" | "inactive" | "suspended";
                    if (newStatus === user.status) return;
                    setConfirmDialog({
                      title: "Change User Status",
                      message: `Change ${user.name}'s status from "${user.status}" to "${newStatus}"?`,
                      confirmLabel: newStatus === "suspended" ? "Suspend User" : `Set ${newStatus}`,
                      variant: newStatus === "suspended" ? "danger" : "info",
                      onConfirm: () => { setConfirmDialog(null); requestUserStatusChange(user.id, newStatus); },
                    });
                  }} disabled={userStatusSaving[user.id]} className="sa-select" style={{ minWidth: 100 }} aria-label={`Change status for ${user.name}`}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </td>
              </tr>
            ))}
            {userRecords.length === 0 && !usersLoading && (
              <tr><td colSpan={7} className="sa-text-center sa-text-muted">No users found</td></tr>
            )}
          </tbody>
        </table>
        )}
      </div>
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />}
    </section>
  );
}
