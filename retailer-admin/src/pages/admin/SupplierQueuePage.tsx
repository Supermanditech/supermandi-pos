// SM-024: SuperAdmin Supplier Queue Page
// View and approve/reject pending suppliers

import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { authFetch } from '../../lib/api';

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
  const { accessToken } = useAuth();

  const [pendingSuppliers, setPendingSuppliers] = useState<PendingSupplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
      const response = await authFetch('/api/v1/retailer-admin/admin/suppliers/pending', accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch pending suppliers');
      const data = await response.json();
      setPendingSuppliers(data.data || []);
    } catch (err) {
      console.error('Error fetching pending suppliers:', err);
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
        `/api/v1/retailer-admin/admin/suppliers/${supplierId}/approve`,
        accessToken,
        { method: 'POST' }
      );
      if (!response.ok) {
        const data = await response.json();
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
        `/api/v1/retailer-admin/admin/suppliers/${selectedSupplier.id}/reject`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({ reason: rejectReason || undefined }),
        }
      );
      if (!response.ok) {
        const data = await response.json();
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

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <header className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

        {/* Queue Stats */}
        <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                {pendingSuppliers.length}
              </span>
              <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>
                Pending Approvals
              </span>
            </div>
          </div>
        </div>

        {/* Pending Suppliers Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading pending suppliers...
            </div>
          ) : pendingSuppliers.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                {pendingSuppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td style={{ fontWeight: '500' }}>{supplier.businessName}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {supplier.gstin || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </td>
                    <td>
                      {supplier.phone && <div>{supplier.phone}</div>}
                      {supplier.email && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {supplier.email}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-info">{supplier.productCount} products</span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {formatDate(supplier.createdAt)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '0.375rem 0.75rem', fontSize: '0.8rem' }}
                          onClick={() => handleApprove(supplier.id)}
                          disabled={actionLoading}
                        >
                          Approve
                        </button>
                        <button
                          className="btn"
                          style={{
                            padding: '0.375rem 0.75rem',
                            fontSize: '0.8rem',
                            background: '#fee2e2',
                            color: '#991b1b',
                          }}
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
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && selectedSupplier && (
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
            <h3 className="card-title">Reject Supplier</h3>
            <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
              Are you sure you want to reject <strong>{selectedSupplier.businessName}</strong>?
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
                {actionLoading ? 'Rejecting...' : 'Reject Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
