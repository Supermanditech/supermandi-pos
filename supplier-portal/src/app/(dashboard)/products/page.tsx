'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  Product,
  ProductInput,
  PaginatedResponse,
} from '@/lib/api';

function formatPrice(paise: number | undefined): string {
  if (!paise) return '-';
  return `₹${(paise / 100).toFixed(2)}`;
}

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
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const showAddForm = searchParams.get('action') === 'add';

  const [showForm, setShowForm] = useState(showAddForm);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  // GL-WF-062: Track unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  // GL-WF-063: Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

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
  });

  // GL-WF-063: Paginated products query
  const { data: productsResponse, isLoading } = useQuery({
    queryKey: ['products', currentPage, pageSize],
    queryFn: () => getProducts({ page: currentPage, limit: pageSize }),
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
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product resubmitted for review!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to resubmit product');
    },
  });

  // GL-WF-037: Handle resubmit - triggers update which resets to pending
  const handleResubmit = (product: Product) => {
    resubmitMutation.mutate({
      id: product.id,
      data: {
        name: product.name,
        category: product.category || '',
        purchasePrice: product.purchasePrice,
        mrp: product.mrp,
        moq: product.moq,
        unit: product.unit,
      },
    });
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingProduct(null);
    setHasUnsavedChanges(false); // GL-WF-062
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

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setHasUnsavedChanges(false); // GL-WF-062: Reset on edit start
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
    });
    setShowForm(true);
  };

  // GL-WF-056: Validate barcode format (GTIN: 8, 12, 13, or 14 digits)
  const isValidBarcode = (barcode: string): boolean => {
    if (!barcode) return true; // Optional field
    return /^\d{8}$|^\d{12,14}$/.test(barcode);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Product name is required');
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

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: formData });
    } else {
      createMutation.mutate(formData);
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
          ? Math.round(parseFloat(value || '0') * 100)
          : name === 'moq'
          ? parseInt(value) || 1
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

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Products</h1>
          <p className="text-slate-500 mt-1">
            Manage your product catalog. Products pending approval will be
            reviewed by SuperMandi.
          </p>
        </div>
        {/* GL-WF-062: Use handleCancel when form has unsaved changes */}
        <button
          onClick={() => showForm ? handleCancel() : setShowForm(true)}
          className="btn btn-primary"
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
                <label className="label">Product Name *</label>
                <input
                  type="text"
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
                <label className="label">Category</label>
                <select
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
                <label className="label">Barcode (GTIN/EAN)</label>
                <input
                  type="text"
                  name="barcode"
                  value={formData.barcode}
                  onChange={handleChange}
                  className="input font-mono"
                  placeholder="8901234567890"
                />
              </div>

              <div>
                <label className="label">Your SKU Code</label>
                <input
                  type="text"
                  name="supplierSku"
                  value={formData.supplierSku}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., RICE-BAS-5KG"
                />
              </div>

              <div>
                <label className="label">Purchase Price (₹) *</label>
                <input
                  type="number"
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
                <label className="label">MRP (₹)</label>
                <input
                  type="number"
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
                <label className="label">Minimum Order Quantity</label>
                <input
                  type="number"
                  name="moq"
                  value={formData.moq}
                  onChange={handleChange}
                  className="input"
                  placeholder="1"
                  min="1"
                />
              </div>

              <div>
                <label className="label">Unit</label>
                <select
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

            <div>
              <label className="label">Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                className="input"
                rows={3}
                placeholder="Product description..."
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting
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
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input"
              placeholder="Search by name, barcode, or SKU..."
            />
          </div>
          <div className="flex gap-2">
            {['all', 'pending', 'approved', 'rejected'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === status
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
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
          <div className="p-8 text-center text-slate-500">
            Loading products...
          </div>
        ) : filteredProducts && filteredProducts.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Product
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  SKU / Barcode
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Price
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  MOQ
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id} className="border-b border-slate-100">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-800">
                      {product.name}
                    </div>
                    {product.category && (
                      <div className="text-sm text-slate-500">
                        {product.category}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-sm">
                    {product.supplierSku || product.barcode || '-'}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium">
                      {formatPrice(product.purchasePrice)}
                    </div>
                    {product.mrp && (
                      <div className="text-sm text-slate-500">
                        MRP: {formatPrice(product.mrp)}
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
                      {product.approvalStatus === 'rejected' && (
                        <button
                          onClick={() => handleResubmit(product)}
                          className="text-amber-600 hover:text-amber-700 text-sm font-medium"
                          disabled={resubmitMutation.isPending}
                        >
                          {resubmitMutation.isPending ? 'Submitting...' : 'Resubmit'}
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
          <div className="p-8 text-center text-slate-500">
            <p>No products found.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-2 text-primary-600 hover:text-primary-700 font-medium"
            >
              Add your first product
            </button>
          </div>
        )}
      </div>

      {/* GL-WF-063: Pagination Controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-4 py-3 bg-white border border-slate-200 rounded-lg">
          <div className="text-sm text-slate-600">
            Showing {((currentPage - 1) * pageSize) + 1} to{' '}
            {Math.min(currentPage * pageSize, pagination.total)} of {pagination.total} products
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm text-slate-600">
              Page {currentPage} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
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
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="card max-w-md w-full mx-4"
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
