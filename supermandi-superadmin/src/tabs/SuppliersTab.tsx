// SA-001: Suppliers tab extracted from App.tsx
// T-188: Batch approval/rejection for pending products
import React, { Component, useEffect, useState } from "react";
import type { PendingSupplierRequest, VerifiedSupplier, PendingProduct, BankChangeEntry } from "../api/suppliers";
import { toggleAutoApproval, publishProduct, batchProductAction } from "../api/suppliers";
import { ConfirmDialog, type ConfirmDialogConfig } from "../components/ConfirmDialog";

// STG-822: Use Indian comma grouping for currency display
const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
function fmtInr(minor: number): string { return inrFmt.format(minor / 100); }

// FIX-048: Light error boundary for modal dialogs — shows close button instead of crashing app
// UNMAPPED.045: Reset hasError when resetKey changes (e.g., different product opened)
class ModalErrorBoundary extends Component<
  { children: React.ReactNode; onClose: () => void; resetKey?: string },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[FIX-048] Modal error boundary caught:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="sa-p-24 sa-text-center">
          <p className="sa-text-error sa-mb-12">Error loading data</p>
          <button className="sa-btn-ghost-sm" onClick={this.props.onClose}>Close</button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { formatDateTime, formatDate } from "../lib/formatters";
import { WhatsAppIcon } from "../components/WhatsAppIcon";

interface SuppliersTabProps {
  refreshSuppliers: () => void;
  suppliersLoading: boolean;
  suppliersError: string;
  supplierActionError: string;
  pendingSuppliers: PendingSupplierRequest[];
  verifiedSuppliers: VerifiedSupplier[];
  selectedSupplierForLink: Record<string, string>;
  setSelectedSupplierForLink: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  rejectReason: Record<string, string>;
  setRejectReason: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  supplierActionLoading: Record<string, boolean>;
  handleVerifySupplierDirectly: (requestId: string) => void;
  handleVerifySupplier: (requestId: string) => void;
  handleRejectSupplier: (requestId: string) => void;
  // Bank verifications
  bankChanges: BankChangeEntry[];
  bankVerifyLoading: Record<string, boolean>;
  bankRejectReason: Record<string, string>;
  setBankRejectReason: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  handleBankVerify: (supplierId: string, action: "approve" | "reject") => void;
  confirmedBankApprove: (supplierId: string) => void;
  // Verified suppliers
  supplierSearch: string;
  setSupplierSearch: (v: string) => void;
  requestSupplierStatusChange: (supplierId: string, businessName: string, action: "suspend" | "reactivate") => void;
  // Pending products
  pendingProducts: PendingProduct[];
  productActionError: string;
  productRejectReason: Record<string, string>;
  setProductRejectReason: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  productActionLoading: Record<string, boolean>;
  handleOpenEditProduct: (product: PendingProduct) => void;
  handleApproveProduct: (productId: string) => void | Promise<void>;
  handleApproveProductDirect: (productId: string) => Promise<void>;
  handleRejectProduct: (productId: string) => void;
  // Product edit modal
  editingProduct: PendingProduct | null;
  setEditingProduct: (p: PendingProduct | null) => void;
  handleCloseEditProduct: () => void;  // T-119: Close with dirty guard
  onModalDirty: (dirty: boolean) => void;  // T-119: Track unsaved changes
  editProductForm: {
    editedName: string;
    marginType: "fixed" | "percent";
    fixedMargin: string;
    percentMargin: string;
    bnplEligible: boolean;
    bnplMaxDays: string;
    invoiceModel: "buy_resell" | "platform_fee" | "";  // T-070
    hsnCode: string;  // T-070
    gstRate: string;  // T-070
  };
  setEditProductForm: (fn: (f: SuppliersTabProps["editProductForm"]) => SuppliersTabProps["editProductForm"]) => void;
  editProductError: string;
  editProductSuccess: string;
  editProductLoading: boolean;
  handleSubmitEditProduct: () => void;
}

export function SuppliersTab({
  refreshSuppliers,
  suppliersLoading,
  suppliersError,
  supplierActionError,
  pendingSuppliers,
  verifiedSuppliers,
  selectedSupplierForLink,
  setSelectedSupplierForLink,
  rejectReason,
  setRejectReason,
  supplierActionLoading,
  handleVerifySupplierDirectly,
  handleVerifySupplier,
  handleRejectSupplier,
  bankChanges,
  bankVerifyLoading,
  bankRejectReason,
  setBankRejectReason,
  handleBankVerify,
  confirmedBankApprove,
  supplierSearch,
  setSupplierSearch,
  requestSupplierStatusChange,
  pendingProducts,
  productActionError,
  productRejectReason,
  setProductRejectReason,
  productActionLoading,
  handleOpenEditProduct,
  handleApproveProduct,
  handleApproveProductDirect,
  handleRejectProduct,
  editingProduct,
  handleCloseEditProduct,
  onModalDirty,
  editProductForm,
  setEditProductForm,
  editProductError,
  editProductSuccess,
  editProductLoading,
  handleSubmitEditProduct,
}: SuppliersTabProps) {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);
  // T-119: Wrapper that marks form dirty on any edit
  function updateProductForm(fn: (f: SuppliersTabProps["editProductForm"]) => SuppliersTabProps["editProductForm"]) {
    setEditProductForm(fn);
    onModalDirty(true);
  }

  // T-066: Auto-approve toggle state
  const [autoApproveLoading, setAutoApproveLoading] = useState<Record<string, boolean>>({});
  // T-068: Publish button state
  const [publishLoading, setPublishLoading] = useState<Record<string, boolean>>({});
  const [publishResult, setPublishResult] = useState<Record<string, string>>({});

  // FIX-050: Clear stale publish state when product list refreshes
  // R2-FIX SUP-017: Also clear stale product selections
  useEffect(() => {
    setPublishLoading({});
    setPublishResult({});
    setSelectedProductIds(prev => {
      const validIds = new Set(pendingProducts.map(p => p.id));
      const filtered = new Set([...prev].filter(id => validIds.has(id)));
      return filtered.size === prev.size ? prev : filtered;
    });
  }, [pendingProducts]);
  // T-188: Batch selection state
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [batchActionLoading, setBatchActionLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string>("");
  const [batchRejectModalOpen, setBatchRejectModalOpen] = useState(false);
  const [batchRejectReason, setBatchRejectReason] = useState("");

  // T-188: Toggle single product selection
  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  // T-188: Select/deselect all pending products
  const toggleSelectAll = () => {
    if (selectedProductIds.size === pendingProducts.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(pendingProducts.map(p => p.id)));
    }
  };

  // T-188: Batch approve selected products
  const handleBatchApprove = async () => {
    if (selectedProductIds.size === 0) return;
    setBatchActionLoading(true);
    setBatchProgress(`Processing 0/${selectedProductIds.size}...`);
    try {
      const ids = Array.from(selectedProductIds);
      const result = await batchProductAction(ids, "approve");
      setBatchProgress(`Done: ${result.succeeded} approved, ${result.failed} failed`);
      setSelectedProductIds(new Set());
      refreshSuppliers();
    } catch (err: any) {
      setBatchProgress(`Error: ${err.message}`);
    } finally {
      setBatchActionLoading(false);
      setTimeout(() => setBatchProgress(""), 5000);
    }
  };

  // T-188: Batch reject selected products (opens modal for reason)
  const handleBatchRejectConfirm = async () => {
    if (selectedProductIds.size === 0 || batchRejectReason.length < 10) return;
    setBatchActionLoading(true);
    setBatchRejectModalOpen(false);
    setBatchProgress(`Processing 0/${selectedProductIds.size}...`);
    try {
      const ids = Array.from(selectedProductIds);
      const result = await batchProductAction(ids, "reject", batchRejectReason);
      setBatchProgress(`Done: ${result.succeeded} rejected, ${result.failed} failed`);
      setSelectedProductIds(new Set());
      setBatchRejectReason("");
      refreshSuppliers();
    } catch (err: any) {
      setBatchProgress(`Error: ${err.message}`);
    } finally {
      setBatchActionLoading(false);
      setTimeout(() => setBatchProgress(""), 5000);
    }
  };

  const handleToggleAutoApprove = async (supplierId: string, currentValue: boolean) => {
    setAutoApproveLoading(prev => ({ ...prev, [supplierId]: true }));
    try {
      await toggleAutoApproval(supplierId, !currentValue);
      refreshSuppliers();
    } catch (err: any) {
      // R2-FIX SUP-003: Surface auto-approve error to user
      setConfirmDialog({ title: "Error", message: err?.message || "Failed to toggle auto-approve", confirmLabel: "OK", variant: "info", onConfirm: () => setConfirmDialog(null) });
    } finally {
      setAutoApproveLoading(prev => ({ ...prev, [supplierId]: false }));
    }
  };

  const handlePublishProduct = async (productId: string) => {
    setPublishLoading(prev => ({ ...prev, [productId]: true }));
    setPublishResult(prev => ({ ...prev, [productId]: "" }));
    try {
      const result = await publishProduct(productId);
      setPublishResult(prev => ({ ...prev, [productId]: `Published to ${result.publishedToStores} stores` }));
      refreshSuppliers();
    } catch (err: any) {
      setPublishResult(prev => ({ ...prev, [productId]: `Error: ${err.message}` }));
    } finally {
      setPublishLoading(prev => ({ ...prev, [productId]: false }));
    }
  };

  return (
    <section className="card">
      <div className="cardHeader">
        <div>
          <div className="cardTitle">Pending Supplier Requests</div>
          <div className="muted">Retailers requesting to link suppliers - verify with platform suppliers or reject</div>
        </div>
        <button onClick={refreshSuppliers} disabled={suppliersLoading}>
          {suppliersLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {suppliersError && <div className="banner" role="alert" style={{ margin: "0 16px 12px" }}>{suppliersError}</div>}
      {supplierActionError && <div className="banner" role="alert" style={{ margin: "0 16px 12px" }}>{supplierActionError}</div>}

      {pendingSuppliers.filter(s => ["pending", "KYC_SUBMITTED", "PAYMENTS_SUBMITTED"].includes(s.status)).length === 0 ? (
        <div className="empty">
          {suppliersLoading ? "Loading pending requests..." : "No pending supplier requests."}
        </div>
      ) : (
        <div className="tableWrap">
          <div className="deviceGrid">
            {pendingSuppliers.filter(s => ["pending", "KYC_SUBMITTED", "PAYMENTS_SUBMITTED"].includes(s.status)).map((request) => (
              <div className="deviceCard" key={request.id}>
                <div className="deviceHeader">
                  <div className="deviceLabelInput" style={{ fontWeight: 600 }}>
                    {request.requestedName || "Unknown Supplier"}
                  </div>
                  <div className="badgeRow">
                    <span className="badge badgeWarn">Pending</span>
                  </div>
                </div>

                <div className="deviceMetaGrid">
                  <div>
                    <strong>Store:</strong> <span className="mono">{request.storeName || request.storeId}</span>
                  </div>
                  <div>
                    <strong>GSTIN:</strong> <span className="mono">{request.requestedGstin || "-"}</span>
                  </div>
                  <div className="sa-flex sa-gap-4">
                    <strong>Phone:</strong> <span className="mono">{request.requestedPhone || "-"}</span>
                    {request.requestedPhone && (
                      <button
                        onClick={() => window.open(`https://wa.me/${request.requestedPhone!.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(`Hi ${request.requestedName || 'there'}, this is SuperMandi admin.`)}`, '_blank', 'noopener,noreferrer')}
                        className="sa-btn-text sa-flex"
                        style={{ padding: 2 }}
                        title="Message on WhatsApp"
                        aria-label="Message on WhatsApp"
                      >
                        <WhatsAppIcon size={14} />
                      </button>
                    )}
                  </div>
                  <div>
                    <strong>Email:</strong> <span className="mono">{request.requestedEmail || "-"}</span>
                  </div>
                  <div>
                    <strong>Requested:</strong> <span className="mono">{formatDateTime(request.createdAt)}</span>
                  </div>
                </div>

                <div className="sa-mt-12">
                  <label className="sa-form-label">Link to Verified Supplier:</label>
                  <select
                    className="selectSmall"
                    style={{ width: "100%", marginBottom: 8 }}
                    value={selectedSupplierForLink[request.id] || ""}
                    onChange={(e) => setSelectedSupplierForLink((prev) => ({ ...prev, [request.id]: e.target.value }))}
                  >
                    <option value="">-- Select verified supplier --</option>
                    {verifiedSuppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.businessName} ({s.gstin}) - {s.city || "Unknown city"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sa-mt-8">
                  <label className="sa-form-label">Reject Reason (optional):</label>
                  <input
                    className="tableInput"
                    style={{ width: "100%", marginBottom: 8 }}
                    placeholder="Reason for rejection..."
                    value={rejectReason[request.id] || ""}
                    onChange={(e) => setRejectReason((prev) => ({ ...prev, [request.id]: e.target.value }))}
                  />
                </div>

                <div className="deviceActions" style={{ flexWrap: "wrap", gap: 8 }}>
                  <button
                    onClick={() => handleVerifySupplierDirectly(request.id)}
                    disabled={supplierActionLoading[request.id]}
                    style={{ background: "var(--color-primary)", color: "var(--color-text-inverse)" }}
                    title="Verify the supplier directly without linking to another"
                  >
                    {supplierActionLoading[request.id] ? "Verifying..." : "Verify Directly"}
                  </button>
                  <button
                    onClick={() => handleVerifySupplier(request.id)}
                    disabled={supplierActionLoading[request.id] || !selectedSupplierForLink[request.id]}
                    style={{ background: "var(--color-success)", color: "var(--color-text-inverse)" }}
                    title="Link to an existing verified supplier"
                  >
                    {supplierActionLoading[request.id] ? "Linking..." : "Link to Verified"}
                  </button>
                  <button
                    className="btnGhost"
                    onClick={() => {
                      // R1-FIX: Confirm before rejecting supplier request
                      setConfirmDialog({
                        title: "Reject Supplier Request",
                        message: `Reject supplier "${request.businessName || request.id}"? They will need to resubmit their application.`,
                        confirmLabel: "Reject",
                        variant: "danger",
                        onConfirm: () => { setConfirmDialog(null); handleRejectSupplier(request.id); },
                      });
                    }}
                    disabled={supplierActionLoading[request.id]}
                    style={{ color: "var(--color-error)" }}
                  >
                    {supplierActionLoading[request.id] ? "Rejecting..." : "Reject"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SA-P1-008: Pending Bank Verifications */}
      {bankChanges.length > 0 && (
        <div className="sa-mb-16">

          <div className="cardHeader">
            <div>
              <div className="cardTitle">
                Pending Bank Verifications
                <span className="badge badgeWarn" style={{ marginLeft: 8 }}>{bankChanges.length}</span>
              </div>
              <div className="muted">Suppliers who changed bank details — approve or reject before payouts resume</div>
            </div>
          </div>

          <div className="sa-flex-col sa-gap-12" style={{ padding: "0 16px 16px" }}>
            {bankChanges.map((bc) => (
              <div key={bc.id} className="card sa-p-16">
                <div className="sa-flex-between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <div className="sa-fw-600 sa-text-base">{bc.businessName}</div>
                    <div className="sa-text-sm sa-text-muted sa-mt-4">GSTIN: {bc.gstin}</div>
                    {bc.phone && <div className="sa-text-sm sa-text-muted">Phone: {bc.phone}</div>}
                  </div>
                  <div className="sa-text-right sa-text-xs sa-text-muted">
                    Changed: {formatDate(bc.updatedAt)}
                  </div>
                </div>

                <div className="sa-flex sa-gap-24 sa-mt-8 sa-text-md">
                  <div><span className="sa-text-muted">Account:</span> {bc.bankAccountMasked || "N/A"}</div>
                  <div><span className="sa-text-muted">IFSC:</span> {bc.bankIfsc || "N/A"}</div>
                  <div><span className="sa-text-muted">Holder:</span> {bc.bankAccountName || "N/A"}</div>
                </div>

                <div className="sa-flex sa-gap-8 sa-mt-12">
                  <button
                    className="sa-btn-success-sm"
                    onClick={() => confirmedBankApprove(bc.id)}
                    disabled={bankVerifyLoading[bc.id]}
                  >
                    {bankVerifyLoading[bc.id] ? "..." : "Approve Bank Details"}
                  </button>
                  <input
                    type="text"
                    className="sa-input sa-input--sm"
                    placeholder="Rejection reason (min 10 chars)"
                    value={bankRejectReason[bc.id] || ""}
                    onChange={(e) => setBankRejectReason((prev) => ({ ...prev, [bc.id]: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="sa-btn-danger-sm"
                    onClick={() => {
                      // R1-FIX: Confirm before rejecting bank details
                      setConfirmDialog({
                        title: "Reject Bank Details",
                        message: `Reject bank details for "${bc.businessName}"? Supplier payouts will be blocked until new details are submitted.`,
                        confirmLabel: "Reject Bank Details",
                        variant: "danger",
                        onConfirm: () => { setConfirmDialog(null); handleBankVerify(bc.id, "reject"); },
                      });
                    }}
                    disabled={bankVerifyLoading[bc.id] || (bankRejectReason[bc.id]?.length || 0) < 10}
                  >
                    {bankVerifyLoading[bc.id] ? "..." : "Reject"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="cardHeader" style={{ paddingTop: 0 }}>
        <div>
          <div className="cardTitle">Verified Suppliers (Platform)</div>
          <div className="muted">Search platform suppliers for linking to requests</div>
        </div>
      </div>

      <div className="tableWrap" style={{ paddingTop: 0 }}>
        <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div className="control">
            <label htmlFor="filter-suppliers-search">Search</label>
            <input
              id="filter-suppliers-search"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="GSTIN or business name..."
            />
          </div>
          <div className="control">
            <label>&nbsp;</label>
            <button onClick={refreshSuppliers} disabled={suppliersLoading}>
              Search
            </button>
          </div>
        </div>
      </div>

      {verifiedSuppliers.length === 0 ? (
        <div className="empty">
          {suppliersLoading ? "Loading verified suppliers..." : "No verified suppliers found. Try a different search."}
        </div>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Business Name</th>
                <th>GSTIN</th>
                <th>Contact</th>
                <th>Location</th>
                <th>Status</th>
                <th>Rating</th>
                <th>Auto-Approve</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {verifiedSuppliers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div>{s.businessName}</div>
                    {s.tradeName && <div className="muted">{s.tradeName}</div>}
                  </td>
                  <td className="mono">{s.gstin}</td>
                  <td>
                    <div className="sa-flex sa-gap-4">
                      <span className="mono">{s.primaryPhone || "-"}</span>
                      {s.primaryPhone && (
                        <button
                          onClick={() => window.open(`https://wa.me/${s.primaryPhone!.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(`Hi ${s.businessName}, this is SuperMandi admin.`)}`, '_blank', 'noopener,noreferrer')}
                          className="sa-btn-text sa-flex"
                          style={{ padding: 2 }}
                          title="Message on WhatsApp"
                          aria-label="Message on WhatsApp"
                        >
                          <WhatsAppIcon size={14} />
                        </button>
                      )}
                    </div>
                    <div className="muted">{s.primaryEmail || ""}</div>
                  </td>
                  <td>{[s.city, s.state].filter(Boolean).join(", ") || "-"}</td>
                  <td>
                    <span className={`badge ${s.verificationStatus === "SUSPENDED" ? "badgeError" : "badgeOk"}`}>
                      {s.verificationStatus === "SUSPENDED" ? "Suspended" : s.verificationStatus}
                    </span>
                  </td>
                  <td className="mono">{typeof s.rating === "number" ? s.rating.toFixed(1) : "-"}</td>
                  <td>
                    <button
                      onClick={() => {
                        // R1-FIX: Confirm auto-approve toggle (affects product pipeline)
                        const newState = !s.autoApproveProducts;
                        setConfirmDialog({
                          title: newState ? "Enable Auto-Approve" : "Disable Auto-Approve",
                          message: newState
                            ? `Enable auto-approve for "${s.businessName}"? All new products from this supplier will be approved automatically.`
                            : `Disable auto-approve for "${s.businessName}"? New products will require manual review.`,
                          confirmLabel: newState ? "Enable" : "Disable",
                          variant: newState ? "info" : "warning",
                          onConfirm: () => { setConfirmDialog(null); handleToggleAutoApprove(s.id, !!s.autoApproveProducts); },
                        });
                      }}
                      disabled={autoApproveLoading[s.id]}
                      className={s.autoApproveProducts ? "sa-btn-success-sm" : "sa-btn-ghost-sm"}
                    >
                      {autoApproveLoading[s.id] ? "..." : s.autoApproveProducts ? "ON" : "OFF"}
                    </button>
                  </td>
                  <td>
                    {s.verificationStatus === "SUSPENDED" ? (
                      <button
                        className="sa-btn-success-sm"
                        onClick={() => requestSupplierStatusChange(s.id, s.businessName, "reactivate")}
                      >
                        Reactivate
                      </button>
                    ) : (
                      <button
                        className="sa-btn-danger-sm"
                        onClick={() => requestSupplierStatusChange(s.id, s.businessName, "suspend")}
                      >
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SA-1.3-001 to SA-1.3-003: Pending Products Section */}
      <div className="cardHeader" style={{ paddingTop: 24, borderTop: "1px solid var(--color-border)" }}>
        <div>
          <div className="cardTitle">
            Pending Products
            {pendingProducts.length > 0 && (
              <span className="badge badgeWarn" style={{ marginLeft: 8 }}>
                {pendingProducts.length}
              </span>
            )}
          </div>
          <div className="muted">Supplier products awaiting approval - set margin and BNPL settings</div>
        </div>
      </div>

      {productActionError && <div className="banner" role="alert" style={{ margin: "0 16px 12px" }}>{productActionError}</div>}

      {/* T-188: Batch action buttons — shown when products exist */}
      {pendingProducts.length > 0 && (
        <div className="sa-flex sa-gap-8 sa-flex-wrap" style={{ padding: "0 16px 12px" }}>
          <label className="sa-flex sa-gap-6 sa-text-md" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={selectedProductIds.size === pendingProducts.length && pendingProducts.length > 0}
              onChange={toggleSelectAll}
              style={{ width: 16, height: 16 }}
            />
            Select All
          </label>
          {selectedProductIds.size > 0 && (
            <>
              <button
                className="sa-btn-success-sm sa-fw-600"
                onClick={handleBatchApprove}
                disabled={batchActionLoading}
                style={{ padding: "6px 14px" }}
              >
                {batchActionLoading ? "Processing..." : `Approve Selected (${selectedProductIds.size})`}
              </button>
              <button
                className="sa-btn-danger-sm sa-fw-600"
                onClick={() => setBatchRejectModalOpen(true)}
                disabled={batchActionLoading}
                style={{ padding: "6px 14px" }}
              >
                {batchActionLoading ? "Processing..." : `Reject Selected (${selectedProductIds.size})`}
              </button>
            </>
          )}
          {batchProgress && (
            <span className={`sa-text-sm sa-fw-500 ${batchProgress.startsWith("Error") ? "sa-text-error" : batchProgress.startsWith("Done") ? "sa-text-success" : "sa-text-muted"}`}>
              {batchProgress}
            </span>
          )}
        </div>
      )}

      {pendingProducts.length === 0 ? (
        <div className="empty">
          {suppliersLoading ? "Loading pending products..." : "No products pending approval."}
        </div>
      ) : (
        <div className="tableWrap">
          <div className="deviceGrid">
            {pendingProducts.map((product) => (
              <div className="deviceCard" key={product.id} style={{
                border: selectedProductIds.has(product.id) ? "2px solid var(--color-primary)" : undefined,
              }}>
                <div className="deviceHeader">
                  {/* T-188: Checkbox + T-162: Product image thumbnail (48x48) */}
                  <div className="sa-flex sa-gap-10" style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={selectedProductIds.has(product.id)}
                      onChange={() => toggleProductSelection(product.id)}
                      style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
                    />
                    {product.thumbnailUrl || product.imageUrl ? (
                      <img
                        src={product.thumbnailUrl || product.imageUrl || ""}
                        alt={product.productName}
                        style={{
                          width: 48,
                          height: 48,
                          objectFit: "cover",
                          borderRadius: 6,
                          border: "1px solid var(--color-border)",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        className="sa-flex-center sa-bg-surface-alt sa-text-muted sa-border sa-radius-6"
                        style={{ width: 48, height: 48, fontSize: 20, flexShrink: 0 }}
                        title="No product image"
                      >
                        &#128230;
                      </div>
                    )}
                    <div className="deviceLabelInput" style={{ fontWeight: 600 }}>
                      {product.productName}
                    </div>
                  </div>
                  <div className="badgeRow">
                    <span className="badge badgeWarn">Pending</span>
                  </div>
                </div>

                <div className="deviceMetaGrid">
                  <div>
                    <strong>Supplier:</strong> <span>{product.supplierName}</span>
                  </div>
                  <div>
                    <strong>Barcode:</strong> <span className="mono">{product.barcode || "-"}</span>
                  </div>
                  <div>
                    <strong>Purchase Price:</strong> <span className="mono">{fmtInr(product.purchasePrice)}</span>
                  </div>
                  <div>
                    <strong>MRP:</strong> <span className="mono">{fmtInr(product.mrp)}</span>
                  </div>
                  <div>
                    <strong>MOQ:</strong> <span className="mono">{product.moq || 1}</span>
                  </div>
                  <div>
                    <strong>Submitted:</strong> <span className="mono">{formatDateTime(product.createdAt)}</span>
                  </div>
                </div>

                <div className="sa-mt-8">
                  <label className="sa-form-label">Reject Reason (min 10 chars):</label>
                  <input
                    className="tableInput"
                    style={{ width: "100%", marginBottom: 8 }}
                    placeholder="Enter reason for rejection..."
                    value={productRejectReason[product.id] || ""}
                    onChange={(e) => setProductRejectReason((prev) => ({ ...prev, [product.id]: e.target.value }))}
                  />
                </div>

                <div className="deviceActions" style={{ flexWrap: "wrap", gap: 8 }}>
                  <button
                    onClick={() => handleOpenEditProduct(product)}
                    style={{ background: "var(--color-primary)", color: "var(--color-text-inverse)" }}
                    title="Edit product details, set margin and BNPL"
                  >
                    Edit / Set Margin
                  </button>
                  <button
                    onClick={() => handleApproveProduct(product.id)}
                    disabled={productActionLoading[product.id]}
                    style={{ background: "var(--color-success)", color: "var(--color-text-inverse)" }}
                    title="Approve this product"
                  >
                    {productActionLoading[product.id] ? "Approving..." : "Approve"}
                  </button>
                  <button
                    onClick={() => {
                      setConfirmDialog({
                        title: "Approve & Publish Product",
                        message: `Approve and publish "${product.productName}" to all linked stores?`,
                        confirmLabel: "Approve & Publish",
                        variant: "warning",
                        onConfirm: async () => {
                          setConfirmDialog(null);
                          try {
                            await handleApproveProductDirect(product.id);
                          } catch { return; }
                          await handlePublishProduct(product.id);
                        },
                      });
                    }}
                    disabled={productActionLoading[product.id] || publishLoading[product.id]}
                    style={{ background: "var(--color-primary)", color: "var(--color-text-inverse)" }}
                    title="Approve and publish to all linked stores"
                  >
                    {publishLoading[product.id] ? "Publishing..." : "Approve & Publish"}
                  </button>
                  <button
                    className="btnGhost"
                    onClick={() => handleRejectProduct(product.id)}
                    disabled={productActionLoading[product.id] || (productRejectReason[product.id]?.length || 0) < 10}
                    style={{ color: "var(--color-error)" }}
                    title="Reject this product"
                  >
                    {productActionLoading[product.id] ? "Rejecting..." : "Reject"}
                  </button>
                </div>
                {publishResult[product.id] && (
                  <div className={`sa-mt-4 sa-text-xs ${publishResult[product.id].startsWith("Error") ? "sa-text-error" : "sa-text-success"}`}>
                    {publishResult[product.id]}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* T-188: Batch Reject Modal — collects rejection reason for selected products */}
      {batchRejectModalOpen && (
        <div className="modalOverlay" onClick={() => setBatchRejectModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modalHeader">
              <h3 style={{ margin: 0 }}>Reject {selectedProductIds.size} Product{selectedProductIds.size !== 1 ? "s" : ""}</h3>
              <button className="btnGhost" onClick={() => setBatchRejectModalOpen(false)} aria-label="Close">&times;</button>
            </div>
            <div className="modalBody">
              <p className="sa-mb-12 sa-text-base sa-text-muted">
                Provide a reason for rejecting the selected products. This will be sent to the supplier.
              </p>
              <div className="control">
                <label>Rejection Reason (min 10 characters)</label>
                <textarea
                  value={batchRejectReason}
                  onChange={(e) => setBatchRejectReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  rows={3}
                  className="sa-textarea"
                />
              </div>
              {batchRejectReason.length > 0 && batchRejectReason.length < 10 && (
                <div className="sa-text-sm sa-text-error sa-mt-4">
                  Reason must be at least 10 characters ({batchRejectReason.length}/10)
                </div>
              )}
            </div>
            <div className="modalFooter">
              <button className="btnGhost" onClick={() => setBatchRejectModalOpen(false)}>Cancel</button>
              <button
                onClick={handleBatchRejectConfirm}
                disabled={batchRejectReason.length < 10 || batchActionLoading}
                style={{
                  background: batchRejectReason.length >= 10 ? "var(--color-error)" : "var(--color-surface-alt)",
                  color: batchRejectReason.length >= 10 ? "var(--color-text-inverse)" : "var(--color-text-secondary)",
                  border: "none", borderRadius: 4, padding: "8px 16px", fontSize: 14,
                  cursor: batchRejectReason.length >= 10 ? "pointer" : "default",
                }}
              >
                {batchActionLoading ? "Processing..." : `Reject ${selectedProductIds.size} Product${selectedProductIds.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Edit Modal (SA-1.3-003) + T-119: Dirty guard on close */}
      {editingProduct && (
        <div className="modalOverlay" onClick={handleCloseEditProduct}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500, maxHeight: "85vh", overflowY: "auto" }}>
            <div className="modalHeader">
              <h3 style={{ margin: 0 }}>Edit Product - Set Margin & BNPL</h3>
              <button className="btnGhost" onClick={handleCloseEditProduct} aria-label="Close product editor">&times;</button>
            </div>

            {/* FIX-048: Error boundary prevents malformed data from crashing entire app */}
            <ModalErrorBoundary onClose={handleCloseEditProduct} resetKey={editingProduct.id}>
            <div className="modalBody">
              {/* T-162: Larger product image preview (200x200) in detail modal */}
              <div className="sa-mb-16 sa-text-center">
                {editingProduct.imageUrl || editingProduct.thumbnailUrl ? (
                  <img
                    src={editingProduct.imageUrl || editingProduct.thumbnailUrl || ""}
                    alt={editingProduct.productName}
                    className="sa-border sa-radius-6"
                    style={{ width: 200, height: 200, objectFit: "cover", display: "inline-block" }}
                  />
                ) : (
                  <div
                    className="sa-bg-surface-alt sa-text-muted sa-border sa-radius-6 sa-flex-col sa-gap-8"
                    style={{ width: 200, height: 200, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <span style={{ fontSize: 40 }}>&#128230;</span>
                    <span className="sa-text-sm">No image</span>
                  </div>
                )}
              </div>
              <div className="sa-mb-12">
                <strong>Original Name:</strong> {editingProduct.productName}
              </div>
              <div className="sa-mb-12">
                <strong>Purchase Price:</strong> {fmtInr(editingProduct.purchasePrice)}
              </div>
              <div className="sa-mb-12">
                <strong>MRP:</strong> {fmtInr(editingProduct.mrp)}
              </div>

              <hr style={{ margin: "16px 0", borderColor: "var(--color-border)" }} />

              <div className="control" style={{ marginBottom: 16 }}>
                <label>Display Name (optional override)</label>
                <input
                  value={editProductForm.editedName}
                  onChange={(e) => updateProductForm((f) => ({ ...f, editedName: e.target.value }))}
                  placeholder={editingProduct.productName}
                />
              </div>

              <div className="control" style={{ marginBottom: 16 }}>
                <label>Margin Type</label>
                <select
                  value={editProductForm.marginType}
                  onChange={(e) => updateProductForm((f) => ({ ...f, marginType: e.target.value as "fixed" | "percent" }))}
                >
                  <option value="fixed">Fixed Amount (INR)</option>
                  <option value="percent">Percentage (%)</option>
                </select>
              </div>

              {editProductForm.marginType === "fixed" ? (
                <div className="control" style={{ marginBottom: 16 }}>
                  <label>Fixed Margin (INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editProductForm.fixedMargin}
                    onChange={(e) => updateProductForm((f) => ({ ...f, fixedMargin: e.target.value }))}
                    placeholder="e.g. 5.00"
                  />
                  <div className="muted" style={{ marginTop: 4 }}>
                    Retailer Price: {inrFmt.format((editingProduct.purchasePrice / 100) + (parseFloat(editProductForm.fixedMargin) || 0))}
                  </div>
                </div>
              ) : (
                <div className="control" style={{ marginBottom: 16 }}>
                  <label>Margin Percentage (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={editProductForm.percentMargin}
                    onChange={(e) => updateProductForm((f) => ({ ...f, percentMargin: e.target.value }))}
                    placeholder="e.g. 10"
                  />
                  <div className="muted" style={{ marginTop: 4 }}>
                    Retailer Price: {inrFmt.format((editingProduct.purchasePrice / 100) * (1 + (parseFloat(editProductForm.percentMargin) || 0) / 100))}
                  </div>
                </div>
              )}

              <div className="control" style={{ marginBottom: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={editProductForm.bnplEligible}
                    onChange={(e) => updateProductForm((f) => ({ ...f, bnplEligible: e.target.checked }))}
                  />
                  BNPL Eligible (Buy Now Pay Later)
                </label>
              </div>

              {editProductForm.bnplEligible && (
                <div className="control" style={{ marginBottom: 16 }}>
                  <label>BNPL Max Days</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={editProductForm.bnplMaxDays}
                    onChange={(e) => updateProductForm((f) => ({ ...f, bnplMaxDays: e.target.value }))}
                  />
                </div>
              )}

              <hr style={{ margin: "16px 0", borderColor: "var(--color-border)" }} />

              {/* T-070: Invoice Configuration */}
              <div className="control" style={{ marginBottom: 16 }}>
                <label>Invoice Model</label>
                <select
                  value={editProductForm.invoiceModel}
                  onChange={(e) => updateProductForm((f) => ({ ...f, invoiceModel: e.target.value as "buy_resell" | "platform_fee" | "" }))}
                >
                  <option value="buy_resell">Buy & Resell</option>
                  <option value="platform_fee">Platform Fee (Commission)</option>
                </select>
                <div className="muted" style={{ marginTop: 4 }}>
                  {editProductForm.invoiceModel === "platform_fee"
                    ? "Supplier sells directly; SuperMandi earns commission"
                    : "SuperMandi buys from supplier and resells to retailer"}
                </div>
              </div>

              <div className="control" style={{ marginBottom: 16 }}>
                <label>HSN Code</label>
                <input
                  value={editProductForm.hsnCode}
                  onChange={(e) => updateProductForm((f) => ({ ...f, hsnCode: e.target.value }))}
                  placeholder="e.g. 0713"
                />
              </div>

              <div className="control" style={{ marginBottom: 16 }}>
                <label>GST Rate (%)</label>
                <select
                  value={editProductForm.gstRate}
                  onChange={(e) => updateProductForm((f) => ({ ...f, gstRate: e.target.value }))}
                >
                  <option value="">Not set</option>
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>

              {editProductError && <div className="banner" role="alert">{editProductError}</div>}
              {editProductSuccess && <div className="muted" style={{ color: "var(--color-success)", marginTop: 8 }}>{editProductSuccess}</div>}
            </div>

            <div className="modalFooter">
              <button className="btnGhost" onClick={handleCloseEditProduct}>Cancel</button>
              <button
                onClick={handleSubmitEditProduct}
                disabled={editProductLoading}
                style={{ background: "var(--color-primary)", color: "var(--color-text-inverse)" }}
              >
                {editProductLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
            </ModalErrorBoundary>
          </div>
        </div>
      )}

      <div className="cardHeader" style={{ paddingTop: 24, borderTop: "1px solid var(--color-border)" }}>
        <div>
          <div className="cardTitle">Recently Processed</div>
          <div className="muted">Approved and rejected requests</div>
        </div>
      </div>

      {pendingSuppliers.filter(s => s.status !== "pending").length === 0 ? (
        <div className="empty">No processed requests yet.</div>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Requested Name</th>
                <th>GSTIN</th>
                <th>Status</th>
                <th>Processed</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {pendingSuppliers.filter(s => s.status !== "pending").map((request) => (
                <tr key={request.id}>
                  <td className="mono">{request.storeName || request.storeId}</td>
                  <td>{request.requestedName || "-"}</td>
                  <td className="mono">{request.requestedGstin || "-"}</td>
                  <td>
                    <span className={`badge ${request.status === "approved" ? "badgeOk" : "badgeError"}`}>
                      {request.status}
                    </span>
                  </td>
                  <td className="mono">
                    {request.reviewedAt ? formatDateTime(request.reviewedAt) : "-"}
                  </td>
                  <td>{request.reviewNotes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />}
    </section>
  );
}
