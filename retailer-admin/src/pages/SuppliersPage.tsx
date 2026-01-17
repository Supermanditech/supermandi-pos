import { useState } from 'react';

interface Supplier {
  id: string;
  name: string;
  phone: string;
  gstin: string;
  productsCount: number;
  lastOrder: string;
}

// Mock data
const mockSuppliers: Supplier[] = [
  { id: '1', name: 'Parle Products Pvt Ltd', phone: '+91 9876543210', gstin: '27AAACP1234A1ZC', productsCount: 45, lastOrder: '2024-01-15' },
  { id: '2', name: 'Tata Consumer Products', phone: '+91 9876543211', gstin: '27AAACT5678B1ZD', productsCount: 32, lastOrder: '2024-01-14' },
  { id: '3', name: 'Local Vegetable Supplier', phone: '+91 9876543212', gstin: '', productsCount: 18, lastOrder: '2024-01-18' },
  { id: '4', name: 'Amul India', phone: '+91 9876543213', gstin: '24AAACA8910C1ZE', productsCount: 28, lastOrder: '2024-01-12' },
];

export default function SuppliersPage() {
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSuppliers = mockSuppliers.filter(
    s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
         s.phone.includes(searchTerm) ||
         s.gstin.includes(searchTerm)
  );

  return (
    <>
      <header className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="page-title">Suppliers</h1>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '➕ Add Supplier'}
          </button>
        </div>
      </header>

      <div className="page-content">
        {/* Add Supplier Form */}
        {showForm && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 className="card-title">Add New Supplier</h3>
            <form onSubmit={(e) => { e.preventDefault(); setShowForm(false); }}>
              <div className="grid grid-2" style={{ marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Supplier Name *</label>
                  <input type="text" className="form-input" placeholder="Enter supplier name" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone *</label>
                  <input type="tel" className="form-input" placeholder="+91 9876543210" required />
                </div>
                <div className="form-group">
                  <label className="form-label">GSTIN (optional)</label>
                  <input type="text" className="form-input" placeholder="27AAACP1234A1ZC" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email (optional)</label>
                  <input type="email" className="form-input" placeholder="supplier@example.com" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-input" rows={2} placeholder="Enter supplier address"></textarea>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary">Save Supplier</button>
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
            placeholder="Search by name, phone, or GSTIN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ maxWidth: '400px' }}
          />
        </div>

        {/* Suppliers Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Supplier Name</th>
                <th>Phone</th>
                <th>GSTIN</th>
                <th>Products</th>
                <th>Last Order</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td style={{ fontWeight: '500' }}>{supplier.name}</td>
                  <td style={{ fontFamily: 'monospace' }}>{supplier.phone}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {supplier.gstin || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                  </td>
                  <td>{supplier.productsCount}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{supplier.lastOrder}</td>
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

        {/* Info */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#eff6ff', borderRadius: '0.5rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            💡 <strong>Tip:</strong> Suppliers can also be created automatically during CSV import
            if you include supplier_name and supplier_phone columns.
          </p>
        </div>
      </div>
    </>
  );
}
