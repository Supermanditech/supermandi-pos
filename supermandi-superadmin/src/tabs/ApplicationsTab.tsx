// SA-001: Applications approval tab extracted from App.tsx
import type { Application } from "../api/applications";
import { formatDateTime } from "../lib/formatters";

interface ApplicationsTabProps {
  applications: Application[];
  applicationsTotal: number;
  applicationsLoading: boolean;
  applicationsError: string;
  appEntityFilter: string;
  setAppEntityFilter: (v: string) => void;
  appActionLoading: Record<string, boolean>;
  appRejectReason: Record<string, string>;
  setAppRejectReason: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  refreshApplications: () => void;
  handleApproveApplication: (id: string) => void;
  handleRejectApplication: (id: string) => void;
  onLoadMore?: () => void;
}

export function ApplicationsTab({
  applications,
  applicationsTotal,
  applicationsLoading,
  applicationsError,
  appEntityFilter,
  setAppEntityFilter,
  appActionLoading,
  appRejectReason,
  setAppRejectReason,
  refreshApplications,
  handleApproveApplication,
  handleRejectApplication,
  onLoadMore,
}: ApplicationsTabProps) {
  return (
    <section className="card">
      <div className="cardHeader">
        <div>
          <div className="cardTitle">Registration Applications</div>
          <div className="muted">Review and approve/reject retailer and supplier registration applications</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            className="selectSmall"
            value={appEntityFilter}
            onChange={(e) => { setAppEntityFilter(e.target.value); setTimeout(() => refreshApplications(), 50); }}
          >
            <option value="">All Types</option>
            <option value="retailer">Retailer</option>
            <option value="supplier">Supplier</option>
          </select>
          <button onClick={refreshApplications} disabled={applicationsLoading}>
            {applicationsLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {applicationsError && <div className="banner" style={{ margin: "0 16px 12px" }}>{applicationsError}</div>}

      {applications.length === 0 ? (
        <div className="empty">
          {applicationsLoading ? "Loading applications..." : "No pending applications."}
        </div>
      ) : (
        <div className="tableWrap">
          <div className="deviceGrid">
            {applications.map((app) => (
              <div className="deviceCard" key={app.id}>
                <div className="deviceHeader">
                  <div className="deviceLabelInput" style={{ fontWeight: 600 }}>
                    {app.businessName || "Unknown Business"}
                  </div>
                  <div className="badgeRow">
                    <span className={`badge ${app.entityType === 'retailer' ? 'badgeOk' : 'badgeInfo'}`} style={{ textTransform: "capitalize" }}>
                      {app.entityType}
                    </span>
                    <span className={`badge ${app.status === 'KYC_SUBMITTED' ? 'badgeWarn' : app.status === 'NEEDS_FIX' ? 'badgeError' : 'badgeOk'}`}>
                      {app.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                <div className="deviceMetaGrid">
                  <div>
                    <strong>Owner:</strong> <span>{app.ownerName}</span>
                  </div>
                  <div>
                    <strong>Phone:</strong> <span className="mono">{app.phone}</span>
                  </div>
                  <div>
                    <strong>GSTIN:</strong> <span className="mono">{app.gstin}</span>
                  </div>
                  {app.email && (
                    <div>
                      <strong>Email:</strong> <span className="mono">{app.email}</span>
                    </div>
                  )}
                  {app.city && (
                    <div>
                      <strong>Location:</strong> <span>{app.city}{app.state ? `, ${app.state}` : ''}{app.pincode ? ` - ${app.pincode}` : ''}</span>
                    </div>
                  )}
                  <div>
                    <strong>Applied:</strong> <span className="mono">{formatDateTime(app.createdAt)}</span>
                  </div>
                  {app.submittedAt && (
                    <div>
                      <strong>KYC Submitted:</strong> <span className="mono">{formatDateTime(app.submittedAt)}</span>
                    </div>
                  )}
                  {app.documentUrls && Object.keys(app.documentUrls).length > 0 && (
                    <div>
                      <strong>Documents:</strong> <span>{Object.keys(app.documentUrls).length} uploaded</span>
                    </div>
                  )}
                  {app.rejectionReason && (
                    <div style={{ gridColumn: "1 / -1", color: "#dc2626" }}>
                      <strong>Previous Rejection:</strong> <span>{app.rejectionReason}</span>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 8 }}>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Rejection Reason (required for reject):</label>
                  <input
                    className="tableInput"
                    style={{ width: "100%", marginBottom: 8 }}
                    placeholder="Reason for rejection (min 5 chars)..."
                    value={appRejectReason[app.id] || ""}
                    onChange={(e) => setAppRejectReason((prev) => ({ ...prev, [app.id]: e.target.value }))}
                  />
                </div>

                {/* T-012: Conditional actions based on application status */}
                <div className="deviceActions" style={{ flexWrap: "wrap", gap: 8 }}>
                  {app.status === 'NEEDS_FIX' ? (
                    <>
                      <span style={{ fontSize: 12, color: "#f59e0b", fontStyle: "italic", alignSelf: "center" }}>
                        Awaiting applicant resubmission
                      </span>
                      <button
                        className="btnGhost"
                        onClick={() => handleRejectApplication(app.id)}
                        disabled={appActionLoading[app.id]}
                        style={{ color: "#ef4444" }}
                        title="Update rejection reason"
                      >
                        {appActionLoading[app.id] ? "Rejecting..." : "Re-Reject"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleApproveApplication(app.id)}
                        disabled={appActionLoading[app.id]}
                        style={{ background: "#22c55e", color: "white" }}
                        title={`Approve and create ${app.entityType === 'retailer' ? 'store' : 'supplier'} record`}
                      >
                        {appActionLoading[app.id] ? "Approving..." : `Approve ${app.entityType === 'retailer' ? 'Store' : 'Supplier'}`}
                      </button>
                      <button
                        className="btnGhost"
                        onClick={() => handleRejectApplication(app.id)}
                        disabled={appActionLoading[app.id]}
                        style={{ color: "#ef4444" }}
                      >
                        {appActionLoading[app.id] ? "Rejecting..." : "Reject"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: "12px 16px", fontSize: 12, color: "#666", display: "flex", alignItems: "center", gap: 12 }}>
        <span>Showing {applications.length} of {applicationsTotal} pending applications</span>
        {/* FIX-049: Load More button when more applications exist */}
        {applications.length < applicationsTotal && onLoadMore && (
          <button
            onClick={onLoadMore}
            disabled={applicationsLoading}
            style={{ fontSize: 12, padding: "4px 12px", cursor: "pointer" }}
          >
            {applicationsLoading ? "Loading..." : "Load More"}
          </button>
        )}
      </div>
    </section>
  );
}
