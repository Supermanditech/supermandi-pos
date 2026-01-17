import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

interface Product {
  id: string;
  barcode: string;
  name: string;
  description?: string;
  type: 'branded' | 'loose';
  sellPrice: number;
  purchasePrice?: number;
  mrp?: number;
  stock: number;
  unit: string;
}

interface ProductFormData {
  barcode: string;
  name: string;
  description: string;
  type: 'branded' | 'loose';
  unit: string;
  purchasePrice: string;
  sellPrice: string;
  mrp: string;
  openingStock: string;
}

const initialFormData: ProductFormData = {
  barcode: '',
  name: '',
  description: '',
  type: 'branded',
  unit: 'pcs',
  purchasePrice: '',
  sellPrice: '',
  mrp: '',
  openingStock: '0',
};

export default function ProductsPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch products from API
  const fetchProducts = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/v1/retailer-admin/products', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch products');
      }

      const data = await response.json();
      setProducts(data.data || []);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to load products. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      fetchProducts();
    }
  }, [accessToken]);

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
        unit: formData.unit,
        purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : undefined,
        sellPrice: parseFloat(formData.sellPrice),
        mrp: formData.mrp ? parseFloat(formData.mrp) : undefined,
        openingStock: parseInt(formData.openingStock) || 0,
      };

      const response = await fetch('/api/v1/retailer-admin/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to create product');
      }

      setSuccess('Product created successfully!');
      setFormData(initialFormData);
      setShowForm(false);

      // Refresh product list
      await fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product. Please try again.');
    } finally {
      setIsSubmitting(false);
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
          <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setError(''); setSuccess(''); }}>
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

        {/* Add Product Form */}
        {showForm && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 className="card-title">Add New Product</h3>
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
                  {isSubmitting ? 'Saving...' : 'Save Product'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowForm(false); setFormData(initialFormData); }}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </div>
            </form>
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
                  <th>Type</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Unit</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td style={{ fontFamily: 'monospace' }}>{product.barcode || '-'}</td>
                    <td>{product.name}</td>
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
                    <td>{product.unit}</td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Bulk Import Link */}
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Have many products to add?
          </p>
          <a href={`/s/${storeCode}/import`} className="btn btn-secondary">
            Import from CSV
          </a>
        </div>
      </div>
    </>
  );
}
