// T-180: POS Purchase Order Visibility in Retailer Admin
// Read-only view of purchase orders placed from POS

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import Breadcrumb from '../components/Breadcrumb';
import { useUrlState } from '../hooks/useUrlState';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { Truck } from 'lucide-react';

// T-180: Expected API: GET /api/v1/retailer-admin/purchase-orders?status=...&search=...&limit=...&offset=...
// Response: { data: PurchaseOrder[], total: number }

interface PurchaseOrderItem {
  id: string;
  productName: string;
  barcode?: string;
  quantity: number;
  unit: string;
  unitPriceMinor: number;
  totalMinor: number;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  supplierPhone?: string;  // WA-002: For direct WhatsApp linking
  orderDate: string;
  expectedDeliveryDate?: string;
  totalMinor: number;
  status: 'draft' | 'submitted' | 'confirmed' | 'shipped' | 'partial_received' | 'delivered' | 'cancelled';
  itemsCount: number;
  items?: PurchaseOrderItem[];
  notes?: string;
  createdAt: string;
}

interface POListResponse {
  success: boolean;
  data: PurchaseOrder[];
  total: number;
}

interface PODetailResponse {
  success: boolean;
  data: PurchaseOrder;
}

/** Format paise to INR string */
function fmt(minor: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format((minor || 0) / 100);
}

function fmtDate(d: string): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:           { bg: 'var(--badge-draft-bg)',     color: 'var(--badge-draft-text)' },
  draft:             { bg: 'var(--badge-draft-bg)',     color: 'var(--badge-draft-text)' },
  submitted:         { bg: 'var(--badge-submitted-bg)', color: 'var(--badge-submitted-text)' },
  confirmed:         { bg: 'var(--badge-confirmed-bg)', color: 'var(--badge-confirmed-text)' },
  shipped:           { bg: 'var(--badge-shipped-bg)',   color: 'var(--badge-shipped-text)' },
  partial_received:  { bg: 'var(--badge-partial-bg)',   color: 'var(--badge-partial-text)' },
  delivered:         { bg: 'var(--badge-delivered-bg)', color: 'var(--badge-delivered-text)' },
  cancelled:         { bg: 'var(--badge-cancelled-bg)', color: 'var(--badge-cancelled-text)' },
};

function fmtStatus(s: string): string {
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default function PurchaseOrdersPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useUrlState('status');
  const [searchTerm, setSearchTerm] = useUrlState('search');
  const limit = 20;

  // Detail modal
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (statusFilter) params.set('status', statusFilter);
      if (searchTerm) params.set('search', searchTerm);

      const res = await authFetch(`/api/v1/retailer-admin/purchase-orders?${params}`, accessToken);
      if (res.status === 401) return;
      if (!res.ok) throw new Error(`Failed to load purchase orders: ${res.status}`);
      const json = await safeJson<POListResponse>(res);
      if (!json) throw new Error('Invalid response from server');
      setOrders(json.data || []);
      setTotal(json.total || 0);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load purchase orders';
      setError(message);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, offset, statusFilter, searchTerm]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const closeDetailModal = () => {
    setDetailModalOpen(false);
    setSelectedPO(null);
    setDetailError(null);
  };

  const openDetail = async (orderId: string) => {
    if (!accessToken) return;
    setDetailModalOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await authFetch(`/api/v1/retailer-admin/purchase-orders/${orderId}`, accessToken);
      if (!res.ok) throw new Error('Failed to load PO detail');
      const json = await safeJson<PODetailResponse>(res);
      setSelectedPO(json?.data || null);
    } catch (e: any) {
      setSelectedPO(null);
      setDetailError(e.message || 'Failed to load purchase order detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <>
      <div className="breadcrumb-wrap">
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Purchase Orders' }]} />
      </div>
      <header className="page-header">
        <h1 className="page-title">Purchase Orders</h1>
      </header>

      <div className="page-content">
        {/* Filters */}
        <div className="po-filter-bar">
          <select
            className="form-input po-filter-select"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
            aria-label="Filter purchase orders by status"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="confirmed">Confirmed</option>
            <option value="shipped">Shipped</option>
            <option value="partial_received">Partial Received</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input
            type="text"
            className="form-input po-search-input"
            placeholder="Search by supplier name..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setOffset(0); }}
            aria-label="Search purchase orders by supplier name"
          />
          <span className="text-sm-muted">
            {total} order{total !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="alert-error-inline">
            {error}
            <button onClick={fetchOrders} className="btn btn-secondary po-retry-btn">
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div className="card card-no-padding">
          {loading ? (
            <div className="text-center-muted">
              Loading purchase orders...
            </div>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={<Truck size={24} />}
              title={statusFilter || searchTerm ? 'No matching purchase orders' : 'No purchase orders yet'}
              description={statusFilter || searchTerm
                ? 'Try changing the filter or search term.'
                : 'Purchase orders from POS will appear here once suppliers are linked and orders placed.'}
            />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>PO #</th>
                  <th>Supplier</th>
                  <th>Order Date</th>
                  <th>Expected Delivery</th>
                  <th className="cell-right">Total ({'\u20B9'})</th>
                  <th>Status</th>
                  <th className="cell-right">Items</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((po) => {
                  const sc = STATUS_COLORS[po.status] || STATUS_COLORS.pending;
                  return (
                    <tr key={po.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(po.id)}>
                      <td className="po-number-cell">{po.poNumber}</td>
                      <td>{po.supplierName}</td>
                      <td className="cell-sm">{fmtDate(po.orderDate)}</td>
                      <td className="cell-sm">{po.expectedDeliveryDate ? fmtDate(po.expectedDeliveryDate) : '-'}</td>
                      <td className="cell-mono-right-bold">{fmt(po.totalMinor)}</td>
                      <td>
                        <span className="badge" style={{ background: sc.bg, color: sc.color }}>
                          {fmtStatus(po.status)}
                        </span>
                      </td>
                      <td className="cell-right">{po.itemsCount}</td>
                      <td>
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={(e) => { e.stopPropagation(); openDetail(po.id); }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="po-pagination">
            <button
              className="btn btn-secondary"
              disabled={currentPage <= 1}
              onClick={() => setOffset(offset - limit)}
            >
              Prev
            </button>
            <span className="text-sm-muted">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="btn btn-secondary"
              disabled={currentPage >= totalPages}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={closeDetailModal}
        title={selectedPO ? `PO: ${selectedPO.poNumber}` : detailError ? 'Error' : 'Loading...'}
        actions={
          <button onClick={closeDetailModal} className="modal-btn modal-btn-primary">
            Close
          </button>
        }
      >
        {detailLoading && <div className="po-modal-loading">Loading purchase order details...</div>}
        {!detailLoading && detailError && (
          <div className="po-modal-loading">
            <p className="po-modal-error">{detailError}</p>
            <p className="po-modal-hint">Please try again.</p>
          </div>
        )}
        {selectedPO && (
          <div className="po-detail-content">
            <div className="po-detail-grid">
              <div><strong>Supplier:</strong> {selectedPO.supplierName}</div>
              <div><strong>Status:</strong> {fmtStatus(selectedPO.status)}</div>
              <div><strong>Order Date:</strong> {fmtDate(selectedPO.orderDate)}</div>
              <div><strong>Expected:</strong> {selectedPO.expectedDeliveryDate ? fmtDate(selectedPO.expectedDeliveryDate) : '-'}</div>
              <div><strong>Total:</strong> {fmt(selectedPO.totalMinor)}</div>
              <div><strong>Items:</strong> {selectedPO.itemsCount}</div>
            </div>

            {selectedPO.notes && (
              <div className="po-detail-notes">
                <strong>Notes:</strong> {selectedPO.notes}
              </div>
            )}

            {/* WA-002: WhatsApp Follow-up Button — uses supplierPhone from API when available */}
            {selectedPO.supplierPhone && (
            <div className="imp-template-mb">
              <button
                onClick={() => {
                  const expected = selectedPO.expectedDeliveryDate ? new Date(selectedPO.expectedDeliveryDate).toLocaleDateString('en-IN') : 'N/A';
                  const status = fmtStatus(selectedPO.status);
                  const msg = `Follow-up on PO #${selectedPO.poNumber}. Status: ${status}. Expected delivery: ${expected}.`;
                  const phone = selectedPO.supplierPhone!.replace(/\D/g, '');
                  if (phone.length < 10) return;
                  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
                }}
                className="po-wa-btn"
                title="Follow up with supplier via WhatsApp"
                aria-label="Message on WhatsApp"
              >
                <WhatsAppIcon size={16} />
                WhatsApp Follow-up
              </button>
            </div>
            )}

            {/* Line Items */}
            {selectedPO.items && selectedPO.items.length > 0 && (
              <>
                <h4 className="po-items-title">Line Items</h4>
                <table className="po-items-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="cell-right">Qty</th>
                      <th className="cell-right">Rate</th>
                      <th className="cell-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPO.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.productName}
                          {item.barcode && <span className="po-barcode-text">({item.barcode})</span>}
                        </td>
                        <td className="cell-right">{item.quantity} {item.unit}</td>
                        <td className="cell-right">{fmt(item.unitPriceMinor)}</td>
                        <td className="cell-right cell-bold">{fmt(item.totalMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
