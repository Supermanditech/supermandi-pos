// SA-P2-004: Compliance Status Aggregation Tab
import { useCallback, useEffect, useState } from "react";
import {
  fetchComplianceOverview,
  type ComplianceOverviewResponse,
  type ComplianceStore,
} from "../api/compliance";

const BADGE_STYLES: Record<string, { className: string; label: string }> = {
  compliant: { className: "sa-badge-ok", label: "Compliant" },
  non_compliant: { className: "sa-badge-error", label: "Non-Compliant" },
  pending: { className: "sa-badge-warn", label: "Pending" },
};

function ComplianceBadge({ status }: { status: string }) {
  const style = BADGE_STYLES[status] || BADGE_STYLES.pending;
  return (
    <span className={style.className} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
      {style.label}
    </span>
  );
}

function KycBadge({ complete }: { complete: boolean }) {
  return (
    <span
      className={complete ? "sa-badge-ok" : "sa-badge-muted"}
      style={{ padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 500 }}
    >
      {complete ? "Complete" : "Incomplete"}
    </span>
  );
}

function ApprovalBadge({ approved }: { approved: boolean }) {
  return (
    <span
      className={approved ? "sa-badge-ok" : "sa-badge-muted"}
      style={{ padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 500 }}
    >
      {approved ? "Approved" : "Not Approved"}
    </span>
  );
}

export function ComplianceTab() {
  const [data, setData] = useState<ComplianceOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "compliant" | "non_compliant" | "pending">("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchComplianceOverview();
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load compliance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredStores: ComplianceStore[] = data
    ? filter === "all"
      ? data.stores
      : data.stores.filter((s) => s.complianceStatus === filter)
    : [];

  return (
    <div className="sa-p-24">
      <div className="sa-flex-between sa-mb-20">
        <div>
          <h2 className="sa-text-xl sa-fw-700">Compliance Overview</h2>
          <p className="sa-text-md sa-text-muted sa-mt-4" style={{ margin: 0 }}>
            KYC status, document verification, and admin approval across all stores
          </p>
        </div>
        <div className="sa-flex sa-gap-8">
          <button className="sa-btn-ghost-sm" onClick={loadData} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="sa-alert-error sa-mb-16" role="alert">{error}</div>}

      {/* Summary cards */}
      {data && (
        <div className="sa-grid-4 sa-mb-20">
          {[
            {
              label: "Total Stores",
              value: String(data.summary.totalStores),
              color: "var(--color-primary)",
              filterKey: "all" as const,
            },
            {
              label: "Compliant",
              value: String(data.summary.compliantCount),
              color: "var(--color-success)",
              filterKey: "compliant" as const,
            },
            {
              label: "Non-Compliant",
              value: String(data.summary.nonCompliantCount),
              color: "var(--color-error, #e53e3e)",
              filterKey: "non_compliant" as const,
            },
            {
              label: "Pending",
              value: String(data.summary.pendingCount),
              color: "var(--color-warning)",
              filterKey: "pending" as const,
            },
          ].map((card) => (
            <button
              key={card.filterKey}
              className="sa-accent-card"
              style={{
                borderLeftColor: card.color,
                cursor: "pointer",
                background: filter === card.filterKey ? "var(--color-surface-alt, #f7f7f7)" : undefined,
                border: filter === card.filterKey ? "2px solid var(--color-primary)" : undefined,
                textAlign: "left",
                width: "100%",
              }}
              onClick={() => setFilter(card.filterKey)}
              aria-pressed={filter === card.filterKey}
            >
              <div className="sa-stat-label">{card.label}</div>
              <div className="sa-stat-value sa-mt-4">{card.value}</div>
            </button>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="sa-grid-4 sa-mb-20">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="sa-stat-card sa-bg-surface-alt">
              <div className="skeleton sa-mb-8" style={{ height: 12, width: "60%" }} />
              <div className="skeleton" style={{ height: 20, width: "80%" }} />
            </div>
          ))}
        </div>
      )}

      {/* Stores table */}
      {loading ? (
        <div className="sa-p-24 skeletonTable">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeletonRow">
              <div className="skeleton skeletonCell" style={{ width: "20%" }} />
              <div className="skeleton skeletonCell" style={{ width: "15%" }} />
              <div className="skeleton skeletonCell" style={{ width: "15%" }} />
              <div className="skeleton skeletonCell" style={{ width: "15%" }} />
              <div className="skeleton skeletonCell" style={{ width: "15%" }} />
              <div className="skeleton skeletonCell" style={{ width: "10%" }} />
            </div>
          ))}
        </div>
      ) : data && filteredStores.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th className="sa-th">Store</th>
              <th className="sa-th">Status</th>
              <th className="sa-th">Compliance</th>
              <th className="sa-th">KYC</th>
              <th className="sa-th">Admin Approval</th>
              <th className="sa-th">Documents</th>
            </tr>
          </thead>
          <tbody>
            {filteredStores.map((store) => (
              <tr key={store.id}>
                <td className="sa-td">
                  <div className="sa-fw-500">{store.name}</div>
                  <div className="sa-text-sm sa-text-muted">{store.code}</div>
                </td>
                <td className="sa-td">
                  <span
                    className={`mono ${
                      store.status === "ACTIVE"
                        ? "sa-badge-ok"
                        : store.status === "SUSPENDED"
                        ? "sa-badge-error"
                        : store.status === "NEEDS_FIX"
                        ? "sa-badge-warn"
                        : "sa-badge-muted"
                    }`}
                  >
                    {store.status}
                  </span>
                </td>
                <td className="sa-td">
                  <ComplianceBadge status={store.complianceStatus} />
                </td>
                <td className="sa-td">
                  <KycBadge complete={store.kycComplete} />
                </td>
                <td className="sa-td">
                  <ApprovalBadge approved={store.adminApproved} />
                </td>
                <td className="sa-td">
                  <div className="sa-text-sm">
                    {store.documents.total === 0 ? (
                      <span className="sa-text-muted">No docs</span>
                    ) : (
                      <span>
                        <span className="sa-text-success">{store.documents.approved}</span>
                        {" / "}
                        <span>{store.documents.total}</span>
                        {store.documents.rejected > 0 && (
                          <span className="sa-text-danger"> ({store.documents.rejected} rejected)</span>
                        )}
                        {store.documents.pending > 0 && (
                          <span className="sa-text-warning"> ({store.documents.pending} pending)</span>
                        )}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : data ? (
        <div className="sa-text-center sa-text-muted" style={{ padding: "3rem" }}>
          {filter === "all" ? "No stores found" : `No ${filter.replace("_", "-")} stores`}
        </div>
      ) : null}
    </div>
  );
}
