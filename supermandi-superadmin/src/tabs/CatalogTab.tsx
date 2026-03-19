// SA-P2-006: Product Category Manual Override — SuperAdmin Catalog Tab
import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchCategories,
  fetchProducts,
  overrideProductCategory,
  updateProductConversion,
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
  };

  // Save category override
  const handleSaveCategory = async () => {
    if (!editingProduct) return;
    setEditSaving(true);
    try {
      const newCategory = editCategory.trim() || null;
      // If category matches original and there was an override, clear it
      const categoryToSend = newCategory === editingProduct.originalCategory ? null : newCategory;

      await overrideProductCategory(editingProduct.id, categoryToSend);

      // V3-FIX-169: Save conversion metadata if changed — fail visibly on error
      const conversionChanged =
        editProcurementUnit !== ((editingProduct as any).procurementUnit || (editingProduct as any).unit || '') ||
        editBaseStockUnit !== ((editingProduct as any).baseStockUnit || '') ||
        editSplitSellEligible !== ((editingProduct as any).splitSellEligible || false);
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

      toast.success("Product updated successfully");
      setEditingProduct(null);

      // Refresh both lists
      loadProducts(page, search, selectedCategory);
      loadCategories();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update category");
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

  return (
    <div>
      <h2>Product Categories</h2>
      <p className="sa-text-muted" style={{ marginBottom: 16 }}>
        Browse and override product categories. Changes to <code>edited_category</code> affect how products appear in the POS buy catalog.
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
      {loading && <TableSkeleton rows={5} columns={6} />}

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
                  <th>Barcode</th>
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
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {product.barcode || "-"}
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
                      <button
                        className="btnSm"
                        onClick={() => openEdit(product)}
                        aria-label={`Edit category for ${product.displayName}`}
                      >
                        Edit Category
                      </button>
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

      {/* Edit Category Modal */}
      {editingProduct && (
        <div className="sa-modal-overlay" onClick={() => !editSaving && setEditingProduct(null)}>
          <div
            className="sa-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Edit product category"
            aria-modal="true"
          >
            <h3 style={{ marginTop: 0 }}>Edit Product — Category & Conversion</h3>
            <div style={{ marginBottom: 12 }}>
              <strong>Product:</strong> {editingProduct.displayName}
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>Original Category:</strong> {editingProduct.originalCategory || "None"}
            </div>
            {editingProduct.editedCategory && (
              <div style={{ marginBottom: 12 }}>
                <strong>Current Override:</strong> {editingProduct.editedCategory}
              </div>
            )}

            {/* V3-FIX-169: Conversion approval — editable "bought as / stocked as / sold as" */}
            <div style={{
              background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
              padding: '12px 16px', marginBottom: 16
            }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#0369a1' }}>Conversion Contract (Editable)</h4>
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
                  <p style={{ fontSize: 10, color: '#9ca3af', margin: '2px 0 0' }}>
                    Suggested retail variants for retailers after add
                  </p>
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="category-input" style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                New Category:
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
                autoFocus
              />
              {/* Suggest existing categories */}
              <datalist id="category-suggestions">
                {categories.map((cat) => (
                  <option key={cat.category} value={cat.category} />
                ))}
              </datalist>
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
                onClick={handleSaveCategory}
                disabled={editSaving || !editCategory.trim()}
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
