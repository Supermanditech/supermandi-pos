// SM-024: SuperAdmin Product Queue Page
// View and approve/reject pending products, edit before approval

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { authFetch, safeJson } from '../../lib/api';
import { useEscapeKey } from '../../lib/hooks';
// T-112: Breadcrumb navigation
import Breadcrumb from '../../components/Breadcrumb';
import { logger } from '../../lib/logger';

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
      const response = await authFetch('/api/v1/admin/products/pending', accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch pending products');
      const data = await safeJson(response);
      setPendingProducts(data.data || []);
    } catch (err) {
      logger.error('Error fetching pending products:', err);
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
          `/api/v1/admin/products/${selectedProduct.id}/edit`,
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
        `/api/v1/admin/products/${selectedProduct.id}/approve`,
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
        `/api/v1/admin/products/${productId}/approve`,
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
        `/api/v1/admin/products/${selectedProduct.id}/reject`,
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
      <div className="breadcrumb-wrap">
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Admin' }, { label: 'Product Queue' }]} />
      </div>
      <header className="page-header">
        <div className="flex-between">
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
          <div className="alert-success">
            {success}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="alert-error">
            {error}
          </div>
        )}

        {/* Queue Stats */}
        <div className="card card-mb-md" style={{ padding: '1rem' }}>
          <div className="sq-stats-row">
            <div>
              <span className="sq-stats-value">
                {pendingProducts.length}
              </span>
              <span className="sq-stats-label">
                Pending Products
              </span>
            </div>
          </div>
        </div>

        {/* Pending Products Table */}
        <div className="card card-no-padding">
          {isLoading ? (
            <div className="text-center-muted">
              Loading pending products...
            </div>
          ) : pendingProducts.length === 0 ? (
            <div className="text-center-muted">
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
                    <td className="cell-bold">{product.productName}</td>
                    <td className="cell-sm">{product.supplierName}</td>
                    <td className="pq-sku-cell">
                      {product.skuCode || product.barcode || (
                        <span className="text-sm-muted">-</span>
                      )}
                    </td>
                    <td>{formatPrice(product.purchasePrice)}</td>
                    <td>{formatPrice(product.mrp)}</td>
                    <td>{product.moq || 1}</td>
                    <td className="text-sm-muted">
                      {formatDate(product.createdAt)}
                    </td>
                    <td>
                      <div className="flex-row--sm">
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => openEditModal(product)}
                          disabled={actionLoading}
                        >
                          Edit & Approve
                        </button>
                        <button
                          className="btn btn-primary btn-xs"
                          onClick={() => handleQuickApprove(product.id)}
                          disabled={actionLoading}
                        >
                          Quick Approve
                        </button>
                        <button
                          className="btn btn-danger-light btn-xs"
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
          className="modal-overlay-custom"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="card pq-edit-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-approve-product-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-approve-product-title" className="card-title">Edit & Approve Product</h3>

            {/* Product Info */}
            <div className="pq-product-info">
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
            <div className="form-group form-group-mb">
              <label className="form-label" htmlFor="pq-edited-name">Product Name (editable)</label>
              <input
                id="pq-edited-name"
                type="text"
                name="editedName"
                className="form-input"
                value={editForm.editedName}
                onChange={handleEditChange}
              />
            </div>

            <div className="form-group form-group-mb">
              <label className="form-label" htmlFor="pq-edited-category">Category (optional override)</label>
              <input
                id="pq-edited-category"
                type="text"
                name="editedCategory"
                className="form-input"
                placeholder="e.g., Grocery, Beverages"
                value={editForm.editedCategory}
                onChange={handleEditChange}
              />
            </div>

            {/* Margin Section */}
            <div className="pq-margin-section">
              <h4 className="pq-margin-title">
                SuperMandi Margin
              </h4>

              <div className="form-group form-group-mb">
                <label className="form-label">Margin Type</label>
                <div className="pq-margin-type-row">
                  <label className="pq-margin-type-label">
                    <input
                      type="radio"
                      name="marginType"
                      value="percent"
                      checked={editForm.marginType === 'percent'}
                      onChange={handleEditChange}
                    />
                    Percentage
                  </label>
                  <label className="pq-margin-type-label">
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
                  <label className="form-label" htmlFor="pq-margin-percent">Margin Percentage (%)</label>
                  <input
                    id="pq-margin-percent"
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
                  <label className="form-label" htmlFor="pq-fixed-margin">Fixed Margin (₹)</label>
                  <input
                    id="pq-fixed-margin"
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
              <div className="pq-price-preview">
                <strong>Retailer Price Preview:</strong>{' '}
                <span className="pq-price-highlight">
                  {formatPrice(calculateRetailerPrice())}
                </span>
              </div>
            </div>

            {/* BNPL Section */}
            <div className="pq-bnpl-section">
              <h4 className="pq-bnpl-title">
                BNPL Settings
              </h4>

              <div className="form-group form-group-mb">
                <label className="pq-bnpl-checkbox">
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
                  <label className="form-label" htmlFor="pq-bnpl-max-days">Max Payment Days</label>
                  <select
                    id="pq-bnpl-max-days"
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
            <div className="modal-footer-actions">
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
          className="modal-overlay-custom"
          onClick={() => setShowRejectModal(false)}
        >
          <div
            className="card modal-card-custom"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-product-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="reject-product-title" className="card-title">Reject Product</h3>
            <p className="modal-confirm-text">
              Are you sure you want to reject <strong>{selectedProduct.productName}</strong>?
            </p>

            <div className="form-group form-group-mb">
              <label className="form-label" htmlFor="reject-product-reason">Reason (optional)</label>
              <textarea
                id="reject-product-reason"
                className="form-input"
                rows={3}
                placeholder="Enter reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>

            <div className="modal-footer-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowRejectModal(false)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
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
