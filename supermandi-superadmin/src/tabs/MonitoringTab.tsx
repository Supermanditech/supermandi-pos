// T-223: Cloud Monitoring Dashboard for SuperAdmin
import { useState, useEffect, useCallback } from "react";
import { fetchHealthStatus, triggerTokenCleanup, type HealthResponse, type TokenCleanupResult } from "../api/monitoring";
// UIUX-SA-009: Styled confirmation dialog instead of bare confirm()
import { ConfirmDialog, type ConfirmDialogConfig } from "../components/ConfirmDialog";
import { formatDateTime } from "../lib/formatters";

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
    if (status === "healthy") return { bg: "var(--color-success-soft)", text: "var(--color-success-dark)", dot: "var(--color-success)" };
    if (status === "warning") return { bg: "var(--color-warning-soft)", text: "var(--color-warning-dark)", dot: "var(--color-warning)" };
    return { bg: "var(--color-error-soft)", text: "var(--color-error-dark)", dot: "var(--color-error)" };
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
    <div className="sa-p-24">
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} loading={cleaningUp} />}
      <div className="sa-flex-between sa-mb-20">
        <div>
          <h2 className="sa-text-2xl sa-fw-600" style={{ margin: 0 }}>System Monitoring</h2>
          <p className="sa-text-muted sa-text-base sa-mt-4" style={{ margin: 0 }}>
            Cloud Run services health, GCP alert policies, infrastructure status
          </p>
        </div>
        <div className="sa-flex sa-gap-8">
          <label className="sa-flex sa-gap-4 sa-text-md sa-text-muted" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh (30s)
          </label>
          <button
            className="sa-btn-ghost-sm"
            onClick={loadHealth}
            disabled={loading}
            style={{ padding: "8px 16px" }}
          >
            {loading ? "Checking..." : "Refresh"}
          </button>
          <button
            className="sa-btn-danger-sm sa-fw-500"
            onClick={handleCleanup}
            disabled={cleaningUp}
            style={{ padding: "8px 16px", background: cleaningUp ? "var(--color-text-secondary)" : undefined }}
          >
            {cleaningUp ? "Cleaning..." : "Cleanup Stale Tokens"}
          </button>
        </div>
      </div>

      {cleanupResult && (
        <div className="sa-alert-success sa-mb-16">
          Token cleanup complete: <strong>{cleanupResult.deactivated}</strong> deactivated (90+ days), <strong>{cleanupResult.deleted}</strong> deleted (180+ days)
        </div>
      )}

      {error && (
        <div className="sa-alert-error sa-mb-16" role="alert">
          {error}
        </div>
      )}

      {/* Overall status banner */}
      {health && (
        <div
          className="sa-flex-between sa-p-16 sa-mb-20 sa-radius-8"
          style={{ backgroundColor: overallColor.bg, border: `1px solid ${overallColor.bg}` }}
        >
          <div className="sa-flex sa-gap-12">
            <div style={{ width: 16, height: 16, borderRadius: "50%", backgroundColor: overallColor.dot }} />
            <div>
              <div className="sa-text-xl sa-fw-700 sa-text-upper" style={{ color: overallColor.text }}>
                {health.status}
              </div>
              <div className="sa-text-sm" style={{ color: overallColor.text, opacity: 0.8 }}>
                Last checked: {formatDateTime(health.timestamp)}
              </div>
            </div>
          </div>
          <div className="sa-flex sa-gap-24">
            <div className="sa-text-center">
              <div className="sa-text-2xl sa-fw-700" style={{ color: overallColor.text }}>{formatUptime(health.uptime)}</div>
              <div className="sa-text-xs" style={{ color: overallColor.text, opacity: 0.7 }}>UPTIME</div>
            </div>
            <div className="sa-text-center">
              <div className="sa-text-2xl sa-fw-700" style={{ color: overallColor.text }}>{health.version?.slice(0, 7) || "—"}</div>
              <div className="sa-text-xs" style={{ color: overallColor.text, opacity: 0.7 }}>VERSION</div>
            </div>
          </div>
        </div>
      )}

      {/* Health checks grid */}
      <h3 className="sa-section-title sa-mb-12">Service Health Checks</h3>
      {loading && !health ? (
        <div className="sa-text-center sa-text-muted" style={{ padding: 40 }}>Loading health status...</div>
      ) : health ? (
        <div className="sa-grid-3 sa-mb-20">
          {Object.entries(health.checks).map(([name, check]) => {
            const c = statusColor(check.status);
            return (
              <div key={name} className="sa-stat-card">
                <div className="sa-flex-between sa-mb-8">
                  <div className="sa-text-base sa-fw-600" style={{ textTransform: "capitalize" }}>{name}</div>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 500, backgroundColor: c.bg, color: c.text }}>
                    {check.status}
                  </span>
                </div>
                {check.latencyMs !== undefined && (
                  <div className="sa-text-md sa-text-muted">
                    Latency: <strong>{check.latencyMs}ms</strong>
                  </div>
                )}
                {check.details && (
                  <div className="sa-text-sm sa-text-muted sa-mt-4">{check.details}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Cloud Run services table */}
      <h3 className="sa-section-title sa-mb-12">Cloud Run Services</h3>
      <div className="sa-scroll-x sa-mb-20">
        <table className="table">
          <thead>
            <tr>
              <th className="sa-th">Service</th>
              <th className="sa-th">Port</th>
              <th className="sa-th">Framework</th>
              <th className="sa-th">Region</th>
              <th className="sa-th">URL</th>
            </tr>
          </thead>
          <tbody>
            {services.map((svc) => (
              <tr key={svc.name}>
                <td className="sa-td sa-td--bold">{svc.name}</td>
                <td className="sa-td sa-td--mono">{svc.port}</td>
                <td className="sa-td">{svc.type}</td>
                <td className="sa-td">asia-south1</td>
                <td className="sa-td sa-td--mono">
                  {svc.name}.run.app
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alert policies reference */}
      <h3 className="sa-section-title sa-mb-12">GCP Alert Policies (10 active)</h3>
      <div className="sa-scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th className="sa-th">Alert Policy</th>
              <th className="sa-th">Trigger Condition</th>
              <th className="sa-th">Service Scope</th>
              <th className="sa-th">Status</th>
            </tr>
          </thead>
          <tbody>
            {alertPolicies.map((policy) => (
              <tr key={policy.name}>
                <td className="sa-td sa-td--bold">{policy.name}</td>
                <td className="sa-td sa-td--mono sa-text-danger">{policy.condition}</td>
                <td className="sa-td">{policy.service}</td>
                <td className="sa-td">
                  <span className="sa-badge-ok">
                    Active
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Infrastructure info */}
      <div className="sa-mt-20 sa-p-16 sa-radius-8 sa-bg-surface-alt sa-border">
        <h3 className="sa-section-title sa-mb-8" style={{ margin: 0 }}>Infrastructure Overview</h3>
        <div className="sa-grid-4 sa-text-md">
          <div>
            <strong className="sa-text-info">Load Balancer</strong>
            <div className="sa-text-muted">supermandi-staging-lb</div>
            <div className="sa-text-sm sa-text-muted">Global HTTPS + SSL cert</div>
          </div>
          <div>
            <strong style={{ color: "var(--color-accent)" }}>Cloud SQL</strong>
            <div className="sa-text-muted">PostgreSQL 15</div>
            <div className="sa-text-sm sa-text-muted">db-f1-micro, asia-south1</div>
          </div>
          <div>
            <strong className="sa-text-danger">Redis</strong>
            <div className="sa-text-muted">Memorystore M1</div>
            <div className="sa-text-sm sa-text-muted">1GB, asia-south1</div>
          </div>
          <div>
            <strong className="sa-text-success">Domain</strong>
            <div className="sa-text-muted">{typeof window !== 'undefined' ? window.location.hostname : 'supermandi.tech'}</div>
            <div className="sa-text-sm sa-text-muted">Cloudflare DNS</div>
          </div>
        </div>
      </div>
    </div>
  );
}
