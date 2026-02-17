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
  status: 'pending' | 'confirmed' | 'delivered' | 'cancelled';
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
  pending:   { bg: '#fef3c7', color: '#92400e' },
  confirmed: { bg: '#dbeafe', color: '#1e40af' },
  delivered: { bg: '#dcfce7', color: '#166534' },
  cancelled: { bg: '#f3f4f6', color: '#6b7280' },
};

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

  const openDetail = async (orderId: string) => {
    if (!accessToken) return;
    setDetailLoading(true);
    try {
      const res = await authFetch(`/api/v1/retailer-admin/purchase-orders/${orderId}`, accessToken);
      if (!res.ok) throw new Error('Failed to load PO detail');
      const json = await safeJson<PODetailResponse>(res);
      setSelectedPO(json?.data || null);
    } catch {
      setSelectedPO(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <>
      <div style={{ padding: '0 1rem' }}>
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Purchase Orders' }]} />
      </div>
      <header className="page-header">
        <h1 className="page-title">Purchase Orders</h1>
      </header>

      <div className="page-content">
        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="form-input"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
            style={{ maxWidth: '200px' }}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input
            type="text"
            className="form-input"
            placeholder="Search by supplier name..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setOffset(0); }}
            style={{ maxWidth: '300px' }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {total} order{total !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: '#fee2e2', color: '#991b1b', padding: '0.75rem 1rem',
            borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.875rem',
          }}>
            {error}
            <button onClick={fetchOrders} className="btn btn-secondary" style={{ marginLeft: '1rem', fontSize: '0.8rem' }}>
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                  <th style={{ textAlign: 'right' }}>Total ({'\u20B9'})</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Items</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((po) => {
                  const sc = STATUS_COLORS[po.status] || STATUS_COLORS.pending;
                  return (
                    <tr key={po.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(po.id)}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 500 }}>{po.poNumber}</td>
                      <td>{po.supplierName}</td>
                      <td style={{ fontSize: '0.875rem' }}>{fmtDate(po.orderDate)}</td>
                      <td style={{ fontSize: '0.875rem' }}>{po.expectedDeliveryDate ? fmtDate(po.expectedDeliveryDate) : '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>{fmt(po.totalMinor)}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 600,
                          background: sc.bg, color: sc.color,
                        }}>
                          {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>{po.itemsCount}</td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
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
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem', alignItems: 'center' }}>
            <button
              className="btn btn-secondary"
              disabled={currentPage <= 1}
              onClick={() => setOffset(offset - limit)}
              style={{ opacity: currentPage <= 1 ? 0.5 : 1 }}
            >
              Prev
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="btn btn-secondary"
              disabled={currentPage >= totalPages}
              onClick={() => setOffset(offset + limit)}
              style={{ opacity: currentPage >= totalPages ? 0.5 : 1 }}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedPO || detailLoading}
        onClose={() => setSelectedPO(null)}
        title={selectedPO ? `PO: ${selectedPO.poNumber}` : 'Loading...'}
        actions={
          <button onClick={() => setSelectedPO(null)} className="modal-btn modal-btn-primary">
            Close
          </button>
        }
      >
        {detailLoading && <div style={{ padding: '2rem', textAlign: 'center' }}>Loading purchase order details...</div>}
        {selectedPO && (
          <div style={{ fontSize: '0.875rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
              <div><strong>Supplier:</strong> {selectedPO.supplierName}</div>
              <div><strong>Status:</strong> {selectedPO.status.charAt(0).toUpperCase() + selectedPO.status.slice(1)}</div>
              <div><strong>Order Date:</strong> {fmtDate(selectedPO.orderDate)}</div>
              <div><strong>Expected:</strong> {selectedPO.expectedDeliveryDate ? fmtDate(selectedPO.expectedDeliveryDate) : '-'}</div>
              <div><strong>Total:</strong> {fmt(selectedPO.totalMinor)}</div>
              <div><strong>Items:</strong> {selectedPO.itemsCount}</div>
            </div>

            {selectedPO.notes && (
              <div style={{ marginBottom: '1rem', padding: '0.5rem', background: '#f8fafc', borderRadius: '4px' }}>
                <strong>Notes:</strong> {selectedPO.notes}
              </div>
            )}

            {/* WA-002: WhatsApp Follow-up Button — uses supplierPhone from API when available */}
            <div style={{ marginBottom: '1rem' }}>
              <button
                onClick={() => {
                  const expected = selectedPO.expectedDeliveryDate ? new Date(selectedPO.expectedDeliveryDate).toLocaleDateString('en-IN') : 'N/A';
                  const status = selectedPO.status.charAt(0).toUpperCase() + selectedPO.status.slice(1);
                  const msg = `Follow-up on PO #${selectedPO.poNumber}. Status: ${status}. Expected delivery: ${expected}.`;
                  const phone = selectedPO.supplierPhone ? selectedPO.supplierPhone.replace(/\D/g, '') : '';
                  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
                }}
                style={{
                  padding: '6px 16px', background: '#f0fdf4', color: '#15803d',
                  border: '1px solid #bbf7d0', borderRadius: 4, cursor: 'pointer',
                  fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px',
                }}
                title="Follow up with supplier via WhatsApp"
                aria-label="Message on WhatsApp"
              >
                <WhatsAppIcon size={16} />
                WhatsApp Follow-up
              </button>
            </div>

            {/* Line Items */}
            {selectedPO.items && selectedPO.items.length > 0 && (
              <>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Line Items</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '4px', textAlign: 'left' }}>Product</th>
                      <th style={{ padding: '4px', textAlign: 'right' }}>Qty</th>
                      <th style={{ padding: '4px', textAlign: 'right' }}>Rate</th>
                      <th style={{ padding: '4px', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPO.items.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '4px' }}>
                          {item.productName}
                          {item.barcode && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>({item.barcode})</span>}
                        </td>
                        <td style={{ padding: '4px', textAlign: 'right' }}>{item.quantity} {item.unit}</td>
                        <td style={{ padding: '4px', textAlign: 'right' }}>{fmt(item.unitPriceMinor)}</td>
                        <td style={{ padding: '4px', textAlign: 'right', fontWeight: 600 }}>{fmt(item.totalMinor)}</td>
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
