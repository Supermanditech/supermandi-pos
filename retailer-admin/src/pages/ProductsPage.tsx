import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch } from '../lib/api';

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
  barcode: string;
  name: string;
  description?: string;
  type: 'branded' | 'loose';
  category?: string;
  brand?: string;
  sellPrice: number;
  purchasePrice?: number;
  mrp?: number;
  stock: number;
  unit: string;
  supplierId?: string;
  supplierName?: string;
}

interface ProductFormData {
  barcode: string;
  name: string;
  description: string;
  type: 'branded' | 'loose';
  category: string;
  brand: string;
  unit: string;
  purchasePrice: string;
  sellPrice: string;
  mrp: string;
  openingStock: string;
  supplierId: string;
}

// Common product categories for Indian kirana stores
const PRODUCT_CATEGORIES = [
  'Groceries',
  'Dairy & Milk',
  'Fruits & Vegetables',
  'Snacks & Beverages',
  'Personal Care',
  'Household',
  'Spices & Masala',
  'Rice & Flour',
  'Oil & Ghee',
  'Pulses & Dals',
  'Tea & Coffee',
  'Biscuits & Cookies',
  'Frozen Foods',
  'Baby Products',
  'Pet Supplies',
  'Stationery',
  'Other',
];

const initialFormData: ProductFormData = {
  barcode: '',
  name: '',
  description: '',
  type: 'branded',
  category: '',
  brand: '',
  unit: 'pcs',
  purchasePrice: '',
  sellPrice: '',
  mrp: '',
  openingStock: '0',
  supplierId: '',
};

export default function ProductsPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Bulk upload state
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkData, setBulkData] = useState('');
  const [bulkPreview, setBulkPreview] = useState<Partial<Product>[]>([]);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  // Fetch products from API
  const fetchProducts = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/v1/retailer-admin/products', accessToken);
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
    }
  }, [accessToken]);

  // Open edit form
  const openEditForm = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      barcode: product.barcode || '',
      name: product.name,
      description: product.description || '',
      type: product.type,
      category: product.category || '',
      brand: product.brand || '',
      unit: product.unit,
      purchasePrice: product.purchasePrice ? String(product.purchasePrice) : '',
      sellPrice: String(product.sellPrice),
      mrp: product.mrp ? String(product.mrp) : '',
      openingStock: String(product.stock),
      supplierId: product.supplierId || '',
    });
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  // Close form
  const closeForm = () => {
    setShowForm(false);
    setEditingProduct(null);
    setFormData(initialFormData);
    setError('');
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

  const handleTypeChange = (type: 'branded' | 'loose') => {
    setFormData(prev => ({ ...prev, type }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        throw new Error('Product name is required');
      }
      if (!formData.sellPrice || parseFloat(formData.sellPrice) <= 0) {
        throw new Error('Valid sell price is required');
      }

      const payload = {
        barcode: formData.barcode.trim() || undefined,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        type: formData.type,
        category: formData.category || undefined,
        brand: formData.brand.trim() || undefined,
        unit: formData.unit,
        purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : undefined,
        sellPrice: parseFloat(formData.sellPrice),
        mrp: formData.mrp ? parseFloat(formData.mrp) : undefined,
        openingStock: parseInt(formData.openingStock) || 0,
        supplierId: formData.supplierId || undefined,
      };

      const isEdit = !!editingProduct;
      const url = isEdit
        ? `/api/v1/retailer-admin/products/${editingProduct.id}`
        : '/api/v1/retailer-admin/products';
      const method = isEdit ? 'PATCH' : 'POST';

      const response = await authFetch(url, accessToken, {
        method,
        body: JSON.stringify(payload),
      });

      if (response.status === 401) return;
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || `Failed to ${isEdit ? 'update' : 'create'} product`);
      }

      setSuccess(`Product ${isEdit ? 'updated' : 'created'} successfully!`);
      closeForm();
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
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      const [name, barcode, category, brand, sellPrice, purchasePrice, mrp, unit, stock] = parts.map(p => p?.trim());

      return {
        name: name || '',
        barcode: barcode || '',
        category: category || '',
        brand: brand || '',
        sellPrice: sellPrice ? parseFloat(sellPrice) : 0,
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) : undefined,
        mrp: mrp ? parseFloat(mrp) : undefined,
        unit: unit || 'pcs',
        stock: stock ? parseInt(stock) : 0,
        type: barcode ? 'branded' as const : 'loose' as const,
      };
    }).filter(p => p.name); // Filter out empty rows
  };

  const handleBulkPreview = () => {
    const parsed = parseBulkData(bulkData);
    setBulkPreview(parsed);
  };

  const handleBulkSubmit = async () => {
    if (bulkPreview.length === 0) return;

    setIsBulkSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await authFetch('/api/v1/retailer-admin/products/bulk', accessToken, {
        method: 'POST',
        body: JSON.stringify({ products: bulkPreview }),
      });

      if (response.status === 401) return;
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to import products');
      }

      setSuccess(`Successfully imported ${data.imported || bulkPreview.length} products!`);
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
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 className="card-title">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
            <form onSubmit={handleSubmit}>
              {/* Product Type Selection */}
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" style={{ marginBottom: '0.75rem', display: 'block' }}>Product Type *</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem 1.25rem',
                      border: `2px solid ${formData.type === 'branded' ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      background: formData.type === 'branded' ? 'var(--primary-light)' : 'white',
                      transition: 'all 0.2s',
                      flex: '1',
                      maxWidth: '200px',
                    }}
                    onClick={() => handleTypeChange('branded')}
                  >
                    <input
                      type="radio"
                      name="productType"
                      checked={formData.type === 'branded'}
                      onChange={() => handleTypeChange('branded')}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span>
                      <strong>Branded</strong>
                      <br />
                      <small style={{ color: 'var(--text-muted)' }}>Has barcode/MRP</small>
                    </span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem 1.25rem',
                      border: `2px solid ${formData.type === 'loose' ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      background: formData.type === 'loose' ? 'var(--primary-light)' : 'white',
                      transition: 'all 0.2s',
                      flex: '1',
                      maxWidth: '200px',
                    }}
                    onClick={() => handleTypeChange('loose')}
                  >
                    <input
                      type="radio"
                      name="productType"
                      checked={formData.type === 'loose'}
                      onChange={() => handleTypeChange('loose')}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span>
                      <strong>Loose</strong>
                      <br />
                      <small style={{ color: 'var(--text-muted)' }}>Sold by weight</small>
                    </span>
                  </label>
                </div>
              </div>

              <div className="grid grid-2" style={{ marginBottom: '1rem' }}>
                {/* Barcode - only for branded products */}
                {formData.type === 'branded' && (
                  <div className="form-group">
                    <label className="form-label">Barcode</label>
                    <input
                      type="text"
                      name="barcode"
                      className="form-input"
                      placeholder="8901030865432"
                      value={formData.barcode}
                      onChange={handleInputChange}
                    />
                  </div>
                )}

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

                <div className="form-group" style={{ gridColumn: formData.type === 'loose' ? 'span 2' : 'auto' }}>
                  <label className="form-label">Description</label>
                  <input
                    type="text"
                    name="description"
                    className="form-input"
                    placeholder="Brief description (optional)"
                    value={formData.description}
                    onChange={handleInputChange}
                  />
                </div>

                {/* Category dropdown */}
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    name="category"
                    className="form-input"
                    value={formData.category}
                    onChange={handleInputChange}
                  >
                    <option value="">Select category...</option>
                    {PRODUCT_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Brand text input */}
                <div className="form-group">
                  <label className="form-label">Brand</label>
                  <input
                    type="text"
                    name="brand"
                    className="form-input"
                    placeholder="e.g., Amul, Tata, Fortune"
                    value={formData.brand}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Unit *</label>
                  <select
                    name="unit"
                    className="form-input"
                    value={formData.unit}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="pcs">Pieces</option>
                    <option value="kg">Kilograms</option>
                    <option value="g">Grams</option>
                    <option value="l">Liters</option>
                    <option value="ml">Milliliters</option>
                  </select>
                </div>

                {/* Supplier dropdown with verification enforcement */}
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
                      Only verified suppliers sync to POS
                    </span>
                  </label>
                  <select
                    name="supplierId"
                    className="form-input"
                    value={formData.supplierId}
                    onChange={handleInputChange}
                    style={{
                      borderColor: formData.supplierId && !suppliers.find(s => s.id === formData.supplierId)?.isSupermandi
                        ? '#fbbf24'
                        : undefined
                    }}
                  >
                    <option value="">-- No supplier linked --</option>
                    {/* Verified suppliers first */}
                    {suppliers.filter(s => s.isSupermandi).length > 0 && (
                      <optgroup label="Verified Suppliers (POS visible)">
                        {suppliers.filter(s => s.isSupermandi).map(supplier => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.businessName || supplier.name} {supplier.supplierCode ? `[${supplier.supplierCode}]` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {/* Unverified suppliers */}
                    {suppliers.filter(s => !s.isSupermandi).length > 0 && (
                      <optgroup label="Local Suppliers (not on POS)">
                        {suppliers.filter(s => !s.isSupermandi).map(supplier => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.businessName || supplier.name} (Local)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {formData.supplierId && !suppliers.find(s => s.id === formData.supplierId)?.isSupermandi && (
                    <span style={{
                      display: 'block',
                      marginTop: '4px',
                      fontSize: '0.75rem',
                      color: '#b45309',
                      backgroundColor: '#fef3c7',
                      padding: '4px 8px',
                      borderRadius: '4px'
                    }}>
                      This supplier is not verified. Product will not show supplier link on POS.
                    </span>
                  )}
                  {!formData.supplierId && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Link to a verified supplier for purchase tracking on POS
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Purchase Price</label>
                  <input
                    type="number"
                    name="purchasePrice"
                    className="form-input"
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    value={formData.purchasePrice}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Sell Price *</label>
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

                {/* MRP - only for branded products */}
                {formData.type === 'branded' && (
                  <div className="form-group">
                    <label className="form-label">MRP</label>
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
                )}

                <div className="form-group">
                  <label className="form-label">Opening Stock</label>
                  <input
                    type="number"
                    name="openingStock"
                    className="form-input"
                    placeholder="0"
                    min="0"
                    value={formData.openingStock}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
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
              Paste product data (one per line). Format: <code>Name, Barcode, Category, Brand, SellPrice, PurchasePrice, MRP, Unit, Stock</code>
            </p>
            <div className="form-group">
              <textarea
                className="form-input"
                rows={8}
                placeholder={`Amul Butter 500g, 8901234567890, Dairy & Milk, Amul, 280, 260, 295, pcs, 10
Tata Salt 1kg, 8901234567891, Groceries, Tata, 28, 25, 30, pcs, 50
Loose Rice,,Rice & Flour,,45,40,,kg,25`}
                value={bulkData}
                onChange={(e) => setBulkData(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleBulkPreview}
                disabled={!bulkData.trim()}
              >
                Preview ({parseBulkData(bulkData).length} items)
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
                      <th>Category</th>
                      <th>Brand</th>
                      <th>Sell ₹</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPreview.map((p, i) => (
                      <tr key={i}>
                        <td>{p.name}</td>
                        <td style={{ fontFamily: 'monospace' }}>{p.barcode || '-'}</td>
                        <td>{p.category || '-'}</td>
                        <td>{p.brand || '-'}</td>
                        <td>₹{p.sellPrice}</td>
                        <td><span className={`badge ${p.type === 'branded' ? 'badge-info' : 'badge-secondary'}`}>{p.type}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
                  <th>Category</th>
                  <th>Brand</th>
                  <th>Type</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Supplier</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{product.barcode || '-'}</td>
                    <td style={{ fontWeight: '500' }}>{product.name}</td>
                    <td style={{ fontSize: '0.875rem' }}>{product.category || <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                    <td style={{ fontSize: '0.875rem' }}>{product.brand || <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                    <td>
                      <span className={`badge ${product.type === 'branded' ? 'badge-info' : 'badge-secondary'}`}>
                        {product.type}
                      </span>
                    </td>
                    <td>₹{product.sellPrice}</td>
                    <td>
                      <span className={`badge ${product.stock < 20 ? 'badge-warning' : 'badge-success'}`}>
                        {product.stock}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {product.supplierName || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
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
