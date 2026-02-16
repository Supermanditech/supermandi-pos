// SA-001: Suppliers tab extracted from App.tsx
// T-188: Batch approval/rejection for pending products
import { useState } from "react";
import type { PendingSupplierRequest, VerifiedSupplier, PendingProduct, BankChangeEntry } from "../api/suppliers";
import { toggleAutoApproval, publishProduct, batchProductAction } from "../api/suppliers";
import { formatDateTime } from "../lib/formatters";

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
  handleRejectProduct,
  editingProduct,
  setEditingProduct,
  handleCloseEditProduct,
  onModalDirty,
  editProductForm,
  setEditProductForm,
  editProductError,
  editProductSuccess,
  editProductLoading,
  handleSubmitEditProduct,
}: SuppliersTabProps) {
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
    } catch (err) {
      console.error("Failed to toggle auto-approve:", err);
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

      {suppliersError && <div className="banner" style={{ margin: "0 16px 12px" }}>{suppliersError}</div>}
      {supplierActionError && <div className="banner" style={{ margin: "0 16px 12px" }}>{supplierActionError}</div>}

      {pendingSuppliers.filter(s => s.status === "pending").length === 0 ? (
        <div className="empty">
          {suppliersLoading ? "Loading pending requests..." : "No pending supplier requests."}
        </div>
      ) : (
        <div className="tableWrap">
          <div className="deviceGrid">
            {pendingSuppliers.filter(s => s.status === "pending").map((request) => (
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
                  <div>
                    <strong>Phone:</strong> <span className="mono">{request.requestedPhone || "-"}</span>
                  </div>
                  <div>
                    <strong>Email:</strong> <span className="mono">{request.requestedEmail || "-"}</span>
                  </div>
                  <div>
                    <strong>Requested:</strong> <span className="mono">{formatDateTime(request.createdAt)}</span>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Link to Verified Supplier:</label>
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

                <div style={{ marginTop: 8 }}>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Reject Reason (optional):</label>
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
                    style={{ background: "#3b82f6", color: "white" }}
                    title="Verify the supplier directly without linking to another"
                  >
                    {supplierActionLoading[request.id] ? "Verifying..." : "Verify Directly"}
                  </button>
                  <button
                    onClick={() => handleVerifySupplier(request.id)}
                    disabled={supplierActionLoading[request.id] || !selectedSupplierForLink[request.id]}
                    style={{ background: "#22c55e", color: "white" }}
                    title="Link to an existing verified supplier"
                  >
                    {supplierActionLoading[request.id] ? "Linking..." : "Link to Verified"}
                  </button>
                  <button
                    className="btnGhost"
                    onClick={() => handleRejectSupplier(request.id)}
                    disabled={supplierActionLoading[request.id]}
                    style={{ color: "#ef4444" }}
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
        <div style={{ marginBottom: 16 }}>
          <div className="cardHeader">
            <div>
              <div className="cardTitle">
                Pending Bank Verifications
                <span className="badge badgeWarn" style={{ marginLeft: 8 }}>{bankChanges.length}</span>
              </div>
              <div className="muted">Suppliers who changed bank details — approve or reject before payouts resume</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 16px 16px" }}>
            {bankChanges.map((bc) => (
              <div key={bc.id} className="card" style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{bc.businessName}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>GSTIN: {bc.gstin}</div>
                    {bc.phone && <div style={{ fontSize: 12, color: "#666" }}>Phone: {bc.phone}</div>}
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11, color: "#888" }}>
                    Changed: {new Date(bc.updatedAt).toLocaleDateString()}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 24, marginTop: 8, fontSize: 13 }}>
                  <div><span style={{ color: "#666" }}>Account:</span> {bc.bankAccountMasked || "N/A"}</div>
                  <div><span style={{ color: "#666" }}>IFSC:</span> {bc.bankIfsc || "N/A"}</div>
                  <div><span style={{ color: "#666" }}>Holder:</span> {bc.bankAccountName || "N/A"}</div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                  <button
                    className="btnPrimary"
                    onClick={() => confirmedBankApprove(bc.id)}
                    disabled={bankVerifyLoading[bc.id]}
                    style={{ fontSize: 12, padding: "4px 12px" }}
                  >
                    {bankVerifyLoading[bc.id] ? "..." : "Approve Bank Details"}
                  </button>
                  <input
                    type="text"
                    placeholder="Rejection reason (min 10 chars)"
                    value={bankRejectReason[bc.id] || ""}
                    onChange={(e) => setBankRejectReason((prev) => ({ ...prev, [bc.id]: e.target.value }))}
                    style={{ flex: 1, fontSize: 12, padding: "4px 8px", border: "1px solid #ddd", borderRadius: 4 }}
                  />
                  <button
                    className="btnGhost"
                    onClick={() => handleBankVerify(bc.id, "reject")}
                    disabled={bankVerifyLoading[bc.id]}
                    style={{ color: "#ef4444", fontSize: 12, padding: "4px 12px" }}
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
            <label>Search</label>
            <input
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
                    <div className="mono">{s.primaryPhone || "-"}</div>
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
                      onClick={() => handleToggleAutoApprove(s.id, !!s.autoApproveProducts)}
                      disabled={autoApproveLoading[s.id]}
                      style={{
                        padding: "4px 10px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer",
                        background: s.autoApproveProducts ? "#22c55e" : "#f3f4f6",
                        color: s.autoApproveProducts ? "#fff" : "#374151",
                      }}
                    >
                      {autoApproveLoading[s.id] ? "..." : s.autoApproveProducts ? "ON" : "OFF"}
                    </button>
                  </td>
                  <td>
                    {s.verificationStatus === "SUSPENDED" ? (
                      <button
                        style={{ background: "#16a34a", color: "white", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
                        onClick={() => requestSupplierStatusChange(s.id, s.businessName, "reactivate")}
                      >
                        Reactivate
                      </button>
                    ) : (
                      <button
                        className="btnDanger"
                        style={{ padding: "4px 10px", fontSize: 12 }}
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
      <div className="cardHeader" style={{ paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
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

      {productActionError && <div className="banner" style={{ margin: "0 16px 12px" }}>{productActionError}</div>}

      {/* T-188: Batch action buttons — shown when products exist */}
      {pendingProducts.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "0 16px 12px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
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
                onClick={handleBatchApprove}
                disabled={batchActionLoading}
                style={{
                  background: "#22c55e", color: "white", border: "none", borderRadius: 4,
                  padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600,
                }}
              >
                {batchActionLoading ? "Processing..." : `Approve Selected (${selectedProductIds.size})`}
              </button>
              <button
                onClick={() => setBatchRejectModalOpen(true)}
                disabled={batchActionLoading}
                style={{
                  background: "#ef4444", color: "white", border: "none", borderRadius: 4,
                  padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600,
                }}
              >
                {batchActionLoading ? "Processing..." : `Reject Selected (${selectedProductIds.size})`}
              </button>
            </>
          )}
          {batchProgress && (
            <span style={{
              fontSize: 12,
              color: batchProgress.startsWith("Error") ? "#dc2626" : batchProgress.startsWith("Done") ? "#16a34a" : "#6b7280",
              fontWeight: 500,
            }}>
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
                border: selectedProductIds.has(product.id) ? "2px solid #3b82f6" : undefined,
              }}>
                <div className="deviceHeader">
                  {/* T-188: Checkbox + T-162: Product image thumbnail (48x48) */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
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
                          border: "1px solid #e2e8f0",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 6,
                          background: "#f1f5f9",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#94a3b8",
                          fontSize: 20,
                          flexShrink: 0,
                          border: "1px solid #e2e8f0",
                        }}
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
                    <strong>Purchase Price:</strong> <span className="mono">INR {(product.purchasePrice / 100).toFixed(2)}</span>
                  </div>
                  <div>
                    <strong>MRP:</strong> <span className="mono">INR {(product.mrp / 100).toFixed(2)}</span>
                  </div>
                  <div>
                    <strong>MOQ:</strong> <span className="mono">{product.moq || 1}</span>
                  </div>
                  <div>
                    <strong>Submitted:</strong> <span className="mono">{formatDateTime(product.createdAt)}</span>
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Reject Reason (min 10 chars):</label>
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
                    style={{ background: "#6366f1", color: "white" }}
                    title="Edit product details, set margin and BNPL"
                  >
                    Edit / Set Margin
                  </button>
                  <button
                    onClick={() => handleApproveProduct(product.id)}
                    disabled={productActionLoading[product.id]}
                    style={{ background: "#22c55e", color: "white" }}
                    title="Approve this product"
                  >
                    {productActionLoading[product.id] ? "Approving..." : "Approve"}
                  </button>
                  <button
                    onClick={async () => {
                      // FIX-047: Await approval before publishing (was setTimeout race)
                      await handleApproveProduct(product.id);
                      await handlePublishProduct(product.id);
                    }}
                    disabled={productActionLoading[product.id] || publishLoading[product.id]}
                    style={{ background: "#2563eb", color: "white" }}
                    title="Approve and publish to all linked stores"
                  >
                    {publishLoading[product.id] ? "Publishing..." : "Approve & Publish"}
                  </button>
                  <button
                    className="btnGhost"
                    onClick={() => handleRejectProduct(product.id)}
                    disabled={productActionLoading[product.id] || (productRejectReason[product.id]?.length || 0) < 10}
                    style={{ color: "#ef4444" }}
                    title="Reject this product"
                  >
                    {productActionLoading[product.id] ? "Rejecting..." : "Reject"}
                  </button>
                </div>
                {publishResult[product.id] && (
                  <div style={{ marginTop: 4, fontSize: 11, color: publishResult[product.id].startsWith("Error") ? "#dc2626" : "#16a34a" }}>
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
              <p style={{ marginBottom: 12, fontSize: 14, color: "#6b7280" }}>
                Provide a reason for rejecting the selected products. This will be sent to the supplier.
              </p>
              <div className="control">
                <label>Rejection Reason (min 10 characters)</label>
                <textarea
                  value={batchRejectReason}
                  onChange={(e) => setBatchRejectReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  rows={3}
                  style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 14, resize: "vertical" }}
                />
              </div>
              {batchRejectReason.length > 0 && batchRejectReason.length < 10 && (
                <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
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
                  background: batchRejectReason.length >= 10 ? "#ef4444" : "#f3f4f6",
                  color: batchRejectReason.length >= 10 ? "white" : "#9ca3af",
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
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modalHeader">
              <h3 style={{ margin: 0 }}>Edit Product - Set Margin & BNPL</h3>
              <button className="btnGhost" onClick={handleCloseEditProduct} aria-label="Close product editor">&times;</button>
            </div>

            <div className="modalBody">
              {/* T-162: Larger product image preview (200x200) in detail modal */}
              <div style={{ marginBottom: 16, textAlign: "center" }}>
                {editingProduct.imageUrl || editingProduct.thumbnailUrl ? (
                  <img
                    src={editingProduct.imageUrl || editingProduct.thumbnailUrl || ""}
                    alt={editingProduct.productName}
                    style={{
                      width: 200,
                      height: 200,
                      objectFit: "cover",
                      borderRadius: 6,
                      border: "1px solid #e2e8f0",
                      display: "inline-block",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 200,
                      height: 200,
                      borderRadius: 6,
                      background: "#f1f5f9",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "column",
                      color: "#94a3b8",
                      border: "1px solid #e2e8f0",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 40 }}>&#128230;</span>
                    <span style={{ fontSize: 12 }}>No image</span>
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 12 }}>
                <strong>Original Name:</strong> {editingProduct.productName}
              </div>
              <div style={{ marginBottom: 12 }}>
                <strong>Purchase Price:</strong> INR {(editingProduct.purchasePrice / 100).toFixed(2)}
              </div>
              <div style={{ marginBottom: 12 }}>
                <strong>MRP:</strong> INR {(editingProduct.mrp / 100).toFixed(2)}
              </div>

              <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />

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
                    Retailer Price: INR {((editingProduct.purchasePrice / 100) + (parseFloat(editProductForm.fixedMargin) || 0)).toFixed(2)}
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
                    Retailer Price: INR {((editingProduct.purchasePrice / 100) * (1 + (parseFloat(editProductForm.percentMargin) || 0) / 100)).toFixed(2)}
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

              <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />

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

              {editProductError && <div className="banner">{editProductError}</div>}
              {editProductSuccess && <div className="muted" style={{ color: "#22c55e", marginTop: 8 }}>{editProductSuccess}</div>}
            </div>

            <div className="modalFooter">
              <button className="btnGhost" onClick={() => setEditingProduct(null)}>Cancel</button>
              <button
                onClick={handleSubmitEditProduct}
                disabled={editProductLoading}
                style={{ background: "#3b82f6", color: "white" }}
              >
                {editProductLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="cardHeader" style={{ paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
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
    </section>
  );
}
