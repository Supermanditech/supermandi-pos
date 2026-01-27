'use client';

import { useState } from 'react';
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

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const showAddForm = searchParams.get('action') === 'add';

  const [showForm, setShowForm] = useState(showAddForm);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
  });

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

  const resetForm = () => {
    setShowForm(false);
    setEditingProduct(null);
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

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
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
        <button
          onClick={() => setShowForm(!showForm)}
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

              <div>
                <label className="label">Category</label>
                <input
                  type="text"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., Grocery, Beverages"
                />
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
              <button
                type="button"
                onClick={resetForm}
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
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(product)}
                        className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                      >
                        Edit
                      </button>
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
    </div>
  );
}
