// T-223: Cloud Monitoring Dashboard for SuperAdmin
import { useState, useEffect, useCallback } from "react";
import { fetchHealthStatus, triggerTokenCleanup, type HealthResponse, type TokenCleanupResult } from "../api/monitoring";
// UIUX-SA-009: Styled confirmation dialog instead of bare confirm()
import { ConfirmDialog, type ConfirmDialogConfig } from "../components/ConfirmDialog";

export function MonitoringTab() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cleanupResult, setCleanupResult] = useState<TokenCleanupResult | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  // UIUX-SA-009: Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHealthStatus();
      setHealth(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch health status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHealth(); }, [loadHealth]);

  // Auto-refresh every 30s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadHealth]);

  const handleCleanup = () => {
    setConfirmDialog({
      title: "Clean Up Expired Tokens",
      message: "This will deactivate tokens unused for 90+ days and delete tokens inactive for 180+ days.",
      detail: "This is a bulk auth operation affecting all stores.",
      confirmLabel: "Run Cleanup",
      variant: "warning",
      onConfirm: async () => {
        setConfirmDialog(null);
        setCleaningUp(true);
        setCleanupResult(null);
        try {
          const result = await triggerTokenCleanup();
          setCleanupResult(result);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Token cleanup failed");
        } finally {
          setCleaningUp(false);
        }
      },
    });
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const statusColor = (status: string) => {
    if (status === "healthy") return { bg: "var(--color-success-soft)", text: "#166534", dot: "var(--color-success)" };
    if (status === "warning") return { bg: "var(--color-warning-soft)", text: "#92400E", dot: "var(--color-warning)" };
    return { bg: "var(--color-error-soft)", text: "#991B1B", dot: "var(--color-error)" };
  };

  const overallColor = health ? statusColor(health.status) : statusColor("unhealthy");

  // REQ.AUDIT.W5.SUPERADMIN.MONITORING-HARDCODED-ALERT-POLICIES.001:
  // Alert policies are hardcoded to match infra/monitoring/alert-policies.yaml.
  // TODO: Replace with an API endpoint (e.g. GET /api/v1/admin/monitoring/alert-policies)
  // to keep this in sync with GCP Cloud Monitoring configuration automatically.
  const alertPolicies = [
    { name: "Cloud Run Latency", condition: "p95 > 2s", service: "All services" },
    { name: "5xx Error Rate", condition: "> 5% of requests", service: "All services" },
    { name: "Instance Scaling", condition: "> 10 instances", service: "All services" },
    { name: "Cloud SQL CPU", condition: "> 80%", service: "Database" },
    { name: "Cloud SQL Memory", condition: "> 85%", service: "Database" },
    { name: "Cloud SQL Disk", condition: "> 80%", service: "Database" },
    { name: "Cloud SQL Connections", condition: "> 80 active", service: "Database" },
    { name: "Redis Memory", condition: "> 75%", service: "Cache" },
    { name: "Load Balancer 4xx", condition: "> 20% of requests", service: "Load Balancer" },
    { name: "Cold Start Duration", condition: "> 30s", service: "All services" },
  ];

  // Hardcoded service list — mirrors GCP Cloud Run services.
  // TODO: Fetch dynamically from admin API when available.
  const services = [
    { name: "api-gateway", port: 3000, type: "Express" },
    { name: "main-backend", port: 3010, type: "Express" },
    { name: "retailer-admin", port: 80, type: "Vite + Nginx" },
    { name: "supplier-portal", port: 3001, type: "Next.js" },
    { name: "superadmin", port: 80, type: "Vite + Nginx" },
    { name: "landing", port: 80, type: "Nginx Static" },
  ];

  return (
    <div style={{ padding: 24 }}>
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} loading={cleaningUp} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>System Monitoring</h2>
          <p style={{ margin: "4px 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
            T-223: Cloud Run services health, GCP alert policies, infrastructure status
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh (30s)
          </label>
          <button
            onClick={loadHealth}
            disabled={loading}
            style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer", fontSize: 13 }}
          >
            {loading ? "Checking..." : "Refresh"}
          </button>
          <button
            onClick={handleCleanup}
            disabled={cleaningUp}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "none",
              background: cleaningUp ? "var(--color-text-secondary)" : "var(--color-error)", color: "#FFF",
              cursor: cleaningUp ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500,
            }}
          >
            {cleaningUp ? "Cleaning..." : "Cleanup Stale Tokens"}
          </button>
        </div>
      </div>

      {cleanupResult && (
        <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, backgroundColor: "var(--color-success-soft)", border: "1px solid var(--color-success)", fontSize: 13 }}>
          Token cleanup complete: <strong>{cleanupResult.deactivated}</strong> deactivated (90+ days), <strong>{cleanupResult.deleted}</strong> deleted (180+ days)
        </div>
      )}

      {error && (
        <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, backgroundColor: "var(--color-error-soft)", color: "#991B1B", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Overall status banner */}
      {health && (
        <div style={{
          padding: 16, marginBottom: 20, borderRadius: 8,
          backgroundColor: overallColor.bg, border: `1px solid ${overallColor.bg}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", backgroundColor: overallColor.dot }} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: overallColor.text, textTransform: "uppercase" }}>
                {health.status}
              </div>
              <div style={{ fontSize: 12, color: overallColor.text, opacity: 0.8 }}>
                Last checked: {new Date(health.timestamp).toLocaleString("en-IN")}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: overallColor.text }}>{formatUptime(health.uptime)}</div>
              <div style={{ fontSize: 11, color: overallColor.text, opacity: 0.7 }}>UPTIME</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: overallColor.text }}>{health.version?.slice(0, 7) || "—"}</div>
              <div style={{ fontSize: 11, color: overallColor.text, opacity: 0.7 }}>VERSION</div>
            </div>
          </div>
        </div>
      )}

      {/* Health checks grid */}
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "var(--color-text-primary)" }}>Service Health Checks</h3>
      {loading && !health ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-secondary)" }}>Loading health status...</div>
      ) : health ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          {Object.entries(health.checks).map(([name, check]) => {
            const c = statusColor(check.status);
            return (
              <div key={name} style={{ padding: 16, borderRadius: 8, border: "1px solid var(--color-border)", backgroundColor: "var(--color-surface)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, textTransform: "capitalize" }}>{name}</div>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 500, backgroundColor: c.bg, color: c.text }}>
                    {check.status}
                  </span>
                </div>
                {check.latencyMs !== undefined && (
                  <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                    Latency: <strong>{check.latencyMs}ms</strong>
                  </div>
                )}
                {check.details && (
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>{check.details}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Cloud Run services table */}
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "var(--color-text-primary)" }}>Cloud Run Services</h3>
      <div style={{ overflowX: "auto", marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: "8px 12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Service</th>
              <th style={{ padding: "8px 12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Port</th>
              <th style={{ padding: "8px 12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Framework</th>
              <th style={{ padding: "8px 12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Region</th>
              <th style={{ padding: "8px 12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>URL</th>
            </tr>
          </thead>
          <tbody>
            {services.map((svc) => (
              <tr key={svc.name} style={{ borderBottom: "1px solid var(--color-surface-alt)" }}>
                <td style={{ padding: "8px 12px", fontWeight: 500 }}>{svc.name}</td>
                <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{svc.port}</td>
                <td style={{ padding: "8px 12px" }}>{svc.type}</td>
                <td style={{ padding: "8px 12px" }}>asia-south1</td>
                <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>
                  {svc.name}.run.app
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alert policies reference */}
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "var(--color-text-primary)" }}>GCP Alert Policies (10 active)</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: "8px 12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Alert Policy</th>
              <th style={{ padding: "8px 12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Trigger Condition</th>
              <th style={{ padding: "8px 12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Service Scope</th>
              <th style={{ padding: "8px 12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {alertPolicies.map((policy) => (
              <tr key={policy.name} style={{ borderBottom: "1px solid var(--color-surface-alt)" }}>
                <td style={{ padding: "8px 12px", fontWeight: 500 }}>{policy.name}</td>
                <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "var(--color-error)" }}>{policy.condition}</td>
                <td style={{ padding: "8px 12px" }}>{policy.service}</td>
                <td style={{ padding: "8px 12px" }}>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 500, backgroundColor: "var(--color-success-soft)", color: "#166534" }}>
                    Active
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Infrastructure info */}
      <div style={{ marginTop: 24, padding: 16, borderRadius: 8, backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>Infrastructure Overview</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, fontSize: 13 }}>
          <div>
            <strong style={{ color: "#1E40AF" }}>Load Balancer</strong>
            <div style={{ color: "var(--color-text-secondary)" }}>supermandi-staging-lb</div>
            <div style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>Global HTTPS + SSL cert</div>
          </div>
          <div>
            <strong style={{ color: "#7C3AED" }}>Cloud SQL</strong>
            <div style={{ color: "var(--color-text-secondary)" }}>PostgreSQL 15</div>
            <div style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>db-f1-micro, asia-south1</div>
          </div>
          <div>
            <strong style={{ color: "var(--color-error)" }}>Redis</strong>
            <div style={{ color: "var(--color-text-secondary)" }}>Memorystore M1</div>
            <div style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>1GB, asia-south1</div>
          </div>
          <div>
            <strong style={{ color: "#166534" }}>Domain</strong>
            <div style={{ color: "var(--color-text-secondary)" }}>{typeof window !== 'undefined' ? window.location.hostname : 'supermandi.tech'}</div>
            <div style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>Cloudflare DNS</div>
          </div>
        </div>
      </div>
    </div>
  );
}
