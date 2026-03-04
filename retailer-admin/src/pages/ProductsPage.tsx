import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import { fetchCategories, FmcgCategory } from '../api/store';
// CURRENCY-FORMAT-001: Use shared currency formatters
import { formatCurrency } from '../lib/formatters';
// T-058: Variant management for LOOSE_BULK products
import VariantManager from '../components/VariantManager';
// T-112: Breadcrumb navigation
import Breadcrumb from '../components/Breadcrumb';
// T-120: URL state for search persistence
import { useUrlState } from '../hooks/useUrlState';
// GAP-2: EmptyState component for consistent empty states
import EmptyState from '../components/EmptyState';
import { Package } from 'lucide-react';
import { useUnsavedChanges } from '../hooks/useNavigationSafety';
import { logger } from '../lib/logger';

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

// T-187: Static fallback categories for Indian FMCG — used when categories API is unavailable
const FALLBACK_FMCG_CATEGORIES: FmcgCategory[] = [
  { id: 'staples', labelEn: 'Staples', labelHi: null, iconKey: 'grain', sortOrder: 1, productCount: 0, stockValue: 0 },
  { id: 'cooking-oil', labelEn: 'Cooking Oil', labelHi: null, iconKey: 'droplet', sortOrder: 2, productCount: 0, stockValue: 0 },
  { id: 'dairy', labelEn: 'Dairy', labelHi: null, iconKey: 'milk', sortOrder: 3, productCount: 0, stockValue: 0 },
  { id: 'beverages', labelEn: 'Beverages', labelHi: null, iconKey: 'cup', sortOrder: 4, productCount: 0, stockValue: 0 },
  { id: 'snacks', labelEn: 'Snacks', labelHi: null, iconKey: 'cookie', sortOrder: 5, productCount: 0, stockValue: 0 },
  { id: 'personal-care', labelEn: 'Personal Care', labelHi: null, iconKey: 'heart', sortOrder: 6, productCount: 0, stockValue: 0 },
  { id: 'cleaning', labelEn: 'Cleaning', labelHi: null, iconKey: 'sparkle', sortOrder: 7, productCount: 0, stockValue: 0 },
  { id: 'spices', labelEn: 'Spices', labelHi: null, iconKey: 'flame', sortOrder: 8, productCount: 0, stockValue: 0 },
  { id: 'pulses', labelEn: 'Pulses', labelHi: null, iconKey: 'bean', sortOrder: 9, productCount: 0, stockValue: 0 },
  { id: 'ready-to-eat', labelEn: 'Ready to Eat', labelHi: null, iconKey: 'utensils', sortOrder: 10, productCount: 0, stockValue: 0 },
  { id: 'baby-care', labelEn: 'Baby Care', labelHi: null, iconKey: 'baby', sortOrder: 11, productCount: 0, stockValue: 0 },
  { id: 'health', labelEn: 'Health', labelHi: null, iconKey: 'plus', sortOrder: 12, productCount: 0, stockValue: 0 },
  { id: 'confectionery', labelEn: 'Confectionery', labelHi: null, iconKey: 'candy', sortOrder: 13, productCount: 0, stockValue: 0 },
  { id: 'frozen', labelEn: 'Frozen', labelHi: null, iconKey: 'snowflake', sortOrder: 14, productCount: 0, stockValue: 0 },
  { id: 'other', labelEn: 'Other', labelHi: null, iconKey: 'box', sortOrder: 15, productCount: 0, stockValue: 0 },
];

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
  // RET-AUD-040: Track supplier fetch errors for user feedback
  const [supplierFetchError, setSupplierFetchError] = useState(false);
  // T-120: Sync search term with URL for back/forward persistence
  const [searchTerm, setSearchTerm] = useUrlState('search');

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
  // ISSUE-MICRO-003: Synchronous guard prevents double-click race (useState is async)
  const submittingRef = useRef(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createdProduct, setCreatedProduct] = useState<ProductCreateResponse['data'] | null>(null);

  // T-058: Variant management state
  const [variantProduct, setVariantProduct] = useState<{ id: string; name: string } | null>(null);

  // LIVE.NAV.RETAILER.PRODUCT_FORM_GUARD.001: Snapshot form state on open for dirty tracking
  const formOpenSnapshotRef = useRef<string>('');

  // Bulk upload state
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkData, setBulkData] = useState('');
  const [bulkPreview, setBulkPreview] = useState<Partial<Product>[]>([]);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  // LIVE.NAV.RETAILER.PRODUCT_FORM_GUARD.001: Unsaved-change guard
  const isFormDirty = useMemo(() => {
    if (!showForm && !showBulkUpload) return false;
    if (showBulkUpload) return bulkData.trim() !== '';
    return formOpenSnapshotRef.current !== '' &&
      JSON.stringify(formData) !== formOpenSnapshotRef.current;
  }, [showForm, showBulkUpload, formData, bulkData]);
  useUnsavedChanges(isFormDirty);

  // Handle ?action=create and ?category=... query params from dashboard navigation
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'create') {
      setShowForm(true);
      setEditingProduct(null);
      setFormData(initialFormData);
      formOpenSnapshotRef.current = JSON.stringify(initialFormData);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
    // RCAT-CAT-001 + ISSUE-MICRO-092: Sync category from URL (persisted for back-button support)
    const catParam = searchParams.get('category');
    setSelectedCategory(catParam || 'all');
    // T-120: ?search= is now handled by useUrlState — no manual sync needed
  }, [searchParams, setSearchParams]);

  // RCAT-CAT-001: Fetch products from API with optional category filter
  // ISSUE-MICRO-044: silent=true skips loading state to preserve scroll after mutations
  // ISSUE-MICRO-079: signal allows cancellation on unmount
  const fetchProducts = async (categoryFilter?: string, options?: { signal?: AbortSignal; silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setError('');
    try {
      const cat = categoryFilter || selectedCategory;
      const params = new URLSearchParams();
      if (cat && cat !== 'all') params.set('categoryId', cat);
      const url = `/api/v1/retailer-admin/products${params.toString() ? '?' + params.toString() : ''}`;
      const response = await authFetch(url, accessToken, { signal: options?.signal });
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch products');
      const data = await safeJson(response);
      setProducts(data?.data || []);
    } catch (err) {
      // ISSUE-MICRO-079: Don't set error state on abort (component unmounted)
      if (err instanceof DOMException && err.name === 'AbortError') return;
      logger.error('Error fetching products:', err);
      setError('Failed to load products. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch suppliers for dropdown
  // RET-AUD-040: Updated to show errors to user instead of silent failure
  // ISSUE-MICRO-079: Accept AbortSignal to cancel on unmount
  const fetchSuppliers = async (signal?: AbortSignal) => {
    setSupplierFetchError(false);
    try {
      const response = await authFetch('/api/v1/retailer-admin/suppliers', accessToken, { signal });
      if (response.status === 401) return;
      if (!response.ok) {
        // RET-AUD-040: Show feedback that supplier list couldn't be loaded
        setSupplierFetchError(true);
        return;
      }
      const data = await safeJson(response);
      setSuppliers(data?.data || []);
    } catch (err) {
      // ISSUE-MICRO-079: Don't set error state on abort (component unmounted)
      if (err instanceof DOMException && err.name === 'AbortError') return;
      logger.error('Error fetching suppliers:', err);
      // RET-AUD-040: Show feedback that supplier list couldn't be loaded
      setSupplierFetchError(true);
    }
  };

  // STG-736: Auth-aware PDF download — plain <a href> doesn't send auth headers
  const downloadSkuPdf = async (productId: string) => {
    if (!accessToken) return;
    try {
      const res = await authFetch(`/api/v1/retailer-admin/products/${productId}/sku.pdf`, accessToken);
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sku_${productId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download SKU PDF');
    }
  };

  // ISSUE-MICRO-079: AbortController cancels in-flight requests on unmount/re-render
  // FIX-021: Removed fetchProducts from init effect — category effect (below) handles it on mount
  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();

    fetchSuppliers(controller.signal);

    // FE-RETAILER-CAT-001: Load categories from POS taxonomy
    // T-187: Falls back to static Indian FMCG categories if API unavailable
    const loadCategories = async () => {
      setCategoriesLoading(true);
      try {
        const result = await fetchCategories(accessToken);
        // Filter out "Sab" (All) category - we'll add our own "All" option
        const fetched = (result.data || []).filter(c => c.sortOrder > 0);
        if (fetched.length > 0) {
          setCategories(fetched);
        } else {
          // T-187: Use static fallback when API returns empty
          setCategories(FALLBACK_FMCG_CATEGORIES);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        logger.error('Failed to load categories:', err);
        // T-187: Use static fallback when API fails
        setCategories(FALLBACK_FMCG_CATEGORIES);
      } finally {
        setCategoriesLoading(false);
      }
    };
    loadCategories();

    return () => controller.abort();
  }, [accessToken]);

  // RCAT-CAT-001: Re-fetch products when category changes (also fires on mount)
  // ISSUE-MICRO-079: AbortController cancels stale category fetches
  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    fetchProducts(selectedCategory, { signal: controller.signal });
    return () => controller.abort();
  }, [selectedCategory, accessToken]);

  // FIX-021: Ref to avoid re-registering visibility handler on every category change
  const selectedCategoryRef = useRef(selectedCategory);
  selectedCategoryRef.current = selectedCategory;

  // RCAT-SYNC-001: Auto-refresh products when tab regains focus (detect POS edits)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && accessToken) {
        fetchProducts(selectedCategoryRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [accessToken]); // FIX-021: Removed selectedCategory dep — uses ref instead

  // ISSUE-MICRO-092: Category select handler — syncs state + URL for back-button support
  const handleCategorySelect = (catId: string) => {
    setSelectedCategory(catId);
    const newParams = new URLSearchParams(searchParams);
    if (catId === 'all') {
      newParams.delete('category');
    } else {
      newParams.set('category', catId);
    }
    setSearchParams(newParams);
  };

  // Open edit form
  const openEditForm = (product: Product) => {
    setEditingProduct(product);
    const editData: ProductFormData = {
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
    };
    setFormData(editData);
    formOpenSnapshotRef.current = JSON.stringify(editData);
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
      const data = await safeJson(response);
      if (!response.ok) {
        throw new Error(data?.error?.message || 'Failed to delete product');
      }
      setSuccess('Product deleted successfully!');
      setDeleteConfirm(null);
      // ISSUE-MICRO-044: Silent refresh preserves scroll position after mutation
      await fetchProducts(undefined, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete product.');
      setDeleteConfirm(null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // GL-CRIT-0035: Barcode validation for common formats
  // Accepts: EAN-13, EAN-8, UPC-A (12 digits), UPC-E (8 digits), or alphanumeric internal codes
  const validateBarcode = (barcode: string): string | null => {
    if (!barcode || !barcode.trim()) return null; // Empty is allowed
    const trimmed = barcode.trim();

    // Allow only alphanumeric, hyphens, and underscores (common for internal SKUs)
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return 'Barcode can only contain letters, numbers, hyphens, and underscores';
    }

    // If all numeric, validate length for standard formats
    if (/^\d+$/.test(trimmed)) {
      const len = trimmed.length;
      // Standard barcode lengths: EAN-8 (8), UPC-A (12), EAN-13 (13), ITF-14 (14)
      if (len < 8 || (len > 8 && len < 12) || len > 14) {
        return 'Numeric barcodes should be 8, 12, 13, or 14 digits (EAN-8, UPC-A, EAN-13, ITF-14)';
      }
    }

    // Length check for all barcodes
    if (trimmed.length > 50) {
      return 'Barcode is too long (max 50 characters)';
    }

    return null; // Valid
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
    // ISSUE-MICRO-003: Synchronous guard — useRef is instant, useState has 0-300ms lag
    if (submittingRef.current) return;
    submittingRef.current = true;
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

      // RET-005: Name length sanity check
      if (formData.name.trim().length > 200) {
        throw new Error('Product name cannot exceed 200 characters');
      }

      // RET-005: Sell price >= purchase price sanity warning (not blocking, common in retail)
      const sellPriceNum = parseFloat(formData.sellPrice);
      const purchasePriceNum = parseFloat(formData.purchasePrice);
      if (sellPriceNum < purchasePriceNum) {
        // Allow it but this is a data integrity signal; backend handles margin calculations
        logger.warn('[RET-005] Sell price is below purchase price — negative margin');
      }

      // GL-CRIT-0035: Validate barcode format
      if (formData.mode === 'PACKAGED' && formData.barcode) {
        const barcodeError = validateBarcode(formData.barcode);
        if (barcodeError) {
          throw new Error(barcodeError);
        }
      }

      // CRITICAL: Convert rupees to paise (integer minor units)
      // FIX-018: String-based parsing to avoid floating-point rounding errors
      const rupeesToPaise = (rupees: string | undefined): number | undefined => {
        if (!rupees) return undefined;
        const trimmed = rupees.trim();
        if (!trimmed || isNaN(Number(trimmed))) return undefined;
        const [whole = '0', frac = ''] = trimmed.split('.');
        return parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, '0').slice(0, 2), 10);
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

      // AUD-025-B: Handle 409 CONFLICT (stale update rejected by LWW)
      // GL-CRIT-0101: Differentiate error handling by status code
      // R6.RET.001: Removed duplicate 401 silent return — show user-friendly message instead
      if (response.status === 401) {
        throw new Error('Session expired. Please log in again.');
      }
      if (response.status === 403) {
        throw new Error('You do not have permission to perform this action.');
      }
      if (response.status === 404) {
        throw new Error('Product not found. It may have been deleted.');
      }
      if (response.status === 409) {
        await safeJson(response); // consume response body
        throw new Error('This product was updated elsewhere. Please refresh and try again.');
      }
      if (response.status === 422) {
        const errData = await safeJson(response) as { error?: { message?: string; details?: Record<string, string> } } | null;
        const details = errData?.error?.details;
        if (details && Object.keys(details).length > 0) {
          const fieldErrors = Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(', ');
          throw new Error(`Validation error: ${fieldErrors}`);
        }
        throw new Error(errData?.error?.message || 'Validation failed. Please check your input.');
      }

      const data = await safeJson(response) as ProductCreateResponse;

      if (!response.ok) {
        // GL-CRIT-0101: Differentiate 4xx client errors from 5xx server errors
        const errMsg = (data as unknown as { error?: { message?: string } }).error?.message;
        if (response.status >= 500) {
          throw new Error(errMsg || 'Server error. Please try again later or contact support.');
        }
        throw new Error(errMsg || `Failed to ${isEdit ? 'update' : 'create'} product`);
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

      // ISSUE-MICRO-044: Silent refresh preserves scroll position after mutation
      await fetchProducts(undefined, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product. Please try again.');
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
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
      // FIX-018: String-based parsing to avoid floating-point rounding errors
      const rupeesToPaise = (rupees: string | undefined): number | undefined => {
        if (!rupees) return undefined;
        const trimmed = rupees.trim();
        if (!trimmed || isNaN(Number(trimmed))) return undefined;
        const [whole = '0', frac = ''] = trimmed.split('.');
        return parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, '0').slice(0, 2), 10);
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
      const data = await safeJson(response);
      if (!response.ok) {
        throw new Error(data?.error?.message || 'Failed to preview products');
      }
      const rows = data?.data?.previewRows || [];
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
      if (data?.data?.invalidCount > 0) {
        setError(`${data.data.invalidCount} row(s) have errors. Fix them before importing.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview products.');
      // RET-C2-002: Clear stale preview on error to avoid count/table mismatch
      setBulkPreview([]);
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
      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data?.error?.message || 'Failed to import products');
      }

      const created = data?.data?.created || 0;
      // STG-214: Report partial failures from bulk paste
      const errors = data?.data?.errors || data?.data?.categorizedWarnings || [];
      if (errors.length > 0) {
        setSuccess(`Imported ${created} products. ${errors.length} row(s) failed — check the data and retry those rows.`);
      } else {
        setSuccess(`Successfully imported ${created} products!`);
      }
      setBulkData('');
      setBulkPreview([]);
      setShowBulkUpload(false);
      // ISSUE-MICRO-044: Silent refresh preserves scroll position after mutation
      await fetchProducts(undefined, { silent: true });
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

  // STG-483: Auth loading guard
  if (!accessToken) return <div className="text-center-muted">Loading...</div>;

  return (
    <>
      {/* T-112: Breadcrumb navigation */}
      <div className="breadcrumb-wrap">
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Products' }]} />
      </div>
      <header className="page-header">
        <div className="flex-between">
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
                formOpenSnapshotRef.current = JSON.stringify(initialFormData);
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
          <div className="alert-inline-success">
            {success}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="alert-inline-error">
            {error}
          </div>
        )}

        {/* Add/Edit Product Form */}
        {showForm && (
          <div className="card prod-form-card">
            <h3 className="card-title prod-form-title">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
            <form onSubmit={handleSubmit}>
              {/* Success: Show created product info with SKU PDF download */}
              {createdProduct && (
                <div className="prod-created-box">
                  <div className="prod-created-header">
                    <span className="prod-created-icon">✅</span>
                    <strong className="prod-created-title">Product Synced to POS!</strong>
                  </div>

                  {createdProduct.storeProduct.mode === 'LOOSE_BULK' && createdProduct.generatedBarcode && (
                    <div className="prod-barcode-block">
                      <p className="prod-barcode-text">
                        <strong>Generated Barcode:</strong>
                        <code className="prod-barcode-code">
                          {createdProduct.generatedBarcode}
                        </code>
                      </p>
                      <p className="prod-barcode-hint">
                        Scan this barcode in POS SELL to add this product.
                      </p>
                    </div>
                  )}

                  {createdProduct.storeProduct.mode === 'PACKAGED' && createdProduct.barcode && (
                    <p className="prod-barcode-text">
                      <strong>Barcode:</strong>
                      <code className="prod-barcode-code">
                        {createdProduct.barcode}
                      </code>
                    </p>
                  )}

                  <div className="prod-created-actions">
                    <button
                      type="button"
                      className="btn btn-primary prod-sku-link"
                      onClick={() => downloadSkuPdf(createdProduct.productId)}
                    >
                      📄 Download SKU Labels (PDF)
                    </button>
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
              <div className="prod-form-section">
                <label className="form-label prod-step-label">
                  <span className="prod-step-badge">1</span>
                  Product Mode *
                </label>
                <div className="prod-mode-options">
                  <label
                    className="prod-mode-label"
                    style={{
                      border: `2px solid ${formData.mode === 'PACKAGED' ? 'var(--primary)' : 'var(--border)'}`,
                      background: formData.mode === 'PACKAGED' ? 'var(--primary-light)' : 'var(--surface)',
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
                      <small className="sup-small-hint">Has manufacturer barcode</small>
                    </span>
                  </label>

                  <label
                    className="prod-mode-label"
                    style={{
                      border: `2px solid ${formData.mode === 'LOOSE_BULK' ? 'var(--primary)' : 'var(--border)'}`,
                      background: formData.mode === 'LOOSE_BULK' ? 'var(--primary-light)' : 'var(--surface)',
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
                      <small className="sup-small-hint">Barcode auto-generated</small>
                    </span>
                  </label>
                </div>
                {formData.mode === 'LOOSE_BULK' && (
                  <p className="prod-mode-hint">
                    💡 A store-scoped barcode will be generated. Download the SKU PDF to print labels.
                  </p>
                )}
              </div>

              {/* ═══ STEP 2: Product Identity ═══ */}
              <div className="prod-form-section">
                <h4 className="prod-section-title">
                  <span className="prod-step-badge">2</span>
                  Product Identity
                </h4>
                {/* Row 1: Name (wide) + Brand (narrow) */}
                <div className="prod-grid-2-1">
                  <div className="form-group">
                    <label className="form-label" htmlFor="prod-name">Product Name *</label>
                    <input
                      id="prod-name"
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
                    <label className="form-label" htmlFor="prod-brand">Brand</label>
                    <input
                      id="prod-brand"
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
                    <label className="form-label" htmlFor="prod-alias">Alias / Local Name</label>
                    <input
                      id="prod-alias"
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
                    <label className="form-label" htmlFor="prod-categoryId">Category</label>
                    <select
                      id="prod-categoryId"
                      className="form-input"
                      value={formData.categoryId}
                      onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    >
                      <option value="">Auto-detect from name</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.labelEn}</option>
                      ))}
                    </select>
                    <small className="sup-small-hint">Leave as "Auto-detect" to assign category automatically, or select manually to override.</small>
                  </div>

                  {formData.mode === 'PACKAGED' && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="prod-barcode">Barcode (GTIN/EAN)</label>
                      <input
                        id="prod-barcode"
                        type="text"
                        name="barcode"
                        className="form-input prod-barcode-input"
                        placeholder="8901030865432"
                        value={formData.barcode}
                        onChange={handleInputChange}
                      />
                      <small className="sup-small-hint">Optional - leave blank if no barcode</small>
                    </div>
                  )}
                </div>
              </div>

              {/* ═══ STEP 3: Measurement & Packaging ═══ */}
              <div className="prod-form-section">
                <h4 className="prod-section-title">
                  <span className="prod-step-badge">3</span>
                  Measurement & Packaging
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: formData.mode === 'PACKAGED' ? '1fr 1fr 1fr' : formData.mode === 'LOOSE_BULK' ? '1fr 1fr 1fr' : '1fr', gap: '0.75rem', alignItems: 'start' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="prod-unit">Unit *</label>
                    <select
                      id="prod-unit"
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
                        <label className="form-label" htmlFor="prod-packSize">Pack Size</label>
                        <input
                          id="prod-packSize"
                          type="number"
                          name="packSize"
                          className="form-input"
                          placeholder="e.g., 500"
                          min="0"
                          value={formData.packSize}
                          onChange={handleInputChange}
                        />
                        <small className="sup-small-hint">Quantity in pack (e.g., 500 for 500g)</small>
                      </div>

                      {/* Pack Unit - RCAT-PROD-002: Custom editable option */}
                      <div className="form-group">
                        <label className="form-label" htmlFor="prod-packUnit">Pack Unit</label>
                        <select
                          id="prod-packUnit"
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
                        <small className="sup-small-hint">Unit for pack size</small>
                      </div>
                    </>
                  )}

                  {/* Mode-specific: Loose/Bulk fields */}
                  {formData.mode === 'LOOSE_BULK' && (
                    <>
                      <div className="form-group">
                        <label className="form-label" htmlFor="prod-soldBy">Sold By *</label>
                        <select
                          id="prod-soldBy"
                          name="soldBy"
                          className="form-input"
                          value={formData.soldBy}
                          onChange={handleInputChange}
                          required
                        >
                          <option value="WEIGHT">Weight (KG/GM)</option>
                          <option value="COUNT">Count (pieces)</option>
                        </select>
                        <small className="sup-small-hint">How product is measured at sale</small>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="prod-rateUnit">Rate Unit *</label>
                        <select
                          id="prod-rateUnit"
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
                        <small className="sup-small-hint">Unit for price rate</small>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ═══ STEP 4: Pricing ═══ */}
              <div className="prod-form-section">
                <h4 className="prod-section-title">
                  <span className="prod-step-badge">4</span>
                  Pricing
                </h4>
                <div className="prod-grid-3">
                  <div className="form-group">
                    <label className="form-label" htmlFor="prod-purchasePrice">Purchase (₹) *</label>
                    <input
                      id="prod-purchasePrice"
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
                    <small className="sup-small-hint">Required for ledger tracking</small>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="prod-sellPrice">Sell (₹) *</label>
                    <input
                      id="prod-sellPrice"
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
                    <label className="form-label" htmlFor="prod-mrp">MRP (₹)</label>
                    <input
                      id="prod-mrp"
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
              <div className="prod-form-section">
                <h4 className="prod-section-title">
                  <span className="prod-step-badge">5</span>
                  Stock & Supplier
                </h4>
                {/* Row 1: Two small qty fields */}
                <div className="prod-grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="prod-openingStockQty">Opening Stock</label>
                    <input
                      id="prod-openingStockQty"
                      type="number"
                      name="openingStockQty"
                      className={`form-input${editingProduct ? ' prod-disabled-stock' : ''}`}
                      placeholder="0"
                      min="0"
                      value={formData.openingStockQty}
                      onChange={handleInputChange}
                      // GL-CRIT-0040: Disable in edit mode to prevent inventory ledger bypass
                      disabled={!!editingProduct}
                    />
                    <small className="sup-small-hint">
                      {editingProduct
                        ? 'Cannot modify opening stock for existing products (use inventory adjustments)'
                        : 'Creates ledger entry if > 0'}
                    </small>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="prod-lowStockAlertQty">Low Stock Alert</label>
                    <input
                      id="prod-lowStockAlertQty"
                      type="number"
                      name="lowStockAlertQty"
                      className="form-input"
                      placeholder="e.g., 10"
                      min="0"
                      value={formData.lowStockAlertQty}
                      onChange={handleInputChange}
                    />
                    <small className="sup-small-hint">Alert when stock falls below this</small>
                  </div>
                </div>

                {/* Row 2: Supplier full width */}
                {/* RCAT-SUP-003: Supplier dropdown */}
                <div className="form-group">
                  <label className="form-label" htmlFor="prod-supplierId">
                    Supplier (optional)
                    <span className="prod-supplier-badge">
                      Verified only
                    </span>
                  </label>
                  <select
                    id="prod-supplierId"
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
                  {/* RET-AUD-040: Show error when supplier fetch fails */}
                  {supplierFetchError && (
                    <span style={{
                      display: 'block',
                      marginTop: '4px',
                      fontSize: '0.75rem',
                      color: 'var(--action-danger-text)',
                      backgroundColor: 'var(--action-danger-bg)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--action-danger-text)'
                    }}>
                      Failed to load suppliers. You can still add products without a supplier.
                    </span>
                  )}
                  {!supplierFetchError && suppliers.filter(s => s.isSupermandi).length === 0 && (
                    <span style={{
                      display: 'block',
                      marginTop: '4px',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      backgroundColor: 'var(--bg-alt)',
                      padding: '4px 8px',
                      borderRadius: '4px'
                    }}>
                      No verified suppliers available to link
                    </span>
                  )}
                  {!formData.supplierId && suppliers.filter(s => s.isSupermandi).length > 0 && (
                    <small className="sup-small-hint">
                      Link to a verified supplier for purchase tracking on POS
                    </small>
                  )}
                </div>
              </div>

              {/* ═══ STEP 6: Tax & Compliance (Optional) ═══ */}
              <div className="prod-form-section">
                <h4 className="prod-section-title">
                  <span className="prod-step-badge">6</span>
                  Tax & Compliance
                </h4>
                <div className="prod-grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="prod-gstPercent">GST %</label>
                    <select
                      id="prod-gstPercent"
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
                    <label className="form-label" htmlFor="prod-hsn">HSN Code</label>
                    <input
                      id="prod-hsn"
                      type="text"
                      name="hsn"
                      className="form-input prod-barcode-input"
                      placeholder="e.g., 1006"
                      value={formData.hsn}
                      onChange={handleInputChange}
                    />
                    <small className="sup-small-hint">For GST compliance</small>
                  </div>
                </div>
              </div>

              {/* ═══ Notes (Optional) ═══ */}
              <div className="form-group prod-form-mb">
                <label className="form-label" htmlFor="prod-notes">Internal Notes</label>
                <textarea
                  id="prod-notes"
                  name="notes"
                  className="form-input prod-textarea"
                  placeholder="Any internal notes about this product..."
                  rows={2}
                  value={formData.notes}
                  onChange={handleInputChange}
                />
                <small className="sup-small-hint">For store use only, not shown on POS</small>
              </div>

              {/* GL-WF-029: BNPL Eligibility Toggle */}
              <div className="form-group prod-form-mb">
                <label className="prod-checkbox-label">
                  <input
                    type="checkbox"
                    name="bnplEligible"
                    checked={formData.bnplEligible}
                    onChange={(e) => setFormData({ ...formData, bnplEligible: e.target.checked })}
                    className="prod-checkbox"
                  />
                  <span className="form-label prod-form-label-inline">BNPL Eligible</span>
                </label>
                <small className="sup-small-hint" style={{ display: 'block', marginTop: '0.25rem', marginLeft: '1.5rem' }}>
                  Allow customers to purchase this product using Buy Now, Pay Later
                </small>
              </div>

              <div className="prod-created-actions" style={{ paddingTop: '0.75rem' }}>
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
          <div className="card prod-bulk-card">
            <h3 className="card-title">Bulk Product Upload</h3>
            <p className="text-sm-muted" style={{ marginBottom: '1rem' }}>
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
            <div className="prod-bulk-actions" style={{ marginBottom: '1rem' }}>
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
              <div className="prod-bulk-preview">
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
                        <td className="prod-table-barcode">{p.barcode || <em className="sup-small-hint">auto</em>}</td>
                        <td>{p.brand || '-'}</td>
                        <td>{formatCurrency(p.sellPrice || 0)}</td>
                        <td>{formatCurrency(p.purchasePrice || 0)}</td>
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
        <div className="prod-search-wrap">
          <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>
            Filter by Category
          </label>
          <div className="prod-cat-bar">
            <button
              className={`prod-cat-btn${selectedCategory === 'all' ? ' prod-cat-btn--active' : ''}`}
              onClick={() => handleCategorySelect('all')}
            >
              All ({products.length})
            </button>
            {categoriesLoading ? (
              <span className="sup-small-hint" style={{ padding: '0.5rem' }}>Loading categories...</span>
            ) : (
              categories.map((cat) => (
                <button
                  key={cat.id}
                  className={`prod-cat-btn${selectedCategory === cat.id ? ' prod-cat-btn--active' : ''}`}
                  onClick={() => handleCategorySelect(cat.id)}
                  title={cat.labelHi || cat.labelEn}
                >
                  {cat.labelEn} ({cat.productCount})
                </button>
              ))
            )}
          </div>
        </div>

        {/* Search */}
        <div className="prod-search-wrap">
          <input
            type="text"
            className="form-input"
            placeholder="Search by name or barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search products by name or barcode"
            style={{ maxWidth: '400px' }}
          />
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div
            className="modal-overlay-custom"
            onClick={() => setDeleteConfirm(null)}
          >
            <div
              className="card"
              style={{ maxWidth: '400px', margin: '1rem' }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-product-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="delete-product-title" className="card-title">Delete Product?</h3>
              <p className="text-sm-muted" style={{ marginBottom: '1rem' }}>
                Are you sure you want to delete this product? This will remove it from your inventory.
              </p>
              <div className="prod-created-actions" style={{ justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setDeleteConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
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
            <div className="text-sm-muted" style={{ padding: '2rem', textAlign: 'center' }}>
              Loading products...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div>
              {/* ISSUE-MICRO-048: Distinguish error state from empty state */}
              {error
                ? <div className="prod-stock-low" style={{ padding: '2rem', textAlign: 'center' }}>Could not load products. Please try again.</div>
                : <EmptyState
                    icon={<Package size={24} />}
                    title={searchTerm ? 'No products match your search' : 'No products yet'}
                    description={searchTerm
                      ? 'Try a different search term or clear the search.'
                      : 'Add your first product to get started with inventory management.'}
                    action={!searchTerm ? (
                      <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditingProduct(null); setFormData(initialFormData); formOpenSnapshotRef.current = JSON.stringify(initialFormData); }}>
                        + Add Product
                      </button>
                    ) : undefined}
                  />}
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
                    <td className="prod-table-barcode">
                      {product.barcode || product.generatedBarcode || '-'}
                    </td>
                    <td style={{ fontWeight: '500' }}>{product.name}</td>
                    <td className="text-sm-muted">{product.brand || <span className="sup-small-hint">-</span>}</td>
                    <td>
                      <span className={`badge ${product.mode === 'PACKAGED' ? 'badge-info' : 'badge-secondary'}`}>
                        {product.mode === 'PACKAGED' ? 'Packaged' : 'Loose'}
                      </span>
                    </td>
                    <td>{formatCurrency(product.sellPrice)}</td>
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
                    <td className="text-sm-muted">
                      {product.supplierName || <span className="sup-small-hint">-</span>}
                    </td>
                    <td>
                      <div className="prod-table-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          title="Download SKU Labels"
                          onClick={() => downloadSkuPdf(product.id)}
                        >
                          📄
                        </button>
                        {product.mode === 'LOOSE_BULK' && (
                          <button
                            className="btn"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'var(--action-info-bg)', color: 'var(--action-info-text)' }}
                            onClick={() => setVariantProduct({ id: product.id, name: product.name })}
                          >
                            Variants
                          </button>
                        )}
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => openEditForm(product)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'var(--action-danger-bg)', color: 'var(--action-danger-text)' }}
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
        <div className="prod-form-section" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <p className="sup-small-hint" style={{ marginBottom: '0.75rem' }}>
            Have many products to add?
          </p>
          <div className="prod-created-actions" style={{ justifyContent: 'center' }}>
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

      {/* T-058: Variant Manager Modal */}
      {variantProduct && (
        <VariantManager
          storeProductId={variantProduct.id}
          productName={variantProduct.name}
          onClose={() => setVariantProduct(null)}
        />
      )}
    </>
  );
}
