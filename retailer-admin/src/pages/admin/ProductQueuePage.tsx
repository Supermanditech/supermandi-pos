// SM-024: SuperAdmin Product Queue Page
// View and approve/reject pending products, edit before approval

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { authFetch, safeJson } from '../../lib/api';
import { useEscapeKey } from '../../lib/hooks';
// T-112: Breadcrumb navigation
import Breadcrumb from '../../components/Breadcrumb';

interface PendingProduct {
  id: string;
  productName: string;
  skuCode: string | null;
  barcode: string | null;
  purchasePrice: number; // in paise
  mrp: number | null; // in paise
  moq: number | null;
  createdAt: string;
  supplierId: string;
  supplierName: string;
}

interface EditFormData {
  editedName: string;
  editedCategory: string;
  marginType: 'fixed' | 'percent';
  superMandiMarginMinor: string;
  marginPercent: string;
  bnplEligible: boolean;
  bnplMaxDays: string;
}

const initialEditForm: EditFormData = {
  editedName: '',
  editedCategory: '',
  marginType: 'percent',
  superMandiMarginMinor: '',
  marginPercent: '5',
  bnplEligible: true,
  bnplMaxDays: '7',
};

export default function ProductQueuePage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();

  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Edit modal state
  const [selectedProduct, setSelectedProduct] = useState<PendingProduct | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<EditFormData>(initialEditForm);
  const [actionLoading, setActionLoading] = useState(false);

  // Rejection modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // GL-CRIT-0078: Close modals with Escape key
  useEscapeKey(
    useCallback(() => {
      setShowEditModal(false);
      setSelectedProduct(null);
    }, []),
    showEditModal
  );
  useEscapeKey(
    useCallback(() => {
      setShowRejectModal(false);
      setSelectedProduct(null);
    }, []),
    showRejectModal && !showEditModal
  );

  // Fetch pending products
  const fetchPendingProducts = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/v1/retailer-admin/admin/products/pending', accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch pending products');
      const data = await safeJson(response);
      setPendingProducts(data.data || []);
    } catch (err) {
      console.error('Error fetching pending products:', err);
      setError('Failed to load pending products. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) {
      fetchPendingProducts();
    }
  }, [accessToken, fetchPendingProducts]);

  // Open edit modal
  const openEditModal = (product: PendingProduct) => {
    setSelectedProduct(product);
    setEditForm({
      ...initialEditForm,
      editedName: product.productName,
    });
    setShowEditModal(true);
  };

  // Open reject modal
  const openRejectModal = (product: PendingProduct) => {
    setSelectedProduct(product);
    setRejectReason('');
    setShowRejectModal(true);
  };

  // Handle edit form changes
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setEditForm((prev) => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
    } else {
      setEditForm((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // Save edits and approve product
  const handleSaveAndApprove = async () => {
    if (!selectedProduct) return;

    setActionLoading(true);
    setError('');
    setSuccess('');
    try {
      // First, edit the product if there are changes
      const editPayload: Record<string, unknown> = {};

      if (editForm.editedName && editForm.editedName !== selectedProduct.productName) {
        editPayload.editedName = editForm.editedName;
      }
      if (editForm.editedCategory) {
        editPayload.editedCategory = editForm.editedCategory;
      }
      if (editForm.marginType === 'fixed' && editForm.superMandiMarginMinor) {
        // Convert rupees to paise
        editPayload.superMandiMarginMinor = Math.round(parseFloat(editForm.superMandiMarginMinor) * 100);
      } else if (editForm.marginType === 'percent' && editForm.marginPercent) {
        editPayload.marginPercent = parseFloat(editForm.marginPercent);
      }
      editPayload.bnplEligible = editForm.bnplEligible;
      if (editForm.bnplMaxDays) {
        editPayload.bnplMaxDays = parseInt(editForm.bnplMaxDays);
      }

      // Apply edits
      if (Object.keys(editPayload).length > 0) {
        const editResponse = await authFetch(
          `/api/v1/retailer-admin/admin/products/${selectedProduct.id}/edit`,
          accessToken,
          {
            method: 'PUT',
            body: JSON.stringify(editPayload),
          }
        );

        if (!editResponse.ok) {
          const data = await safeJson<{ error?: string }>(editResponse, { error: 'Failed to save product edits' });
          throw new Error(data?.error || 'Failed to save product edits');
        }
      }

      // Then approve the product
      const approveResponse = await authFetch(
        `/api/v1/retailer-admin/admin/products/${selectedProduct.id}/approve`,
        accessToken,
        { method: 'POST' }
      );

      if (!approveResponse.ok) {
        const data = await safeJson<{ error?: string }>(approveResponse, { error: 'Failed to approve product' });
        throw new Error(data?.error || 'Failed to approve product');
      }

      setSuccess(`Product "${editForm.editedName || selectedProduct.productName}" approved successfully!`);
      setShowEditModal(false);
      setSelectedProduct(null);
      fetchPendingProducts();
    } catch (err: any) {
      setError(err.message || 'Failed to save and approve product');
    } finally {
      setActionLoading(false);
    }
  };

  // Quick approve without editing
  const handleQuickApprove = async (productId: string) => {
    setActionLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await authFetch(
        `/api/v1/retailer-admin/admin/products/${productId}/approve`,
        accessToken,
        { method: 'POST' }
      );

      if (!response.ok) {
        const data = await safeJson(response);
        throw new Error(data.error || 'Failed to approve product');
      }

      setSuccess('Product approved successfully!');
      fetchPendingProducts();
    } catch (err: any) {
      setError(err.message || 'Failed to approve product');
    } finally {
      setActionLoading(false);
    }
  };

  // Reject product
  const handleReject = async () => {
    if (!selectedProduct) return;

    setActionLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await authFetch(
        `/api/v1/retailer-admin/admin/products/${selectedProduct.id}/reject`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({ reason: rejectReason || undefined }),
        }
      );

      if (!response.ok) {
        const data = await safeJson(response);
        throw new Error(data.error || 'Failed to reject product');
      }

      setSuccess('Product rejected.');
      setShowRejectModal(false);
      setSelectedProduct(null);
      setRejectReason('');
      fetchPendingProducts();
    } catch (err: any) {
      setError(err.message || 'Failed to reject product');
    } finally {
      setActionLoading(false);
    }
  };

  // Format price
  const formatPrice = (paise: number | null) => {
    if (paise === null || paise === undefined) return '-';
    return `₹${(paise / 100).toFixed(2)}`;
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Calculate retailer price preview
  const calculateRetailerPrice = () => {
    if (!selectedProduct) return 0;
    const purchasePrice = selectedProduct.purchasePrice;
    if (editForm.marginType === 'fixed' && editForm.superMandiMarginMinor) {
      return purchasePrice + Math.round(parseFloat(editForm.superMandiMarginMinor) * 100);
    } else if (editForm.marginType === 'percent' && editForm.marginPercent) {
      const marginPaise = Math.round((purchasePrice * parseFloat(editForm.marginPercent)) / 100);
      return purchasePrice + marginPaise;
    }
    return purchasePrice;
  };

  return (
    <>
      {/* T-112: Breadcrumb navigation */}
      <div style={{ padding: '0 1rem' }}>
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Admin' }, { label: 'Product Queue' }]} />
      </div>
      <header className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="page-title">Product Approval Queue</h1>
          <button
            className="btn btn-secondary"
            onClick={fetchPendingProducts}
            disabled={isLoading}
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="page-content">
        {/* Success Message */}
        {success && (
          <div
            style={{
              background: '#dcfce7',
              color: '#166534',
              padding: '0.75rem 1rem',
              borderRadius: '0.375rem',
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}
          >
            {success}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div
            style={{
              background: '#fee2e2',
              color: '#991b1b',
              padding: '0.75rem 1rem',
              borderRadius: '0.375rem',
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        {/* Queue Stats */}
        <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                {pendingProducts.length}
              </span>
              <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>
                Pending Products
              </span>
            </div>
          </div>
        </div>

        {/* Pending Products Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading pending products...
            </div>
          ) : pendingProducts.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No pending product approvals.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Supplier</th>
                  <th>SKU / Barcode</th>
                  <th>Purchase Price</th>
                  <th>MRP</th>
                  <th>MOQ</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingProducts.map((product) => (
                  <tr key={product.id}>
                    <td style={{ fontWeight: '500' }}>{product.productName}</td>
                    <td style={{ fontSize: '0.85rem' }}>{product.supplierName}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {product.skuCode || product.barcode || (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td>{formatPrice(product.purchasePrice)}</td>
                    <td>{formatPrice(product.mrp)}</td>
                    <td>{product.moq || 1}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {formatDate(product.createdAt)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.375rem 0.75rem', fontSize: '0.8rem' }}
                          onClick={() => openEditModal(product)}
                          disabled={actionLoading}
                        >
                          Edit & Approve
                        </button>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '0.375rem 0.75rem', fontSize: '0.8rem' }}
                          onClick={() => handleQuickApprove(product.id)}
                          disabled={actionLoading}
                        >
                          Quick Approve
                        </button>
                        <button
                          className="btn"
                          style={{
                            padding: '0.375rem 0.75rem',
                            fontSize: '0.8rem',
                            background: '#fee2e2',
                            color: '#991b1b',
                          }}
                          onClick={() => openRejectModal(product)}
                          disabled={actionLoading}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Edit & Approve Modal */}
      {showEditModal && selectedProduct && (
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
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="card"
            style={{ maxWidth: '600px', width: '95%', margin: '1rem', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="card-title">Edit & Approve Product</h3>

            {/* Product Info */}
            <div
              style={{
                background: '#f1f5f9',
                padding: '0.75rem',
                borderRadius: '0.375rem',
                marginBottom: '1rem',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <strong>Supplier:</strong> {selectedProduct.supplierName}
              </div>
              <div>
                <strong>Purchase Price:</strong> {formatPrice(selectedProduct.purchasePrice)}
              </div>
              {selectedProduct.mrp && (
                <div>
                  <strong>MRP:</strong> {formatPrice(selectedProduct.mrp)}
                </div>
              )}
            </div>

            {/* Edit Form */}
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Product Name (editable)</label>
              <input
                type="text"
                name="editedName"
                className="form-input"
                value={editForm.editedName}
                onChange={handleEditChange}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Category (optional override)</label>
              <input
                type="text"
                name="editedCategory"
                className="form-input"
                placeholder="e.g., Grocery, Beverages"
                value={editForm.editedCategory}
                onChange={handleEditChange}
              />
            </div>

            {/* Margin Section */}
            <div
              style={{
                background: '#eff6ff',
                padding: '1rem',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
              }}
            >
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--primary)' }}>
                SuperMandi Margin
              </h4>

              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Margin Type</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <input
                      type="radio"
                      name="marginType"
                      value="percent"
                      checked={editForm.marginType === 'percent'}
                      onChange={handleEditChange}
                    />
                    Percentage
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <input
                      type="radio"
                      name="marginType"
                      value="fixed"
                      checked={editForm.marginType === 'fixed'}
                      onChange={handleEditChange}
                    />
                    Fixed Amount
                  </label>
                </div>
              </div>

              {editForm.marginType === 'percent' ? (
                <div className="form-group">
                  <label className="form-label">Margin Percentage (%)</label>
                  <input
                    type="number"
                    name="marginPercent"
                    className="form-input"
                    placeholder="5"
                    min="0"
                    max="50"
                    step="0.5"
                    value={editForm.marginPercent}
                    onChange={handleEditChange}
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Fixed Margin (₹)</label>
                  <input
                    type="number"
                    name="superMandiMarginMinor"
                    className="form-input"
                    placeholder="10.00"
                    min="0"
                    step="0.01"
                    value={editForm.superMandiMarginMinor}
                    onChange={handleEditChange}
                  />
                </div>
              )}

              {/* Price Preview */}
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.5rem',
                  background: 'white',
                  borderRadius: '0.25rem',
                  fontSize: '0.85rem',
                }}
              >
                <strong>Retailer Price Preview:</strong>{' '}
                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                  {formatPrice(calculateRetailerPrice())}
                </span>
              </div>
            </div>

            {/* BNPL Section */}
            <div
              style={{
                background: '#f0fdf4',
                padding: '1rem',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
              }}
            >
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#166534' }}>
                BNPL Settings
              </h4>

              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    name="bnplEligible"
                    checked={editForm.bnplEligible}
                    onChange={handleEditChange}
                  />
                  Eligible for Buy Now Pay Later
                </label>
              </div>

              {editForm.bnplEligible && (
                <div className="form-group">
                  <label className="form-label">Max Payment Days</label>
                  <select
                    name="bnplMaxDays"
                    className="form-input"
                    value={editForm.bnplMaxDays}
                    onChange={handleEditChange}
                  >
                    <option value="3">3 days</option>
                    <option value="7">7 days</option>
                    <option value="14">14 days</option>
                    <option value="30">30 days</option>
                  </select>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowEditModal(false)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveAndApprove}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processing...' : 'Save & Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedProduct && (
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
          onClick={() => setShowRejectModal(false)}
        >
          <div
            className="card"
            style={{ maxWidth: '450px', width: '90%', margin: '1rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="card-title">Reject Product</h3>
            <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
              Are you sure you want to reject <strong>{selectedProduct.productName}</strong>?
            </p>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Reason (optional)</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Enter reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowRejectModal(false)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                className="btn"
                style={{ background: '#dc2626', color: 'white' }}
                onClick={handleReject}
                disabled={actionLoading}
              >
                {actionLoading ? 'Rejecting...' : 'Reject Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
