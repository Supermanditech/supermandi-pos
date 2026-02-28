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
      const [overviewData, testsData] = await Promise.all([
        fetchQualityOverview(),
        fetchTestResults(),
      ]);
      setOverview(overviewData);
      setTestResults(testsData);
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
      return { bg: "#DCFCE7", text: "#166534", dot: "#22C55E" };
    if (status === "warning" || status === "degraded" || status === "scripts-ready")
      return { bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" };
    return { bg: "#FEE2E2", text: "#991B1B", dot: "#EF4444" };
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
      <div
        key={name}
        style={{
          border: "1px solid #E2E8F0",
          borderRadius: 8,
          padding: 16,
          background: "#FFF",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>{icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>{metric}</div>
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
      <div style={{ padding: 24, textAlign: "center", color: "#64748B" }}>
        Loading quality dashboard...
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div style={{ padding: 24 }}>
        <div
          style={{
            padding: 12,
            background: "#FEE2E2",
            color: "#991B1B",
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (!overview) return null;

  const systemColor = statusColor(overview.database.status);

  return (
    <div style={{ padding: 24 }}>
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} loading={resettingMetrics} />}
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Quality Dashboard</h2>
          <p style={{ margin: "4px 0 0", color: "#64748B", fontSize: 14 }}>
            9 testing tools + GCP native monitoring + live system metrics
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label
            style={{
              fontSize: 13,
              color: "#64748B",
              display: "flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (60s)
          </label>
          <button
            onClick={handleResetMetrics}
            disabled={resettingMetrics}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              background: "#FFF",
              border: "1px solid #CBD5E1",
              borderRadius: 6,
              cursor: resettingMetrics ? "not-allowed" : "pointer",
              opacity: resettingMetrics ? 0.6 : 1,
            }}
          >
            {resettingMetrics ? "Resetting..." : "Reset Metrics"}
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              background: "#2563EB",
              color: "#FFF",
              border: "none",
              borderRadius: 6,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* System Health Banner */}
      <div
        style={{
          background: systemColor.bg,
          border: `1px solid ${systemColor.dot}`,
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Uptime</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {formatUptime(overview.system.uptime)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Memory</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{overview.system.memoryMB} MB</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Error Rate</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{overview.system.errorRate}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>P95 Latency</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{overview.system.p95LatencyMs}ms</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Total Requests</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {overview.system.totalRequests.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Avg Latency</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {overview.system.avgLatencyMs}ms
            </div>
          </div>
        </div>
      </div>

      {/* Testing Tools Grid (3x3) */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Testing Tools</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
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
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>GCP Native Tools</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
              Cloud Monitoring
            </div>
            <div style={{ fontSize: 13, color: "#64748B" }}>
              {overview.gcp.alertPolicies} alert policies
            </div>
          </div>
          <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Uptime Checks</div>
            <div style={{ fontSize: 13, color: "#64748B" }}>
              {overview.gcp.uptimeChecks} services
            </div>
          </div>
          <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
              Error Reporting
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: statusColor(overview.gcp.errorReporting).text,
              }}
            >
              {overview.gcp.errorReporting}
            </div>
          </div>
          <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Cloud Trace</div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: statusColor(overview.gcp.cloudTrace).text,
              }}
            >
              {overview.gcp.cloudTrace}
            </div>
          </div>
          <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Cloud Profiler</div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: statusColor(overview.gcp.cloudProfiler).text,
              }}
            >
              {overview.gcp.cloudProfiler}
            </div>
          </div>
        </div>
      </div>

      {/* Test Results Table */}
      {testResults && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Test Results</h3>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>
            Last run: {testResults.lastRun}
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
              background: "#FFF",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                <th style={{ padding: 10, textAlign: "left", fontWeight: 600 }}>Suite</th>
                <th style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>Passed</th>
                <th style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>Failed</th>
                <th style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>Skipped</th>
                <th style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>Duration</th>
                <th style={{ padding: 10, textAlign: "center", fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(testResults.suites).map(([suite, result]) => {
                const status = result.failed > 0 ? "failed" : "passed";
                const statusCol = statusColor(status);
                return (
                  <tr key={suite} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: 10 }}>{suite}</td>
                    <td style={{ padding: 10, textAlign: "right", color: "#166534" }}>
                      {result.passed}
                    </td>
                    <td style={{ padding: 10, textAlign: "right", color: "#991B1B" }}>
                      {result.failed}
                    </td>
                    <td style={{ padding: 10, textAlign: "right", color: "#64748B" }}>
                      {result.skipped}
                    </td>
                    <td style={{ padding: 10, textAlign: "right", color: "#64748B" }}>
                      {result.duration}
                    </td>
                    <td style={{ padding: 10, textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: statusCol.bg,
                          color: statusCol.text,
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: statusCol.dot,
                          }}
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
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Code Coverage</h3>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
              background: "#FFF",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                <th style={{ padding: 10, textAlign: "left", fontWeight: 600 }}>Project</th>
                <th style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>Statements</th>
                <th style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>Branches</th>
                <th style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>Functions</th>
                <th style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>Lines</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(testResults.coverage).map(([project, cov]) => (
                <tr key={project} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: 10 }}>{project}</td>
                  <td style={{ padding: 10, textAlign: "right" }}>{cov.statements}%</td>
                  <td style={{ padding: 10, textAlign: "right" }}>{cov.branches}%</td>
                  <td style={{ padding: 10, textAlign: "right" }}>{cov.functions}%</td>
                  <td style={{ padding: 10, textAlign: "right" }}>{cov.lines}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CI Gate Summary */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>CI Gate Summary</h3>
        <div
          style={{
            border: "1px solid #E2E8F0",
            borderRadius: 8,
            padding: 16,
            background: "#FFF",
          }}
        >
          <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
            Total Gates: {overview.gates.total}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 8,
            }}
          >
            {Object.entries(overview.gates.categories).map(([category, count]) => (
              <div
                key={category}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  background: "#F8FAFC",
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                <span style={{ color: "#64748B" }}>{category}</span>
                <span style={{ fontWeight: 600 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Endpoints */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Top Endpoints</h3>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            background: "#FFF",
            border: "1px solid #E2E8F0",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <thead>
            <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
              <th style={{ padding: 10, textAlign: "left", fontWeight: 600 }}>Method</th>
              <th style={{ padding: 10, textAlign: "left", fontWeight: 600 }}>Path</th>
              <th style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>Count</th>
              <th style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>P95 (ms)</th>
              <th style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>Error Rate</th>
              <th style={{ padding: 10, textAlign: "left", fontWeight: 600 }}>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {overview.topEndpoints.map((ep, i) => {
              const errorRate = ep.count > 0 ? ((ep.errorCount / ep.count) * 100).toFixed(1) : "0.0";
              return (
                <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td
                    style={{
                      padding: 10,
                      fontFamily: "monospace",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {ep.method}
                  </td>
                  <td style={{ padding: 10, fontFamily: "monospace", fontSize: 11 }}>
                    {ep.path}
                  </td>
                  <td style={{ padding: 10, textAlign: "right" }}>{ep.count.toLocaleString()}</td>
                  <td style={{ padding: 10, textAlign: "right" }}>{ep.p95Ms}</td>
                  <td
                    style={{
                      padding: 10,
                      textAlign: "right",
                      color: parseFloat(errorRate) > 5 ? "#991B1B" : "#64748B",
                    }}
                  >
                    {errorRate}%
                  </td>
                  <td style={{ padding: 10, color: "#64748B", fontSize: 11 }}>
                    {new Date(ep.lastSeen).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Database Health */}
      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Database Health</h3>
        <div
          style={{
            border: "1px solid #E2E8F0",
            borderRadius: 8,
            padding: 16,
            background: "#FFF",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Status</div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: statusColor(overview.database.status).text,
                }}
              >
                {overview.database.status}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Latency</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{overview.database.latencyMs}ms</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Connections</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {overview.database.activeConnections}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Migrations</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{overview.database.migrations}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Latest</div>
              <div style={{ fontSize: 11, fontWeight: 600, fontFamily: "monospace" }}>
                {overview.database.latestMigration}
              </div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#64748B" }}>
              Table Row Counts
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 6,
              }}
            >
              {Object.entries(overview.database.tableStats).map(([table, count]) => (
                <div
                  key={table}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "4px 8px",
                    background: "#F8FAFC",
                    borderRadius: 4,
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: "#64748B", fontFamily: "monospace" }}>{table}</span>
                  <span style={{ fontWeight: 600 }}>{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Services */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Services</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {overview.services.map((svc) => {
            const color = statusColor(svc.status);
            return (
              <div
                key={svc.name}
                style={{ border: "1px solid #E2E8F0", borderRadius: 8, padding: 12 }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{svc.name}</div>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>
                  Port {svc.port} • {svc.framework}
                </div>
                <span
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
