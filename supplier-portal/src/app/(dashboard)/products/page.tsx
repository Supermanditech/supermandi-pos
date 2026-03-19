'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  Product,
  ProductInput,
  PaginatedResponse,
} from '@/lib/api';
import { formatCurrency } from '@/lib/formatters';
// T-113: Breadcrumb navigation
import Breadcrumb from '@/components/Breadcrumb';
// REQ.AUDIT.W4.CROSS.HARDCODED-FILE-SIZE-LIMIT.001
import { MAX_PRODUCT_IMAGE_SIZE_BYTES, MAX_PRODUCT_IMAGE_SIZE_LABEL } from '@/lib/fileLimits';
// T-121: URL state for search persistence
import { useUrlState } from '@/hooks/useUrlState';
// GAP-3: EmptyState component for consistent empty states
import EmptyState from '@/components/EmptyState';
// STG-010: Check supplier verification status
import { useAuth } from '@/lib/auth';
import { Package, Upload, X, ImageIcon } from 'lucide-react';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

// GL-WF-057: Predefined FMCG categories from taxonomy
const PRODUCT_CATEGORIES = [
  { value: '', label: 'Select Category' },
  { value: 'Atta-Dal', label: 'Atta-Dal (आटा-दाल)' },
  { value: 'Chawal', label: 'Chawal (चावल)' },
  { value: 'Masala', label: 'Masala (मसाला)' },
  { value: 'Tel-Ghee', label: 'Tel-Ghee (तेल-घी)' },
  { value: 'Namkeen', label: 'Namkeen (नमकीन)' },
  { value: 'Biscuit', label: 'Biscuit (बिस्कुट)' },
  { value: 'Chai-Coffee', label: 'Chai-Coffee (चाय-कॉफी)' },
  { value: 'Cold Drink', label: 'Cold Drink (कोल्ड ड्रिंक)' },
  { value: 'Doodh', label: 'Doodh (दूध-पनीर)' },
  { value: 'Sabun', label: 'Sabun (साबुन)' },
  { value: 'Safai', label: 'Safai (सफाई)' },
  { value: 'Baby', label: 'Baby (बेबी)' },
  { value: 'Paan-Supari', label: 'Paan-Supari (पान-सुपारी)' },
  { value: 'Baaki', label: 'Baaki - Other (बाकी)' },
];

export default function ProductsPage() {
  // STG-010: Get supplier verification status
  const { supplier } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const showAddForm = searchParams.get('action') === 'add';

  const [showForm, setShowForm] = useState(showAddForm);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  // AUDIT-SUP-024: Track which product is being resubmitted (per-product loading)
  const [resubmittingId, setResubmittingId] = useState<string | null>(null);
  // T-121: Sync search term with URL for back/forward persistence
  const [searchTerm, setSearchTerm] = useUrlState('search');
  // ISSUE-MICRO-096: Sync status filter to URL for refresh/back-button persistence
  const statusFilter = searchParams.get('status') || 'all';
  // GL-WF-062: Track unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  // ISSUE-MICRO-005: Pagination synced to URL for refresh/back-button persistence
  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
  const pageSize = 20;

  // REQ.AUDIT.W5.SUPPLIER.PRODUCTS-SAVE-DOUBLE-SUBMIT.001: synchronous guard against rapid double-submit
  const submitInflightRef = useRef(false);

  // T-161: Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploadProgress, setImageUploadProgress] = useState<number>(0);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [formData, setFormData] = useState<ProductInput>({
    name: '',
    description: '',
    category: '',
    barcode: '',
    supplierSku: '',
    purchasePrice: 0,
    mrp: undefined,
    moq: 1,
    unit: 'PCS',
    // SCALE-B5: Compliance & measurement fields
    manufacturerName: '',
    countryOfOrigin: 'India',
    netContentValue: undefined,
    netContentUnit: '',
    shelfLifeDays: undefined,
    hsnCode: '',
    // V3-FIX-169: Procurement packaging metadata
    procurementUnit: '',
    procurementPackQty: undefined,
    baseStockUnit: '',
    splitSellEligible: false,
  });

  // GL-WF-063: Paginated products query
  // GL-CRIT-0034: Track error state for API failures
  // STG-082: Pass search and status filter to backend for server-side filtering
  const { data: productsResponse, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['products', currentPage, pageSize, searchTerm, statusFilter],
    queryFn: () => getProducts({ page: currentPage, limit: pageSize, search: searchTerm || undefined, status: statusFilter === 'all' ? undefined : statusFilter }),
  });

  const products = productsResponse?.data;
  const pagination = productsResponse?.pagination;

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product created successfully!');
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create product');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductInput> }) =>
      updateProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product updated successfully!');
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update product');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted');
      setDeleteConfirm(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete product');
    },
  });

  // GL-WF-037: Resubmit rejected product for review
  const resubmitMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductInput> }) =>
      updateProduct(id, data),
    onSuccess: () => {
      setResubmittingId(null);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product resubmitted for review!');
    },
    onError: (error: Error) => {
      setResubmittingId(null);
      toast.error(error.message || 'Failed to resubmit product');
    },
  });

  // GO-LIVE-026: Handle resubmit - include ALL product fields to prevent data loss
  const handleResubmit = (product: Product) => {
    setResubmittingId(product.id);
    resubmitMutation.mutate({
      id: product.id,
      data: {
        name: product.name,
        description: product.description || '',
        category: product.category || '',
        barcode: product.barcode || '',
        supplierSku: product.supplierSku || '',
        purchasePrice: product.purchasePrice,
        mrp: product.mrp,
        moq: product.moq,
        unit: product.unit,
        // SCALE-B5: Include compliance fields to prevent data loss on resubmit
        manufacturerName: product.manufacturerName,
        countryOfOrigin: product.countryOfOrigin,
        netContentValue: product.netContentValue,
        netContentUnit: product.netContentUnit,
        shelfLifeDays: product.shelfLifeDays,
        hsnCode: product.hsnCode,
      },
    });
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingProduct(null);
    setHasUnsavedChanges(false); // GL-WF-062
    // T-161: Clear image state
    setImageFile(null);
    setImagePreview(null);
    setImageUploadProgress(0);
    setIsUploadingImage(false);
    setIsDragOver(false);
    setFormData({
      name: '',
      description: '',
      category: '',
      barcode: '',
      supplierSku: '',
      purchasePrice: 0,
      mrp: undefined,
      moq: 1,
      unit: 'PCS',
      // SCALE-B5: Compliance & measurement fields reset
      manufacturerName: '',
      countryOfOrigin: 'India',
      netContentValue: undefined,
      netContentUnit: '',
      shelfLifeDays: undefined,
      hsnCode: '',
      // V3-FIX-169: Procurement packaging reset
      procurementUnit: '',
      procurementPackQty: undefined,
      baseStockUnit: '',
      splitSellEligible: false,
    });
  };

  // GL-WF-062: Handle cancel with unsaved changes check
  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedWarning(true);
    } else {
      resetForm();
    }
  }, [hasUnsavedChanges]);

  // GL-WF-062: Warn on browser navigation with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && showForm) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, showForm]);

  // ISSUE-MICRO-019: Warn on SPA (client-side) navigation with unsaved form changes
  useEffect(() => {
    if (!hasUnsavedChanges || !showForm) return;

    const origPushState = history.pushState.bind(history);
    history.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
      if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        origPushState(data, unused, url);
      }
    };

    return () => {
      history.pushState = origPushState;
    };
  }, [hasUnsavedChanges, showForm]);

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setHasUnsavedChanges(false); // GL-WF-062: Reset on edit start
    // T-161: Load existing image preview if product has an image
    setImageFile(null);
    setImagePreview(product.imageUrl || product.thumbnailUrl || null);
    setImageUploadProgress(0);
    setIsUploadingImage(false);
    setFormData({
      name: product.name,
      description: product.description || '',
      category: product.category || '',
      barcode: product.barcode || '',
      supplierSku: product.supplierSku || '',
      purchasePrice: product.purchasePrice,
      mrp: product.mrp,
      moq: product.moq,
      unit: product.unit,
      imageUrl: product.imageUrl,
      // SCALE-B5: Pre-fill compliance & measurement fields
      manufacturerName: product.manufacturerName || '',
      countryOfOrigin: product.countryOfOrigin || 'India',
      netContentValue: product.netContentValue,
      netContentUnit: product.netContentUnit || '',
      shelfLifeDays: product.shelfLifeDays,
      hsnCode: product.hsnCode || '',
    });
    setShowForm(true);
  };

  // GL-WF-056: Validate barcode format (GTIN: 8, 12, 13, or 14 digits)
  const isValidBarcode = (barcode: string): boolean => {
    if (!barcode) return true; // Optional field
    return /^\d{8}$|^\d{12,14}$/.test(barcode);
  };

  // T-161: Image file selection handler
  const handleImageSelect = (file: File) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPEG, PNG, and WebP images are allowed');
      return;
    }
    if (file.size > MAX_PRODUCT_IMAGE_SIZE_BYTES) {
      toast.error(`Image file size must be under ${MAX_PRODUCT_IMAGE_SIZE_LABEL}`);
      return;
    }
    setImageFile(file);
    setHasUnsavedChanges(true);
    // Create local preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // T-161: Handle file input change
  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelect(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  // T-161: Handle drag-and-drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageSelect(file);
  };

  // T-161: Remove selected image
  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setHasUnsavedChanges(true);
    setFormData((prev) => ({ ...prev, imageUrl: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // REQ.AUDIT.W5.SUPPLIER.PRODUCTS-SAVE-DOUBLE-SUBMIT.001: block concurrent invocations
    if (submitInflightRef.current || isSubmitting) return;
    submitInflightRef.current = true;

    try {
      // SUP-004: Product name validation — min 2 chars, max 200
      if (!formData.name.trim()) {
        toast.error('Product name is required');
        return;
      }
      if (formData.name.trim().length < 2) {
        toast.error('Product name must be at least 2 characters');
        return;
      }
      if (formData.name.trim().length > 200) {
        toast.error('Product name cannot exceed 200 characters');
        return;
      }
      if (!formData.purchasePrice || formData.purchasePrice <= 0) {
        toast.error('Valid purchase price is required');
        return;
      }

      // GL-WF-017: Validate MRP >= Purchase Price
      if (formData.mrp && formData.mrp < formData.purchasePrice) {
        toast.error('MRP must be greater than or equal to purchase price');
        return;
      }

      // GL-WF-056: Validate barcode format
      if (formData.barcode && !isValidBarcode(formData.barcode)) {
        toast.error('Barcode must be a valid GTIN format (8, 12, 13, or 14 digits)');
        return;
      }

      // T-161: Upload image first if a new file is selected
      let submitData = { ...formData };
      if (imageFile) {
        try {
          setIsUploadingImage(true);
          setImageUploadProgress(0);
          const result = await uploadProductImage(imageFile, {
            onProgress: setImageUploadProgress,
          });
          submitData = { ...submitData, imageUrl: result.imageUrl };
          setIsUploadingImage(false);
        } catch (error) {
          setIsUploadingImage(false);
          toast.error(error instanceof Error ? error.message : 'Failed to upload image');
          return;
        }
      }

      if (editingProduct) {
        updateMutation.mutate({ id: editingProduct.id, data: submitData });
      } else {
        createMutation.mutate(submitData);
      }
    } finally {
      // Reset synchronous guard — mutation isPending state takes over from here
      submitInflightRef.current = false;
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setHasUnsavedChanges(true); // GL-WF-062: Track changes
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === 'purchasePrice' || name === 'mrp'
          // GL-CRIT-0033: Fix floating point precision (450.99 * 100 = 45098.99999...)
          ? Math.round((parseFloat(value || '0') + Number.EPSILON) * 100)
          : name === 'moq'
          ? parseInt(value) || 1
          // SCALE-B5: netContentValue and shelfLifeDays are optional positive integers
          : name === 'netContentValue' || name === 'shelfLifeDays'
          ? value === '' ? undefined : parseFloat(value) || undefined
          : value,
    }));
  };

  // Filter products
  const filteredProducts = products?.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.barcode?.includes(searchTerm) ||
      product.supplierSku?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' || product.approvalStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending || isUploadingImage;

  // ISSUE-MICRO-005: Update pagination via URL for back-button/refresh persistence
  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newPage <= 1) {
      params.delete('page');
    } else {
      params.set('page', newPage.toString());
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
  };

  // REQ.AUDIT.W5.SUPPLIER.PRODUCTS-FILTER-KEYBOARD-NAV.001: arrow key navigation for WCAG tab group
  const handleFilterKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    const statuses = ['all', 'pending', 'approved', 'rejected'];
    const currentIndex = statuses.indexOf(statusFilter);
    let newIndex = -1;
    if (e.key === 'ArrowRight') {
      newIndex = (currentIndex + 1) % statuses.length;
    } else if (e.key === 'ArrowLeft') {
      newIndex = (currentIndex - 1 + statuses.length) % statuses.length;
    }
    if (newIndex >= 0) {
      e.preventDefault();
      const newStatus = statuses[newIndex];
      const p = new URLSearchParams(searchParams.toString());
      if (newStatus === 'all') { p.delete('status'); } else { p.set('status', newStatus); }
      p.delete('page');
      router.push(`${pathname}?${p.toString()}`);
      const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[newIndex]?.focus();
    }
  }, [statusFilter, searchParams, pathname, router]);

  return (
    <div>
      {/* T-113: Breadcrumb navigation */}
      <Breadcrumb items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Products' }]} />
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Products</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage your product catalog. Products pending approval will be
            reviewed by SuperMandi.
          </p>
        </div>
        {/* GL-WF-062: Use handleCancel when form has unsaved changes */}
        {/* STG-010: Disable button when API failed or supplier unverified */}
        <button
          onClick={() => showForm ? handleCancel() : setShowForm(true)}
          className="btn btn-primary"
          disabled={!showForm && (isError || supplier?.verificationStatus !== 'verified')}
          title={isError ? 'Products failed to load' : supplier?.verificationStatus !== 'verified' ? 'Supplier verification required' : undefined}
        >
          {showForm ? 'Cancel' : '+ Add Product'}
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingProduct ? 'Edit Product' : 'Add New Product'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="product-name" className="label">Product Name *</label>
                <input
                  type="text"
                  id="product-name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., Premium Basmati Rice 5kg"
                  required
                />
              </div>

              {/* GL-WF-057: Category dropdown instead of free-text */}
              <div>
                <label htmlFor="product-category" className="label">Category</label>
                <select
                  id="product-category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="input"
                >
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="product-barcode" className="label">Barcode (GTIN/EAN)</label>
                <input
                  type="text"
                  id="product-barcode"
                  name="barcode"
                  value={formData.barcode}
                  onChange={handleChange}
                  className="input font-mono"
                  placeholder="8901234567890"
                />
              </div>

              <div>
                <label htmlFor="product-sku" className="label">Your SKU Code</label>
                <input
                  type="text"
                  id="product-sku"
                  name="supplierSku"
                  value={formData.supplierSku}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., RICE-BAS-5KG"
                />
              </div>

              <div>
                <label htmlFor="product-purchasePrice" className="label">Purchase Price (₹) *</label>
                <input
                  type="number"
                  id="product-purchasePrice"
                  name="purchasePrice"
                  value={(formData.purchasePrice / 100).toFixed(2)}
                  onChange={handleChange}
                  className="input"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  required
                />
              </div>

              <div>
                <label htmlFor="product-mrp" className="label">MRP (₹)</label>
                <input
                  type="number"
                  id="product-mrp"
                  name="mrp"
                  value={formData.mrp ? (formData.mrp / 100).toFixed(2) : ''}
                  onChange={handleChange}
                  className="input"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>

              <div>
                <label htmlFor="product-moq" className="label">Minimum Order Quantity</label>
                <input
                  type="number"
                  id="product-moq"
                  name="moq"
                  value={formData.moq}
                  onChange={handleChange}
                  className="input"
                  placeholder="1"
                  min="1"
                />
              </div>

              <div>
                <label htmlFor="product-unit" className="label">Unit</label>
                <select
                  id="product-unit"
                  name="unit"
                  value={formData.unit}
                  onChange={handleChange}
                  className="input"
                >
                  <option value="PCS">Pieces (PCS)</option>
                  <option value="KG">Kilograms (KG)</option>
                  <option value="GM">Grams (GM)</option>
                  <option value="LTR">Liters (LTR)</option>
                  <option value="ML">Milliliters (ML)</option>
                  <option value="PACK">Pack</option>
                  <option value="BOX">Box</option>
                </select>
              </div>
            </div>

            {/* STG-081: Description field removed — catalog.supplier_products has no description column.
                Re-add after migration adds the column. */}

            {/* SCALE-B5: Compliance & Measurements section */}
            <div>
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">
                Compliance &amp; Measurements
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="product-manufacturerName" className="label">Manufacturer Name</label>
                  <input
                    type="text"
                    id="product-manufacturerName"
                    name="manufacturerName"
                    value={formData.manufacturerName || ''}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g. Nestlé India Pvt Ltd"
                  />
                </div>

                <div>
                  <label htmlFor="product-countryOfOrigin" className="label">Country of Origin</label>
                  <input
                    type="text"
                    id="product-countryOfOrigin"
                    name="countryOfOrigin"
                    value={formData.countryOfOrigin || ''}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g. India"
                  />
                </div>

                <div>
                  <label htmlFor="product-netContentValue" className="label">Net Content (value)</label>
                  <input
                    type="number"
                    id="product-netContentValue"
                    name="netContentValue"
                    value={formData.netContentValue ?? ''}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g. 500"
                    min="0"
                    step="any"
                  />
                </div>

                <div>
                  <label htmlFor="product-netContentUnit" className="label">Net Content (unit)</label>
                  <select
                    id="product-netContentUnit"
                    name="netContentUnit"
                    value={formData.netContentUnit || ''}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="">Select unit</option>
                    <option value="g">g (grams)</option>
                    <option value="kg">kg (kilograms)</option>
                    <option value="ml">ml (millilitres)</option>
                    <option value="l">l (litres)</option>
                    <option value="pcs">pcs (pieces)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="product-shelfLifeDays" className="label">Shelf Life (days)</label>
                  <input
                    type="number"
                    id="product-shelfLifeDays"
                    name="shelfLifeDays"
                    value={formData.shelfLifeDays ?? ''}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g. 365 for 1 year"
                    min="1"
                  />
                </div>

                <div>
                  <label htmlFor="product-hsnCode" className="label">HSN Code</label>
                  <input
                    type="text"
                    id="product-hsnCode"
                    name="hsnCode"
                    value={formData.hsnCode || ''}
                    onChange={handleChange}
                    className="input font-mono"
                    placeholder="e.g. 19023010"
                  />
                </div>
              </div>
            </div>

            {/* V3-FIX-169: Procurement Packaging & Conversion */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Procurement Packaging</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="product-procurementUnit" className="label">Shipped As</label>
                  <select
                    id="product-procurementUnit"
                    name="procurementUnit"
                    value={formData.procurementUnit || ''}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="">Same as unit</option>
                    <option value="KG">Kilogram (KG)</option>
                    <option value="GM">Gram (GM)</option>
                    <option value="LTR">Litre (LTR)</option>
                    <option value="ML">Millilitre (ML)</option>
                    <option value="PCS">Piece (PCS)</option>
                    <option value="DOZEN">Dozen</option>
                    <option value="CARTON">Carton</option>
                    <option value="CASE">Case</option>
                    <option value="BAG">Bag</option>
                    <option value="TIN">Tin</option>
                    <option value="DRUM">Drum</option>
                    <option value="TRAY">Tray</option>
                    <option value="BOTTLE">Bottle</option>
                    <option value="PACK">Pack</option>
                  </select>
                  <p className="text-xs text-slate-400 mt-1">How you ship this product to retailers</p>
                </div>

                <div>
                  <label htmlFor="product-procurementPackQty" className="label">Units per Pack</label>
                  <input
                    type="number"
                    id="product-procurementPackQty"
                    name="procurementPackQty"
                    value={formData.procurementPackQty ?? ''}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g. 24 for a carton of 24"
                    min="0.01"
                    step="0.01"
                  />
                  <p className="text-xs text-slate-400 mt-1">Base units per procurement pack</p>
                </div>

                <div>
                  <label htmlFor="product-baseStockUnit" className="label">Stock Unit</label>
                  <select
                    id="product-baseStockUnit"
                    name="baseStockUnit"
                    value={formData.baseStockUnit || ''}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="">Auto (from unit)</option>
                    <option value="KG">Kilogram (KG)</option>
                    <option value="GM">Gram (GM)</option>
                    <option value="PCS">Piece (PCS)</option>
                    <option value="LTR">Litre (LTR)</option>
                    <option value="ML">Millilitre (ML)</option>
                  </select>
                  <p className="text-xs text-slate-400 mt-1">How retailers track this in inventory</p>
                </div>

                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      name="splitSellEligible"
                      checked={formData.splitSellEligible || false}
                      onChange={(e) => setFormData(prev => ({ ...prev, splitSellEligible: e.target.checked }))}
                      className="rounded border-slate-300"
                    />
                    Retailer can split for retail sale
                  </label>
                </div>
              </div>
            </div>

            {/* T-161: Product Image Upload */}
            <div>
              <label htmlFor="product-image-input" className="label">Product Image</label>
              {imagePreview ? (
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Product preview"
                      className="w-32 h-32 object-cover rounded-lg border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                      title="Remove image"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="text-sm text-slate-500 mt-2">
                    {imageFile ? (
                      <span>{imageFile.name} ({(imageFile.size / 1024).toFixed(0)} KB)</span>
                    ) : (
                      <span>Current product image</span>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                    isDragOver
                      ? 'border-primary-400 bg-primary-50'
                      : 'border-slate-300 hover:border-primary-400'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('product-image-input')?.click()}
                >
                  <input
                    id="product-image-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleImageInputChange}
                  />
                  <div className="flex flex-col items-center gap-2">
                    {isDragOver ? (
                      <ImageIcon size={32} className="text-primary-400" />
                    ) : (
                      <Upload size={32} className="text-slate-400" />
                    )}
                    <div className="text-sm text-slate-600">
                      <span className="font-medium text-primary-600">Click to upload</span> or drag and drop
                    </div>
                    <div className="text-xs text-slate-400">
                      JPEG, PNG, or WebP (max {MAX_PRODUCT_IMAGE_SIZE_LABEL})
                    </div>
                  </div>
                </div>
              )}
              {/* T-161: Upload progress indicator */}
              {isUploadingImage && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all duration-300"
                        style={{ width: `${imageUploadProgress}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono">{imageUploadProgress}%</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isUploadingImage
                  ? 'Uploading Image...'
                  : isSubmitting
                  ? 'Saving...'
                  : editingProduct
                  ? 'Update Product'
                  : 'Add Product'}
              </button>
              {/* GL-WF-062: Use handleCancel for unsaved changes check */}
              <button
                type="button"
                onClick={handleCancel}
                className="btn btn-secondary"
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label htmlFor="products-search" className="sr-only">Search products</label>
            <input
              type="text"
              id="products-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input"
              placeholder="Search by name, barcode, or SKU..."
            />
          </div>
          <div className="flex gap-2" role="tablist">
            {['all', 'pending', 'approved', 'rejected'].map((status) => (
              <button
                key={status}
                onClick={() => {
                  // ISSUE-MICRO-096: Sync status filter to URL params + reset to page 1
                  const params = new URLSearchParams(searchParams.toString());
                  if (status === 'all') { params.delete('status'); } else { params.set('status', status); }
                  params.delete('page');
                  router.push(`${pathname}?${params.toString()}`);
                }}
                onKeyDown={handleFilterKeyDown}
                tabIndex={statusFilter === status ? 0 : -1}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === status
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                role="tab"
                aria-selected={statusFilter === status}
                aria-label={`Filter by ${status === 'all' ? 'all statuses' : status}`}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-4" role="status" aria-label="Loading products">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 py-3 border-b border-slate-100">
                <div className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: '25%' }} />
                <div className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: '15%' }} />
                <div className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: '12%' }} />
                <div className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: '10%' }} />
                <div className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: '15%' }} />
              </div>
            ))}
          </div>
        ) : isError ? (
          /* GL-CRIT-0034: Show error state with retry button */
          <div className="p-8 text-center">
            <div className="text-red-600 font-medium mb-2">
              Failed to load products
            </div>
            <p className="text-slate-500 text-sm mb-4">
              {error instanceof Error ? error.message : 'An error occurred while loading your products.'}
            </p>
            <button
              onClick={() => refetch()}
              className="btn btn-primary"
            >
              Retry
            </button>
          </div>
        ) : filteredProducts && filteredProducts.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                  Product
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                  SKU / Barcode
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                  Price
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                  MOQ
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id} className="border-b border-slate-100">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-800 dark:text-slate-100">
                      {product.name}
                    </div>
                    {product.category && (
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        {product.category}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-sm">
                    {product.supplierSku || product.barcode || '-'}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium">
                      {product.purchasePrice != null ? formatCurrency(product.purchasePrice) : '-'}
                    </div>
                    {product.mrp != null && (
                      <div className="text-sm text-slate-500">
                        MRP: {formatCurrency(product.mrp)}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {product.moq} {product.unit}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        statusColors[product.approvalStatus] || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {product.approvalStatus}
                    </span>
                    {/* GL-WF-036: Show rejection reason */}
                    {product.approvalStatus === 'rejected' && product.rejectionReason && (
                      <div className="mt-1 text-xs text-red-600" title={product.rejectionReason}>
                        Reason: {product.rejectionReason.length > 30
                          ? `${product.rejectionReason.substring(0, 30)}...`
                          : product.rejectionReason}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(product)}
                        className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                      >
                        Edit
                      </button>
                      {/* GL-WF-037: Resubmit button for rejected products */}
                      {/* AUDIT-SUP-024: Per-product resubmit loading state */}
                      {product.approvalStatus === 'rejected' && (
                        <button
                          onClick={() => handleResubmit(product)}
                          className="text-amber-600 hover:text-amber-700 text-sm font-medium"
                          disabled={resubmittingId === product.id}
                        >
                          {resubmittingId === product.id ? 'Submitting...' : 'Resubmit'}
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteConfirm(product.id)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            icon={Package}
            title={products && products.length > 0 ? "No matching products" : "No products yet"}
            description={products && products.length > 0 ? "Try adjusting your search or filter criteria." : "Add your first product to start building your catalog."}
            action={products && products.length > 0 ? undefined : (
              <button
                onClick={() => setShowForm(true)}
                className="btn btn-primary"
              >
                + Add Product
              </button>
            )}
          />
        )}
      </div>

      {/* GL-WF-063: Pagination Controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Showing {((currentPage - 1) * pageSize) + 1} to{' '}
            {Math.min(currentPage * pageSize, pagination.total)} of {pagination.total} products
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm text-slate-600">
              Page {currentPage} of {pagination.totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === pagination.totalPages}
              className="px-3 py-1 text-sm border border-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => { if (!deleteMutation.isPending) setDeleteConfirm(null); }}
        >
          <div
            className="card max-w-md w-full mx-4"
            role="dialog"
            aria-modal="true"
            aria-label="Delete product confirmation"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Delete Product?</h3>
            <p className="text-slate-600 mb-4">
              This action cannot be undone. The product will be permanently
              removed.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                className="btn bg-red-600 text-white hover:bg-red-700"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GL-WF-062: Unsaved Changes Warning Modal */}
      {showUnsavedWarning && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowUnsavedWarning(false)}
        >
          <div
            className="card max-w-md w-full mx-4"
            role="dialog"
            aria-modal="true"
            aria-label="Discard changes confirmation"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Discard Changes?</h3>
            <p className="text-slate-600 mb-4">
              You have unsaved changes. Are you sure you want to discard them?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowUnsavedWarning(false)}
                className="btn btn-secondary"
              >
                Keep Editing
              </button>
              <button
                onClick={() => {
                  setShowUnsavedWarning(false);
                  resetForm();
                }}
                className="btn bg-amber-600 text-white hover:bg-amber-700"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
