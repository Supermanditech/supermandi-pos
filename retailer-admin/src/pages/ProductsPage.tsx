import { useState } from 'react';
import { useParams } from 'react-router-dom';

interface Product {
  id: string;
  barcode: string;
  name: string;
  sellPrice: number;
  stock: number;
  unit: string;
}

// Mock data for demo
const mockProducts: Product[] = [
  { id: '1', barcode: '8901030865432', name: 'Parle-G 100g', sellPrice: 10, stock: 150, unit: 'pcs' },
  { id: '2', barcode: '8901030865433', name: 'Tata Salt 1kg', sellPrice: 28, stock: 80, unit: 'pcs' },
  { id: '3', barcode: '', name: 'Loose Rice', sellPrice: 55, stock: 25, unit: 'kg' },
  { id: '4', barcode: '8901030865434', name: 'Amul Butter 500g', sellPrice: 275, stock: 12, unit: 'pcs' },
  { id: '5', barcode: '', name: 'Fresh Tomatoes', sellPrice: 40, stock: 30, unit: 'kg' },
];

export default function ProductsPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);

  const filteredProducts = mockProducts.filter(
    p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
         p.barcode.includes(searchTerm)
  );

  return (
    <>
      <header className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="page-title">Products</h1>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '➕ Add Product'}
          </button>
        </div>
      </header>

      <div className="page-content">
        {/* Add Product Form */}
        {showForm && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 className="card-title">Add New Product</h3>
            <form onSubmit={(e) => { e.preventDefault(); setShowForm(false); }}>
              <div className="grid grid-2" style={{ marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Barcode (optional)</label>
                  <input type="text" className="form-input" placeholder="8901030865432" />
                </div>
                <div className="form-group">
                  <label className="form-label">Product Name *</label>
                  <input type="text" className="form-input" placeholder="Enter product name" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Sell Price *</label>
                  <input type="number" className="form-input" placeholder="0.00" step="0.01" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Unit *</label>
                  <select className="form-input" required>
                    <option value="pcs">Pieces</option>
                    <option value="kg">Kilograms</option>
                    <option value="g">Grams</option>
                    <option value="l">Liters</option>
                    <option value="ml">Milliliters</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Opening Stock</label>
                  <input type="number" className="form-input" placeholder="0" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary">Save Product</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
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
          <table className="table">
            <thead>
              <tr>
                <th>Barcode</th>
                <th>Name</th>
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
        </div>

        {/* Bulk Import Link */}
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Have many products to add?
          </p>
          <a href={`/s/${storeCode}/import`} className="btn btn-secondary">
            📥 Import from CSV
          </a>
        </div>
      </div>
    </>
  );
}
