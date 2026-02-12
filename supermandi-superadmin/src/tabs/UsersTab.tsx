// SA-001: Users management tab extracted from App.tsx
import type { UserRecord } from "../api/users";
import { TableSkeleton } from "../components/TableSkeleton";

interface UsersTabProps {
  userRecords: UserRecord[];
  usersLoading: boolean;
  usersError: string;
  userSearch: string;
  userStatusSaving: Record<string, boolean>;
  userActionError: string;
  showCreateUser: boolean;
  createUserForm: { name: string; email: string; phone: string; actor_type: string };
  createUserLoading: boolean;
  createUserError: string;
  createUserSuccess: string;
  setUserSearch: (v: string) => void;
  setShowCreateUser: (v: boolean) => void;
  setCreateUserForm: (fn: (f: { name: string; email: string; phone: string; actor_type: string }) => { name: string; email: string; phone: string; actor_type: string }) => void;
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
  return (
    <section className="card">
      <div className="cardHeader">
        <div>
          <div className="cardTitle">Users Management</div>
          <div className="muted">Manage platform users and their access</div>
        </div>
        <button onClick={() => setShowCreateUser(!showCreateUser)} style={{ background: showCreateUser ? "#6b7280" : "#3b82f6", color: "white" }}>
          {showCreateUser ? "Cancel" : "+ Create User"}
        </button>
      </div>

      {showCreateUser && (
        <div className="tableWrap" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div className="control">
              <label>Name *</label>
              <input value={createUserForm.name} onChange={(e) => setCreateUserForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" />
            </div>
            <div className="control">
              <label>Email</label>
              <input type="email" value={createUserForm.email} onChange={(e) => setCreateUserForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
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
          {createUserForm.actor_type === "platform" && (
            <div className="muted" style={{ marginTop: 8, color: "#b45309", background: "#fef3c7", padding: 8, borderRadius: 4 }}>
              Creating a Platform Admin grants full system access. Additional verification required.
            </div>
          )}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={requestCreateUser} disabled={createUserLoading} style={{ background: "#22c55e", color: "white" }}>
              {createUserLoading ? "Creating..." : "Create User"}
            </button>
            {createUserError && <span className="errorText">{createUserError}</span>}
            {createUserSuccess && <span style={{ color: "#22c55e", fontWeight: 600 }}>{createUserSuccess}</span>}
          </div>
          <div className="muted" style={{ marginTop: 8 }}>* Name is required. At least one of Email or Phone must be provided.</div>
        </div>
      )}

      <div className="tableWrap">
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search by name, email, or phone..." style={{ flex: 1, minWidth: 200 }} />
          <button onClick={refreshUsers} disabled={usersLoading}>{usersLoading ? "Loading..." : "Refresh"}</button>
        </div>
        {userActionError && <div className="errorText" style={{ marginBottom: 8 }}>{userActionError}</div>}
        {usersError && <div className="errorText" style={{ marginBottom: 8 }}>{usersError}</div>}
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
                <td><span className={`badge ${user.status === "active" ? "badgeOk" : user.status === "suspended" ? "badgeErr" : "badgeWarn"}`}>{user.status}</span></td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                  <select value={user.status} onChange={(e) => requestUserStatusChange(user.id, e.target.value as "active" | "inactive" | "suspended")} disabled={userStatusSaving[user.id]} style={{ minWidth: 100 }}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </td>
              </tr>
            ))}
            {userRecords.length === 0 && !usersLoading && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "#888" }}>No users found</td></tr>
            )}
          </tbody>
        </table>
        )}
      </div>
    </section>
  );
}
