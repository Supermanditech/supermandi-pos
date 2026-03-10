// Quality Dashboard Tab — SuperAdmin visibility hub for all 9 testing tools + GCP native tools + live system metrics
import { useState, useEffect, useCallback } from "react";
import {
  fetchQualityOverview,
  fetchTestResults,
  resetMetrics,
  type QualityOverview,
  type TestResults,
  type ToolStatus,
} from "../api/quality";
// UIUX-SA-010: Styled confirmation dialog instead of bare confirm()
import { ConfirmDialog, type ConfirmDialogConfig } from "../components/ConfirmDialog";
import { formatDateTime } from "../lib/formatters";

export function QualityDashboardTab() {
  const [overview, setOverview] = useState<QualityOverview | null>(null);
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [resettingMetrics, setResettingMetrics] = useState(false);
  // UIUX-SA-010: Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // R2-FIX QUA-002: Use allSettled so one failure doesn't lose both datasets
      const [overviewResult, testsResult] = await Promise.allSettled([
        fetchQualityOverview(),
        fetchTestResults(),
      ]);
      if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value);
      if (testsResult.status === 'fulfilled') setTestResults(testsResult.value);
      const failures = [overviewResult, testsResult].filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        setError(failures.map(f => (f as PromiseRejectedResult).reason?.message || 'Unknown error').join('; '));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quality data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 60s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  const handleResetMetrics = () => {
    setConfirmDialog({
      title: "Reset Metrics",
      message: "This will reset all request metrics counters to zero.",
      detail: "Historical reporting data will be lost.",
      confirmLabel: "Reset Metrics",
      variant: "danger",
      onConfirm: async () => {
        setConfirmDialog(null);
        setResettingMetrics(true);
        try {
          await resetMetrics();
          await loadData();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Metrics reset failed");
        } finally {
          setResettingMetrics(false);
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
    if (status === "healthy" || status === "running" || status === "configured" || status === "enabled" || status === "passed")
      return { bg: "var(--color-success-soft)", text: "var(--color-success)", dot: "var(--color-success)" };
    if (status === "warning" || status === "degraded" || status === "scripts-ready")
      return { bg: "var(--color-warning-soft)", text: "var(--color-warning)", dot: "var(--color-warning)" };
    return { bg: "var(--color-error-soft)", text: "var(--color-error)", dot: "var(--color-error)" };
  };

  const renderToolCard = (name: string, icon: string, tool: ToolStatus) => {
    const color = statusColor(tool.status);
    let metric = "";
    if (tool.portals) metric = `${tool.portals.length} portals`;
    else if (tool.specs) metric = `${tool.specs} specs`;
    else if (tool.flows) metric = `${tool.flows} flows`;
    else if (tool.scripts) metric = `${tool.scripts} scripts`;
    else if (tool.suites) metric = `${tool.suites} suites`;
    else if (tool.gates) metric = `${tool.gates} gates`;
    else if (tool.baselines) metric = `${tool.baselines} baselines`;

    return (
      <div key={name} className="sa-stat-card">
        <div className="sa-flex sa-gap-8 sa-mb-8">
          <span className="sa-text-3xl">{icon}</span>
          <div style={{ flex: 1 }}>
            <div className="sa-fw-600 sa-text-base">{name}</div>
            <div className="sa-text-sm sa-text-muted">{metric}</div>
          </div>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 4,
            background: color.bg,
            color: color.text,
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: color.dot,
            }}
          />
          {tool.installed ? "Installed" : "Missing"}
        </div>
      </div>
    );
  };

  if (loading && !overview) {
    return (
      <div className="sa-p-24 sa-text-center sa-text-muted">
        Loading quality dashboard...
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="sa-p-24">
        <div className="sa-alert-error" role="alert">
          {error}
        </div>
      </div>
    );
  }

  if (!overview) return null;

  const systemColor = statusColor(overview.database.status);

  return (
    <div className="sa-p-24">
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} loading={resettingMetrics} />}
      {/* Header */}
      <div className="sa-flex-between sa-mb-20">
        <div>
          <h2 className="sa-text-2xl sa-fw-600" style={{ margin: 0 }}>Quality Dashboard</h2>
          <p className="sa-text-muted sa-text-base sa-mt-4" style={{ margin: 0 }}>
            9 testing tools + GCP native monitoring + live system metrics
          </p>
        </div>
        <div className="sa-flex sa-gap-8">
          <label className="sa-flex sa-gap-4 sa-text-md sa-text-muted" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (60s)
          </label>
          <button
            className="sa-btn-ghost-sm"
            onClick={handleResetMetrics}
            disabled={resettingMetrics}
            style={{ opacity: resettingMetrics ? 0.6 : 1 }}
          >
            {resettingMetrics ? "Resetting..." : "Reset Metrics"}
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            style={{
              padding: "6px 12px", fontSize: 13, background: "var(--color-primary)", color: "var(--color-text-inverse)",
              border: "none", borderRadius: 6,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* System Health Banner */}
      <div
        className="sa-radius-8 sa-p-16 sa-mb-20"
        style={{ background: systemColor.bg, border: `1px solid ${systemColor.dot}` }}
      >
        <div className="sa-grid-auto sa-gap-16">
          <div>
            <div className="sa-stat-label">Uptime</div>
            <div className="sa-text-lg sa-fw-600">
              {formatUptime(overview.system.uptime)}
            </div>
          </div>
          <div>
            <div className="sa-stat-label">Memory</div>
            <div className="sa-text-lg sa-fw-600">{overview.system.memoryMB} MB</div>
          </div>
          <div>
            <div className="sa-stat-label">Error Rate</div>
            <div className="sa-text-lg sa-fw-600">{overview.system.errorRate}</div>
          </div>
          <div>
            <div className="sa-stat-label">P95 Latency</div>
            <div className="sa-text-lg sa-fw-600">{overview.system.p95LatencyMs}ms</div>
          </div>
          <div>
            <div className="sa-stat-label">Total Requests</div>
            <div className="sa-text-lg sa-fw-600">
              {overview.system.totalRequests.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="sa-stat-label">Avg Latency</div>
            <div className="sa-text-lg sa-fw-600">
              {overview.system.avgLatencyMs}ms
            </div>
          </div>
        </div>
      </div>

      {/* Testing Tools Grid (3x3) */}
      <div className="sa-mb-20">
        <h3 className="sa-text-lg sa-fw-600 sa-mb-12" style={{ margin: 0 }}>Testing Tools</h3>
        <div className="sa-grid-auto">
          {renderToolCard("Vitest", "⚡", overview.tools.vitest)}
          {renderToolCard("Jest", "🃏", overview.tools.jest)}
          {renderToolCard("Playwright E2E", "🎭", overview.tools.playwright)}
          {renderToolCard("Maestro Mobile", "📱", overview.tools.maestro)}
          {renderToolCard("k6 Load Tests", "📊", overview.tools.k6)}
          {renderToolCard("Contract Tests", "📋", overview.tools.contractTests)}
          {renderToolCard("Security Scan", "🔒", overview.tools.securityScan)}
          {renderToolCard("Visual Regression", "🎨", overview.tools.visualRegression)}
          {overview.tools.databaseTests && renderToolCard("Database Tests", "💾", overview.tools.databaseTests)}
        </div>
      </div>

      {/* GCP Native Tools */}
      <div className="sa-mb-20">
        <h3 className="sa-text-lg sa-fw-600 sa-mb-12" style={{ margin: 0 }}>GCP Native Tools</h3>
        <div className="sa-grid-auto">
          <div className="sa-stat-card sa-p-12">
            <div className="sa-fw-600 sa-text-base sa-mb-4">
              Cloud Monitoring
            </div>
            <div className="sa-text-md sa-text-muted">
              {overview.gcp.alertPolicies} alert policies
            </div>
          </div>
          <div className="sa-stat-card sa-p-12">
            <div className="sa-fw-600 sa-text-base sa-mb-4">Uptime Checks</div>
            <div className="sa-text-md sa-text-muted">
              {overview.gcp.uptimeChecks} services
            </div>
          </div>
          <div className="sa-stat-card sa-p-12">
            <div className="sa-fw-600 sa-text-base sa-mb-4">
              Error Reporting
            </div>
            <div
              className="sa-text-xs sa-fw-500"
              style={{ color: statusColor(overview.gcp.errorReporting).text }}
            >
              {overview.gcp.errorReporting}
            </div>
          </div>
          <div className="sa-stat-card sa-p-12">
            <div className="sa-fw-600 sa-text-base sa-mb-4">Cloud Trace</div>
            <div
              className="sa-text-xs sa-fw-500"
              style={{ color: statusColor(overview.gcp.cloudTrace).text }}
            >
              {overview.gcp.cloudTrace}
            </div>
          </div>
          <div className="sa-stat-card sa-p-12">
            <div className="sa-fw-600 sa-text-base sa-mb-4">Cloud Profiler</div>
            <div
              className="sa-text-xs sa-fw-500"
              style={{ color: statusColor(overview.gcp.cloudProfiler).text }}
            >
              {overview.gcp.cloudProfiler}
            </div>
          </div>
        </div>
      </div>

      {/* Test Results Table */}
      {testResults && (
        <div className="sa-mb-20">
          <h3 className="sa-text-lg sa-fw-600 sa-mb-12" style={{ margin: 0 }}>Test Results</h3>
          <div className="sa-text-sm sa-text-muted sa-mb-8">
            Last run: {testResults.lastRun}
          </div>
          <table className="table sa-border sa-radius-8 sa-overflow-hidden">
            <thead>
              <tr>
                <th className="sa-th">Suite</th>
                <th className="sa-th sa-th--right">Passed</th>
                <th className="sa-th sa-th--right">Failed</th>
                <th className="sa-th sa-th--right">Skipped</th>
                <th className="sa-th sa-th--right">Duration</th>
                <th className="sa-th" style={{ textAlign: "center" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(testResults.suites).map(([suite, result]) => {
                const status = result.failed > 0 ? "failed" : "passed";
                const statusCol = statusColor(status);
                return (
                  <tr key={suite}>
                    <td className="sa-td">{suite}</td>
                    <td className="sa-td sa-td--right sa-text-success">
                      {result.passed}
                    </td>
                    <td className="sa-td sa-td--right sa-text-error">
                      {result.failed}
                    </td>
                    <td className="sa-td sa-td--right sa-text-muted">
                      {result.skipped}
                    </td>
                    <td className="sa-td sa-td--right sa-text-muted">
                      {result.duration}
                    </td>
                    <td className="sa-td" style={{ textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "2px 8px", borderRadius: 4,
                          background: statusCol.bg, color: statusCol.text,
                          fontSize: 11, fontWeight: 500,
                        }}
                      >
                        <span
                          style={{ width: 6, height: 6, borderRadius: "50%", background: statusCol.dot }}
                        />
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Code Coverage Table */}
      {testResults && (
        <div className="sa-mb-20">
          <h3 className="sa-text-lg sa-fw-600 sa-mb-12" style={{ margin: 0 }}>Code Coverage</h3>
          <table className="table sa-border sa-radius-8 sa-overflow-hidden">
            <thead>
              <tr>
                <th className="sa-th">Project</th>
                <th className="sa-th sa-th--right">Statements</th>
                <th className="sa-th sa-th--right">Branches</th>
                <th className="sa-th sa-th--right">Functions</th>
                <th className="sa-th sa-th--right">Lines</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(testResults.coverage).map(([project, cov]) => (
                <tr key={project}>
                  <td className="sa-td">{project}</td>
                  <td className="sa-td sa-td--right">{cov.statements}%</td>
                  <td className="sa-td sa-td--right">{cov.branches}%</td>
                  <td className="sa-td sa-td--right">{cov.functions}%</td>
                  <td className="sa-td sa-td--right">{cov.lines}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CI Gate Summary */}
      <div className="sa-mb-20">
        <h3 className="sa-text-lg sa-fw-600 sa-mb-12" style={{ margin: 0 }}>CI Gate Summary</h3>
        <div className="sa-stat-card">
          <div className="sa-mb-12 sa-text-base sa-fw-600">
            Total Gates: {overview.gates.total}
          </div>
          <div className="sa-grid-auto sa-gap-8">
            {Object.entries(overview.gates.categories).map(([category, count]) => (
              <div
                key={category}
                className="sa-flex-between sa-bg-surface-alt sa-radius-4 sa-text-sm"
                style={{ padding: "6px 8px" }}
              >
                <span className="sa-text-muted">{category}</span>
                <span className="sa-fw-600">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Endpoints */}
      <div className="sa-mb-20">
        <h3 className="sa-text-lg sa-fw-600 sa-mb-12" style={{ margin: 0 }}>Top Endpoints</h3>
        <table className="table sa-border sa-radius-8 sa-overflow-hidden">
          <thead>
            <tr>
              <th className="sa-th">Method</th>
              <th className="sa-th">Path</th>
              <th className="sa-th sa-th--right">Count</th>
              <th className="sa-th sa-th--right">P95 (ms)</th>
              <th className="sa-th sa-th--right">Error Rate</th>
              <th className="sa-th">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {overview.topEndpoints.map((ep, i) => {
              const errorRate = ep.count > 0 ? ((ep.errorCount / ep.count) * 100).toFixed(1) : "0.0";
              return (
                <tr key={i}>
                  <td className="sa-td sa-td--mono sa-td--bold">
                    {ep.method}
                  </td>
                  <td className="sa-td sa-td--mono">
                    {ep.path}
                  </td>
                  <td className="sa-td sa-td--right">{ep.count.toLocaleString()}</td>
                  <td className="sa-td sa-td--right">{ep.p95Ms}</td>
                  <td
                    className="sa-td sa-td--right"
                    style={{ color: parseFloat(errorRate) > 5 ? "var(--color-error)" : "var(--color-text-secondary)" }}
                  >
                    {errorRate}%
                  </td>
                  <td className="sa-td sa-text-muted sa-text-xs">
                    {formatDateTime(ep.lastSeen)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Database Health */}
      <div>
        <h3 className="sa-text-lg sa-fw-600 sa-mb-12" style={{ margin: 0 }}>Database Health</h3>
        <div className="sa-stat-card">
          <div className="sa-grid-auto sa-gap-12 sa-mb-16">
            <div>
              <div className="sa-stat-label">Status</div>
              <div
                className="sa-text-base sa-fw-600"
                style={{ color: statusColor(overview.database.status).text }}
              >
                {overview.database.status}
              </div>
            </div>
            <div>
              <div className="sa-stat-label">Latency</div>
              <div className="sa-text-base sa-fw-600">{overview.database.latencyMs}ms</div>
            </div>
            <div>
              <div className="sa-stat-label">Connections</div>
              <div className="sa-text-base sa-fw-600">
                {overview.database.activeConnections}
              </div>
            </div>
            <div>
              <div className="sa-stat-label">Migrations</div>
              <div className="sa-text-base sa-fw-600">{overview.database.migrations}</div>
            </div>
            <div>
              <div className="sa-stat-label">Latest</div>
              <div className="sa-text-xs sa-fw-600 mono">
                {overview.database.latestMigration}
              </div>
            </div>
          </div>
          <div className="sa-border-t" style={{ paddingTop: 12 }}>
            <div className="sa-text-sm sa-fw-600 sa-mb-8 sa-text-muted">
              Table Row Counts
            </div>
            <div className="sa-grid-auto sa-gap-6">
              {Object.entries(overview.database.tableStats).map(([table, count]) => (
                <div
                  key={table}
                  className="sa-flex-between sa-bg-surface-alt sa-radius-4 sa-text-xs"
                  style={{ padding: "4px 8px" }}
                >
                  <span className="sa-text-muted mono">{table}</span>
                  <span className="sa-fw-600">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Services */}
      <div className="sa-mt-20">
        <h3 className="sa-text-lg sa-fw-600 sa-mb-12" style={{ margin: 0 }}>Services</h3>
        <div className="sa-grid-auto">
          {overview.services.map((svc) => {
            const color = statusColor(svc.status);
            return (
              <div key={svc.name} className="sa-stat-card sa-p-12">
                <div className="sa-fw-600 sa-text-base sa-mb-4">{svc.name}</div>
                <div className="sa-text-xs sa-text-muted sa-mb-6">
                  Port {svc.port} • {svc.framework}
                </div>
                <span
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "2px 8px", borderRadius: 4,
                    background: color.bg, color: color.text,
                    fontSize: 11, fontWeight: 500,
                  }}
                >
                  <span
                    style={{ width: 6, height: 6, borderRadius: "50%", background: color.dot }}
                  />
                  {svc.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
