// T-058: Variant Manager Component for LOOSE_BULK Products
// Manages retail selling units (e.g., 1kg, 5kg, 500gm) for loose products

import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import { formatCurrency } from '../lib/formatters';

interface Variant {
  id: string;
  storeProductId: string;
  variantLabel: string;
  variantQty: number;
  baseUnit: string;
  sellPriceMinor: number;
  barcode: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

interface VariantFormData {
  label: string;
  qty: string;
  baseUnit: string;
  sellPriceMinor: string;
}

const VALID_UNITS = ['KG', 'GM', 'LTR', 'ML', 'PCS', 'DOZEN'] as const;

const initialVariantForm: VariantFormData = {
  label: '',
  qty: '',
  baseUnit: 'KG',
  sellPriceMinor: '',
};

interface Props {
  storeProductId: string;
  productName: string;
  onClose: () => void;
}

export default function VariantManager({ storeProductId, productName, onClose }: Props) {
  const { accessToken } = useAuth();
  const [variants, setVariants] = useState<Variant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<VariantFormData>(initialVariantForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<VariantFormData>(initialVariantForm);

  // Load variants
  useEffect(() => {
    loadVariants();
  }, [storeProductId]);

  async function loadVariants() {
    setIsLoading(true);
    setError('');
    try {
      const res = await authFetch(
        `/api/v1/retailer-admin/products/${storeProductId}/variants`,
        accessToken
      );
      const data = await safeJson(res);
      if (res.ok) {
        setVariants(data.data || []);
      } else {
        setError(data?.error?.message || 'Failed to load variants');
      }
    } catch {
      setError('Network error loading variants');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAdd() {
    if (!formData.label.trim() || !formData.qty || !formData.sellPriceMinor) {
      setError('Please fill all required fields');
      return;
    }

    const qty = parseFloat(formData.qty);
    // FIX-018: String-based parsing to avoid floating-point rounding errors
    const [whole = '0', frac = ''] = formData.sellPriceMinor.split('.');
    const price = parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, '0').slice(0, 2), 10);

    if (isNaN(qty) || qty <= 0) {
      setError('Quantity must be a positive number');
      return;
    }
    if (isNaN(price) || price < 0) {
      setError('Price must be non-negative');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const res = await authFetch(
        `/api/v1/retailer-admin/products/${storeProductId}/variants`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            variants: [{
              label: formData.label.trim(),
              qty,
              baseUnit: formData.baseUnit,
              sellPriceMinor: price,
            }],
          }),
        }
      );
      const data = await safeJson(res);
      if (res.ok) {
        setSuccess('Variant added');
        setFormData(initialVariantForm);
        setShowAddForm(false);
        await loadVariants();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data?.error?.message || 'Failed to add variant');
      }
    } catch {
      setError('Network error');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdate(variantId: string) {
    const qty = parseFloat(editForm.qty);
    // FIX-018: String-based parsing to avoid floating-point rounding errors
    const [whole2 = '0', frac2 = ''] = editForm.sellPriceMinor.split('.');
    const price = parseInt(whole2, 10) * 100 + parseInt(frac2.padEnd(2, '0').slice(0, 2), 10);

    if (!editForm.label.trim()) {
      setError('Label is required');
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      setError('Quantity must be positive');
      return;
    }
    if (isNaN(price) || price < 0) {
      setError('Price must be non-negative');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const res = await authFetch(
        `/api/v1/retailer-admin/products/${storeProductId}/variants/${variantId}`,
        accessToken,
        {
          method: 'PATCH',
          body: JSON.stringify({
            label: editForm.label.trim(),
            qty,
            baseUnit: editForm.baseUnit,
            sellPriceMinor: price,
          }),
        }
      );
      const data = await safeJson(res);
      if (res.ok) {
        setSuccess('Variant updated');
        setEditingId(null);
        await loadVariants();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data?.error?.message || 'Failed to update variant');
      }
    } catch {
      setError('Network error');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(variantId: string) {
    if (!confirm('Deactivate this variant?')) return;
    setError('');
    try {
      const res = await authFetch(
        `/api/v1/retailer-admin/products/${storeProductId}/variants/${variantId}`,
        accessToken,
        { method: 'DELETE' }
      );
      const data = await safeJson(res);
      if (res.ok) {
        setSuccess('Variant deactivated');
        await loadVariants();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data?.error?.message || 'Failed to delete variant');
      }
    } catch {
      setError('Network error');
    }
  }

  function startEdit(v: Variant) {
    setEditingId(v.id);
    setEditForm({
      label: v.variantLabel,
      qty: String(v.variantQty),
      baseUnit: v.baseUnit,
      sellPriceMinor: String(v.sellPriceMinor / 100), // paise → rupees for display
    });
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'white', borderRadius: '0.75rem', padding: '1.5rem',
        width: '90%', maxWidth: '700px', maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Retail Variants</h3>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {productName}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666',
          }}>
            &times;
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>
        )}
        {success && (
          <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{success}</div>
        )}

        {/* Variant List */}
        {isLoading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading variants...</p>
        ) : variants.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            <p>No variants defined yet.</p>
            <p style={{ fontSize: '0.875rem' }}>
              Add selling units like "1 kg", "500 gm", etc. with individual prices.
            </p>
          </div>
        ) : (
          <table className="table" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th>Label</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Price</th>
                <th>Barcode</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id}>
                  {editingId === v.id ? (
                    <>
                      <td>
                        <input
                          type="text"
                          value={editForm.label}
                          onChange={(e) => setEditForm(p => ({ ...p, label: e.target.value }))}
                          style={{ width: '80px', padding: '0.25rem' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={editForm.qty}
                          onChange={(e) => setEditForm(p => ({ ...p, qty: e.target.value }))}
                          style={{ width: '60px', padding: '0.25rem' }}
                          step="0.01"
                          min="0.01"
                        />
                      </td>
                      <td>
                        <select
                          value={editForm.baseUnit}
                          onChange={(e) => setEditForm(p => ({ ...p, baseUnit: e.target.value }))}
                          style={{ padding: '0.25rem' }}
                        >
                          {VALID_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={editForm.sellPriceMinor}
                          onChange={(e) => setEditForm(p => ({ ...p, sellPriceMinor: e.target.value }))}
                          style={{ width: '70px', padding: '0.25rem' }}
                          step="0.01"
                          min="0"
                          placeholder="Rs"
                        />
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{v.barcode}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                            onClick={() => handleUpdate(v.id)}
                            disabled={isSubmitting}
                          >
                            Save
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ fontWeight: 500 }}>{v.variantLabel}</td>
                      <td>{v.variantQty}</td>
                      <td>{v.baseUnit}</td>
                      <td>{formatCurrency(v.sellPriceMinor)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{v.barcode}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                            onClick={() => startEdit(v)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', background: '#fee2e2', color: '#991b1b' }}
                            onClick={() => handleDelete(v.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Add Variant Form */}
        {showAddForm ? (
          <div style={{
            padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem',
            border: '1px solid var(--border)', marginBottom: '1rem',
          }}>
            <h4 style={{ margin: '0 0 0.75rem' }}>Add Variant</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem', alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                  Label *
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. 1 kg"
                  value={formData.label}
                  onChange={(e) => setFormData(p => ({ ...p, label: e.target.value }))}
                  style={{ padding: '0.4rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                  Quantity *
                </label>
                <input
                  type="number"
                  className="form-control"
                  placeholder="e.g. 1"
                  value={formData.qty}
                  onChange={(e) => setFormData(p => ({ ...p, qty: e.target.value }))}
                  step="0.01"
                  min="0.01"
                  style={{ padding: '0.4rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                  Unit *
                </label>
                <select
                  className="form-control"
                  value={formData.baseUnit}
                  onChange={(e) => setFormData(p => ({ ...p, baseUnit: e.target.value }))}
                  style={{ padding: '0.4rem' }}
                >
                  {VALID_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                  Sell Price (Rs) *
                </label>
                <input
                  type="number"
                  className="form-control"
                  placeholder="e.g. 50"
                  value={formData.sellPriceMinor}
                  onChange={(e) => setFormData(p => ({ ...p, sellPriceMinor: e.target.value }))}
                  step="0.01"
                  min="0"
                  style={{ padding: '0.4rem' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button
                className="btn btn-primary"
                onClick={handleAdd}
                disabled={isSubmitting}
                style={{ fontSize: '0.875rem' }}
              >
                {isSubmitting ? 'Adding...' : 'Add Variant'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => { setShowAddForm(false); setFormData(initialVariantForm); }}
                style={{ fontSize: '0.875rem' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => setShowAddForm(true)}
            style={{ width: '100%', marginBottom: '1rem' }}
          >
            + Add Variant
          </button>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
