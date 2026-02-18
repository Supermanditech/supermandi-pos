// SA-001: Stores tab extracted from App.tsx
import React from "react";
import type { StoreRecord } from "../api/stores";
import type { GlobalFeatureFlag, StoreFeatureFlag } from "../api/featureFlags";
import type { EnrollmentRecord } from "../api/deviceEnrollments";
import { formatDateTime } from "../lib/formatters";
import { WhatsAppIcon } from "../components/WhatsAppIcon";

interface StoresTabProps {
  // Create store
  createStoreName: string;
  setCreateStoreName: (v: string) => void;
  createStoreId: string;
  setCreateStoreId: (v: string) => void;
  handleCreateStore: () => void;
  createStoreLoading: boolean;
  createStoreError: string;
  createStoreSuccess: string;
  // UPI activation
  storeAdminId: string;
  setStoreAdminId: (v: string) => void;
  storeUpiInput: string;
  setStoreUpiInput: (v: string) => void;
  storeUpiInputRef: React.RefObject<HTMLInputElement | null>;
  handleStoreLoad: () => void;
  handleStoreSave: () => void;
  storeLoading: boolean;
  storeError: string;
  storeSuccess: string;
  storeRecord: StoreRecord | null;
  // Directory
  storeDirectory: StoreRecord[];
  storeDirectoryLoading: boolean;
  storeDirectoryError: string;
  storeNameError: string;
  storeNameEdits: Record<string, string>;
  updateStoreNameDraft: (storeId: string, name: string) => void;
  storeNameSaving: Record<string, boolean>;
  handleStoreNameSave: (storeId: string) => void;
  expandedStoreId: string | null;
  setExpandedStoreId: (id: string | null) => void;
  loadStoreFeatureFlags: (storeId: string) => void;
  requestStoreStatusChange: (storeId: string, storeName: string, action: "suspend" | "reactivate") => void;
  // Contact editing
  getStoreContactDraft: (s: StoreRecord) => { address: string; contactName: string; contactPhone: string; contactEmail: string };
  updateStoreContactDraft: (storeId: string, patch: Partial<{ address: string; contactName: string; contactPhone: string; contactEmail: string }>) => void;
  // Payment methods
  getStorePaymentDraft: (s: StoreRecord) => string[];
  toggleStorePaymentMethod: (storeId: string, method: string, current: string[]) => void;
  // Feature flags
  storeFeatureFlags: Record<string, StoreFeatureFlag[]>;
  storeFFLoading: Record<string, boolean>;
  handleStoreFFToggle: (storeId: string, flag: StoreFeatureFlag) => void;
  // Bulk feature flags
  selectedStoreIds: Set<string>;
  setSelectedStoreIds: (ids: Set<string>) => void;
  toggleStoreSelection: (storeId: string) => void;
  bulkFlagKey: string;
  setBulkFlagKey: (v: string) => void;
  bulkFlagAction: "enable" | "disable";
  setBulkFlagAction: (v: "enable" | "disable") => void;
  handleBulkFF: () => void;
  bulkFlagLoading: boolean;
  bulkFlagResult: string;
  featureFlags: GlobalFeatureFlag[];
  // Barcode sheets
  barcodeSheetStoreId: string;
  setBarcodeSheetStoreId: (v: string) => void;
  barcodeSheetTier: "tier1" | "tier2";
  setBarcodeSheetTier: (v: "tier1" | "tier2") => void;
  barcodeSheetBusy: boolean;
  barcodeSheetError: string;
  barcodeSheetSuccess: string;
  handleBarcodeSheetDownload: () => void;
  handleBarcodeSheetShare: () => void;
  // Store activity (derived from events)
  stores: Array<{ storeId: string; eventCount: number; lastSeen: string }>;
  limit: number;
  // SA-ENROLL-UX G3 + G5: Enrollment from stores tab
  handleCreateEnrollmentForStore: (storeId: string) => void;
  enrollmentForStoreLoading: string;
  storeEnrollments: Record<string, EnrollmentRecord[]>;
  loadStoreEnrollments: (storeId: string) => void;
  storeEnrollmentsLoading: Record<string, boolean>;
  handleRevokeEnrollment: (code: string) => void;
  revokeLoading: boolean;
}

export function StoresTab({
  createStoreName,
  setCreateStoreName,
  createStoreId,
  setCreateStoreId,
  handleCreateStore,
  createStoreLoading,
  createStoreError,
  createStoreSuccess,
  storeAdminId,
  setStoreAdminId,
  storeUpiInput,
  setStoreUpiInput,
  storeUpiInputRef,
  handleStoreLoad,
  handleStoreSave,
  storeLoading,
  storeError,
  storeSuccess,
  storeRecord,
  storeDirectory,
  storeDirectoryLoading,
  storeDirectoryError,
  storeNameError,
  storeNameEdits,
  updateStoreNameDraft,
  storeNameSaving,
  handleStoreNameSave,
  expandedStoreId,
  setExpandedStoreId,
  loadStoreFeatureFlags,
  requestStoreStatusChange,
  getStoreContactDraft,
  updateStoreContactDraft,
  getStorePaymentDraft,
  toggleStorePaymentMethod,
  storeFeatureFlags,
  storeFFLoading,
  handleStoreFFToggle,
  selectedStoreIds,
  setSelectedStoreIds,
  toggleStoreSelection,
  bulkFlagKey,
  setBulkFlagKey,
  bulkFlagAction,
  setBulkFlagAction,
  handleBulkFF,
  bulkFlagLoading,
  bulkFlagResult,
  featureFlags,
  barcodeSheetStoreId,
  setBarcodeSheetStoreId,
  barcodeSheetTier,
  setBarcodeSheetTier,
  barcodeSheetBusy,
  barcodeSheetError,
  barcodeSheetSuccess,
  handleBarcodeSheetDownload,
  handleBarcodeSheetShare,
  stores,
  limit,
  // SA-ENROLL-UX G3 + G5
  handleCreateEnrollmentForStore,
  enrollmentForStoreLoading,
  storeEnrollments,
  loadStoreEnrollments,
  storeEnrollmentsLoading,
  handleRevokeEnrollment,
  revokeLoading,
}: StoresTabProps) {
  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">Create Store</div>
        <div className="muted">Generate a Store ID for new device enrollment.</div>
      </div>

      <div className="tableWrap" style={{ paddingTop: 0 }}>
        <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div className="control">
            <label>Store name</label>
            <input
              value={createStoreName}
              onChange={(e) => setCreateStoreName(e.target.value)}
              placeholder="Supermandi Pilot Store"
            />
          </div>
          <div className="control">
            <label>Store ID (optional)</label>
            <input
              value={createStoreId}
              onChange={(e) => setCreateStoreId(e.target.value)}
              placeholder="UUID or store code"
            />
          </div>
          <div className="control">
            <label>&nbsp;</label>
            <button onClick={handleCreateStore} disabled={createStoreLoading}>
              {createStoreLoading ? "Creating..." : "Create store"}
            </button>
          </div>
        </div>

        {createStoreError && (
          <div className="banner" style={{ marginTop: 12 }}>{createStoreError}</div>
        )}
        {createStoreSuccess && (
          <div className="muted" style={{ marginTop: 12 }}>{createStoreSuccess}</div>
        )}
      </div>

      <div className="cardHeader">
        <div className="cardTitle">Store Activation (UPI VPA)</div>
        <div className="muted">GET prefill → PATCH save + activate/deactivate</div>
      </div>

      <div className="tableWrap" style={{ paddingTop: 0 }}>
        <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div className="control">
            <label>Store ID</label>
            <input
              value={storeAdminId}
              onChange={(e) => setStoreAdminId(e.target.value)}
              placeholder="e.g. store-1"
            />
          </div>
          <div className="control">
            <label>UPI VPA</label>
            <input
              ref={storeUpiInputRef}
              value={storeUpiInput}
              onChange={(e) => setStoreUpiInput(e.target.value)}
              placeholder="merchant@upi"
            />
          </div>
          <div className="control">
            <label>&nbsp;</label>
            <button onClick={handleStoreLoad} disabled={storeLoading}>
              {storeLoading ? "Loading..." : "Load store"}
            </button>
          </div>
          <div className="control">
            <label>&nbsp;</label>
            <button onClick={handleStoreSave} disabled={storeLoading}>
              {storeLoading ? "Saving..." : "Save VPA"}
            </button>
          </div>
        </div>

        {storeError && <div className="banner" style={{ marginTop: 12 }}>{storeError}</div>}
        {storeSuccess && <div className="muted" style={{ marginTop: 12 }}>{storeSuccess}</div>}

        {storeRecord && (
          <div className="tableWrap" style={{ paddingTop: 6 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Store ID</th>
                  <th>Name</th>
                  <th>Active</th>
                  <th>UPI VPA</th>
                  <th>UPI Updated</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono">{storeRecord.id}</td>
                  <td>{storeRecord.name ?? "-"}</td>
                  <td className="mono">{storeRecord.active ? "true" : "false"}</td>
                  <td className="mono">{storeRecord.upi_vpa ?? "-"}</td>
                  <td className="mono">
                    {storeRecord.upi_vpa_updated_at
                      ? formatDateTime(storeRecord.upi_vpa_updated_at)
                      : "-"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="cardHeader" style={{ paddingTop: 0 }}>
        <div className="cardTitle">Stores (directory)</div>
        <div className="muted">Edit store names and status</div>
      </div>

      {storeDirectoryError && <div className="banner" style={{ margin: "0 16px 12px" }}>{storeDirectoryError}</div>}
      {storeNameError && <div className="banner" style={{ margin: "0 16px 12px" }}>{storeNameError}</div>}
      {/* #186.12: Loading indicator when refreshing with existing data */}
      {storeDirectoryLoading && storeDirectory.length > 0 && (
        <div className="muted" style={{ margin: "0 16px 8px", fontSize: 12 }}>Refreshing stores...</div>
      )}

      {/* SA-P1-007: Bulk feature flag toolbar */}
      {selectedStoreIds.size > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 16px", background: "#eff6ff", borderRadius: 6, margin: "0 16px 8px" }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{selectedStoreIds.size} store(s) selected</span>
          <select value={bulkFlagKey} onChange={(e) => setBulkFlagKey(e.target.value)} style={{ fontSize: 13, padding: "4px 8px" }}>
            <option value="">Select flag...</option>
            {featureFlags.map((f) => <option key={f.flag_key} value={f.flag_key}>{f.flag_key}</option>)}
          </select>
          <select value={bulkFlagAction} onChange={(e) => setBulkFlagAction(e.target.value as "enable" | "disable")} style={{ fontSize: 13, padding: "4px 8px" }}>
            <option value="enable">Enable</option>
            <option value="disable">Disable</option>
          </select>
          <button onClick={handleBulkFF} disabled={bulkFlagLoading || !bulkFlagKey}>
            {bulkFlagLoading ? "Applying..." : "Apply"}
          </button>
          <button className="btnGhost" onClick={() => setSelectedStoreIds(new Set())}>Clear</button>
          {bulkFlagResult && <span style={{ fontSize: 12, color: "#666" }}>{bulkFlagResult}</span>}
        </div>
      )}

      {storeDirectory.length === 0 ? (
        <div className="empty">
          {storeDirectoryLoading ? "Loading stores..." : "No stores found."}
        </div>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    checked={selectedStoreIds.size === storeDirectory.length && storeDirectory.length > 0}
                    onChange={() => {
                      if (selectedStoreIds.size === storeDirectory.length) {
                        setSelectedStoreIds(new Set());
                      } else {
                        setSelectedStoreIds(new Set(storeDirectory.map((s) => s.id)));
                      }
                    }}
                    title="Select all"
                  />
                </th>
                <th>Store ID</th>
                <th>Store Name</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {storeDirectory.map((s) => {
                const contactDraft = getStoreContactDraft(s);
                const isExpanded = expandedStoreId === s.id;
                return (
                  <React.Fragment key={s.id}>
                    <tr>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedStoreIds.has(s.id)}
                          onChange={() => toggleStoreSelection(s.id)}
                        />
                      </td>
                      <td className="mono">{s.id}</td>
                      <td>
                        <input
                          className="tableInput"
                          value={storeNameEdits[s.id] ?? s.name ?? s.storeName ?? ""}
                          onChange={(e) => updateStoreNameDraft(s.id, e.target.value)}
                          placeholder="Store name"
                        />
                      </td>
                      <td>
                        <button
                          className="btnGhost"
                          onClick={() => { const nextId = isExpanded ? null : s.id; setExpandedStoreId(nextId); if (nextId) { loadStoreFeatureFlags(nextId); loadStoreEnrollments(nextId); } }}
                          title={isExpanded ? "Hide details" : "Edit details"}
                        >
                          {s.contact_name || s.contact_phone ? `${s.contact_name ?? ""}` : "(none)"}
                          {isExpanded ? " ▲" : " ▼"}
                        </button>
                      </td>
                      {/* SA-P0-001: Show raw status with color coding */}
                      <td>
                        <span className="mono" style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          ...(s.status === "SUSPENDED"
                            ? { background: "#fee2e2", color: "#991b1b" }
                            : s.status === "ACTIVE"
                            ? { background: "#dcfce7", color: "#166534" }
                            : { background: "#f3f4f6", color: "#374151" }),
                        }}>
                          {s.status ?? (s.active ? "ACTIVE" : "INACTIVE")}
                        </span>
                      </td>
                      <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <button onClick={() => handleStoreNameSave(s.id)} disabled={storeNameSaving[s.id]}>
                          {storeNameSaving[s.id] ? "Saving..." : "Save"}
                        </button>
                        {/* SA-ENROLL-UX G3: Generate QR button per store */}
                        <button
                          className="btnGhost"
                          onClick={() => handleCreateEnrollmentForStore(s.id)}
                          disabled={enrollmentForStoreLoading === s.id}
                          title="Generate enrollment QR code for this store"
                          style={{ fontSize: 12, padding: "4px 8px" }}
                        >
                          {enrollmentForStoreLoading === s.id ? "..." : "QR"}
                        </button>
                        {/* SA-P0-001: Suspend/Reactivate buttons */}
                        {s.status === "ACTIVE" && (
                          <button
                            className="btnDanger"
                            style={{ fontSize: 12, padding: "4px 8px" }}
                            onClick={() => requestStoreStatusChange(s.id, s.name ?? s.storeName ?? s.id, "suspend")}
                          >
                            Suspend
                          </button>
                        )}
                        {s.status === "SUSPENDED" && (
                          <button
                            style={{ fontSize: 12, padding: "4px 8px", background: "#16a34a", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
                            onClick={() => requestStoreStatusChange(s.id, s.name ?? s.storeName ?? s.id, "reactivate")}
                          >
                            Reactivate
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} style={{ background: "#f9fafb", padding: "12px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", maxWidth: "600px" }}>
                            <div>
                              <label style={{ fontSize: "12px", color: "#666" }}>Contact Name</label>
                              <input
                                className="tableInput"
                                value={contactDraft.contactName}
                                onChange={(e) => updateStoreContactDraft(s.id, { contactName: e.target.value })}
                                placeholder="Contact name"
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: "12px", color: "#666" }}>Phone</label>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <input
                                  className="tableInput"
                                  value={contactDraft.contactPhone}
                                  onChange={(e) => updateStoreContactDraft(s.id, { contactPhone: e.target.value })}
                                  placeholder="+91..."
                                  style={{ flex: 1 }}
                                />
                                {contactDraft.contactPhone && (
                                  <button
                                    onClick={() => window.open(`https://wa.me/${contactDraft.contactPhone.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(`Hi, this is SuperMandi admin regarding your store ${s.name ?? s.storeName ?? s.id}.`)}`, '_blank', 'noopener,noreferrer')}
                                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}
                                    title="Message on WhatsApp"
                                    aria-label="Message on WhatsApp"
                                  >
                                    <WhatsAppIcon size={18} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div>
                              <label style={{ fontSize: "12px", color: "#666" }}>Email</label>
                              <input
                                className="tableInput"
                                value={contactDraft.contactEmail}
                                onChange={(e) => updateStoreContactDraft(s.id, { contactEmail: e.target.value })}
                                placeholder="email@example.com"
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: "12px", color: "#666" }}>Address</label>
                              <input
                                className="tableInput"
                                value={contactDraft.address}
                                onChange={(e) => updateStoreContactDraft(s.id, { address: e.target.value })}
                                placeholder="Store address"
                              />
                            </div>
                          </div>
                          {/* SA-P1-006: Payment method checkboxes */}
                          <div style={{ marginTop: "12px" }}>
                            <label style={{ fontSize: "12px", color: "#666", display: "block", marginBottom: "6px" }}>Payment Methods</label>
                            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                              {(["CASH", "UPI", "DUE"] as const).map((method) => {
                                const draft = getStorePaymentDraft(s);
                                return (
                                  <label key={method} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                                    <input
                                      type="checkbox"
                                      checked={draft.includes(method)}
                                      onChange={() => toggleStorePaymentMethod(s.id, method, draft)}
                                    />
                                    {method}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                          {/* SA-P1-007: Per-store feature flag overrides */}
                          <div style={{ marginTop: "12px" }}>
                            <label style={{ fontSize: "12px", color: "#666", display: "block", marginBottom: "6px" }}>Feature Flags</label>
                            {storeFFLoading[s.id] ? (
                              <span style={{ fontSize: 12, color: "#888" }}>Loading...</span>
                            ) : storeFeatureFlags[s.id] ? (
                              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                                {storeFeatureFlags[s.id].map((f) => (
                                  <label key={f.flag_key} style={{ display: "flex", alignItems: "center", gap: "4px", cursor: f.global_enabled ? "pointer" : "default", fontSize: 13, opacity: f.global_enabled ? 1 : 0.5 }}>
                                    <input
                                      type="checkbox"
                                      checked={f.effective}
                                      disabled={!f.global_enabled}
                                      onChange={() => handleStoreFFToggle(s.id, f)}
                                    />
                                    <span>{f.flag_key}</span>
                                    {f.store_override !== null && <span style={{ fontSize: 10, color: "#f59e0b" }}>(override)</span>}
                                    {!f.global_enabled && <span style={{ fontSize: 10, color: "#ef4444" }}>(killed)</span>}
                                  </label>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          {/* SA-ENROLL-UX G5: Per-store enrollment codes */}
                          <div style={{ marginTop: "12px" }}>
                            <label style={{ fontSize: "12px", color: "#666", display: "block", marginBottom: "6px" }}>Enrollment Codes</label>
                            {storeEnrollmentsLoading[s.id] ? (
                              <span style={{ fontSize: 12, color: "#888" }}>Loading...</span>
                            ) : storeEnrollments[s.id] && storeEnrollments[s.id].length > 0 ? (
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                {storeEnrollments[s.id].map((e) => {
                                  const badgeStyle: React.CSSProperties = {
                                    display: "inline-flex", alignItems: "center", gap: 6,
                                    padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                                    ...(e.status === "ACTIVE" ? { background: "#dcfce7", color: "#166534" }
                                      : e.status === "REVOKED" ? { background: "#fee2e2", color: "#991b1b" }
                                      : e.status === "USED" ? { background: "#dbeafe", color: "#1e40af" }
                                      : { background: "#fef3c7", color: "#92400e" }),
                                  };
                                  return (
                                    <span key={e.id} style={badgeStyle}>
                                      <span className="mono">{e.code}</span>
                                      <span>{e.status}</span>
                                      <span style={{ fontSize: 10, opacity: 0.7 }}>
                                        {e.uses_count}/{e.max_uses} uses
                                      </span>
                                      {e.status === "ACTIVE" && (
                                        <button
                                          onClick={() => handleRevokeEnrollment(e.code)}
                                          disabled={revokeLoading}
                                          style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 11, textDecoration: "underline", padding: 0 }}
                                        >
                                          revoke
                                        </button>
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: "#888" }}>No enrollment codes yet</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="cardHeader" style={{ paddingTop: 0 }}>
        <div className="cardTitle">Barcode Sheets</div>
        <div className="muted">Generate A4 PDF sheets with existing barcodes (Tier-1 / Tier-2).</div>
      </div>

      {barcodeSheetError && <div className="banner" style={{ margin: "0 16px 12px" }}>{barcodeSheetError}</div>}
      {barcodeSheetSuccess && <div className="muted" style={{ margin: "0 16px 12px" }}>{barcodeSheetSuccess}</div>}

      <div className="tableWrap" style={{ paddingTop: 0 }}>
        <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div className="control">
            <label>Store ID</label>
            <input
              value={barcodeSheetStoreId}
              onChange={(e) => setBarcodeSheetStoreId(e.target.value)}
              placeholder="UUID or store code"
            />
          </div>
          <div className="control">
            <label>Tier</label>
            <select
              value={barcodeSheetTier}
              onChange={(e) => setBarcodeSheetTier(e.target.value as "tier1" | "tier2")}
              className="selectSmall"
            >
              <option value="tier1">Tier 1 (large)</option>
              <option value="tier2">Tier 2 (compact)</option>
            </select>
          </div>
          <div className="control">
            <label>&nbsp;</label>
            <button onClick={handleBarcodeSheetDownload} disabled={barcodeSheetBusy}>
              {barcodeSheetBusy ? "Working..." : "Download PDF"}
            </button>
          </div>
          <div className="control">
            <label>&nbsp;</label>
            <button onClick={handleBarcodeSheetShare} disabled={barcodeSheetBusy}>
              {barcodeSheetBusy ? "Working..." : "Share to WhatsApp"}
            </button>
          </div>
        </div>
      </div>

      <div className="cardHeader" style={{ paddingTop: 0 }}>
        <div className="cardTitle">Stores (activity)</div>
        <div className="muted">Activity summary in last {limit} events</div>
      </div>

      {stores.length === 0 ? (
        <div className="empty">No stores seen yet.</div>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Store ID</th>
                <th>Event count</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.storeId}>
                  <td className="mono">{s.storeId}</td>
                  <td className="mono">{s.eventCount}</td>
                  <td className="mono">{formatDateTime(s.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
