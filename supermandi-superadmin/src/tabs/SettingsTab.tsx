// SA-001: Settings tab extracted from App.tsx
// T-234: Per-store feature flag overrides UI
// SA-P0-003: Price bounds configuration
// UIUX-SA-011: Styled confirmation dialog instead of bare confirm()
import { useState, useCallback, useEffect } from "react";
import { ConfirmDialog, type ConfirmDialogConfig } from "../components/ConfirmDialog";
import type { SystemSettings, SystemStats } from "../api/settings";
import type { GlobalFeatureFlag, StoreFeatureFlag } from "../api/featureFlags";
import { fetchStoreFeatureFlags, setStoreOverride, removeStoreOverride } from "../api/featureFlags";
import { fetchPriceBounds, updatePriceBounds, type PriceBounds } from "../api/priceBounds";
import type { StoreRecord } from "../api/stores";
import { formatDateTime } from "../lib/formatters";
import { TotpSetupCard } from "../components/TotpSetupCard";
import { SecuritySettingsCard } from "../components/SecuritySettingsCard";

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

  // SA-P0-003: Price bounds state
  const [priceBounds, setPriceBounds] = useState<PriceBounds | null>(null);
  const [priceBoundsLoading, setPriceBoundsLoading] = useState(false);
  const [priceBoundsError, setPriceBoundsError] = useState("");
  const [priceBoundsSaving, setPriceBoundsSaving] = useState(false);
  const [pbMinInput, setPbMinInput] = useState("");
  const [pbMaxInput, setPbMaxInput] = useState("");

  const loadPriceBounds = useCallback(async () => {
    setPriceBoundsLoading(true);
    setPriceBoundsError("");
    try {
      const bounds = await fetchPriceBounds();
      setPriceBounds(bounds);
      setPbMinInput(String(bounds.minPricePaise / 100));
      setPbMaxInput(String(bounds.maxPricePaise / 100));
    } catch (e: unknown) {
      setPriceBoundsError(e instanceof Error ? e.message : "Failed to load price bounds");
    } finally {
      setPriceBoundsLoading(false);
    }
  }, []);

  useEffect(() => { loadPriceBounds(); }, [loadPriceBounds]);

  const handleSavePriceBounds = useCallback(async () => {
    const minRupees = parseFloat(pbMinInput);
    const maxRupees = parseFloat(pbMaxInput);
    if (isNaN(minRupees) || isNaN(maxRupees) || minRupees <= 0 || maxRupees <= 0) {
      setPriceBoundsError("Both values must be positive numbers");
      return;
    }
    const minPaise = Math.round(minRupees * 100);
    const maxPaise = Math.round(maxRupees * 100);
    if (maxPaise <= minPaise) {
      setPriceBoundsError("Maximum must be greater than minimum");
      return;
    }
    setPriceBoundsSaving(true);
    setPriceBoundsError("");
    try {
      const updated = await updatePriceBounds(minPaise, maxPaise);
      setPriceBounds(updated);
      setPbMinInput(String(minPaise / 100));
      setPbMaxInput(String(maxPaise / 100));
    } catch (e: unknown) {
      setPriceBoundsError(e instanceof Error ? e.message : "Failed to update price bounds");
    } finally {
      setPriceBoundsSaving(false);
    }
  }, [pbMinInput, pbMaxInput]);

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
    } catch (e: unknown) {
      setStoreFlagsError(e instanceof Error ? e.message : "Failed to load store flags");
    } finally {
      setStoreFlagsLoading(false);
    }
  }, []);

  const handleStoreSelect = useCallback((storeId: string) => {
    setSelectedStoreId(storeId);
    setStoreFlags([]);
    setStoreFlagsError("");
    loadStoreFlags(storeId);
  }, [loadStoreFlags]);

  const handleSetOverride = useCallback(async (flagKey: string, enabled: boolean) => {
    if (!selectedStoreId) return;
    setStoreFlagSaving((p) => ({ ...p, [flagKey]: true }));
    try {
      await setStoreOverride(selectedStoreId, flagKey, enabled);
      await loadStoreFlags(selectedStoreId);
    } catch (e: unknown) {
      setStoreFlagsError(e instanceof Error ? e.message : "Failed to set override");
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
    } catch (e: unknown) {
      setStoreFlagsError(e instanceof Error ? e.message : "Failed to remove override");
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
        <div className="sa-flex sa-gap-8 sa-mb-12">
          <button onClick={refreshSettings} disabled={settingsLoading}>{settingsLoading ? "Loading..." : "Refresh"}</button>
        </div>
        {settingsError && <div className="errorText sa-mb-8" role="alert">{settingsError} <button onClick={refreshSettings} className="sa-btn-ghost-sm" style={{ marginLeft: 8 }}>Retry</button></div>}
        <div className="sa-grid-auto" style={{ gap: 16 }}>
          <div className="sa-stat-card sa-bg-surface-alt">
            <h4 className="sa-section-title">System Information</h4>
            {systemSettings ? (
              <div className="sa-flex-col sa-gap-8 sa-text-md">
                <div className="sa-flex-between"><span className="sa-text-muted">Version:</span><span className="mono">{systemSettings.version}</span></div>
                <div className="sa-flex-between"><span className="sa-text-muted">Environment:</span><span className={`badge ${systemSettings.environment === "production" ? "badgeOk" : "badgeWarn"}`}>{systemSettings.environment}</span></div>
                <div className="sa-flex-between"><span className="sa-text-muted">Database:</span><span className={`badge ${systemSettings.database.connected ? "badgeOk" : "badgeError"}`}>{systemSettings.database.connected ? "Connected" : "Disconnected"}</span></div>
              </div>
            ) : (<div className="sa-text-muted sa-text-md">Loading...</div>)}
          </div>
          <div className="sa-stat-card sa-bg-surface-alt">
            <h4 className="sa-section-title">Features</h4>
            {systemSettings ? (
              <div className="sa-flex-col sa-gap-8 sa-text-md">
                <div className="sa-flex-between"><span className="sa-text-muted">AI Assistant:</span><span className={`badge ${systemSettings.features.aiEnabled ? "badgeOk" : "badgeWarn"}`}>{systemSettings.features.aiEnabled ? "Enabled" : "Disabled"}</span></div>
                <div className="sa-flex-between"><span className="sa-text-muted">Analytics:</span><span className={`badge ${systemSettings.features.analyticsEnabled ? "badgeOk" : "badgeWarn"}`}>{systemSettings.features.analyticsEnabled ? "Enabled" : "Disabled"}</span></div>
              </div>
            ) : (<div className="sa-text-muted sa-text-md">Loading...</div>)}
          </div>
          <div className="sa-stat-card sa-bg-surface-alt">
            <h4 className="sa-section-title">Platform Statistics</h4>
            {systemStats ? (
              <div className="sa-flex-col sa-gap-8 sa-text-md">
                <div className="sa-flex-between"><span className="sa-text-muted">Total Stores:</span><span className="sa-fw-600">{systemStats.totalStores.toLocaleString()}</span></div>
                <div className="sa-flex-between"><span className="sa-text-muted">Total Devices:</span><span className="sa-fw-600">{systemStats.totalDevices.toLocaleString()}</span></div>
                <div className="sa-flex-between"><span className="sa-text-muted">Total Users:</span><span className="sa-fw-600">{systemStats.totalUsers.toLocaleString()}</span></div>
              </div>
            ) : (<div className="sa-text-muted sa-text-md">Loading...</div>)}
          </div>
        </div>

        <div className="sa-mt-20">
          <h3 className="sa-text-lg sa-fw-700 sa-mb-12">Feature Kill Switch</h3>
          <div className="muted sa-mb-12">Disable features globally. POS respects changes on next ui-status fetch.</div>
          <button onClick={refreshFeatureFlags} disabled={featureFlagsLoading} className="sa-mb-12">{featureFlagsLoading ? "Loading..." : "Refresh Flags"}</button>
          {featureFlagsError && <div className="banner sa-mb-8" role="alert">{featureFlagsError} <button onClick={refreshFeatureFlags} className="sa-btn-ghost-sm" style={{ marginLeft: 8 }}>Retry</button></div>}
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr><th>Feature</th><th>Description</th><th>Status</th><th>Config</th><th>Action</th><th>Last Changed</th></tr>
              </thead>
              <tbody>
                {featureFlags.map((flag) => (
                  <tr key={flag.flag_key}>
                    <td><span className="mono">{flag.flag_key}</span></td>
                    <td className="sa-text-sm sa-text-muted">{flag.description || "\u2014"}</td>
                    <td><span className={`badge ${flag.enabled ? "badgeOk" : "badgeError"}`}>{flag.enabled ? "ENABLED" : "DISABLED"}</span></td>
                    <td>{flag.flag_key === "minAppVersion" ? (<span className="sa-text-sm sa-text-muted">Auto (from build)</span>) : (<span className="sa-text-xs sa-text-muted">{"\u2014"}</span>)}</td>
                    <td>
                      <button onClick={() => {
                        const action = flag.enabled ? "KILL" : "Enable";
                        setConfirmDialog({
                          title: `${action} Feature Flag`,
                          message: `Are you sure you want to ${action.toLowerCase()} "${flag.flag_key}" globally? This affects ALL stores.`,
                          confirmLabel: action,
                          variant: flag.enabled ? "danger" : "info",
                          onConfirm: () => { setConfirmDialog(null); handleToggleGlobalFlag(flag.flag_key, !flag.enabled); },
                        });
                      }} disabled={featureFlagSaving[flag.flag_key]} className={flag.enabled ? "sa-btn-danger-sm" : "sa-btn-success-sm"} style={{ padding: "4px 12px" }}>
                        {featureFlagSaving[flag.flag_key] ? "Saving..." : flag.enabled ? "KILL" : "Enable"}
                      </button>
                    </td>
                    <td className="sa-text-xs sa-text-muted">{flag.updated_at ? formatDateTime(flag.updated_at) : "\u2014"}</td>
                  </tr>
                ))}
                {featureFlags.length === 0 && !featureFlagsLoading && (
                  <tr><td colSpan={6} className="sa-text-center sa-text-muted">No feature flags found. Migration may be pending.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SA-P0-003: Price Bounds Configuration */}
        <div className="sa-mt-20">
          <h3 className="sa-text-lg sa-fw-700 sa-mb-12">Price Bounds</h3>
          <div className="muted sa-mb-12">Configure global minimum and maximum allowed product prices (in Rupees). Enforced across POS and Retailer Admin.</div>
          <div className="sa-flex sa-gap-8 sa-mb-12">
            <button onClick={loadPriceBounds} disabled={priceBoundsLoading} className="sa-btn-ghost-sm">
              {priceBoundsLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
          {priceBoundsError && <div className="banner sa-mb-8" role="alert">{priceBoundsError}</div>}
          {priceBounds && (
            <div className="sa-stat-card sa-bg-surface-alt" style={{ maxWidth: 480 }}>
              <div className="sa-flex-col sa-gap-8">
                <div className="sa-flex sa-gap-8 sa-align-center">
                  <label htmlFor="pb-min" className="sa-text-muted" style={{ minWidth: 120 }}>Min Price (Rs):</label>
                  <input
                    id="pb-min"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={pbMinInput}
                    onChange={(e) => setPbMinInput(e.target.value)}
                    className="sa-input"
                    style={{ width: 160 }}
                    aria-label="Minimum price in rupees"
                  />
                </div>
                <div className="sa-flex sa-gap-8 sa-align-center">
                  <label htmlFor="pb-max" className="sa-text-muted" style={{ minWidth: 120 }}>Max Price (Rs):</label>
                  <input
                    id="pb-max"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={pbMaxInput}
                    onChange={(e) => setPbMaxInput(e.target.value)}
                    className="sa-input"
                    style={{ width: 160 }}
                    aria-label="Maximum price in rupees"
                  />
                </div>
                <div className="sa-flex sa-gap-8 sa-mt-8">
                  <button
                    onClick={handleSavePriceBounds}
                    disabled={priceBoundsSaving}
                    className="sa-btn-success-sm"
                  >
                    {priceBoundsSaving ? "Saving..." : "Save Bounds"}
                  </button>
                  {priceBounds.updatedAt && (
                    <span className="sa-text-xs sa-text-muted">Last updated: {formatDateTime(priceBounds.updatedAt)}{priceBounds.updatedBy ? ` by ${priceBounds.updatedBy}` : ""}</span>
                  )}
                </div>
              </div>
            </div>
          )}
          {!priceBounds && !priceBoundsLoading && !priceBoundsError && (
            <div className="sa-text-muted sa-text-md">No price bounds configured.</div>
          )}
        </div>

        {/* T-234: Per-Store Feature Flag Overrides */}
        <div className="sa-mt-20">
          <h3 className="sa-text-lg sa-fw-700 sa-mb-12">Per-Store Feature Overrides</h3>
          <div className="muted sa-mb-12">Override global flags for a specific store. Overrides take precedence over the global setting.</div>
          <div className="sa-flex sa-gap-8 sa-mb-12">
            <select
              value={selectedStoreId}
              onChange={(e) => handleStoreSelect(e.target.value)}
              className="sa-select" style={{ minWidth: 260 }}
              aria-label="Select store for feature flag overrides"
            >
              <option value="">-- Select a store --</option>
              {[...storeDirectory].sort((a, b) => ((a.name || a.storeName || a.id) as string).localeCompare((b.name || b.storeName || b.id) as string)).map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.storeName || s.id}</option>
              ))}
            </select>
            {selectedStoreId && (
              <button onClick={() => loadStoreFlags(selectedStoreId)} disabled={storeFlagsLoading} className="sa-btn-ghost-sm">
                {storeFlagsLoading ? "Loading..." : "Refresh"}
              </button>
            )}
          </div>
          {storeFlagsError && <div className="banner sa-mb-8" role="alert">{storeFlagsError}</div>}
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
                          ? <span className="sa-text-xs sa-text-muted">No override</span>
                          : <span className={`badge ${flag.store_override ? "badgeOk" : "badgeError"}`}>{flag.store_override ? "ON" : "OFF"}</span>
                        }
                      </td>
                      <td><span className={`badge ${flag.effective ? "badgeOk" : "badgeError"}`}>{flag.effective ? "ENABLED" : "DISABLED"}</span></td>
                      <td className="sa-flex sa-gap-4 sa-flex-wrap">
                        {flag.store_override !== true && (
                          <button
                            onClick={() => setConfirmDialog({
                              title: "Enable Store Override",
                              message: `Enable "${flag.flag_key}" override for this store? This overrides the global setting.`,
                              confirmLabel: "Enable",
                              variant: "info",
                              onConfirm: () => { setConfirmDialog(null); handleSetOverride(flag.flag_key, true); },
                            })}
                            disabled={storeFlagSaving[flag.flag_key]}
                            className="sa-btn-success-sm sa-btn-xs"
                          >Enable</button>
                        )}
                        {flag.store_override !== false && (
                          <button
                            onClick={() => setConfirmDialog({
                              title: "Disable Store Override",
                              message: `Disable "${flag.flag_key}" override for this store? This overrides the global setting.`,
                              confirmLabel: "Disable",
                              variant: "danger",
                              onConfirm: () => { setConfirmDialog(null); handleSetOverride(flag.flag_key, false); },
                            })}
                            disabled={storeFlagSaving[flag.flag_key]}
                            className="sa-btn-danger-sm sa-btn-xs"
                          >Disable</button>
                        )}
                        {flag.store_override !== null && (
                          <button
                            onClick={() => setConfirmDialog({
                              title: "Revert Store Override",
                              message: `Remove the "${flag.flag_key}" override for this store? It will revert to the global setting.`,
                              confirmLabel: "Revert",
                              variant: "danger",
                              onConfirm: () => { setConfirmDialog(null); handleRemoveOverride(flag.flag_key); },
                            })}
                            disabled={storeFlagSaving[flag.flag_key]}
                            className="sa-btn-xs" style={{ background: "var(--color-text-secondary)", color: "var(--color-text-inverse)", border: "none" }}
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
            <div className="sa-text-muted sa-text-md">No flags found for this store.</div>
          )}
        </div>

        {/* GCP-STG-0755 + GCP-STG-0539: Account Security */}
        <div className="sa-mt-20">
          <h3 className="sa-text-lg sa-fw-700 sa-mb-12">Account Security</h3>
          <SecuritySettingsCard />
          <div className="sa-mt-12">
            <TotpSetupCard />
          </div>
        </div>
      </div>
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />}
    </section>
  );
}
