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

// V3-FIX-168: Common kirana retail variant suggestions by stock unit
const SUGGESTED_VARIANTS: Record<string, Array<{ label: string; qty: number; unit: string }>> = {
  KG: [
    { label: '250 g', qty: 0.25, unit: 'KG' },
    { label: '500 g', qty: 0.5, unit: 'KG' },
    { label: '1 kg', qty: 1, unit: 'KG' },
    { label: '5 kg', qty: 5, unit: 'KG' },
  ],
  GM: [
    { label: '100 g', qty: 100, unit: 'GM' },
    { label: '250 g', qty: 250, unit: 'GM' },
    { label: '500 g', qty: 500, unit: 'GM' },
  ],
  LTR: [
    { label: '250 ml', qty: 0.25, unit: 'LTR' },
    { label: '500 ml', qty: 0.5, unit: 'LTR' },
    { label: '1 L', qty: 1, unit: 'LTR' },
  ],
  ML: [
    { label: '100 ml', qty: 100, unit: 'ML' },
    { label: '250 ml', qty: 250, unit: 'ML' },
    { label: '500 ml', qty: 500, unit: 'ML' },
  ],
  PCS: [
    { label: '1 pc', qty: 1, unit: 'PCS' },
    { label: '6 pcs', qty: 6, unit: 'PCS' },
    { label: '12 pcs', qty: 12, unit: 'PCS' },
  ],
};

interface Props {
  storeProductId: string;
  productName: string;
  onClose: () => void;
  baseStockUnit?: string;
}

export default function VariantManager({ storeProductId, productName, onClose, baseStockUnit }: Props) {
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
    <div className="vm-overlay">
      <div className="vm-card">
        {/* Header */}
        <div className="vm-header">
          <div>
            <h3 className="vm-title">Retail Variants</h3>
            <p className="vm-subtitle">
              {productName}
            </p>
          </div>
          <button onClick={onClose} className="vm-close-btn">
            &times;
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="alert alert-error vm-alert-mb">{error}</div>
        )}
        {success && (
          <div className="alert alert-success vm-alert-mb">{success}</div>
        )}

        {/* V3-FIX-168: Suggest retail variants button */}
        {!isLoading && variants.length === 0 && baseStockUnit && SUGGESTED_VARIANTS[baseStockUnit] && (
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
            padding: '12px 16px', marginBottom: 12
          }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#1e40af' }}>
              Common {baseStockUnit === 'KG' ? 'weight' : baseStockUnit === 'LTR' ? 'volume' : 'count'} variants available
            </p>
            <p style={{ margin: '4px 0 8px', fontSize: 13, color: '#3b82f6' }}>
              {SUGGESTED_VARIANTS[baseStockUnit].map(v => v.label).join(', ')}
            </p>
            <button
              className="btn btn-primary"
              style={{ fontSize: 13, padding: '6px 14px' }}
              disabled={isSubmitting}
              onClick={async () => {
                const suggestions = SUGGESTED_VARIANTS[baseStockUnit];
                if (!suggestions) return;
                setIsSubmitting(true);
                setError('');
                try {
                  const res = await authFetch(
                    `/api/v1/retailer-admin/products/${storeProductId}/variants`,
                    accessToken,
                    {
                      method: 'POST',
                      body: JSON.stringify({
                        variants: suggestions.map(s => ({
                          label: s.label,
                          qty: s.qty,
                          baseUnit: s.unit,
                          sellPriceMinor: 0,
                        })),
                      }),
                    }
                  );
                  const data = await safeJson(res);
                  if (res.ok) {
                    setSuccess(`Added ${suggestions.length} suggested variants — set prices to activate`);
                    loadVariants();
                  } else {
                    setError(data?.error?.message || 'Failed to add suggested variants');
                  }
                } catch {
                  setError('Network error adding suggested variants');
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              {isSubmitting ? 'Adding...' : 'Use Suggested Retail Setup'}
            </button>
          </div>
        )}

        {/* Variant List */}
        {isLoading ? (
          <p className="vm-loading">Loading variants...</p>
        ) : variants.length === 0 ? (
          <div className="vm-empty">
            <p>No variants defined yet.</p>
            <p className="vm-empty-hint">
              Add selling units like "1 kg", "500 gm", etc. with individual prices.
            </p>
          </div>
        ) : (
          <table className="table vm-table">
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
                          className="vm-input-sm"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={editForm.qty}
                          onChange={(e) => setEditForm(p => ({ ...p, qty: e.target.value }))}
                          className="vm-input-num"
                          step="0.01"
                          min="0.01"
                        />
                      </td>
                      <td>
                        <select
                          value={editForm.baseUnit}
                          onChange={(e) => setEditForm(p => ({ ...p, baseUnit: e.target.value }))}
                          className="vm-select-sm"
                        >
                          {VALID_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={editForm.sellPriceMinor}
                          onChange={(e) => setEditForm(p => ({ ...p, sellPriceMinor: e.target.value }))}
                          className="vm-input-price"
                          step="0.01"
                          min="0"
                          placeholder="Rs"
                        />
                      </td>
                      <td className="vm-cell-mono">{v.barcode}</td>
                      <td>
                        <div className="vm-actions-row">
                          <button
                            className="btn btn-primary vm-btn-xs"
                            onClick={() => handleUpdate(v.id)}
                            disabled={isSubmitting}
                          >
                            Save
                          </button>
                          <button
                            className="btn btn-secondary vm-btn-xs"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="vm-cell-bold">{v.variantLabel}</td>
                      <td>{v.variantQty}</td>
                      <td>{v.baseUnit}</td>
                      <td>{formatCurrency(v.sellPriceMinor)}</td>
                      <td className="vm-cell-mono">{v.barcode}</td>
                      <td>
                        <div className="vm-actions-row">
                          <button
                            className="btn btn-secondary vm-btn-xs"
                            onClick={() => startEdit(v)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn vm-btn-remove"
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
          <div className="vm-add-form">
            <h4 className="vm-add-title">Add Variant</h4>
            <div className="vm-add-grid">
              <div>
                <label className="vm-form-label">
                  Label *
                </label>
                <input
                  type="text"
                  className="form-control vm-form-input"
                  placeholder="e.g. 1 kg"
                  value={formData.label}
                  onChange={(e) => setFormData(p => ({ ...p, label: e.target.value }))}
                />
              </div>
              <div>
                <label className="vm-form-label">
                  Quantity *
                </label>
                <input
                  type="number"
                  className="form-control vm-form-input"
                  placeholder="e.g. 1"
                  value={formData.qty}
                  onChange={(e) => setFormData(p => ({ ...p, qty: e.target.value }))}
                  step="0.01"
                  min="0.01"
                />
              </div>
              <div>
                <label className="vm-form-label">
                  Unit *
                </label>
                <select
                  className="form-control vm-form-input"
                  value={formData.baseUnit}
                  onChange={(e) => setFormData(p => ({ ...p, baseUnit: e.target.value }))}
                >
                  {VALID_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="vm-form-label">
                  Sell Price (Rs) *
                </label>
                <input
                  type="number"
                  className="form-control vm-form-input"
                  placeholder="e.g. 50"
                  value={formData.sellPriceMinor}
                  onChange={(e) => setFormData(p => ({ ...p, sellPriceMinor: e.target.value }))}
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
            <div className="vm-form-actions">
              <button
                className="btn btn-primary vm-btn-md"
                onClick={handleAdd}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Adding...' : 'Add Variant'}
              </button>
              <button
                className="btn btn-secondary vm-btn-md"
                onClick={() => { setShowAddForm(false); setFormData(initialVariantForm); }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-primary vm-btn-full"
            onClick={() => setShowAddForm(true)}
          >
            + Add Variant
          </button>
        )}

        {/* Footer */}
        <div className="vm-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
