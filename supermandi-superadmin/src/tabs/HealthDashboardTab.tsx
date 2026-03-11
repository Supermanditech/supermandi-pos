// SA-P1-009: Store Health Dashboard Tab
import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchStoreHealth,
  type StoreHealthResponse,
  type StoreHealthEntry,
  type StoreHealthFactor,
} from "../api/health";

export function HealthDashboardTab() {
  const [data, setData] = useState<StoreHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  // R4-NET-007: In-flight guard to prevent overlapping refresh requests
  const refreshInFlight = useRef(false);

  const loadData = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchStoreHealth();
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load store health data");
    } finally {
      setLoading(false);
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 60s when enabled
  // R3-QUA-003: Skip refresh when tab is hidden (Page Visibility API)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (!document.hidden) loadData();
    }, 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  const scoreColor = (score: number): string => {
    if (score >= 80) return "var(--color-success, #22c55e)";
    if (score >= 50) return "var(--color-warning, #f59e0b)";
    return "var(--color-danger, #ef4444)";
  };

  const factorBadge = (factor: StoreHealthFactor) => {
    const colors: Record<string, { bg: string; text: string }> = {
      healthy: { bg: "var(--color-success-soft, #dcfce7)", text: "var(--color-success, #16a34a)" },
      warning: { bg: "var(--color-warning-soft, #fef3c7)", text: "var(--color-warning, #d97706)" },
      critical: { bg: "var(--color-danger-soft, #fee2e2)", text: "var(--color-danger, #dc2626)" },
    };
    const c = colors[factor.status] || colors.critical;
    return (
      <span
        key={factor.name}
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 500,
          background: c.bg,
          color: c.text,
          marginRight: 4,
          marginBottom: 2,
        }}
        title={factor.detail}
      >
        {factor.name}: {factor.status}
      </span>
    );
  };

  // Loading state
  if (loading && !data) {
    return <div className="sa-loading">Loading store health dashboard...</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Store Health Dashboard</h2>
          <p className="sa-text-muted" style={{ margin: "4px 0 0" }}>
            Per-store health scoring based on device, sync, orders, and KYC status
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button className="btnSm" onClick={loadData} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div role="alert" className="sa-alert sa-alert--danger" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Summary cards */}
      {data && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <SummaryCard label="Total Stores" value={data.summary.totalStores} color="var(--color-text, #1e293b)" />
            <SummaryCard label="Healthy (80+)" value={data.summary.healthyCount} color="var(--color-success, #22c55e)" />
            <SummaryCard label="Warning (50-79)" value={data.summary.warningCount} color="var(--color-warning, #f59e0b)" />
            <SummaryCard label="Critical (<50)" value={data.summary.criticalCount} color="var(--color-danger, #ef4444)" />
          </div>

          {/* Store health table */}
          {data.stores.length === 0 ? (
            <div className="sa-empty">No stores found.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="sa-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Store</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Code</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", minWidth: 160 }}>Health Score</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Device</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Sync</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Orders</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>KYC</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stores.map((store: StoreHealthEntry) => (
                    <tr key={store.id} style={{ borderBottom: "1px solid var(--color-border, #e2e8f0)" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 500 }}>{store.name}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 13 }}>{store.code}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div
                            style={{
                              flex: 1,
                              height: 8,
                              borderRadius: 4,
                              background: "var(--color-bg-muted, #f1f5f9)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              data-testid={`health-bar-${store.id}`}
                              style={{
                                width: `${store.healthScore}%`,
                                height: "100%",
                                borderRadius: 4,
                                background: scoreColor(store.healthScore),
                                transition: "width 0.3s ease",
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: scoreColor(store.healthScore), minWidth: 32, textAlign: "right" }}>
                            {store.healthScore}
                          </span>
                        </div>
                      </td>
                      {store.factors.map((f: StoreHealthFactor) => (
                        <td key={f.name} style={{ padding: "8px 12px" }}>
                          {factorBadge(f)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Summary card sub-component
function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        padding: "16px",
        borderRadius: 8,
        border: "1px solid var(--color-border, #e2e8f0)",
        background: "var(--color-bg-card, #fff)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "var(--color-text-muted, #64748b)", marginTop: 4 }}>{label}</div>
    </div>
  );
}
