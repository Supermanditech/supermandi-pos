import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, API_GATEWAY_BASE } from '../lib/api';
import { fetchCategories, FmcgCategory } from '../api/store';

interface Supplier {
  id: string;
  name: string;
  businessName?: string;
  verificationStatus: 'verified' | 'pending' | 'unverified' | 'rejected';
  isSupermandi: boolean;
  supplierCode?: string;
}

interface Product {
  id: string;
  barcode: string | null;
  generatedBarcode?: string | null;
  name: string;
  description?: string;
  mode: 'PACKAGED' | 'LOOSE_BULK';
  brand?: string;
  alias?: string;
  sellPrice: number;
  purchasePrice: number;
  mrp?: number;
  stock: number;
  unit: string;
  supplierId?: string;
  supplierName?: string;
  // New fields per E2E Go-Live spec
  lowStockAlertQty?: number;
  gstPercent?: number;
  hsn?: string;
  notes?: string;
  // PACKAGED only
  packSize?: number;
  packUnit?: string;
  // LOOSE_BULK only
  soldBy?: string;
  rateUnit?: string;
  // RCAT-CAT-002: Category
  categoryId?: string;
  // GL-WF-029: BNPL eligibility
  bnplEligible?: boolean;
}

// API response for product create
interface ProductCreateResponse {
  ok: boolean;
  data: {
    storeId: string;
    productId: string;
    barcode: string | null;
    generatedBarcode: string | null;
    ledgerEntryId: string | null;
    storeProduct: {
      productId: string;
      mode: 'PACKAGED' | 'LOOSE_BULK';
      name: string;
      sellPrice: number;
      purchasePrice: number;
      currentStock: number;
    };
  };
}

interface ProductFormData {
  barcode: string;
  name: string;
  description: string;
  mode: 'PACKAGED' | 'LOOSE_BULK';
  brand: string;
  alias: string;
  unit: string;
  purchasePrice: string;
  sellPrice: string;
  mrp: string;
  openingStockQty: string;
  supplierId: string;
  // New fields per E2E Go-Live spec
  lowStockAlertQty: string;  // Optional - threshold for low stock alerts
  gstPercent: string;        // Optional - GST percentage (0, 5, 12, 18, 28)
  hsn: string;               // Optional - HSN code for tax compliance
  notes: string;             // Optional - internal notes
  // PACKAGED only
  packSize: string;          // Recommended - e.g., "500" for 500g pack
  packUnit: string;          // Recommended - e.g., "g", "ml", "pcs"
  // LOOSE_BULK only
  soldBy: string;            // Required - "WEIGHT" or "COUNT"
  rateUnit: string;          // Required - the unit rate is quoted in (e.g., KG, GM, PCS)
  // RCAT-CAT-002: Category override
  categoryId: string;        // Optional - taxonomy_id from fmcg_taxonomy
  // GL-WF-029: BNPL eligibility toggle
  bnplEligible: boolean;     // Optional - whether product can be purchased on BNPL
}

const initialFormData: ProductFormData = {
  barcode: '',
  name: '',
  description: '',
  mode: 'PACKAGED',
  brand: '',
  alias: '',
  unit: 'PCS',
  purchasePrice: '',
  sellPrice: '',
  mrp: '',
  openingStockQty: '0',
  supplierId: '',
  // New fields per E2E Go-Live spec
  lowStockAlertQty: '',
  gstPercent: '',
  hsn: '',
  notes: '',
  // PACKAGED only
  packSize: '',
  packUnit: '',
  // LOOSE_BULK only
  soldBy: 'WEIGHT',   // Default for loose products
  rateUnit: 'KG',     // Default rate unit
  // RCAT-CAT-002: Category override
  categoryId: '',
  // GL-WF-029: BNPL eligibility
  bnplEligible: false,
};

export default function ProductsPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // FE-RETAILER-CAT-001: Categories from POS taxonomy
  const [categories, setCategories] = useState<FmcgCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createdProduct, setCreatedProduct] = useState<ProductCreateResponse['data'] | null>(null);

  // Bulk upload state
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkData, setBulkData] = useState('');
  const [bulkPreview, setBulkPreview] = useState<Partial<Product>[]>([]);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  // Handle ?action=create and ?category=... query params from dashboard navigation
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'create') {
      setShowForm(true);
      setEditingProduct(null);
      setFormData(initialFormData);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
    // RCAT-CAT-001: Handle ?category=... from dashboard category card click
    const catParam = searchParams.get('category');
    if (catParam) {
      setSelectedCategory(catParam);
      searchParams.delete('category');
      setSearchParams(searchParams, { replace: true });
    }
    // RCAT-SEARCH-001: Handle ?search=... from global search
    const searchParam = searchParams.get('search');
    if (searchParam) {
      setSearchTerm(searchParam);
      searchParams.delete('search');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // RCAT-CAT-001: Fetch products from API with optional category filter
  const fetchProducts = async (categoryFilter?: string) => {
    setIsLoading(true);
    setError('');
    try {
      const cat = categoryFilter || selectedCategory;
      const params = new URLSearchParams();
      if (cat && cat !== 'all') params.set('categoryId', cat);
      const url = `/api/v1/retailer-admin/products${params.toString() ? '?' + params.toString() : ''}`;
      const response = await authFetch(url, accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch products');
      const data = await response.json();
      setProducts(data.data || []);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to load products. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch suppliers for dropdown
  const fetchSuppliers = async () => {
    try {
      const response = await authFetch('/api/v1/retailer-admin/suppliers', accessToken);
      if (response.status === 401) return;
      if (!response.ok) return;
      const data = await response.json();
      setSuppliers(data.data || []);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
    }
  };

  useEffect(() => {
    if (accessToken) {
      fetchProducts();
      fetchSuppliers();

      // FE-RETAILER-CAT-001: Load categories from POS taxonomy
      const loadCategories = async () => {
        setCategoriesLoading(true);
        try {
          const result = await fetchCategories(accessToken);
          // Filter out "Sab" (All) category - we'll add our own "All" option
          setCategories((result.data || []).filter(c => c.sortOrder > 0));
        } catch (err) {
          console.error('Failed to load categories:', err);
          setCategories([]);
        } finally {
          setCategoriesLoading(false);
        }
      };
      loadCategories();
    }
  }, [accessToken]);

  // RCAT-CAT-001: Re-fetch products when category changes
  useEffect(() => {
    if (accessToken) {
      fetchProducts(selectedCategory);
    }
  }, [selectedCategory, accessToken]);

  // RCAT-SYNC-001: Auto-refresh products when tab regains focus (detect POS edits)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && accessToken) {
        fetchProducts(selectedCategory);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [accessToken, selectedCategory]);

  // Open edit form
  const openEditForm = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      barcode: product.barcode || '',
      name: product.name,
      description: product.description || '',
      mode: product.mode || 'PACKAGED',
      brand: product.brand || '',
      alias: product.alias || '',
      unit: product.unit,
      purchasePrice: product.purchasePrice ? String(product.purchasePrice / 100) : '',
      sellPrice: String(product.sellPrice / 100),
      mrp: product.mrp ? String(product.mrp / 100) : '',
      openingStockQty: String(product.stock),
      supplierId: product.supplierId || '',
      // New fields per E2E Go-Live spec
      lowStockAlertQty: product.lowStockAlertQty ? String(product.lowStockAlertQty) : '',
      gstPercent: product.gstPercent !== undefined ? String(product.gstPercent) : '',
      hsn: product.hsn || '',
      notes: product.notes || '',
      // PACKAGED only
      packSize: product.packSize ? String(product.packSize) : '',
      packUnit: product.packUnit || '',
      // LOOSE_BULK only
      soldBy: product.soldBy || 'WEIGHT',
      rateUnit: product.rateUnit || 'KG',
      // RCAT-CAT-002: Category
      categoryId: product.categoryId || '',
      // GL-WF-029: BNPL eligibility
      bnplEligible: product.bnplEligible || false,
    });
    setShowForm(true);
    setError('');
    setSuccess('');
    setCreatedProduct(null);
  };

  // Close form
  const closeForm = () => {
    setShowForm(false);
    setEditingProduct(null);
    setFormData(initialFormData);
    setError('');
    setCreatedProduct(null);
  };

  // Handle delete
  const handleDelete = async (productId: string) => {
    setError('');
    setSuccess('');
    try {
      const response = await authFetch(`/api/v1/retailer-admin/products/${productId}`, accessToken, {
        method: 'DELETE',
      });
      if (response.status === 401) return;
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to delete product');
      }
      setSuccess('Product deleted successfully!');
      setDeleteConfirm(null);
      await fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete product.');
      setDeleteConfirm(null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleModeChange = (mode: 'PACKAGED' | 'LOOSE_BULK') => {
    setFormData(prev => ({
      ...prev,
      mode,
      barcode: mode === 'LOOSE_BULK' ? '' : prev.barcode, // Clear barcode for loose products
      // Reset mode-specific fields
      unit: mode === 'PACKAGED' ? 'PCS' : 'KG',
      // PACKAGED fields - clear when switching to LOOSE_BULK
      packSize: mode === 'LOOSE_BULK' ? '' : prev.packSize,
      packUnit: mode === 'LOOSE_BULK' ? '' : prev.packUnit,
      // LOOSE_BULK fields - set defaults when switching to LOOSE_BULK
      soldBy: mode === 'LOOSE_BULK' ? (prev.soldBy || 'WEIGHT') : prev.soldBy,
      rateUnit: mode === 'LOOSE_BULK' ? (prev.rateUnit || 'KG') : prev.rateUnit,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreatedProduct(null);
    setIsSubmitting(true);

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        throw new Error('Product name is required');
      }
      if (!formData.sellPrice || parseFloat(formData.sellPrice) <= 0) {
        throw new Error('Valid sell price is required');
      }
      // Purchase price is now required per E2E Go-Live spec
      if (!formData.purchasePrice || parseFloat(formData.purchasePrice) <= 0) {
        throw new Error('Valid purchase price is required for ledger tracking');
      }

      // CRITICAL: Convert rupees to paise (integer minor units)
      // Backend enforces integer paise, UI shows rupees
      const rupeesToPaise = (rupees: string | undefined): number | undefined => {
        if (!rupees) return undefined;
        const float = parseFloat(rupees);
        if (isNaN(float)) return undefined;
        return Math.round(float * 100); // Round to avoid floating point issues
      };

      // API-RCAT-001: New contract - no category, mode required
      const payload: Record<string, unknown> = {
        mode: formData.mode,
        barcode: formData.mode === 'PACKAGED' && formData.barcode.trim() ? formData.barcode.trim() : undefined,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        brand: formData.brand.trim() || undefined,
        alias: formData.alias.trim() || undefined,
        unit: formData.unit,
        purchasePrice: rupeesToPaise(formData.purchasePrice)!, // Required
        sellPrice: rupeesToPaise(formData.sellPrice)!, // Required
        mrp: rupeesToPaise(formData.mrp),
        openingStockQty: editingProduct
          ? (formData.openingStockQty !== '' ? parseInt(formData.openingStockQty) : undefined)
          : (parseInt(formData.openingStockQty) || 0),
        supplierId: formData.supplierId || undefined,
        // New fields per E2E Go-Live spec
        lowStockAlertQty: formData.lowStockAlertQty ? parseInt(formData.lowStockAlertQty) : undefined,
        gstPercent: formData.gstPercent ? parseFloat(formData.gstPercent) : undefined,
        hsn: formData.hsn.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        // GL-WF-029: BNPL eligibility
        bnplEligible: formData.bnplEligible,
      };

      // RCAT-CAT-002: Category override (store level)
      if (formData.categoryId) {
        payload.categoryId = formData.categoryId;
      }

      // Add mode-specific fields
      if (formData.mode === 'PACKAGED') {
        // PACKAGED: Pack Size and Pack Unit (recommended)
        if (formData.packSize) payload.packSize = parseInt(formData.packSize);
        if (formData.packUnit.trim()) payload.packUnit = formData.packUnit.trim();
      } else {
        // LOOSE_BULK: Sold By and Rate Unit (required per spec)
        payload.soldBy = formData.soldBy || 'WEIGHT';
        payload.rateUnit = formData.rateUnit || 'KG';
      }

      const isEdit = !!editingProduct;
      const url = isEdit
        ? `/api/v1/retailer-admin/products/${editingProduct.id}`
        : '/api/v1/retailer-admin/products';
      const method = isEdit ? 'PATCH' : 'POST';

      // AUD-025-B: Send timestamp for last-write-wins conflict resolution
      if (isEdit) {
        payload.metadataUpdatedAt = new Date().toISOString();
      }

      const response = await authFetch(url, accessToken, {
        method,
        body: JSON.stringify(payload),
      });

      if (response.status === 401) return;

      // AUD-025-B: Handle 409 CONFLICT (stale update rejected by LWW)
      if (response.status === 409) {
        await response.json(); // consume response body
        throw new Error('This product was updated elsewhere. Please refresh and try again.');
      }

      const data = await response.json() as ProductCreateResponse;

      if (!response.ok) {
        throw new Error((data as unknown as { error?: { message?: string } }).error?.message || `Failed to ${isEdit ? 'update' : 'create'} product`);
      }

      if (isEdit) {
        setSuccess('Product updated successfully!');
        closeForm();
      } else {
        // Show success with barcode info for new products
        setSuccess('Product created successfully! Synced to POS.');
        setCreatedProduct(data.data);
        // Don't close form yet - let user see barcode info and download PDF
      }

      await fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Parse bulk upload data (tab/comma separated)
  const parseBulkData = (text: string): Partial<Product>[] => {
    const lines = text.trim().split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    return lines.map(line => {
      // Support both tab and comma separation
      // New format: Name, Barcode, Brand, SellPrice, PurchasePrice, MRP, Unit, Stock
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      const [name, barcode, brand, sellPrice, purchasePrice, mrp, unit, stock] = parts.map(p => p?.trim());

      // CRITICAL: Convert rupees to paise (integer minor units)
      const rupeesToPaise = (rupees: string | undefined): number | undefined => {
        if (!rupees) return undefined;
        const float = parseFloat(rupees);
        if (isNaN(float)) return undefined;
        return Math.round(float * 100);
      };

      return {
        name: name || '',
        barcode: barcode || null,
        brand: brand || '',
        sellPrice: rupeesToPaise(sellPrice) || 0,
        purchasePrice: rupeesToPaise(purchasePrice) || 0,
        mrp: rupeesToPaise(mrp),
        unit: unit || 'PCS',
        stock: stock ? parseInt(stock) : 0,
        // Mode is determined by presence of barcode
        mode: barcode ? 'PACKAGED' as const : 'LOOSE_BULK' as const,
      };
    }).filter(p => p.name); // Filter out empty rows
  };

  // RCAT-BULK-002: Preview via backend endpoint (validates + parses server-side)
  const handleBulkPreview = async () => {
    if (!bulkData.trim()) return;
    setError('');
    setIsBulkSubmitting(true);
    try {
      const response = await authFetch('/api/v1/retailer-admin/products/bulk-paste/preview', accessToken, {
        method: 'POST',
        body: JSON.stringify({ text: bulkData }),
      });
      if (response.status === 401) return;
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to preview products');
      }
      const rows = data.data?.previewRows || [];
      setBulkPreview(rows.map((r: any) => ({
        name: r.name,
        barcode: r.barcode || null,
        brand: r.brand || '',
        sellPrice: r.sellPrice || 0,
        purchasePrice: r.purchasePrice || 0,
        mrp: r.mrp || 0,
        unit: r.unit || 'PCS',
        stock: r.stock || 0,
        mode: r.mode as 'PACKAGED' | 'LOOSE_BULK',
      })));
      if (data.data?.invalidCount > 0) {
        setError(`${data.data.invalidCount} row(s) have errors. Fix them before importing.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview products.');
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  // RCAT-BULK-002: Commit via backend endpoint (creates products + barcodes + ledger)
  const handleBulkSubmit = async () => {
    if (bulkPreview.length === 0) return;

    setIsBulkSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await authFetch('/api/v1/retailer-admin/products/bulk-paste/commit', accessToken, {
        method: 'POST',
        body: JSON.stringify({ rows: bulkPreview }),
      });

      if (response.status === 401) return;
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to import products');
      }

      const created = data.data?.created || 0;
      setSuccess(`Successfully imported ${created} products!`);
      setBulkData('');
      setBulkPreview([]);
      setShowBulkUpload(false);
      await fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import products.');
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const filteredProducts = products.filter(
    p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
         (p.barcode && p.barcode.includes(searchTerm))
  );

  return (
    <>
      <header className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="page-title">Products</h1>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (showForm) {
                closeForm();
              } else {
                setShowForm(true);
                setShowBulkUpload(false);
                setEditingProduct(null);
                setFormData(initialFormData);
                setError('');
                setSuccess('');
              }
            }}
          >
            {showForm ? 'Cancel' : '+ Add Product'}
          </button>
        </div>
      </header>

      <div className="page-content">
        {/* Success Message */}
        {success && (
          <div style={{
            background: '#dcfce7',
            color: '#166534',
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            {success}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        {/* Add/Edit Product Form */}
        {showForm && (
          <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
            <h3 className="card-title" style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
            <form onSubmit={handleSubmit}>
              {/* Success: Show created product info with SKU PDF download */}
              {createdProduct && (
                <div style={{
                  background: '#dcfce7',
                  border: '2px solid #22c55e',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  marginBottom: '1.5rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>✅</span>
                    <strong style={{ color: '#166534' }}>Product Synced to POS!</strong>
                  </div>

                  {createdProduct.storeProduct.mode === 'LOOSE_BULK' && createdProduct.generatedBarcode && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <p style={{ margin: '0 0 0.5rem 0', color: '#166534' }}>
                        <strong>Generated Barcode:</strong>
                        <code style={{
                          marginLeft: '0.5rem',
                          padding: '0.25rem 0.5rem',
                          background: 'white',
                          borderRadius: '0.25rem',
                          fontFamily: 'monospace',
                          fontSize: '1rem',
                        }}>
                          {createdProduct.generatedBarcode}
                        </code>
                      </p>
                      <p style={{ margin: '0', fontSize: '0.875rem', color: '#166534' }}>
                        Scan this barcode in POS SELL to add this product.
                      </p>
                    </div>
                  )}

                  {createdProduct.storeProduct.mode === 'PACKAGED' && createdProduct.barcode && (
                    <p style={{ margin: '0 0 0.75rem 0', color: '#166534' }}>
                      <strong>Barcode:</strong>
                      <code style={{
                        marginLeft: '0.5rem',
                        padding: '0.25rem 0.5rem',
                        background: 'white',
                        borderRadius: '0.25rem',
                        fontFamily: 'monospace',
                      }}>
                        {createdProduct.barcode}
                      </code>
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <a
                      href={`${API_GATEWAY_BASE}/api/v1/retailer-admin/products/${createdProduct.productId}/sku.pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      📄 Download SKU Labels (PDF)
                    </a>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        closeForm();
                        setSuccess('');
                      }}
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setCreatedProduct(null);
                        setFormData(initialFormData);
                      }}
                    >
                      Add Another Product
                    </button>
                  </div>
                </div>
              )}

              {/* ═══ STEP 1: Product Type ═══ */}
              <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                <label className="form-label" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 'bold' }}>1</span>
                  Product Mode *
                </label>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      border: `2px solid ${formData.mode === 'PACKAGED' ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      background: formData.mode === 'PACKAGED' ? 'var(--primary-light)' : 'white',
                      transition: 'all 0.2s',
                      flex: '1',
                      maxWidth: '220px',
                    }}
                    onClick={() => handleModeChange('PACKAGED')}
                  >
                    <input
                      type="radio"
                      name="productMode"
                      checked={formData.mode === 'PACKAGED'}
                      onChange={() => handleModeChange('PACKAGED')}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span>
                      <strong>Packaged (FMCG)</strong>
                      <br />
                      <small style={{ color: 'var(--text-muted)' }}>Has manufacturer barcode</small>
                    </span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      border: `2px solid ${formData.mode === 'LOOSE_BULK' ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      background: formData.mode === 'LOOSE_BULK' ? 'var(--primary-light)' : 'white',
                      transition: 'all 0.2s',
                      flex: '1',
                      maxWidth: '220px',
                    }}
                    onClick={() => handleModeChange('LOOSE_BULK')}
                  >
                    <input
                      type="radio"
                      name="productMode"
                      checked={formData.mode === 'LOOSE_BULK'}
                      onChange={() => handleModeChange('LOOSE_BULK')}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span>
                      <strong>Loose / Bulk</strong>
                      <br />
                      <small style={{ color: 'var(--text-muted)' }}>Barcode auto-generated</small>
                    </span>
                  </label>
                </div>
                {formData.mode === 'LOOSE_BULK' && (
                  <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    💡 A store-scoped barcode will be generated. Download the SKU PDF to print labels.
                  </p>
                )}
              </div>

              {/* ═══ STEP 2: Product Identity ═══ */}
              <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', paddingBottom: '0.375rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 'bold' }}>2</span>
                  Product Identity
                </h4>
                {/* Row 1: Name (wide) + Brand (narrow) */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <div className="form-group">
                    <label className="form-label">Product Name *</label>
                    <input
                      type="text"
                      name="name"
                      className="form-input"
                      placeholder="Enter product name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Brand</label>
                    <input
                      type="text"
                      name="brand"
                      className="form-input"
                      placeholder="e.g., Amul, Tata"
                      value={formData.brand}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                {/* Row 2: Alias (medium) + Category (medium) + Barcode (narrow, if packaged) */}
                <div style={{ display: 'grid', gridTemplateColumns: formData.mode === 'PACKAGED' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Alias / Local Name</label>
                    <input
                      type="text"
                      name="alias"
                      className="form-input"
                      placeholder="e.g., नमक, चावल"
                      value={formData.alias}
                      onChange={handleInputChange}
                    />
                  </div>

                  {/* RCAT-CAT-002: Category dropdown */}
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select
                      className="form-input"
                      value={formData.categoryId}
                      onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    >
                      <option value="">Auto-detect from name</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.labelEn}</option>
                      ))}
                    </select>
                    <small style={{ color: 'var(--text-muted)' }}>Leave as "Auto-detect" to assign category automatically, or select manually to override.</small>
                  </div>

                  {formData.mode === 'PACKAGED' && (
                    <div className="form-group">
                      <label className="form-label">Barcode (GTIN/EAN)</label>
                      <input
                        type="text"
                        name="barcode"
                        className="form-input"
                        placeholder="8901030865432"
                        value={formData.barcode}
                        onChange={handleInputChange}
                        style={{ fontFamily: 'monospace', letterSpacing: '0.5px' }}
                      />
                      <small style={{ color: 'var(--text-muted)' }}>Optional - leave blank if no barcode</small>
                    </div>
                  )}
                </div>
              </div>

              {/* ═══ STEP 3: Measurement & Packaging ═══ */}
              <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', paddingBottom: '0.375rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 'bold' }}>3</span>
                  Measurement & Packaging
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: formData.mode === 'PACKAGED' ? '1fr 1fr 1fr' : formData.mode === 'LOOSE_BULK' ? '1fr 1fr 1fr' : '1fr', gap: '0.75rem', alignItems: 'start' }}>
                  <div className="form-group">
                    <label className="form-label">Unit *</label>
                    <select
                      name="unit"
                      className="form-input"
                      value={formData.unit}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="PCS">Pieces (PCS)</option>
                      <option value="PACK">Pack</option>
                      <option value="KG">Kilograms (KG)</option>
                      <option value="GM">Grams (GM)</option>
                      <option value="LTR">Liters (LTR)</option>
                      <option value="ML">Milliliters (ML)</option>
                    </select>
                  </div>

                  {/* Mode-specific: Packaged fields */}
                  {formData.mode === 'PACKAGED' && (
                    <>
                      <div className="form-group">
                        <label className="form-label">Pack Size</label>
                        <input
                          type="number"
                          name="packSize"
                          className="form-input"
                          placeholder="e.g., 500"
                          min="0"
                          value={formData.packSize}
                          onChange={handleInputChange}
                        />
                        <small style={{ color: 'var(--text-muted)' }}>Quantity in pack (e.g., 500 for 500g)</small>
                      </div>

                      {/* Pack Unit - RCAT-PROD-002: Custom editable option */}
                      <div className="form-group">
                        <label className="form-label">Pack Unit</label>
                        <select
                          name="packUnit"
                          className="form-input"
                          value={['g', 'kg', 'ml', 'l', 'pcs', 'pack', ''].includes(formData.packUnit) ? formData.packUnit : 'OTHER'}
                          onChange={(e) => {
                            if (e.target.value === 'OTHER') {
                              setFormData(prev => ({ ...prev, packUnit: '' }));
                            } else {
                              setFormData(prev => ({ ...prev, packUnit: e.target.value }));
                            }
                          }}
                        >
                          <option value="">-- Select --</option>
                          <option value="g">Grams (g)</option>
                          <option value="kg">Kilograms (kg)</option>
                          <option value="ml">Milliliters (ml)</option>
                          <option value="l">Liters (l)</option>
                          <option value="pcs">Pieces (pcs)</option>
                          <option value="pack">Pack</option>
                          <option value="OTHER">Other (type...)</option>
                        </select>
                        {!['g', 'kg', 'ml', 'l', 'pcs', 'pack', ''].includes(formData.packUnit) && (
                          <input
                            type="text"
                            className="form-input"
                            style={{ marginTop: '0.5rem' }}
                            placeholder="Enter custom unit (e.g., sachet, strip)"
                            value={formData.packUnit}
                            onChange={(e) => setFormData(prev => ({ ...prev, packUnit: e.target.value }))}
                          />
                        )}
                        <small style={{ color: 'var(--text-muted)' }}>Unit for pack size</small>
                      </div>
                    </>
                  )}

                  {/* Mode-specific: Loose/Bulk fields */}
                  {formData.mode === 'LOOSE_BULK' && (
                    <>
                      <div className="form-group">
                        <label className="form-label">Sold By *</label>
                        <select
                          name="soldBy"
                          className="form-input"
                          value={formData.soldBy}
                          onChange={handleInputChange}
                          required
                        >
                          <option value="WEIGHT">Weight (KG/GM)</option>
                          <option value="COUNT">Count (pieces)</option>
                        </select>
                        <small style={{ color: 'var(--text-muted)' }}>How product is measured at sale</small>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Rate Unit *</label>
                        <select
                          name="rateUnit"
                          className="form-input"
                          value={formData.rateUnit}
                          onChange={handleInputChange}
                          required
                        >
                          {formData.soldBy === 'WEIGHT' ? (
                            <>
                              <option value="KG">Per Kilogram (KG)</option>
                              <option value="GM">Per 100 Grams</option>
                            </>
                          ) : (
                            <>
                              <option value="PCS">Per Piece (PCS)</option>
                              <option value="DOZEN">Per Dozen</option>
                            </>
                          )}
                        </select>
                        <small style={{ color: 'var(--text-muted)' }}>Unit for price rate</small>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ═══ STEP 4: Pricing ═══ */}
              <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', paddingBottom: '0.375rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 'bold' }}>4</span>
                  Pricing
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Purchase (₹) *</label>
                    <input
                      type="number"
                      name="purchasePrice"
                      className="form-input"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      value={formData.purchasePrice}
                      onChange={handleInputChange}
                      required
                    />
                    <small style={{ color: 'var(--text-muted)' }}>Required for ledger tracking</small>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Sell (₹) *</label>
                    <input
                      type="number"
                      name="sellPrice"
                      className="form-input"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      value={formData.sellPrice}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">MRP (₹)</label>
                    <input
                      type="number"
                      name="mrp"
                      className="form-input"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      value={formData.mrp}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
              </div>

              {/* ═══ STEP 5: Stock & Supplier ═══ */}
              <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', paddingBottom: '0.375rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 'bold' }}>5</span>
                  Stock & Supplier
                </h4>
                {/* Row 1: Two small qty fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <div className="form-group">
                    <label className="form-label">Opening Stock</label>
                    <input
                      type="number"
                      name="openingStockQty"
                      className="form-input"
                      placeholder="0"
                      min="0"
                      value={formData.openingStockQty}
                      onChange={handleInputChange}
                    />
                    <small style={{ color: 'var(--text-muted)' }}>Creates ledger entry if &gt; 0</small>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Low Stock Alert</label>
                    <input
                      type="number"
                      name="lowStockAlertQty"
                      className="form-input"
                      placeholder="e.g., 10"
                      min="0"
                      value={formData.lowStockAlertQty}
                      onChange={handleInputChange}
                    />
                    <small style={{ color: 'var(--text-muted)' }}>Alert when stock falls below this</small>
                  </div>
                </div>

                {/* Row 2: Supplier full width */}
                {/* RCAT-SUP-003: Supplier dropdown */}
                <div className="form-group">
                  <label className="form-label">
                    Supplier (optional)
                    <span style={{
                      marginLeft: '8px',
                      fontSize: '0.7rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: '#dcfce7',
                      color: '#166534'
                    }}>
                      Verified only
                    </span>
                  </label>
                  <select
                    name="supplierId"
                    className="form-input"
                    value={formData.supplierId}
                    onChange={handleInputChange}
                  >
                    <option value="">-- No supplier linked --</option>
                    {suppliers.filter(s => s.isSupermandi).map(supplier => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.businessName || supplier.name} {supplier.supplierCode ? `[${supplier.supplierCode}]` : ''}
                      </option>
                    ))}
                  </select>
                  {suppliers.filter(s => s.isSupermandi).length === 0 && (
                    <span style={{
                      display: 'block',
                      marginTop: '4px',
                      fontSize: '0.75rem',
                      color: '#64748b',
                      backgroundColor: '#f1f5f9',
                      padding: '4px 8px',
                      borderRadius: '4px'
                    }}>
                      No verified suppliers available to link
                    </span>
                  )}
                  {!formData.supplierId && suppliers.filter(s => s.isSupermandi).length > 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Link to a verified supplier for purchase tracking on POS
                    </span>
                  )}
                </div>
              </div>

              {/* ═══ STEP 6: Tax & Compliance (Optional) ═══ */}
              <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', paddingBottom: '0.375rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 'bold' }}>6</span>
                  Tax & Compliance
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">GST %</label>
                    <select
                      name="gstPercent"
                      className="form-input"
                      value={formData.gstPercent}
                      onChange={handleInputChange}
                    >
                      <option value="">-- Select --</option>
                      <option value="0">0% (Exempt)</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">HSN Code</label>
                    <input
                      type="text"
                      name="hsn"
                      className="form-input"
                      placeholder="e.g., 1006"
                      value={formData.hsn}
                      onChange={handleInputChange}
                      style={{ fontFamily: 'monospace' }}
                    />
                    <small style={{ color: 'var(--text-muted)' }}>For GST compliance</small>
                  </div>
                </div>
              </div>

              {/* ═══ Notes (Optional) ═══ */}
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Internal Notes</label>
                <textarea
                  name="notes"
                  className="form-input"
                  placeholder="Any internal notes about this product..."
                  rows={2}
                  value={formData.notes}
                  onChange={handleInputChange}
                  style={{ resize: 'vertical' }}
                />
                <small style={{ color: 'var(--text-muted)' }}>For store use only, not shown on POS</small>
              </div>

              {/* GL-WF-029: BNPL Eligibility Toggle */}
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    name="bnplEligible"
                    checked={formData.bnplEligible}
                    onChange={(e) => setFormData({ ...formData, bnplEligible: e.target.checked })}
                    style={{ width: '1rem', height: '1rem' }}
                  />
                  <span className="form-label" style={{ margin: 0, fontWeight: 500 }}>BNPL Eligible</span>
                </label>
                <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem', marginLeft: '1.5rem' }}>
                  Allow customers to purchase this product using Buy Now, Pay Later
                </small>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.75rem' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : (editingProduct ? 'Update Product' : 'Save Product')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeForm}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Bulk Upload Section */}
        {showBulkUpload && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 className="card-title">Bulk Product Upload</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Paste product data (one per line). Format: <code>Name, Barcode, Brand, SellPrice, PurchasePrice, MRP, Unit, Stock</code>
              <br /><small>Leave barcode empty for loose/bulk products (barcode will be auto-generated).</small>
            </p>
            <div className="form-group">
              <textarea
                className="form-input"
                rows={8}
                placeholder={`Amul Butter 500g, 8901234567890, Amul, 280, 260, 295, PACK, 10
Tata Salt 1kg, 8901234567891, Tata, 28, 25, 30, PCS, 50
Loose Rice,, , 45, 40, , KG, 25`}
                value={bulkData}
                onChange={(e) => setBulkData(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleBulkPreview}
                disabled={!bulkData.trim() || isBulkSubmitting}
              >
                {isBulkSubmitting && bulkPreview.length === 0 ? 'Previewing...' : `Preview (${parseBulkData(bulkData).length} lines)`}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleBulkSubmit}
                disabled={bulkPreview.length === 0 || isBulkSubmitting}
              >
                {isBulkSubmitting ? 'Importing...' : `Import ${bulkPreview.length} Products`}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setShowBulkUpload(false); setBulkData(''); setBulkPreview([]); }}
              >
                Cancel
              </button>
            </div>

            {/* Preview Table */}
            {bulkPreview.length > 0 && (
              <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '0.375rem' }}>
                <table className="table" style={{ fontSize: '0.75rem' }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Barcode</th>
                      <th>Brand</th>
                      <th>Sell ₹</th>
                      <th>Purchase ₹</th>
                      <th>Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPreview.map((p, i) => (
                      <tr key={i}>
                        <td>{p.name}</td>
                        <td style={{ fontFamily: 'monospace' }}>{p.barcode || <em style={{ color: 'var(--text-muted)' }}>auto</em>}</td>
                        <td>{p.brand || '-'}</td>
                        <td>₹{((p.sellPrice || 0) / 100).toFixed(2)}</td>
                        <td>₹{((p.purchasePrice || 0) / 100).toFixed(2)}</td>
                        <td><span className={`badge ${p.mode === 'PACKAGED' ? 'badge-info' : 'badge-secondary'}`}>{p.mode === 'PACKAGED' ? 'Packaged' : 'Loose'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* FE-RETAILER-CAT-001: Category Filter from POS Taxonomy */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Filter by Category
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className={`btn ${selectedCategory === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
              onClick={() => setSelectedCategory('all')}
            >
              All ({products.length})
            </button>
            {categoriesLoading ? (
              <span style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading categories...</span>
            ) : (
              categories.map((cat) => (
                <button
                  key={cat.id}
                  className={`btn ${selectedCategory === cat.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                  onClick={() => setSelectedCategory(cat.id)}
                  title={cat.labelHi || cat.labelEn}
                >
                  {cat.labelEn} ({cat.productCount})
                </button>
              ))
            )}
          </div>
        </div>

        {/* Search */}
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search by name or barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ maxWidth: '400px' }}
          />
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setDeleteConfirm(null)}
          >
            <div
              className="card"
              style={{ maxWidth: '400px', margin: '1rem' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="card-title">Delete Product?</h3>
              <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
                Are you sure you want to delete this product? This will remove it from your inventory.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setDeleteConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn"
                  style={{ background: '#dc2626', color: 'white' }}
                  onClick={() => handleDelete(deleteConfirm)}
                >
                  Delete Product
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Products Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading products...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              {searchTerm ? 'No products match your search.' : 'No products yet. Add your first product above!'}
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Barcode</th>
                  <th>Name</th>
                  <th>Brand</th>
                  <th>Mode</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Supplier</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {product.barcode || product.generatedBarcode || '-'}
                    </td>
                    <td style={{ fontWeight: '500' }}>{product.name}</td>
                    <td style={{ fontSize: '0.875rem' }}>{product.brand || <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                    <td>
                      <span className={`badge ${product.mode === 'PACKAGED' ? 'badge-info' : 'badge-secondary'}`}>
                        {product.mode === 'PACKAGED' ? 'Packaged' : 'Loose'}
                      </span>
                    </td>
                    <td>₹{(product.sellPrice / 100).toFixed(2)}</td>
                    <td>
                      <span className={`badge ${
                        product.lowStockAlertQty && product.stock <= product.lowStockAlertQty
                          ? 'badge-warning'
                          : product.stock < 20
                            ? 'badge-warning'
                            : 'badge-success'
                      }`}>
                        {product.stock}
                        {product.lowStockAlertQty && product.stock <= product.lowStockAlertQty && (
                          <span title="Below alert threshold"> ⚠️</span>
                        )}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {product.supplierName || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <a
                          href={`${API_GATEWAY_BASE}/api/v1/retailer-admin/products/${product.id}/sku.pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          title="Download SKU Labels"
                        >
                          📄
                        </a>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => openEditForm(product)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#fee2e2', color: '#991b1b' }}
                          onClick={() => setDeleteConfirm(product.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Bulk Import Options */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            Have many products to add?
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={() => { setShowBulkUpload(!showBulkUpload); setShowForm(false); }}
            >
              {showBulkUpload ? 'Hide Bulk Upload' : 'Bulk Paste Upload'}
            </button>
            <a href={`/s/${storeCode}/import`} className="btn btn-secondary">
              Import from CSV
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
