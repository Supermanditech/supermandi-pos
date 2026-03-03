// SA-001: Applications approval tab extracted from App.tsx
import { useEffect } from "react";
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
  // SA.016: Refresh when entity filter changes instead of using setTimeout
  useEffect(() => { refreshApplications(); }, [appEntityFilter]);

  return (
    <section className="card">
      <div className="cardHeader">
        <div>
          <div className="cardTitle">Registration Applications</div>
          <div className="muted">Review and approve/reject retailer and supplier registration applications</div>
        </div>
        <div className="sa-flex sa-gap-8">
          <select
            className="selectSmall"
            value={appEntityFilter}
            onChange={(e) => setAppEntityFilter(e.target.value)}
            aria-label="Filter applications by type"
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

      {applicationsError && <div className="banner sa-mb-12" role="alert" style={{ margin: "0 16px" }}>{applicationsError}</div>}

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
                  <div className="deviceLabelInput sa-fw-600">
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
                    <div className="sa-text-danger" style={{ gridColumn: "1 / -1" }}>
                      <strong>Previous Rejection:</strong> <span>{app.rejectionReason}</span>
                    </div>
                  )}
                </div>

                <div className="sa-mt-8">
                  <label className="sa-form-label">Rejection Reason (required for reject, min 5 chars):</label>
                  <textarea
                    className="sa-textarea sa-mb-8"
                    style={{ minHeight: 48 }}
                    placeholder="Describe what the applicant needs to fix (min 5 characters)..."
                    value={appRejectReason[app.id] || ""}
                    onChange={(e) => setAppRejectReason((prev) => ({ ...prev, [app.id]: e.target.value }))}
                  />
                </div>

                {/* T-012: Conditional actions based on application status */}
                <div className="deviceActions">
                  {app.status === 'NEEDS_FIX' ? (
                    <>
                      <span className="sa-text-sm sa-text-warning" style={{ fontStyle: "italic", alignSelf: "center" }}>
                        Awaiting applicant resubmission
                      </span>
                      <button
                        onClick={() => handleApproveApplication(app.id)}
                        disabled={appActionLoading[app.id]}
                        className="btnSuccess"
                        title={`Approve resubmitted ${app.entityType === 'retailer' ? 'store' : 'supplier'} application`}
                      >
                        {appActionLoading[app.id] ? "Approving..." : "Approve"}
                      </button>
                      <button
                        className="btnGhost sa-text-danger"
                        onClick={() => handleRejectApplication(app.id)}
                        disabled={appActionLoading[app.id]}
                        title="Update rejection reason and send back"
                      >
                        {appActionLoading[app.id] ? "Updating..." : "Update Rejection"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleApproveApplication(app.id)}
                        disabled={appActionLoading[app.id]}
                        className="btnSuccess"
                        title={`Approve and create ${app.entityType === 'retailer' ? 'store' : 'supplier'} record`}
                      >
                        {appActionLoading[app.id] ? "Approving..." : `Approve ${app.entityType === 'retailer' ? 'Store' : 'Supplier'}`}
                      </button>
                      <button
                        className="btnGhost sa-text-danger"
                        onClick={() => handleRejectApplication(app.id)}
                        disabled={appActionLoading[app.id]}
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

      <div className="sa-flex sa-gap-12 sa-text-sm sa-text-muted sa-px-12 sa-py-8">
        <span>Showing {applications.length} of {applicationsTotal} pending applications</span>
        {/* APPLICATIONS-UNBOUNDED-LOADMORE: cap at 500 to prevent memory bloat */}
        {applications.length >= 500 ? (
          <span className="sa-text-warning" style={{ fontStyle: "italic" }}>
            Max reached — use search to narrow results.
          </span>
        ) : (
          applications.length < applicationsTotal && onLoadMore && (
            <button
              onClick={onLoadMore}
              disabled={applicationsLoading}
              className="sa-btn-sm"
            >
              {applicationsLoading ? "Loading..." : "Load More"}
            </button>
          )
        )}
      </div>
    </section>
  );
}
