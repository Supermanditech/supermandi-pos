// SA-001: Settings tab extracted from App.tsx
// T-234: Per-store feature flag overrides UI
// UIUX-SA-011: Styled confirmation dialog instead of bare confirm()
import { useState, useCallback } from "react";
import { ConfirmDialog, type ConfirmDialogConfig } from "../components/ConfirmDialog";
import type { SystemSettings, SystemStats } from "../api/settings";
import type { GlobalFeatureFlag, StoreFeatureFlag } from "../api/featureFlags";
import { fetchStoreFeatureFlags, setStoreOverride, removeStoreOverride } from "../api/featureFlags";
import type { StoreRecord } from "../api/stores";
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
  storeDirectory: StoreRecord[];
}

export function SettingsTab({
  systemSettings, systemStats, settingsLoading, settingsError,
  featureFlags, featureFlagsLoading, featureFlagSaving, featureFlagsError,
  refreshSettings, refreshFeatureFlags, handleToggleGlobalFlag,
  storeDirectory,
}: SettingsTabProps) {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);
  // T-234: Per-store feature flag override state
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [storeFlags, setStoreFlags] = useState<StoreFeatureFlag[]>([]);
  const [storeFlagsLoading, setStoreFlagsLoading] = useState(false);
  const [storeFlagsError, setStoreFlagsError] = useState("");
  const [storeFlagSaving, setStoreFlagSaving] = useState<Record<string, boolean>>({});

  const loadStoreFlags = useCallback(async (storeId: string) => {
    if (!storeId) { setStoreFlags([]); return; }
    setStoreFlagsLoading(true);
    setStoreFlagsError("");
    try {
      const flags = await fetchStoreFeatureFlags(storeId);
      setStoreFlags(flags);
    } catch (e: any) {
      setStoreFlagsError(e?.message || "Failed to load store flags");
    } finally {
      setStoreFlagsLoading(false);
    }
  }, []);

  const handleStoreSelect = useCallback((storeId: string) => {
    setSelectedStoreId(storeId);
    loadStoreFlags(storeId);
  }, [loadStoreFlags]);

  const handleSetOverride = useCallback(async (flagKey: string, enabled: boolean) => {
    if (!selectedStoreId) return;
    setStoreFlagSaving((p) => ({ ...p, [flagKey]: true }));
    try {
      await setStoreOverride(selectedStoreId, flagKey, enabled);
      await loadStoreFlags(selectedStoreId);
    } catch (e: any) {
      setStoreFlagsError(e?.message || "Failed to set override");
    } finally {
      setStoreFlagSaving((p) => ({ ...p, [flagKey]: false }));
    }
  }, [selectedStoreId, loadStoreFlags]);

  const handleRemoveOverride = useCallback(async (flagKey: string) => {
    if (!selectedStoreId) return;
    setStoreFlagSaving((p) => ({ ...p, [flagKey]: true }));
    try {
      await removeStoreOverride(selectedStoreId, flagKey);
      await loadStoreFlags(selectedStoreId);
    } catch (e: any) {
      setStoreFlagsError(e?.message || "Failed to remove override");
    } finally {
      setStoreFlagSaving((p) => ({ ...p, [flagKey]: false }));
    }
  }, [selectedStoreId, loadStoreFlags]);
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
        {settingsError && <div className="errorText" style={{ marginBottom: 8 }}>{settingsError} <button onClick={refreshSettings} style={{ marginLeft: 8, padding: "2px 8px", fontSize: 12, cursor: "pointer" }}>Retry</button></div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
          <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 16 }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>System Information</h4>
            {systemSettings ? (
              <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#666" }}>Version:</span><span className="mono">{systemSettings.version}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#666" }}>Environment:</span><span className={`badge ${systemSettings.environment === "production" ? "badgeOk" : "badgeWarn"}`}>{systemSettings.environment}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#666" }}>Database:</span><span className={`badge ${systemSettings.database.connected ? "badgeOk" : "badgeError"}`}>{systemSettings.database.connected ? "Connected" : "Disconnected"}</span></div>
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
                    <td><span className={`badge ${flag.enabled ? "badgeOk" : "badgeError"}`}>{flag.enabled ? "ENABLED" : "DISABLED"}</span></td>
                    <td>{flag.flag_key === "minAppVersion" ? (<span style={{ fontSize: 12, color: "#666" }}>Auto (from build)</span>) : (<span style={{ color: "#999", fontSize: 11 }}>{"\u2014"}</span>)}</td>
                    <td>
                      <button onClick={() => { handleToggleGlobalFlag(flag.flag_key, !flag.enabled); }} disabled={featureFlagSaving[flag.flag_key]} style={{ background: flag.enabled ? "#ef4444" : "#22c55e", color: "#fff", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer", fontSize: 12 }}>
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

        {/* T-234: Per-Store Feature Flag Overrides */}
        <div style={{ marginTop: 24 }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: 16 }}>Per-Store Feature Overrides</h3>
          <div className="muted" style={{ marginBottom: 12 }}>Override global flags for a specific store. Overrides take precedence over the global setting.</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <select
              value={selectedStoreId}
              onChange={(e) => handleStoreSelect(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13, minWidth: 260 }}
            >
              <option value="">-- Select a store --</option>
              {storeDirectory.map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.storeName || s.id}</option>
              ))}
            </select>
            {selectedStoreId && (
              <button onClick={() => loadStoreFlags(selectedStoreId)} disabled={storeFlagsLoading} style={{ fontSize: 12 }}>
                {storeFlagsLoading ? "Loading..." : "Refresh"}
              </button>
            )}
          </div>
          {storeFlagsError && <div className="banner" style={{ marginBottom: 8 }}>{storeFlagsError}</div>}
          {selectedStoreId && storeFlags.length > 0 && (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr><th>Feature</th><th>Global</th><th>Store Override</th><th>Effective</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {storeFlags.map((flag) => (
                    <tr key={flag.flag_key}>
                      <td><span className="mono">{flag.flag_key}</span></td>
                      <td><span className={`badge ${flag.global_enabled ? "badgeOk" : "badgeError"}`}>{flag.global_enabled ? "ON" : "OFF"}</span></td>
                      <td>
                        {flag.store_override === null
                          ? <span style={{ color: "#999", fontSize: 11 }}>No override</span>
                          : <span className={`badge ${flag.store_override ? "badgeOk" : "badgeError"}`}>{flag.store_override ? "ON" : "OFF"}</span>
                        }
                      </td>
                      <td><span className={`badge ${flag.effective ? "badgeOk" : "badgeError"}`}>{flag.effective ? "ENABLED" : "DISABLED"}</span></td>
                      <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {flag.store_override !== true && (
                          <button
                            onClick={() => handleSetOverride(flag.flag_key, true)}
                            disabled={storeFlagSaving[flag.flag_key]}
                            style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 11 }}
                          >Enable</button>
                        )}
                        {flag.store_override !== false && (
                          <button
                            onClick={() => handleSetOverride(flag.flag_key, false)}
                            disabled={storeFlagSaving[flag.flag_key]}
                            style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 11 }}
                          >Disable</button>
                        )}
                        {flag.store_override !== null && (
                          <button
                            onClick={() => handleRemoveOverride(flag.flag_key)}
                            disabled={storeFlagSaving[flag.flag_key]}
                            style={{ background: "#6b7280", color: "#fff", border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 11 }}
                          >Revert</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selectedStoreId && storeFlags.length === 0 && !storeFlagsLoading && (
            <div style={{ color: "#888", fontSize: 13 }}>No flags found for this store.</div>
          )}
        </div>
      </div>
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />}
    </section>
  );
}
