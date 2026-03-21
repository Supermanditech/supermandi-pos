// SA-P2-006: Product Category Manual Override — SuperAdmin Catalog Tab
// GCP-STG-0071: Approve/Reject supplier products
// GCP-STG-0072: Set margin per SKU
// GCP-STG-0075: Full product metadata editing
import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchCategories,
  fetchProducts,
  overrideProductCategory,
  updateProductConversion,
  approveProduct,
  rejectProduct,
  setProductMargin,
  editProductMetadata,
  type CategorySummary,
  type CatalogProduct,
} from "../api/catalog";
import toast from "react-hot-toast";
import { TableSkeleton } from "../components/TableSkeleton";

export function CatalogTab() {
  // State
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const LIMIT = 50;

  // Edit modal state
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  // V3-FIX-169: Conversion editing state
  const [editProcurementUnit, setEditProcurementUnit] = useState("");
  const [editProcurementPackQty, setEditProcurementPackQty] = useState("");
  const [editBaseStockUnit, setEditBaseStockUnit] = useState("");
  const [editSplitSellEligible, setEditSplitSellEligible] = useState(false);
  // V3-FIX-169: "Sells as" approval
  const [editSellUnit, setEditSellUnit] = useState("");
  const [editDefaultVariants, setEditDefaultVariants] = useState("");
  // GCP-STG-0072: Margin editing state
  const [editMarginPct, setEditMarginPct] = useState("");
  const [editMarginFixed, setEditMarginFixed] = useState("");
  // GCP-STG-0075: Metadata editing state
  const [editName, setEditName] = useState("");
  // GCP-STG-0087: Billing model state
  const [editBillingModel, setEditBillingModel] = useState("SUPERMANDI_PRINCIPAL");

  // GCP-STG-0071: Reject modal state
  const [rejectingProduct, setRejectingProduct] = useState<CatalogProduct | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);

  // In-flight action guard
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  // R4-NET-007: In-flight guard
  const refreshInFlight = useRef(false);

  // Load categories
  const loadCategories = useCallback(async () => {
    try {
      const cats = await fetchCategories();
      setCategories(cats);
    } catch (err: unknown) {
      // Non-fatal — categories sidebar is supplementary
      console.warn("Failed to load categories:", err);
    }
  }, []);

  // Load products
  const loadProducts = useCallback(async (pageNum: number, searchTerm: string, category: string) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchProducts({
        page: pageNum,
        limit: LIMIT,
        q: searchTerm || undefined,
        category: category || undefined,
      });
      setProducts(result.data);
      setTotal(result.pagination.total);
      setHasMore(result.pagination.hasMore);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
      refreshInFlight.current = false;
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadProducts(page, search, selectedCategory);
  }, [page, search, selectedCategory, loadProducts]);

  // Debounced search
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  };

  // Category filter
  const handleCategoryFilter = (cat: string) => {
    setSelectedCategory(cat === selectedCategory ? "" : cat);
    setPage(1);
  };

  // Open edit modal
  const openEdit = (product: CatalogProduct) => {
    setEditingProduct(product);
    setEditCategory(product.editedCategory || product.originalCategory || "");
    setEditName(product.displayName || product.name || "");
    // V3-FIX-169: Populate conversion fields
    setEditProcurementUnit((product as any).procurementUnit || (product as any).unit || "");
    setEditProcurementPackQty((product as any).procurementPackQty ? String((product as any).procurementPackQty) : "1");
    setEditBaseStockUnit((product as any).baseStockUnit || "");
    setEditSplitSellEligible((product as any).splitSellEligible || false);
    // V3-FIX-169: Sells-as — load from saved data, fallback to suggestion
    setEditSellUnit((product as any).sellUnit || (product as any).baseStockUnit || "");
    setEditDefaultVariants(
      (product as any).defaultVariants ||
      ((product as any).baseStockUnit === "KG" ? "250g, 500g, 1kg, 5kg" :
       (product as any).baseStockUnit === "LTR" ? "250ml, 500ml, 1L" :
       (product as any).baseStockUnit === "PCS" ? "1pc, 6pcs, 12pcs" : "")
    );
    // GCP-STG-0072: Margin fields — empty means no change
    setEditMarginPct("");
    setEditMarginFixed("");
    // GCP-STG-0087: Billing model
    setEditBillingModel((product as any).billingModel || "SUPERMANDI_PRINCIPAL");
  };

  // GCP-STG-0071: Approve product
  const handleApprove = async (product: CatalogProduct) => {
    if (actionInFlight) return;
    setActionInFlight(product.id);
    try {
      await approveProduct(product.id);
      toast.success(`Approved: ${product.displayName}`);
      loadProducts(page, search, selectedCategory);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to approve product");
    } finally {
      setActionInFlight(null);
    }
  };

  // GCP-STG-0071: Open reject modal
  const openReject = (product: CatalogProduct) => {
    setRejectingProduct(product);
    setRejectReason("");
  };

  // GCP-STG-0071: Submit rejection
  const handleReject = async () => {
    if (!rejectingProduct || !rejectReason.trim()) return;
    setRejectSaving(true);
    try {
      await rejectProduct(rejectingProduct.id, rejectReason.trim());
      toast.success(`Rejected: ${rejectingProduct.displayName}`);
      setRejectingProduct(null);
      loadProducts(page, search, selectedCategory);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reject product");
    } finally {
      setRejectSaving(false);
    }
  };

  // Save edits (category + conversion + margin + metadata)
  const handleSaveEdits = async () => {
    if (!editingProduct) return;
    setEditSaving(true);
    try {
      const newCategory = editCategory.trim() || null;
      // If category matches original and there was an override, clear it
      const categoryToSend = newCategory === editingProduct.originalCategory ? null : newCategory;

      await overrideProductCategory(editingProduct.id, categoryToSend);

      // V3-FIX-169: Save conversion metadata if ANY conversion field changed
      const conversionChanged =
        editProcurementUnit !== ((editingProduct as any).procurementUnit || (editingProduct as any).unit || '') ||
        editBaseStockUnit !== ((editingProduct as any).baseStockUnit || '') ||
        editSplitSellEligible !== ((editingProduct as any).splitSellEligible || false) ||
        editSellUnit !== ((editingProduct as any).sellUnit || (editingProduct as any).baseStockUnit || '') ||
        editDefaultVariants !== ((editingProduct as any).defaultVariants || '');
      if (conversionChanged) {
        await updateProductConversion(editingProduct.id, {
          procurementUnit: editProcurementUnit || undefined,
          procurementPackQty: editProcurementPackQty ? parseFloat(editProcurementPackQty) : undefined,
          baseStockUnit: editBaseStockUnit || undefined,
          splitSellEligible: editSplitSellEligible,
          sellUnit: editSellUnit || undefined,
          defaultVariants: editDefaultVariants || undefined,
        });
      }

      // GCP-STG-0072: Set margin if provided
      const hasMarginPct = editMarginPct.trim() !== "";
      const hasMarginFixed = editMarginFixed.trim() !== "";
      if (hasMarginPct || hasMarginFixed) {
        await setProductMargin(editingProduct.id, {
          marginPct: hasMarginPct ? parseFloat(editMarginPct) : undefined,
          marginFixedMinor: hasMarginFixed ? Math.round(parseFloat(editMarginFixed) * 100) : undefined,
        });
      }

      // GCP-STG-0087: Update billing model if changed
      const billingModelChanged = editBillingModel !== ((editingProduct as any).billingModel || "SUPERMANDI_PRINCIPAL");
      if (billingModelChanged) {
        await editProductMetadata(editingProduct.id, {
          billingModel: editBillingModel,
        } as any);
      }

      // GCP-STG-0075: Update product name if changed
      const nameChanged = editName.trim() !== (editingProduct.displayName || editingProduct.name || "");
      if (nameChanged) {
        await editProductMetadata(editingProduct.id, {
          editedName: editName.trim(),
        });
      }

      toast.success("Product updated successfully");
      setEditingProduct(null);

      // Refresh both lists
      loadProducts(page, search, selectedCategory);
      loadCategories();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update product");
    } finally {
      setEditSaving(false);
    }
  };

  // Clear override (revert to original)
  const handleClearOverride = async () => {
    if (!editingProduct) return;
    setEditSaving(true);
    try {
      await overrideProductCategory(editingProduct.id, null);
      toast.success("Category override cleared");
      setEditingProduct(null);
      loadProducts(page, search, selectedCategory);
      loadCategories();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to clear override");
    } finally {
      setEditSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  // Format price in rupees from minor (paise) or major units
  const formatPrice = (value: number | null | undefined) => {
    if (value == null) return "-";
    // If value > 1000 it's likely in paise (minor), convert to rupees
    const rupees = value > 10000 ? value / 100 : value;
    return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  return (
    <div>
      <h2>Product Catalog</h2>
      <p className="sa-text-muted" style={{ marginBottom: 16 }}>
        Browse, approve/reject, set margins, and edit product metadata. Approved products appear in retailer POS buy catalog.
      </p>

      {/* Category summary chips */}
      {categories.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <button
            className={`btnSm ${!selectedCategory ? "btnPrimary" : ""}`}
            onClick={() => handleCategoryFilter("")}
          >
            All ({categories.reduce((sum, c) => sum + c.productCount, 0)})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.category}
              className={`btnSm ${selectedCategory === cat.category ? "btnPrimary" : ""}`}
              onClick={() => handleCategoryFilter(cat.category)}
            >
              {cat.category} ({cat.productCount})
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by product name, barcode, or SKU..."
          defaultValue={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="sa-input"
          style={{ width: "100%", maxWidth: 400 }}
          aria-label="Search products"
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="sa-error" role="alert" style={{ marginBottom: 16 }}>
          {error}
          <button className="btnSm" onClick={() => loadProducts(page, search, selectedCategory)} style={{ marginLeft: 8 }}>
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && <TableSkeleton rows={5} columns={8} />}

      {/* Empty state */}
      {!loading && !error && products.length === 0 && (
        <div className="sa-empty" role="status">
          No products found{search ? ` matching "${search}"` : ""}{selectedCategory ? ` in category "${selectedCategory}"` : ""}.
        </div>
      )}

      {/* Products table */}
      {!loading && products.length > 0 && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="sa-table" aria-label="Catalog products">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Brand</th>
                  <th>Price</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{product.displayName}</div>
                      {product.supplierSku && (
                        <div className="sa-text-muted" style={{ fontSize: 12 }}>
                          SKU: {product.supplierSku}
                        </div>
                      )}
                      {product.barcode && (
                        <div className="sa-text-muted" style={{ fontSize: 11, fontFamily: "monospace" }}>
                          {product.barcode}
                        </div>
                      )}
                    </td>
                    <td>
                      <span>{product.currentCategory || "Uncategorized"}</span>
                      {product.editedCategory && (
                        <div className="sa-text-muted" style={{ fontSize: 11 }}>
                          Original: {product.originalCategory || "none"}
                        </div>
                      )}
                    </td>
                    <td>{product.brand || "-"}</td>
                    <td>
                      <div style={{ fontSize: 13 }}>
                        <div>Cost: {formatPrice(product.purchasePrice)}</div>
                        {product.mrp != null && <div className="sa-text-muted" style={{ fontSize: 11 }}>MRP: {formatPrice(product.mrp)}</div>}
                      </div>
                    </td>
                    <td>{product.supplierName}</td>
                    <td>
                      <span className={
                        product.approvalStatus === "approved" ? "sa-badge-success" :
                        product.approvalStatus === "rejected" ? "sa-badge-error" :
                        "sa-badge-warning"
                      }>
                        {product.approvalStatus || "pending"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <button
                          className="btnSm"
                          onClick={() => openEdit(product)}
                          aria-label={`Edit ${product.displayName}`}
                        >
                          Edit
                        </button>
                        {product.approvalStatus !== "approved" && (
                          <button
                            className="btnSm btnPrimary"
                            onClick={() => handleApprove(product)}
                            disabled={actionInFlight === product.id}
                            aria-label={`Approve ${product.displayName}`}
                            style={{ background: "#059669", borderColor: "#059669" }}
                          >
                            {actionInFlight === product.id ? "..." : "Approve"}
                          </button>
                        )}
                        {product.approvalStatus !== "rejected" && (
                          <button
                            className="btnSm"
                            onClick={() => openReject(product)}
                            disabled={actionInFlight === product.id}
                            aria-label={`Reject ${product.displayName}`}
                            style={{ color: "#dc2626", borderColor: "#dc2626" }}
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <span className="sa-text-muted">
              Showing {(page - 1) * LIMIT + 1}-{Math.min(page * LIMIT, total)} of {total} products
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btnSm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span style={{ lineHeight: "32px" }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="btnSm"
                disabled={!hasMore}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Edit Product Modal (GCP-STG-0075: Extended with name, margin, metadata) */}
      {editingProduct && (
        <div className="sa-modal-overlay" onClick={() => !editSaving && setEditingProduct(null)}>
          <div
            className="sa-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Edit product"
            aria-modal="true"
            style={{ maxWidth: 560 }}
          >
            <h3 style={{ marginTop: 0 }}>Edit Product</h3>

            {/* Product info header */}
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
              padding: '10px 14px', marginBottom: 16, fontSize: 13
            }}>
              <div><strong>Supplier:</strong> {editingProduct.supplierName}</div>
              <div><strong>Purchase Price:</strong> {formatPrice(editingProduct.purchasePrice)}</div>
              {editingProduct.mrp != null && <div><strong>MRP:</strong> {formatPrice(editingProduct.mrp)}</div>}
              {editingProduct.hsnCode && <div><strong>HSN:</strong> {editingProduct.hsnCode}</div>}
              {editingProduct.defaultGstRate != null && <div><strong>GST:</strong> {editingProduct.defaultGstRate}%</div>}
            </div>

            {/* GCP-STG-0075: Product name override */}
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="edit-name" style={{ display: "block", marginBottom: 4, fontWeight: 500, fontSize: 13 }}>
                Display Name:
              </label>
              <input
                id="edit-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="sa-input"
                style={{ width: "100%" }}
                disabled={editSaving}
                maxLength={200}
              />
              {editName.trim() !== (editingProduct.name || "") && (
                <div className="sa-text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                  Original: {editingProduct.name}
                </div>
              )}
            </div>

            {/* GCP-STG-0072: Margin setting */}
            <div style={{
              background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8,
              padding: '12px 16px', marginBottom: 16
            }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#92400e' }}>SuperMandi Margin</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 2 }}>Margin %:</label>
                  <input
                    type="number"
                    value={editMarginPct}
                    onChange={(e) => { setEditMarginPct(e.target.value); setEditMarginFixed(""); }}
                    className="sa-input"
                    style={{ width: '100%', fontSize: 13 }}
                    placeholder="e.g., 15"
                    min="0" max="100" step="0.5"
                    disabled={editSaving}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 2 }}>OR Fixed (₹):</label>
                  <input
                    type="number"
                    value={editMarginFixed}
                    onChange={(e) => { setEditMarginFixed(e.target.value); setEditMarginPct(""); }}
                    className="sa-input"
                    style={{ width: '100%', fontSize: 13 }}
                    placeholder="e.g., 50"
                    min="0" step="1"
                    disabled={editSaving}
                  />
                </div>
              </div>
              {(editMarginPct || editMarginFixed) && (
                <p style={{ fontSize: 12, color: '#059669', marginTop: 6, marginBottom: 0 }}>
                  Retail price: {editMarginPct
                    ? formatPrice(editingProduct.purchasePrice * (1 + parseFloat(editMarginPct) / 100))
                    : formatPrice(editingProduct.purchasePrice + parseFloat(editMarginFixed || "0"))
                  }
                </p>
              )}
            </div>

            {/* GCP-STG-0087: Billing Model Selector */}
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
              padding: '12px 16px', marginBottom: 16
            }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#166534' }}>Billing Model</h4>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="billingModel"
                    value="SUPERMANDI_PRINCIPAL"
                    checked={editBillingModel === "SUPERMANDI_PRINCIPAL"}
                    onChange={() => setEditBillingModel("SUPERMANDI_PRINCIPAL")}
                    disabled={editSaving}
                  />
                  SuperMandi Principal
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="billingModel"
                    value="DIRECT_SUPPLIER"
                    checked={editBillingModel === "DIRECT_SUPPLIER"}
                    onChange={() => setEditBillingModel("DIRECT_SUPPLIER")}
                    disabled={editSaving}
                  />
                  Direct Supplier
                </label>
              </div>
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 6, marginBottom: 0 }}>
                {editBillingModel === "SUPERMANDI_PRINCIPAL"
                  ? "SuperMandi buys from supplier and resells to retailer. Two invoices: purchase + sale."
                  : "Supplier invoices retailer directly. SuperMandi charges platform commission fee."}
              </p>
            </div>

            {/* V3-FIX-169: Conversion approval — editable "bought as / stocked as / sold as" */}
            <div style={{
              background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
              padding: '12px 16px', marginBottom: 16
            }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#0369a1' }}>Conversion Contract</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 2 }}>Retailer Buys As:</label>
                  <select
                    value={editProcurementUnit}
                    onChange={(e) => setEditProcurementUnit(e.target.value)}
                    className="sa-input"
                    style={{ width: '100%', fontSize: 13 }}
                    disabled={editSaving}
                  >
                    <option value="">Auto</option>
                    <option value="KG">KG</option><option value="GM">GM</option>
                    <option value="LTR">LTR</option><option value="ML">ML</option>
                    <option value="PCS">PCS</option><option value="DOZEN">Dozen</option>
                    <option value="CARTON">Carton</option><option value="CASE">Case</option>
                    <option value="BAG">Bag</option><option value="TIN">Tin</option>
                    <option value="DRUM">Drum</option><option value="TRAY">Tray</option>
                    <option value="BOTTLE">Bottle</option><option value="PACK">Pack</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 2 }}>Units per Pack:</label>
                  <input
                    type="number"
                    value={editProcurementPackQty}
                    onChange={(e) => setEditProcurementPackQty(e.target.value)}
                    className="sa-input"
                    style={{ width: '100%', fontSize: 13 }}
                    min="0.01" step="0.01"
                    disabled={editSaving}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 2 }}>Stores As:</label>
                  <select
                    value={editBaseStockUnit}
                    onChange={(e) => setEditBaseStockUnit(e.target.value)}
                    className="sa-input"
                    style={{ width: '100%', fontSize: 13 }}
                    disabled={editSaving}
                  >
                    <option value="">Auto</option>
                    <option value="KG">KG</option><option value="GM">GM</option>
                    <option value="PCS">PCS</option>
                    <option value="LTR">LTR</option><option value="ML">ML</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editSplitSellEligible}
                      onChange={(e) => setEditSplitSellEligible(e.target.checked)}
                      disabled={editSaving}
                    />
                    Split-sell eligible
                  </label>
                </div>
              </div>
              {editProcurementUnit && editBaseStockUnit && editProcurementUnit !== editBaseStockUnit && (
                <p style={{ fontSize: 12, color: '#059669', marginTop: 6, marginBottom: 0 }}>
                  1 {editProcurementUnit} = {editProcurementPackQty || '1'} {editBaseStockUnit}
                </p>
              )}

              {/* V3-FIX-169: "Sells As" + default retail variants approval */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 2 }}>Sells As:</label>
                  <select
                    value={editSellUnit}
                    onChange={(e) => setEditSellUnit(e.target.value)}
                    className="sa-input"
                    style={{ width: '100%', fontSize: 13 }}
                    disabled={editSaving}
                  >
                    <option value="">Same as stock unit</option>
                    <option value="KG">Per KG</option><option value="GM">Per GM</option>
                    <option value="LTR">Per LTR</option><option value="ML">Per ML</option>
                    <option value="PCS">Per PCS</option><option value="DOZEN">Per Dozen</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 2 }}>Default Retail Variants:</label>
                  <input
                    type="text"
                    value={editDefaultVariants}
                    onChange={(e) => setEditDefaultVariants(e.target.value)}
                    className="sa-input"
                    style={{ width: '100%', fontSize: 13 }}
                    placeholder="250g, 500g, 1kg"
                    disabled={editSaving}
                  />
                </div>
              </div>
            </div>

            {/* Category override */}
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="category-input" style={{ display: "block", marginBottom: 4, fontWeight: 500, fontSize: 13 }}>
                Category:
              </label>
              <input
                id="category-input"
                type="text"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="sa-input"
                style={{ width: "100%" }}
                placeholder="Enter category name..."
                disabled={editSaving}
                maxLength={100}
                list="category-suggestions"
              />
              <datalist id="category-suggestions">
                {categories.map((cat) => (
                  <option key={cat.category} value={cat.category} />
                ))}
              </datalist>
              {editingProduct.editedCategory && (
                <div className="sa-text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                  Original: {editingProduct.originalCategory || "none"}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {editingProduct.editedCategory && (
                <button
                  className="btnSm"
                  onClick={handleClearOverride}
                  disabled={editSaving}
                  style={{ marginRight: "auto" }}
                >
                  Clear Override
                </button>
              )}
              <button
                className="btnSm"
                onClick={() => setEditingProduct(null)}
                disabled={editSaving}
              >
                Cancel
              </button>
              <button
                className="btnSm btnPrimary"
                onClick={handleSaveEdits}
                disabled={editSaving}
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GCP-STG-0071: Reject Reason Modal */}
      {rejectingProduct && (
        <div className="sa-modal-overlay" onClick={() => !rejectSaving && setRejectingProduct(null)}>
          <div
            className="sa-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Reject product"
            aria-modal="true"
            style={{ maxWidth: 420 }}
          >
            <h3 style={{ marginTop: 0, color: "#dc2626" }}>Reject Product</h3>
            <div style={{ marginBottom: 12 }}>
              <strong>Product:</strong> {rejectingProduct.displayName}
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>Supplier:</strong> {rejectingProduct.supplierName}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="reject-reason" style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Rejection Reason (required):
              </label>
              <textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="sa-input"
                style={{ width: "100%", minHeight: 80, resize: "vertical" }}
                placeholder="Enter reason for rejection..."
                disabled={rejectSaving}
                maxLength={500}
                autoFocus
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btnSm"
                onClick={() => setRejectingProduct(null)}
                disabled={rejectSaving}
              >
                Cancel
              </button>
              <button
                className="btnSm"
                onClick={handleReject}
                disabled={rejectSaving || !rejectReason.trim()}
                style={{ background: "#dc2626", color: "white", borderColor: "#dc2626" }}
              >
                {rejectSaving ? "Rejecting..." : "Reject Product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
