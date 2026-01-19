import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { authFetch } from '../lib/api';

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  address: string | null;
}

interface SupplierFormData {
  name: string;
  phone: string;
  gstin: string;
  address: string;
}

const initialFormData: SupplierFormData = {
  name: '',
  phone: '',
  gstin: '',
  address: '',
};

export default function SuppliersPage() {
  const { accessToken } = useAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch suppliers from API
  const fetchSuppliers = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/v1/retailer-admin/suppliers', accessToken);

      // 401 is handled by authFetch (triggers logout)
      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch suppliers');
      }

      const data = await response.json();
      setSuppliers(data.data || []);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      setError('Failed to load suppliers. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      fetchSuppliers();
    }
  }, [accessToken]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        throw new Error('Supplier name is required');
      }

      const payload = {
        name: formData.name.trim(),
        phone: formData.phone.trim() || undefined,
        gstin: formData.gstin.trim() || undefined,
        address: formData.address.trim() || undefined,
      };

      const response = await authFetch('/api/v1/retailer-admin/suppliers', accessToken, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // 401 is handled by authFetch (triggers logout)
      if (response.status === 401) {
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to create supplier');
      }

      setSuccess('Supplier created successfully!');
      setFormData(initialFormData);
      setShowForm(false);

      // Refresh supplier list
      await fetchSuppliers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create supplier. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSuppliers = suppliers.filter(
    s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
         (s.phone && s.phone.includes(searchTerm)) ||
         (s.gstin && s.gstin.includes(searchTerm))
  );

  return (
    <>
      <header className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="page-title">Suppliers</h1>
          <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setError(''); setSuccess(''); }}>
            {showForm ? 'Cancel' : '+ Add Supplier'}
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

        {/* Add Supplier Form */}
        {showForm && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 className="card-title">Add New Supplier</h3>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-2" style={{ marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Supplier Name *</label>
                  <input
                    type="text"
                    name="name"
                    className="form-input"
                    placeholder="Enter supplier name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    className="form-input"
                    placeholder="+91 9876543210"
                    value={formData.phone}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">GSTIN (optional)</label>
                  <input
                    type="text"
                    name="gstin"
                    className="form-input"
                    placeholder="27AAACP1234A1ZC"
                    value={formData.gstin}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Address</label>
                <textarea
                  name="address"
                  className="form-input"
                  rows={2}
                  placeholder="Enter supplier address"
                  value={formData.address}
                  onChange={handleInputChange}
                ></textarea>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Supplier'}
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
            placeholder="Search by name, phone, or GSTIN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ maxWidth: '400px' }}
          />
        </div>

        {/* Suppliers Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading suppliers...
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              {searchTerm ? 'No suppliers match your search.' : 'No suppliers yet. Add your first supplier above!'}
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Supplier Name</th>
                  <th>Phone</th>
                  <th>GSTIN</th>
                  <th>Address</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td style={{ fontWeight: '500' }}>{supplier.name}</td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {supplier.phone || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                      {supplier.gstin || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </td>
                    <td style={{ fontSize: '0.875rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {supplier.address || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </td>
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

        {/* Info */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#eff6ff', borderRadius: '0.5rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <strong>Tip:</strong> Suppliers can also be created automatically during CSV import
            if you include supplier_name and supplier_phone columns.
          </p>
        </div>
      </div>
    </>
  );
}
