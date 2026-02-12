// SA-001: Settings tab extracted from App.tsx
import type { SystemSettings, SystemStats } from "../api/settings";
import type { GlobalFeatureFlag } from "../api/featureFlags";
import { formatDateTime } from "../lib/formatters";

interface SettingsTabProps {
  systemSettings: SystemSettings | null;
  systemStats: SystemStats | null;
  settingsLoading: boolean;
  settingsError: string;
  featureFlags: GlobalFeatureFlag[];
  featureFlagsLoading: boolean;
  featureFlagSaving: Record<string, boolean>;
  featureFlagsError: string;
  refreshSettings: () => void;
  refreshFeatureFlags: () => void;
  handleToggleGlobalFlag: (key: string, enabled: boolean) => void;
}

export function SettingsTab({
  systemSettings, systemStats, settingsLoading, settingsError,
  featureFlags, featureFlagsLoading, featureFlagSaving, featureFlagsError,
  refreshSettings, refreshFeatureFlags, handleToggleGlobalFlag,
}: SettingsTabProps) {
  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">System Settings</div>
        <div className="muted">Platform configuration and statistics</div>
      </div>

      <div className="tableWrap">
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <button onClick={refreshSettings} disabled={settingsLoading}>{settingsLoading ? "Loading..." : "Refresh"}</button>
        </div>
        {settingsError && <div className="errorText" style={{ marginBottom: 8 }}>{settingsError}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
          <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 16 }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>System Information</h4>
            {systemSettings ? (
              <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#666" }}>Version:</span><span className="mono">{systemSettings.version}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#666" }}>Environment:</span><span className={`badge ${systemSettings.environment === "production" ? "badgeOk" : "badgeWarn"}`}>{systemSettings.environment}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#666" }}>Database:</span><span className={`badge ${systemSettings.database.connected ? "badgeOk" : "badgeErr"}`}>{systemSettings.database.connected ? "Connected" : "Disconnected"}</span></div>
              </div>
            ) : (<div style={{ color: "#888", fontSize: 13 }}>Loading...</div>)}
          </div>
          <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 16 }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>Features</h4>
            {systemSettings ? (
              <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#666" }}>AI Assistant:</span><span className={`badge ${systemSettings.features.aiEnabled ? "badgeOk" : "badgeWarn"}`}>{systemSettings.features.aiEnabled ? "Enabled" : "Disabled"}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#666" }}>Analytics:</span><span className={`badge ${systemSettings.features.analyticsEnabled ? "badgeOk" : "badgeWarn"}`}>{systemSettings.features.analyticsEnabled ? "Enabled" : "Disabled"}</span></div>
              </div>
            ) : (<div style={{ color: "#888", fontSize: 13 }}>Loading...</div>)}
          </div>
          <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 16 }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>Platform Statistics</h4>
            {systemStats ? (
              <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#666" }}>Total Stores:</span><span style={{ fontWeight: 600 }}>{systemStats.totalStores.toLocaleString()}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#666" }}>Total Devices:</span><span style={{ fontWeight: 600 }}>{systemStats.totalDevices.toLocaleString()}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#666" }}>Total Users:</span><span style={{ fontWeight: 600 }}>{systemStats.totalUsers.toLocaleString()}</span></div>
              </div>
            ) : (<div style={{ color: "#888", fontSize: 13 }}>Loading...</div>)}
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: 16 }}>Feature Kill Switch</h3>
          <div className="muted" style={{ marginBottom: 12 }}>Disable features globally. POS respects changes on next ui-status fetch.</div>
          <button onClick={refreshFeatureFlags} disabled={featureFlagsLoading} style={{ marginBottom: 12 }}>{featureFlagsLoading ? "Loading..." : "Refresh Flags"}</button>
          {featureFlagsError && <div className="banner" style={{ marginBottom: 8 }}>{featureFlagsError}</div>}
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr><th>Feature</th><th>Description</th><th>Status</th><th>Config</th><th>Action</th><th>Last Changed</th></tr>
              </thead>
              <tbody>
                {featureFlags.map((flag) => (
                  <tr key={flag.flag_key}>
                    <td><span className="mono">{flag.flag_key}</span></td>
                    <td style={{ fontSize: 12, color: "#666" }}>{flag.description || "\u2014"}</td>
                    <td><span className={`badge ${flag.enabled ? "badgeOk" : "badgeErr"}`}>{flag.enabled ? "ENABLED" : "DISABLED"}</span></td>
                    <td>{flag.flag_key === "minAppVersion" ? (<span style={{ fontSize: 12, color: "#666" }}>Auto (from build)</span>) : (<span style={{ color: "#999", fontSize: 11 }}>{"\u2014"}</span>)}</td>
                    <td>
                      <button onClick={() => handleToggleGlobalFlag(flag.flag_key, !flag.enabled)} disabled={featureFlagSaving[flag.flag_key]} style={{ background: flag.enabled ? "#ef4444" : "#22c55e", color: "#fff", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer", fontSize: 12 }}>
                        {featureFlagSaving[flag.flag_key] ? "Saving..." : flag.enabled ? "KILL" : "Enable"}
                      </button>
                    </td>
                    <td style={{ fontSize: 11, color: "#888" }}>{flag.updated_at ? formatDateTime(flag.updated_at) : "\u2014"}</td>
                  </tr>
                ))}
                {featureFlags.length === 0 && !featureFlagsLoading && (
                  <tr><td colSpan={6} style={{ textAlign: "center", color: "#888" }}>No feature flags found. Migration may be pending.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
