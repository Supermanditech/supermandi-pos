// SA-P2-006: Product Category Manual Override — SuperAdmin Catalog Tab
import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchCategories,
  fetchProducts,
  overrideProductCategory,
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
      toast.success("Category updated successfully");
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
      {loading && <TableSkeleton rows={5} cols={6} />}

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
            <h3 style={{ marginTop: 0 }}>Edit Product Category</h3>
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
