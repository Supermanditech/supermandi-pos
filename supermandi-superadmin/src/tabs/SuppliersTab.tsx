// SA-001: Suppliers tab extracted from App.tsx
import type { PendingSupplierRequest, VerifiedSupplier, PendingProduct, BankChangeEntry } from "../api/suppliers";
import { formatDateTime, formatCurrency } from "../lib/formatters";

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
  handleApproveProduct: (productId: string) => void;
  handleRejectProduct: (productId: string) => void;
  // Product edit modal
  editingProduct: PendingProduct | null;
  setEditingProduct: (p: PendingProduct | null) => void;
  editProductForm: {
    editedName: string;
    marginType: "fixed" | "percent";
    fixedMargin: string;
    percentMargin: string;
    bnplEligible: boolean;
    bnplMaxDays: string;
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
  editProductForm,
  setEditProductForm,
  editProductError,
  editProductSuccess,
  editProductLoading,
  handleSubmitEditProduct,
}: SuppliersTabProps) {
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
                    onClick={() => handleBankVerify(bc.id, "approve")}
                    disabled={bankVerifyLoading[bc.id]}
                    style={{ fontSize: 12, padding: "4px 12px" }}
                  >
                    {bankVerifyLoading[bc.id] ? "..." : "Approve Bank Details"}
                  </button>
                  <input
                    type="text"
                    placeholder="Rejection reason (min 5 chars)"
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

      {pendingProducts.length === 0 ? (
        <div className="empty">
          {suppliersLoading ? "Loading pending products..." : "No products pending approval."}
        </div>
      ) : (
        <div className="tableWrap">
          <div className="deviceGrid">
            {pendingProducts.map((product) => (
              <div className="deviceCard" key={product.id}>
                <div className="deviceHeader">
                  <div className="deviceLabelInput" style={{ fontWeight: 600 }}>
                    {product.productName}
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
                    className="btnGhost"
                    onClick={() => handleRejectProduct(product.id)}
                    disabled={productActionLoading[product.id] || (productRejectReason[product.id]?.length || 0) < 10}
                    style={{ color: "#ef4444" }}
                    title="Reject this product"
                  >
                    {productActionLoading[product.id] ? "Rejecting..." : "Reject"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Product Edit Modal (SA-1.3-003) */}
      {editingProduct && (
        <div className="modalOverlay" onClick={() => setEditingProduct(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modalHeader">
              <h3 style={{ margin: 0 }}>Edit Product - Set Margin & BNPL</h3>
              <button className="btnGhost" onClick={() => setEditingProduct(null)}>&times;</button>
            </div>

            <div className="modalBody">
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
                  onChange={(e) => setEditProductForm((f) => ({ ...f, editedName: e.target.value }))}
                  placeholder={editingProduct.productName}
                />
              </div>

              <div className="control" style={{ marginBottom: 16 }}>
                <label>Margin Type</label>
                <select
                  value={editProductForm.marginType}
                  onChange={(e) => setEditProductForm((f) => ({ ...f, marginType: e.target.value as "fixed" | "percent" }))}
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
                    onChange={(e) => setEditProductForm((f) => ({ ...f, fixedMargin: e.target.value }))}
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
                    onChange={(e) => setEditProductForm((f) => ({ ...f, percentMargin: e.target.value }))}
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
                    onChange={(e) => setEditProductForm((f) => ({ ...f, bnplEligible: e.target.checked }))}
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
                    onChange={(e) => setEditProductForm((f) => ({ ...f, bnplMaxDays: e.target.value }))}
                  />
                </div>
              )}

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
