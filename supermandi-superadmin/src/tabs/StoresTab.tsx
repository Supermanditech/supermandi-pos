// SA-001: Stores tab extracted from App.tsx
import React from "react";
import type { StoreRecord, StoreSettings, InvoiceSettings } from "../api/stores";
import { fetchInvoiceSettings, updateInvoiceSettings } from "../api/stores";
import type { GlobalFeatureFlag, StoreFeatureFlag } from "../api/featureFlags";
import type { EnrollmentRecord } from "../api/deviceEnrollments";
import { formatDateTime } from "../lib/formatters";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
// SA-P2-008: Bulk Import Notification
import { BulkImportNotifications } from "../components/BulkImportNotifications";

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
  storeSuspendLoading: boolean;
  // Contact editing
  getStoreContactDraft: (s: StoreRecord) => { address: string; contactName: string; contactPhone: string; contactEmail: string; gstin: string };
  updateStoreContactDraft: (storeId: string, patch: Partial<{ address: string; contactName: string; contactPhone: string; contactEmail: string; gstin: string }>) => void;
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
  revokeLoading: string | null;
  // #331: Resend welcome message (download links + activation instructions)
  handleResendCode?: (code: string) => void;
  resendLoading?: boolean;
  // ISSUE-063: Credit toggle
  handleCreditToggle: (storeId: string, enabled: boolean) => void;
  // SA-P1-014: Store settings audit view
  storeSettings: Record<string, StoreSettings>;
  storeSettingsLoading: Record<string, boolean>;
  loadStoreSettings: (storeId: string) => void;
  // SA-P2-007: BNPL limit adjustment
  handleBnplSave: (storeId: string, settings: { bnplEnabled: boolean; bnplCreditLimit: number; bnplMaxDays: number; creditEnabled: boolean; creditLimit: number }) => void;
  bnplSaving: Record<string, boolean>;
  // SA-P0-002: Discount limit
  handleDiscountLimitSave: (storeId: string, maxDiscountPercent: number) => void;
  discountLimitSaving: Record<string, boolean>;
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
  storeSuspendLoading,
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
  handleResendCode,
  resendLoading,
  handleCreditToggle,
  storeSettings,
  storeSettingsLoading,
  loadStoreSettings,
  handleBnplSave,
  bnplSaving,
  handleDiscountLimitSave,
  discountLimitSaving,
}: StoresTabProps) {
  // SA-P2-007: BNPL edit modal state
  const [bnplEditStoreId, setBnplEditStoreId] = React.useState<string | null>(null);
  const [bnplForm, setBnplForm] = React.useState({ bnplEnabled: false, bnplCreditLimitRupees: "0", bnplMaxDays: "7", creditEnabled: false, creditLimitRupees: "0" });

  function openBnplEdit(storeId: string, settings: StoreSettings) {
    setBnplEditStoreId(storeId);
    setBnplForm({
      bnplEnabled: settings.bnplEnabled,
      bnplCreditLimitRupees: String((settings.bnplCreditLimit || 0) / 100),
      bnplMaxDays: String(settings.bnplMaxDays || 7),
      creditEnabled: settings.creditEnabled,
      creditLimitRupees: String((settings.creditLimit || 0) / 100),
    });
  }

  function closeBnplEdit() {
    setBnplEditStoreId(null);
  }

  function submitBnplEdit() {
    if (!bnplEditStoreId) return;
    handleBnplSave(bnplEditStoreId, {
      bnplEnabled: bnplForm.bnplEnabled,
      bnplCreditLimit: Math.round(parseFloat(bnplForm.bnplCreditLimitRupees || "0") * 100),
      bnplMaxDays: parseInt(bnplForm.bnplMaxDays) || 7,
      creditEnabled: bnplForm.creditEnabled,
      creditLimit: Math.round(parseFloat(bnplForm.creditLimitRupees || "0") * 100),
    });
    closeBnplEdit();
  }

  // SA-P0-002: Discount limit inline edit state
  const [discountLimitEdits, setDiscountLimitEdits] = React.useState<Record<string, string>>({});

  function getDiscountLimitDraft(storeId: string, settings: StoreSettings): string {
    return discountLimitEdits[storeId] ?? String(settings.maxDiscountPercent ?? 100);
  }

  function submitDiscountLimit(storeId: string) {
    const raw = discountLimitEdits[storeId];
    if (raw === undefined) return;
    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) return;
    handleDiscountLimitSave(storeId, value);
    setDiscountLimitEdits((prev) => {
      const next = { ...prev };
      delete next[storeId];
      return next;
    });
  }

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
          <div className="banner sa-mt-12" role="alert">{createStoreError}</div>
        )}
        {createStoreSuccess && (
          <div className="muted sa-mt-12">{createStoreSuccess}</div>
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

        {storeError && <div className="banner sa-mt-12" role="alert">{storeError}</div>}
        {storeSuccess && <div className="muted sa-mt-12">{storeSuccess}</div>}

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

      {storeDirectoryError && <div className="banner" role="alert" style={{ margin: "0 16px 12px" }}>{storeDirectoryError}</div>}
      {storeNameError && <div className="banner" role="alert" style={{ margin: "0 16px 12px" }}>{storeNameError}</div>}
      {/* #186.12: Loading indicator when refreshing with existing data */}
      {storeDirectoryLoading && storeDirectory.length > 0 && (
        <div className="muted sa-text-sm" style={{ margin: "0 16px 8px" }}>Refreshing stores...</div>
      )}

      {/* SA-P1-007: Bulk feature flag toolbar */}
      {selectedStoreIds.size > 0 && (
        <div className="sa-flex sa-gap-8 sa-py-8 sa-px-12 sa-radius-6" style={{ background: "var(--color-primary-light)", margin: "0 16px 8px" }}>
          <span className="sa-text-md sa-fw-500">{selectedStoreIds.size} store(s) selected</span>
          <label htmlFor="filter-stores-bulk-flag" className="sa-sr-only">Feature flag</label>
          <select id="filter-stores-bulk-flag" value={bulkFlagKey} onChange={(e) => setBulkFlagKey(e.target.value)} className="sa-select sa-input--sm">
            <option value="">Select flag...</option>
            {featureFlags.map((f) => <option key={f.flag_key} value={f.flag_key}>{f.flag_key}</option>)}
          </select>
          <label htmlFor="filter-stores-bulk-action" className="sa-sr-only">Flag action</label>
          <select id="filter-stores-bulk-action" value={bulkFlagAction} onChange={(e) => setBulkFlagAction(e.target.value as "enable" | "disable")} className="sa-select sa-input--sm">
            <option value="enable">Enable</option>
            <option value="disable">Disable</option>
          </select>
          <button onClick={handleBulkFF} disabled={bulkFlagLoading || !bulkFlagKey}>
            {bulkFlagLoading ? "Applying..." : "Apply"}
          </button>
          <button className="btnGhost" onClick={() => setSelectedStoreIds(new Set())}>Clear</button>
          {bulkFlagResult && <span className="sa-text-sm sa-text-muted">{bulkFlagResult}</span>}
        </div>
      )}

      {storeDirectory.length === 0 ? (
        storeDirectoryLoading ? (
          /* UNMAPPED.044: Loading skeleton for initial store fetch */
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>&nbsp;</th>
                  <th>Store ID</th>
                  <th>Store Name</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map(i => (
                  <tr key={i}>
                    <td><div style={{ width: 14, height: 14, background: "var(--color-border)", borderRadius: 3 }} /></td>
                    <td><div style={{ height: 14, width: "80%", background: "var(--color-border)", borderRadius: 4 }} /></td>
                    <td><div style={{ height: 14, width: "70%", background: "var(--color-border)", borderRadius: 4 }} /></td>
                    <td><div style={{ height: 14, width: "50%", background: "var(--color-border)", borderRadius: 4 }} /></td>
                    <td><div style={{ height: 14, width: 60, background: "var(--color-border)", borderRadius: 4 }} /></td>
                    <td><div style={{ height: 14, width: 50, background: "var(--color-border)", borderRadius: 4 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No stores found.</div>
        )
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
                    aria-label="Select all stores"
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
                          aria-label={`Select store ${s.name ?? s.storeName ?? s.id}`}
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
                        <span className={`mono ${s.status === "SUSPENDED" ? "sa-badge-error" : s.status === "ACTIVE" ? "sa-badge-ok" : "sa-badge-muted"}`}>
                          {s.status ?? (s.active ? "ACTIVE" : "INACTIVE")}
                        </span>
                      </td>
                      <td className="sa-flex sa-gap-4 sa-flex-wrap">
                        <button onClick={() => handleStoreNameSave(s.id)} disabled={storeNameSaving[s.id]}>
                          {storeNameSaving[s.id] ? "Saving..." : "Save"}
                        </button>
                        {/* SA-ENROLL-UX G3: Generate QR button per store */}
                        <button
                          className="sa-btn-ghost-sm"
                          onClick={() => handleCreateEnrollmentForStore(s.id)}
                          disabled={enrollmentForStoreLoading === s.id}
                          title="Generate enrollment QR code for this store"
                        >
                          {enrollmentForStoreLoading === s.id ? "..." : "QR"}
                        </button>
                        {/* SA-P0-001: Suspend/Reactivate buttons */}
                        {s.status === "ACTIVE" && (
                          <button
                            className="sa-btn-danger-sm"
                            onClick={() => requestStoreStatusChange(s.id, s.name ?? s.storeName ?? s.id, "suspend")}
                            disabled={storeSuspendLoading}
                          >
                            Suspend
                          </button>
                        )}
                        {s.status === "SUSPENDED" && (
                          <button
                            className="sa-btn-success-sm"
                            onClick={() => requestStoreStatusChange(s.id, s.name ?? s.storeName ?? s.id, "reactivate")}
                            disabled={storeSuspendLoading}
                          >
                            Reactivate
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="sa-bg-surface-alt sa-p-12">
                          <div className="sa-grid-2 sa-gap-8" style={{ maxWidth: "600px" }}>
                            <div>
                              <label className="sa-form-label">Contact Name</label>
                              <input
                                className="tableInput"
                                value={contactDraft.contactName}
                                onChange={(e) => updateStoreContactDraft(s.id, { contactName: e.target.value })}
                                placeholder="Contact name"
                              />
                            </div>
                            <div>
                              <label className="sa-form-label">Phone</label>
                              <div className="sa-flex sa-gap-4">
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
                                    className="sa-btn-text sa-flex"
                                    style={{ padding: 2 }}
                                    title="Message on WhatsApp"
                                    aria-label="Message on WhatsApp"
                                  >
                                    <WhatsAppIcon size={18} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div>
                              <label className="sa-form-label">Email</label>
                              <input
                                className="tableInput"
                                value={contactDraft.contactEmail}
                                onChange={(e) => updateStoreContactDraft(s.id, { contactEmail: e.target.value })}
                                placeholder="email@example.com"
                              />
                            </div>
                            <div>
                              <label className="sa-form-label">Address</label>
                              <input
                                className="tableInput"
                                value={contactDraft.address}
                                onChange={(e) => updateStoreContactDraft(s.id, { address: e.target.value })}
                                placeholder="Store address"
                              />
                            </div>
                            <div>
                              <label className="sa-form-label">GSTIN</label>
                              <input
                                className="tableInput"
                                value={contactDraft.gstin}
                                onChange={(e) => updateStoreContactDraft(s.id, { gstin: e.target.value.toUpperCase() })}
                                placeholder="e.g. 27AABCU9603R1ZM"
                                maxLength={15}
                              />
                            </div>
                          </div>
                          {/* SA-P1-006: Payment method checkboxes */}
                          <div className="sa-mt-12">
                            <label className="sa-form-label sa-mb-6">Payment Methods</label>
                            <div className="sa-flex sa-gap-12 sa-flex-wrap">
                              {(["CASH", "UPI", "DUE"] as const).map((method) => {
                                const draft = getStorePaymentDraft(s);
                                return (
                                  <label key={method} className="sa-flex sa-gap-6" style={{ cursor: "pointer" }}>
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
                          {/* ISSUE-063: Credit enable toggle */}
                          <div className="sa-mt-12">
                            <label className="sa-form-label sa-mb-6">Credit / BNPL</label>
                            <div className="sa-flex sa-gap-12 sa-items-center">
                              <label className="sa-flex sa-gap-6" style={{ cursor: "pointer" }}>
                                <input
                                  type="checkbox"
                                  checked={s.creditEnabled ?? s.credit_enabled ?? false}
                                  onChange={() => handleCreditToggle(s.id, !(s.creditEnabled ?? s.credit_enabled ?? false))}
                                />
                                Enable Credit
                              </label>
                              <span className="sa-text-sm sa-text-muted">
                                Limit: ₹{((Number(s.creditLimit ?? s.credit_limit) || 0) / 100).toLocaleString("en-IN")}
                              </span>
                            </div>
                          </div>
                          {/* SA-P1-007: Per-store feature flag overrides */}
                          <div className="sa-mt-12">
                            <label className="sa-form-label sa-mb-6">Feature Flags</label>
                            {storeFFLoading[s.id] ? (
                              <span className="sa-text-sm sa-text-muted">Loading...</span>
                            ) : storeFeatureFlags[s.id] ? (
                              <div className="sa-flex sa-gap-12 sa-flex-wrap">
                                {storeFeatureFlags[s.id].map((f) => (
                                  <label key={f.flag_key} className="sa-flex sa-gap-4 sa-text-md" style={{ cursor: f.global_enabled ? "pointer" : "default", opacity: f.global_enabled ? 1 : 0.5 }}>
                                    <input
                                      type="checkbox"
                                      checked={f.effective}
                                      disabled={!f.global_enabled}
                                      onChange={() => handleStoreFFToggle(s.id, f)}
                                    />
                                    <span>{f.flag_key}</span>
                                    {f.store_override !== null && <span className="sa-text-xs sa-text-warning">(override)</span>}
                                    {!f.global_enabled && <span className="sa-text-xs sa-text-danger">(killed)</span>}
                                  </label>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          {/* SA-ENROLL-UX G5: Per-store enrollment codes */}
                          <div className="sa-mt-12">
                            <label className="sa-form-label sa-mb-6">Enrollment Codes</label>
                            {storeEnrollmentsLoading[s.id] ? (
                              <span className="sa-text-sm sa-text-muted">Loading...</span>
                            ) : storeEnrollments[s.id] && storeEnrollments[s.id].length > 0 ? (
                              <div className="sa-flex sa-gap-8 sa-flex-wrap">
                                {storeEnrollments[s.id].map((e) => {
                                  const badgeClass = e.status === "ACTIVE" ? "sa-badge-ok"
                                    : e.status === "REVOKED" ? "sa-badge-error"
                                    : e.status === "USED" ? "sa-badge-info"
                                    : "sa-badge-warn";
                                  return (
                                    <span key={e.id} className={`${badgeClass} sa-gap-6`} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500 }}>
                                      <span className="mono">{e.code}</span>
                                      <span>{e.status}</span>
                                      <span style={{ fontSize: 10, opacity: 0.7 }}>
                                        {e.uses_count}/{e.max_uses} uses
                                      </span>
                                      {e.status === "ACTIVE" && (
                                        <>
                                          <button
                                            onClick={() => handleRevokeEnrollment(e.code)}
                                            disabled={revokeLoading === e.code}
                                            className="sa-btn-text sa-text-danger" style={{ textDecoration: "underline", fontSize: 11 }}
                                            aria-label={`Revoke enrollment code ${e.code}`}
                                          >
                                            revoke
                                          </button>
                                          {handleResendCode && (
                                            <button
                                              onClick={() => handleResendCode(e.code)}
                                              disabled={resendLoading}
                                              className="sa-btn-text" style={{ textDecoration: "underline", fontSize: 11 }}
                                              aria-label={`Resend enrollment code ${e.code}`}
                                            >
                                              resend
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="sa-text-sm sa-text-muted">No enrollment codes yet</span>
                            )}
                          </div>
                          {/* GCP-STG-0358: Invoice Template Settings */}
                          <InvoiceSettingsSection storeId={s.id} />
                          {/* SA-P1-014: Store Settings (read-only audit view) */}
                          <div className="sa-mt-12">
                            <div className="sa-flex sa-gap-8 sa-items-center sa-mb-6">
                              <label className="sa-form-label" style={{ margin: 0 }}>Store Settings</label>
                              {!storeSettings[s.id] && !storeSettingsLoading[s.id] && (
                                <button
                                  className="sa-btn-ghost-sm"
                                  onClick={() => loadStoreSettings(s.id)}
                                  title="Load store settings for audit"
                                >
                                  View Settings
                                </button>
                              )}
                            </div>
                            {storeSettingsLoading[s.id] ? (
                              <span className="sa-text-sm sa-text-muted">Loading settings...</span>
                            ) : storeSettings[s.id] ? (
                              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 6, padding: 12 }}>
                                <table className="table" style={{ fontSize: 13 }}>
                                  <tbody>
                                    {/* Identity */}
                                    <tr><td colSpan={2} style={{ fontWeight: 600, paddingTop: 4, paddingBottom: 2, borderBottom: "1px solid var(--color-border)" }}>Identity</td></tr>
                                    <tr><td className="sa-text-muted" style={{ width: 180 }}>Store ID</td><td className="mono">{storeSettings[s.id].storeId}</td></tr>
                                    <tr><td className="sa-text-muted">Store Code</td><td className="mono">{storeSettings[s.id].code}</td></tr>
                                    <tr><td className="sa-text-muted">Store Type</td><td>{storeSettings[s.id].storeType ?? "-"}</td></tr>
                                    <tr><td className="sa-text-muted">Timezone</td><td>{storeSettings[s.id].timezone}</td></tr>
                                    <tr><td className="sa-text-muted">Currency</td><td>{storeSettings[s.id].currency}</td></tr>
                                    {/* Status */}
                                    <tr><td colSpan={2} style={{ fontWeight: 600, paddingTop: 8, paddingBottom: 2, borderBottom: "1px solid var(--color-border)" }}>Status</td></tr>
                                    <tr><td className="sa-text-muted">Status</td><td><span className={`mono ${storeSettings[s.id].status === "ACTIVE" ? "sa-badge-ok" : storeSettings[s.id].status === "SUSPENDED" ? "sa-badge-error" : "sa-badge-muted"}`}>{storeSettings[s.id].status}</span></td></tr>
                                    {storeSettings[s.id].statusReason && <tr><td className="sa-text-muted">Status Reason</td><td>{storeSettings[s.id].statusReason}</td></tr>}
                                    {storeSettings[s.id].statusUpdatedAt && <tr><td className="sa-text-muted">Status Updated</td><td className="mono">{formatDateTime(storeSettings[s.id].statusUpdatedAt!)}</td></tr>}
                                    <tr><td className="sa-text-muted">KYC Status</td><td>{storeSettings[s.id].kycStatus ?? "-"}</td></tr>
                                    {/* Contact / Address */}
                                    <tr><td colSpan={2} style={{ fontWeight: 600, paddingTop: 8, paddingBottom: 2, borderBottom: "1px solid var(--color-border)" }}>Contact / Address</td></tr>
                                    <tr><td className="sa-text-muted">Contact Name</td><td>{storeSettings[s.id].contactName ?? "-"}</td></tr>
                                    <tr><td className="sa-text-muted">Phone</td><td className="mono">{storeSettings[s.id].contactPhone ?? "-"}</td></tr>
                                    <tr><td className="sa-text-muted">Email</td><td>{storeSettings[s.id].contactEmail ?? "-"}</td></tr>
                                    <tr><td className="sa-text-muted">Address</td><td>{storeSettings[s.id].address ?? "-"}</td></tr>
                                    <tr><td className="sa-text-muted">City</td><td>{storeSettings[s.id].city ?? "-"}</td></tr>
                                    <tr><td className="sa-text-muted">State</td><td>{storeSettings[s.id].state ?? "-"}</td></tr>
                                    <tr><td className="sa-text-muted">Pincode</td><td className="mono">{storeSettings[s.id].pincode ?? "-"}</td></tr>
                                    {/* Payment */}
                                    <tr><td colSpan={2} style={{ fontWeight: 600, paddingTop: 8, paddingBottom: 2, borderBottom: "1px solid var(--color-border)" }}>Payment Settings</td></tr>
                                    <tr><td className="sa-text-muted">UPI VPA</td><td className="mono">{storeSettings[s.id].upiVpa ?? "-"}</td></tr>
                                    {storeSettings[s.id].upiVpaUpdatedAt && <tr><td className="sa-text-muted">UPI Updated</td><td className="mono">{formatDateTime(storeSettings[s.id].upiVpaUpdatedAt!)}</td></tr>}
                                    <tr><td className="sa-text-muted">Payment Methods</td><td>{storeSettings[s.id].allowedPaymentMethods.join(", ")}</td></tr>
                                    {/* Credit / BNPL */}
                                    <tr><td colSpan={2} style={{ fontWeight: 600, paddingTop: 8, paddingBottom: 2, borderBottom: "1px solid var(--color-border)" }}>Credit / BNPL</td></tr>
                                    <tr><td className="sa-text-muted">Credit Enabled</td><td className="mono">{storeSettings[s.id].creditEnabled ? "Yes" : "No"}</td></tr>
                                    <tr><td className="sa-text-muted">Credit Limit</td><td className="mono">{"\u20B9"}{((storeSettings[s.id].creditLimit || 0) / 100).toLocaleString("en-IN")}</td></tr>
                                    <tr><td className="sa-text-muted">BNPL Enabled</td><td className="mono">{storeSettings[s.id].bnplEnabled ? "Yes" : "No"}</td></tr>
                                    <tr><td className="sa-text-muted">BNPL Credit Limit</td><td className="mono">{"\u20B9"}{((storeSettings[s.id].bnplCreditLimit || 0) / 100).toLocaleString("en-IN")}</td></tr>
                                    <tr><td className="sa-text-muted">BNPL Max Days</td><td className="mono">{storeSettings[s.id].bnplMaxDays}</td></tr>
                                    <tr><td colSpan={2} style={{ paddingTop: 6 }}>
                                      <button
                                        className="btnSm"
                                        disabled={!!bnplSaving[s.id]}
                                        onClick={() => openBnplEdit(s.id, storeSettings[s.id])}
                                        data-testid={`edit-bnpl-${s.id}`}
                                      >
                                        {bnplSaving[s.id] ? "Saving..." : "Edit BNPL Settings"}
                                      </button>
                                    </td></tr>
                                    {/* SA-P0-002: Discount Limits */}
                                    <tr><td colSpan={2} style={{ fontWeight: 600, paddingTop: 8, paddingBottom: 2, borderBottom: "1px solid var(--color-border)" }}>Discount Limits</td></tr>
                                    <tr>
                                      <td className="sa-text-muted">Max Discount %</td>
                                      <td>
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          step="0.01"
                                          className="sa-input mono"
                                          style={{ width: 80, marginRight: 8 }}
                                          value={getDiscountLimitDraft(s.id, storeSettings[s.id])}
                                          onChange={(e) => setDiscountLimitEdits((prev) => ({ ...prev, [s.id]: e.target.value }))}
                                          data-testid={`discount-limit-input-${s.id}`}
                                        />
                                        <button
                                          className="btnSm"
                                          disabled={!!discountLimitSaving[s.id] || discountLimitEdits[s.id] === undefined}
                                          onClick={() => submitDiscountLimit(s.id)}
                                          data-testid={`discount-limit-save-${s.id}`}
                                        >
                                          {discountLimitSaving[s.id] ? "Saving..." : "Save"}
                                        </button>
                                      </td>
                                    </tr>
                                    {/* Readiness Flags */}
                                    <tr><td colSpan={2} style={{ fontWeight: 600, paddingTop: 8, paddingBottom: 2, borderBottom: "1px solid var(--color-border)" }}>Readiness Flags</td></tr>
                                    <tr><td className="sa-text-muted">Device Bound</td><td className="mono">{storeSettings[s.id].deviceBound ? "Yes" : "No"}</td></tr>
                                    <tr><td className="sa-text-muted">KYC Complete</td><td className="mono">{storeSettings[s.id].kycComplete ? "Yes" : "No"}</td></tr>
                                    <tr><td className="sa-text-muted">UPI Complete</td><td className="mono">{storeSettings[s.id].upiComplete ? "Yes" : "No"}</td></tr>
                                    <tr><td className="sa-text-muted">Admin Approved</td><td className="mono">{storeSettings[s.id].adminApproved ? "Yes" : "No"}</td></tr>
                                    {/* Device Info */}
                                    <tr><td colSpan={2} style={{ fontWeight: 600, paddingTop: 8, paddingBottom: 2, borderBottom: "1px solid var(--color-border)" }}>Device Info</td></tr>
                                    <tr><td className="sa-text-muted">Active Devices</td><td className="mono">{storeSettings[s.id].activeDeviceCount}</td></tr>
                                    <tr><td className="sa-text-muted">POS Device ID</td><td className="mono">{storeSettings[s.id].posDeviceId ?? "-"}</td></tr>
                                    <tr><td className="sa-text-muted">Scan V2 Enabled</td><td className="mono">{storeSettings[s.id].scanLookupV2Enabled ? "Yes" : "No"}</td></tr>
                                    {/* Feature Flags */}
                                    {storeSettings[s.id].featureFlags.length > 0 && (
                                      <>
                                        <tr><td colSpan={2} style={{ fontWeight: 600, paddingTop: 8, paddingBottom: 2, borderBottom: "1px solid var(--color-border)" }}>Feature Flags</td></tr>
                                        {storeSettings[s.id].featureFlags.map((f) => (
                                          <tr key={f.flag_key}>
                                            <td className="sa-text-muted">{f.flag_key} <span className="sa-text-xs sa-text-muted">({f.scope_type})</span></td>
                                            <td className="mono">{f.enabled ? "Enabled" : "Disabled"}</td>
                                          </tr>
                                        ))}
                                      </>
                                    )}
                                    {/* Timestamps */}
                                    <tr><td colSpan={2} style={{ fontWeight: 600, paddingTop: 8, paddingBottom: 2, borderBottom: "1px solid var(--color-border)" }}>Timestamps</td></tr>
                                    <tr><td className="sa-text-muted">Created</td><td className="mono">{formatDateTime(storeSettings[s.id].createdAt)}</td></tr>
                                    <tr><td className="sa-text-muted">Updated</td><td className="mono">{formatDateTime(storeSettings[s.id].updatedAt)}</td></tr>
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
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

      {barcodeSheetError && <div className="banner" role="alert" style={{ margin: "0 16px 12px" }}>{barcodeSheetError}</div>}
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
            <label htmlFor="filter-stores-barcode-tier">Tier</label>
            <select
              id="filter-stores-barcode-tier"
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

      {/* SA-P2-007: BNPL Edit Modal */}
      {bnplEditStoreId && (
        <div className="modal-overlay" data-testid="bnpl-edit-modal" onClick={closeBnplEdit}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="cardHeader">
              <div className="cardTitle">Edit BNPL Settings</div>
            </div>
            <div style={{ padding: "0 16px 16px" }}>
              <div className="sa-mb-12">
                <label className="sa-flex sa-gap-6" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={bnplForm.bnplEnabled}
                    onChange={(e) => setBnplForm((f) => ({ ...f, bnplEnabled: e.target.checked }))}
                    data-testid="bnpl-enabled-toggle"
                  />
                  BNPL Enabled
                </label>
              </div>
              <div className="sa-mb-12">
                <label className="sa-form-label">BNPL Credit Limit (Rs)</label>
                <input
                  className="tableInput"
                  type="number"
                  min="0"
                  step="100"
                  value={bnplForm.bnplCreditLimitRupees}
                  onChange={(e) => setBnplForm((f) => ({ ...f, bnplCreditLimitRupees: e.target.value }))}
                  data-testid="bnpl-credit-limit-input"
                />
              </div>
              <div className="sa-mb-12">
                <label className="sa-form-label">BNPL Max Days (1-90)</label>
                <input
                  className="tableInput"
                  type="number"
                  min="1"
                  max="90"
                  value={bnplForm.bnplMaxDays}
                  onChange={(e) => setBnplForm((f) => ({ ...f, bnplMaxDays: e.target.value }))}
                  data-testid="bnpl-max-days-input"
                />
              </div>
              <hr style={{ margin: "12px 0", borderColor: "var(--color-border)" }} />
              <div className="sa-mb-12">
                <label className="sa-flex sa-gap-6" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={bnplForm.creditEnabled}
                    onChange={(e) => setBnplForm((f) => ({ ...f, creditEnabled: e.target.checked }))}
                    data-testid="credit-enabled-toggle"
                  />
                  Credit Enabled
                </label>
              </div>
              <div className="sa-mb-12">
                <label className="sa-form-label">Credit Limit (Rs)</label>
                <input
                  className="tableInput"
                  type="number"
                  min="0"
                  step="100"
                  value={bnplForm.creditLimitRupees}
                  onChange={(e) => setBnplForm((f) => ({ ...f, creditLimitRupees: e.target.value }))}
                  data-testid="credit-limit-input"
                />
              </div>
              <div className="sa-flex sa-gap-12" style={{ justifyContent: "flex-end", marginTop: 16 }}>
                <button className="btnSm" onClick={closeBnplEdit} data-testid="bnpl-cancel-btn">Cancel</button>
                <button className="btnSm" onClick={submitBnplEdit} data-testid="bnpl-save-btn" style={{ fontWeight: 600 }}>Save BNPL Settings</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SA-P2-008: Bulk Import Notification */}
      <BulkImportNotifications />
    </section>
  );
}

// =============================================================================
// GCP-STG-0358: Invoice Template Settings — self-contained section per store
// =============================================================================

const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  logoUrl: null,
  headerText: null,
  footerText: "Thank you for your business!",
  termsAndConditions: null,
  showGstin: true,
  showHsn: true,
  autoSendWhatsApp: false,
  autoSendOnSale: false,
  autoSendOnPo: false,
  autoSendOnGrn: false,
};

function InvoiceSettingsSection({ storeId }: { storeId: string }) {
  const [settings, setSettings] = React.useState<InvoiceSettings | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [draft, setDraft] = React.useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS);

  async function loadSettings() {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await fetchInvoiceSettings(storeId);
      const merged = { ...DEFAULT_INVOICE_SETTINGS, ...data };
      setSettings(merged);
      setDraft(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice settings");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updateInvoiceSettings(storeId, draft);
      setSettings({ ...draft });
      setSuccess("Invoice settings saved.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save invoice settings");
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(patch: Partial<InvoiceSettings>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  const isDirty = settings !== null && JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <div className="sa-mt-12" data-testid="invoice-settings-section">
      <div className="sa-flex sa-gap-8 sa-items-center sa-mb-6">
        <label className="sa-form-label" style={{ margin: 0 }}>Invoice Settings</label>
        {!settings && !loading && (
          <button
            className="sa-btn-ghost-sm"
            onClick={loadSettings}
            data-testid="invoice-settings-load-btn"
            title="Load invoice template settings"
          >
            View Invoice Settings
          </button>
        )}
      </div>

      {loading && <div className="muted">Loading invoice settings...</div>}
      {error && <div className="banner sa-mt-6" role="alert" data-testid="invoice-settings-error">{error}</div>}
      {success && <div className="muted sa-mt-6" data-testid="invoice-settings-success">{success}</div>}

      {settings && !loading && (
        <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: 12 }} data-testid="invoice-settings-form">
          {/* Header Text */}
          <div className="sa-mb-12">
            <label className="sa-form-label">Header Text</label>
            <input
              className="tableInput"
              type="text"
              value={draft.headerText ?? ""}
              onChange={(e) => updateDraft({ headerText: e.target.value || null })}
              placeholder="Invoice header text"
              data-testid="invoice-header-text"
            />
          </div>

          {/* Footer Text */}
          <div className="sa-mb-12">
            <label className="sa-form-label">Footer Text</label>
            <input
              className="tableInput"
              type="text"
              value={draft.footerText ?? ""}
              onChange={(e) => updateDraft({ footerText: e.target.value || null })}
              placeholder="Thank you for your business!"
              data-testid="invoice-footer-text"
            />
          </div>

          {/* Terms & Conditions */}
          <div className="sa-mb-12">
            <label className="sa-form-label">Terms &amp; Conditions</label>
            <textarea
              className="tableInput"
              rows={3}
              value={draft.termsAndConditions ?? ""}
              onChange={(e) => updateDraft({ termsAndConditions: e.target.value || null })}
              placeholder="Terms and conditions for invoices..."
              style={{ resize: "vertical", width: "100%" }}
              data-testid="invoice-terms"
            />
          </div>

          {/* Checkboxes — Display options */}
          <div className="sa-mb-12">
            <label className="sa-form-label" style={{ marginBottom: 6 }}>Display Options</label>
            <div className="sa-flex sa-gap-12" style={{ flexWrap: "wrap" }}>
              <label className="sa-flex sa-gap-6" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={draft.showGstin}
                  onChange={(e) => updateDraft({ showGstin: e.target.checked })}
                  data-testid="invoice-show-gstin"
                />
                Show GSTIN
              </label>
              <label className="sa-flex sa-gap-6" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={draft.showHsn}
                  onChange={(e) => updateDraft({ showHsn: e.target.checked })}
                  data-testid="invoice-show-hsn"
                />
                Show HSN
              </label>
            </div>
          </div>

          {/* GCP-STG-0359: WhatsApp Dispatch Policy */}
          <div className="sa-mb-12" data-testid="whatsapp-dispatch-policy">
            <label className="sa-form-label" style={{ marginBottom: 6 }}>WhatsApp Dispatch Policy</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="sa-flex sa-gap-6" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={draft.autoSendWhatsApp}
                  onChange={(e) => updateDraft({ autoSendWhatsApp: e.target.checked })}
                  data-testid="invoice-auto-send-whatsapp"
                />
                <span>Enable WhatsApp auto-dispatch (master toggle)</span>
              </label>
              <div style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, opacity: draft.autoSendWhatsApp ? 1 : 0.5 }}>
                <label className="sa-flex sa-gap-6" style={{ cursor: draft.autoSendWhatsApp ? "pointer" : "not-allowed" }}>
                  <input
                    type="checkbox"
                    checked={draft.autoSendOnSale}
                    onChange={(e) => updateDraft({ autoSendOnSale: e.target.checked })}
                    disabled={!draft.autoSendWhatsApp}
                    data-testid="invoice-auto-send-on-sale"
                  />
                  <span>Auto-send invoice on POS sale</span>
                </label>
                <label className="sa-flex sa-gap-6" style={{ cursor: draft.autoSendWhatsApp ? "pointer" : "not-allowed" }}>
                  <input
                    type="checkbox"
                    checked={draft.autoSendOnPo}
                    onChange={(e) => updateDraft({ autoSendOnPo: e.target.checked })}
                    disabled={!draft.autoSendWhatsApp}
                    data-testid="invoice-auto-send-on-po"
                  />
                  <span>Auto-send PO to supplier</span>
                </label>
                <label className="sa-flex sa-gap-6" style={{ cursor: draft.autoSendWhatsApp ? "pointer" : "not-allowed" }}>
                  <input
                    type="checkbox"
                    checked={draft.autoSendOnGrn}
                    onChange={(e) => updateDraft({ autoSendOnGrn: e.target.checked })}
                    disabled={!draft.autoSendWhatsApp}
                    data-testid="invoice-auto-send-on-grn"
                  />
                  <span>Auto-send GRN confirmation</span>
                </label>
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="sa-flex sa-gap-8" style={{ alignItems: "center" }}>
            <button
              className="btnSm"
              onClick={handleSave}
              disabled={saving || !isDirty}
              data-testid="invoice-settings-save-btn"
              style={{ fontWeight: 600 }}
            >
              {saving ? "Saving..." : "Save Invoice Settings"}
            </button>
            {isDirty && <span className="muted" style={{ fontSize: 12 }}>Unsaved changes</span>}
          </div>
        </div>
      )}
    </div>
  );
}
