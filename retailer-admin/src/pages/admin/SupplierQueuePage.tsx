// SM-024: SuperAdmin Supplier Queue Page
// View and approve/reject pending suppliers

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { authFetch, safeJson } from '../../lib/api';
import { formatDateTime } from '../../lib/formatters';
// T-112: Breadcrumb navigation
import Breadcrumb from '../../components/Breadcrumb';
import { logger } from '../../lib/logger';

interface PendingSupplier {
  id: string;
  businessName: string;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  productCount: number;
}

export default function SupplierQueuePage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();

  const [pendingSuppliers, setPendingSuppliers] = useState<PendingSupplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // GCP-STG-0421: Pagination state
  const SUPPLIER_QUEUE_PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(0);

  // Modal state
  const [selectedSupplier, setSelectedSupplier] = useState<PendingSupplier | null>(null);

  // Rejection modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch pending suppliers
  const fetchPendingSuppliers = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/v1/admin/suppliers/pending', accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch pending suppliers');
      const data = await safeJson(response);
      setPendingSuppliers(data.data || []);
    } catch (err) {
      logger.error('Error fetching pending suppliers:', err);
      setError('Failed to load pending suppliers. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      fetchPendingSuppliers();
    }
  }, [accessToken]);

  // Approve supplier directly
  const handleApprove = async (supplierId: string) => {
    setActionLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await authFetch(
        `/api/v1/admin/suppliers/${supplierId}/approve`,
        accessToken,
        { method: 'POST' }
      );
      if (!response.ok) {
        const data = await safeJson(response);
        throw new Error(data.error || 'Failed to approve supplier');
      }
      setSuccess('Supplier approved successfully!');
      fetchPendingSuppliers();
    } catch (err: any) {
      setError(err.message || 'Failed to approve supplier');
    } finally {
      setActionLoading(false);
    }
  };

  // Reject supplier
  const handleReject = async () => {
    if (!selectedSupplier) return;

    setActionLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await authFetch(
        `/api/v1/admin/suppliers/${selectedSupplier.id}/reject`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({ reason: rejectReason || undefined }),
        }
      );
      if (!response.ok) {
        const data = await safeJson(response);
        throw new Error(data.error || 'Failed to reject supplier');
      }
      setSuccess('Supplier rejected.');
      setShowRejectModal(false);
      setSelectedSupplier(null);
      setRejectReason('');
      fetchPendingSuppliers();
    } catch (err: any) {
      setError(err.message || 'Failed to reject supplier');
    } finally {
      setActionLoading(false);
    }
  };

  // Open reject modal
  const openRejectModal = (supplier: PendingSupplier) => {
    setSelectedSupplier(supplier);
    setRejectReason('');
    setShowRejectModal(true);
  };

  // R6.RET.016: Use shared formatDateTime for consistent date display

  return (
    <>
      {/* T-112: Breadcrumb navigation */}
      <div className="breadcrumb-wrap">
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Admin' }, { label: 'Supplier Queue' }]} />
      </div>
      <header className="page-header">
        <div className="flex-between">
          <h1 className="page-title">Supplier Approval Queue</h1>
          <button
            className="btn btn-secondary"
            onClick={() => fetchPendingSuppliers()}
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
        <div className="card card-mb-md">
          <div className="sq-stats-row">
            <div>
              <span className="sq-stats-value">
                {pendingSuppliers.length}
              </span>
              <span className="sq-stats-label">
                Pending Approvals
              </span>
            </div>
          </div>
        </div>

        {/* Pending Suppliers Table */}
        <div className="card card-no-padding">
          {isLoading ? (
            <div className="text-center-muted">
              Loading pending suppliers...
            </div>
          ) : pendingSuppliers.length === 0 ? (
            <div className="text-center-muted">
              No pending supplier approvals.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Business Name</th>
                  <th>GSTIN</th>
                  <th>Contact</th>
                  <th>Products</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* GCP-STG-0421: Paginate supplier queue */}
                {pendingSuppliers.slice(currentPage * SUPPLIER_QUEUE_PAGE_SIZE, (currentPage + 1) * SUPPLIER_QUEUE_PAGE_SIZE).map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="cell-bold">{supplier.businessName}</td>
                    <td className="cell-mono cell-sm">
                      {supplier.gstin || <span className="text-sm-muted">-</span>}
                    </td>
                    <td>
                      {supplier.phone && <div>{supplier.phone}</div>}
                      {supplier.email && (
                        <div className="text-sm-muted">
                          {supplier.email}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-info">{supplier.productCount} products</span>
                    </td>
                    <td className="text-sm-muted">
                      {formatDateTime(supplier.createdAt)}
                    </td>
                    <td>
                      <div className="flex-row--sm">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleApprove(supplier.id)}
                          disabled={actionLoading}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-danger-light btn-sm"
                          onClick={() => openRejectModal(supplier)}
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
          {/* GCP-STG-0421: Pagination controls */}
          {(() => {
            const totalPages = Math.ceil(pendingSuppliers.length / SUPPLIER_QUEUE_PAGE_SIZE);
            if (totalPages <= 1) return null;
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: 13, color: '#64748B' }}>
                  Showing {currentPage * SUPPLIER_QUEUE_PAGE_SIZE + 1}–{Math.min((currentPage + 1) * SUPPLIER_QUEUE_PAGE_SIZE, pendingSuppliers.length)} of {pendingSuppliers.length}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 0}>
                    Previous
                  </button>
                  <span style={{ fontSize: 13, lineHeight: '32px', color: '#475569' }}>
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <button className="btn btn-secondary btn-sm" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages - 1}>
                    Next
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && selectedSupplier && (
        <div
          className="modal-overlay-custom"
          onClick={() => setShowRejectModal(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowRejectModal(false); }}
        >
          <div
            className="card modal-card-custom"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-supplier-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="reject-supplier-title" className="card-title">Reject Supplier</h3>
            <p className="modal-confirm-text">
              Are you sure you want to reject <strong>{selectedSupplier.businessName}</strong>?
            </p>

            <div className="form-group form-group-mb">
              <label className="form-label" htmlFor="reject-supplier-reason">Reason (optional)</label>
              <textarea
                id="reject-supplier-reason"
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
                {actionLoading ? 'Rejecting...' : 'Reject Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
