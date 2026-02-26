'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getOrders, updateOrderStatus, updateOrderShipment, updateOrderItemStatus, getOrderNotes, addOrderNote, markOrdersRead, getOrderDetail, getOrderEvents, getOrderStreamUrl, confirmOrderDelivery, Order, OrderItem, OrderNote, OrderDetail, OrderDetailItem, OrderEvent, PaginatedResponse } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
// T-113: Breadcrumb navigation
import Breadcrumb from '@/components/Breadcrumb';
// T-121: URL state for filter persistence
import { useUrlState } from '@/hooks/useUrlState';
// GAP-3: EmptyState component for consistent empty states
import EmptyState from '@/components/EmptyState';
import { ShoppingCart, Repeat } from 'lucide-react';
// FIX-028: Close SSE on logout
import { useAuth } from '@/lib/auth';
// REQ.AUDIT.W4.SUPPLIER.SSE-NO-RECONNECT.001: reconnecting SSE wrapper
import { ReconnectingEventSource, SSEConnectionState } from '@/lib/reconnectingEventSource';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';

const statusColors: Record<string, string> = {
  submitted: 'bg-orange-100 text-orange-700',  // UIUX-XPLAT-001: Backend initial PO status
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

// GL-WF-038: Item-level status colors
const itemStatusColors: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  partial: 'bg-amber-100 text-amber-700',
  received: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

// R6.CROSS.003: Aligned with order-service stateMachine.ts (source of truth)
// UIUX-XPLAT-001: 'submitted' is the initial backend PO status before supplier confirms
const statusFlow: Record<string, string[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'partial_received'],
  partial_received: ['delivered', 'partial_received'],
  delivered: [],
  cancelled: [],
};

// GL-WF-039: Common carriers in India
const CARRIERS = [
  'Delhivery',
  'BlueDart',
  'DTDC',
  'Ecom Express',
  'Xpressbees',
  'Shadowfax',
  'India Post',
  'Professional Couriers',
  'Other',
];

export default function OrdersPage() {
  const queryClient = useQueryClient();
  // FIX-028: Close SSE when auth state changes (logout)
  const { isAuthenticated } = useAuth();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  // T-121: Sync status filter with URL for back/forward persistence
  const [statusFilter, setStatusFilter] = useUrlState('status', 'all');
  // GL-WF-063: Pagination state — synced with URL for back/forward persistence
  const [pageParam, setPageParam] = useUrlState('page', '1');
  const currentPage = Math.max(1, parseInt(pageParam, 10) || 1);
  const setCurrentPage = (v: number | ((p: number) => number)) => {
    const next = typeof v === 'function' ? v(currentPage) : v;
    setPageParam(String(next));
  };
  const pageSize = 20;
  // AUDIT-SUP-018: Debounce timer for quantity input mutations
  const qtyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // FIX-025: Clear debounce on unmount to prevent stale mutation after navigation
  useEffect(() => {
    return () => {
      if (qtyDebounceRef.current) clearTimeout(qtyDebounceRef.current);
    };
  }, []);
  // GL-WF-039: Shipment tracking state
  // GO-LIVE-029: Added shipment date fields
  const [showShipmentForm, setShowShipmentForm] = useState(false);
  const [shipmentData, setShipmentData] = useState({
    trackingNumber: '',
    carrier: '',
    shipmentDate: new Date().toISOString().split('T')[0],  // Default to today
    expectedDeliveryDate: '',
  });
  // GO-LIVE-030: Order notes state
  const [newNoteText, setNewNoteText] = useState('');
  const [showNotesSection, setShowNotesSection] = useState(false);
  // T-246: Delivery confirmation state
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  // UIUX-SUP-010: Confirmation state for shipping with pending items
  const [pendingShipConfirm, setPendingShipConfirm] = useState<{ count: number } | null>(null);
  // REQ.AUDIT.W5.SUPPLIER.ORDERS-STATUS-NO-CONFIRMATION.001: Confirmation gate for irreversible status changes
  const [pendingStatusConfirm, setPendingStatusConfirm] = useState<{ id: string; newStatus: Order['status'] } | null>(null);
  // REQ.AUDIT.W4.SUPPLIER.SSE-NO-RECONNECT.001: track live SSE connection state
  const [sseState, setSseState] = useState<SSEConnectionState>('connecting');

  // GL-WF-063: Paginated orders query
  // PRA-REAUDIT: Added isError + refetch to prevent API failure showing as empty state
  const { data: ordersResponse, isLoading, isError, refetch } = useQuery({
    queryKey: ['orders', currentPage, pageSize],
    queryFn: () => getOrders({ page: currentPage, limit: pageSize }),
  });

  const orders = ordersResponse?.data;
  const pagination = ordersResponse?.pagination;

  // SUP-POS-007: Mark orders as read on mount (clears badge in layout)
  useEffect(() => {
    markOrdersRead().catch(() => {});
  }, []);

  // SUP-POS-012: SSE real-time order updates
  // FIX-028: Close SSE when isAuthenticated changes to false (logout)
  // REQ.AUDIT.W4.SUPPLIER.SSE-NO-RECONNECT.001: use ReconnectingEventSource for auto-retry + UI state
  const eventSourceRef = useRef<ReconnectingEventSource | null>(null);
  useEffect(() => {
    if (!isAuthenticated) return;
    const streamUrl = getOrderStreamUrl();
    if (!streamUrl) return;

    const es = new ReconnectingEventSource(streamUrl, { onStateChange: setSseState });
    eventSourceRef.current = es;

    const handleOrderEvent = () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    };

    es.addEventListener('order.created', handleOrderEvent);
    es.addEventListener('order.status_changed', handleOrderEvent);
    es.addEventListener('order.payment_received', handleOrderEvent);
    es.addEventListener('order.delivery_confirmed', handleOrderEvent);  // T-247
    es.addEventListener('order.event', handleOrderEvent);

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [queryClient, isAuthenticated]);

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Order['status'] }) =>
      updateOrderStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order status updated');
      setSelectedOrder(null);
      setShowShipmentForm(false);
      setShowNotesSection(false);
      setNewNoteText('');
      setPendingStatusConfirm(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update order');
    },
  });

  // GL-WF-039: Shipment tracking mutation
  // GO-LIVE-029: Include shipment date fields
  const shipmentMutation = useMutation({
    mutationFn: ({ id, trackingNumber, carrier, shipmentDate, expectedDeliveryDate }: {
      id: string; trackingNumber: string; carrier: string; shipmentDate?: string; expectedDeliveryDate?: string;
    }) =>
      updateOrderShipment(id, { trackingNumber, carrier, shipmentDate, expectedDeliveryDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Shipment info added and order marked as shipped');
      setSelectedOrder(null);
      setShowShipmentForm(false);
      setShowNotesSection(false);
      setNewNoteText('');
      setShipmentData({ trackingNumber: '', carrier: '', shipmentDate: new Date().toISOString().split('T')[0], expectedDeliveryDate: '' });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add shipment info');
    },
  });

  // GL-WF-038: Item status update mutation
  const itemStatusMutation = useMutation({
    mutationFn: ({ orderId, itemId, status, receivedQuantity }: {
      orderId: string;
      itemId: string;
      status: OrderItem['status'];
      receivedQuantity?: number;
    }) => updateOrderItemStatus(orderId, itemId, { status, receivedQuantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Item status updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update item status');
    },
  });

  // GO-LIVE-030: Order notes query - only fetch when an order is selected
  const { data: orderNotes, isLoading: notesLoading, refetch: refetchNotes } = useQuery({
    queryKey: ['orderNotes', selectedOrder?.id],
    queryFn: () => selectedOrder ? getOrderNotes(selectedOrder.id) : Promise.resolve([]),
    enabled: !!selectedOrder && showNotesSection,
  });

  // SUP-POS-008: Fetch full order detail with barcode, SKU, store contact
  const { data: orderDetail } = useQuery({
    queryKey: ['orderDetail', selectedOrder?.id],
    queryFn: () => selectedOrder ? getOrderDetail(selectedOrder.id) : Promise.resolve(null),
    enabled: !!selectedOrder,
  });

  // SUP-POS-008: Fetch order timeline events
  const { data: orderEvents } = useQuery({
    queryKey: ['orderEvents', selectedOrder?.id],
    queryFn: () => selectedOrder ? getOrderEvents(selectedOrder.id) : Promise.resolve([]),
    enabled: !!selectedOrder,
  });

  // GO-LIVE-030: Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: ({ orderId, message }: { orderId: string; message: string }) =>
      addOrderNote(orderId, { message, isInternal: false }),
    onSuccess: () => {
      refetchNotes();
      setNewNoteText('');
      toast.success('Note added');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add note');
    },
  });

  // T-246: Delivery confirmation mutation
  const deliveryMutation = useMutation({
    mutationFn: ({ orderId, deliveryNotes: notes }: { orderId: string; deliveryNotes?: string }) =>
      confirmOrderDelivery(orderId, { deliveryNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orderDetail'] });
      toast.success('Delivery confirmation recorded. Awaiting retailer receipt.');
      setSelectedOrder(null);
      setShowDeliveryForm(false);
      setDeliveryNotes('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to confirm delivery');
    },
  });

  const filteredOrders = orders?.filter(
    (order) => statusFilter === 'all' || order.status === statusFilter
  );

  // GL-CRIT-0060: Use API-provided total counts if available, fallback to page counts
  // Note: For accurate totals, backend should return statusCounts in pagination response
  const statusCounts = ordersResponse?.statusCounts || orders?.reduce(
    (acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  ) || {};
  // Add total count from pagination if available
  if (pagination?.total && !statusCounts.all) {
    statusCounts.all = pagination.total;
  }

  // ISSUE-MICRO-004: Track any pending mutation to prevent modal close during operations
  const isAnyMutationPending = updateStatusMutation.isPending || shipmentMutation.isPending || itemStatusMutation.isPending || addNoteMutation.isPending || deliveryMutation.isPending;

  // STBT-185.7: Force-close escape after mutation hangs >15s
  const [mutationStartTime, setMutationStartTime] = useState<number | null>(null);
  const [showForceClose, setShowForceClose] = useState(false);
  useEffect(() => {
    if (isAnyMutationPending) {
      if (!mutationStartTime) setMutationStartTime(Date.now());
      const timer = setTimeout(() => setShowForceClose(true), 15_000);
      return () => clearTimeout(timer);
    }
    setMutationStartTime(null);
    setShowForceClose(false);
  }, [isAnyMutationPending, mutationStartTime]);

  // ISSUE-MICRO-022: Lock body scroll when order details modal is open
  useEffect(() => {
    if (selectedOrder) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [selectedOrder]);

  return (
    <div>
      {/* T-113: Breadcrumb navigation */}
      <Breadcrumb items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Orders' }]} />
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Orders</h1>
        <p className="text-slate-500 mt-1">
          Manage incoming orders from retailers. Update order status to keep
          customers informed.
        </p>
      </div>

      {/* REQ.AUDIT.W4.SUPPLIER.SSE-NO-RECONNECT.001: live-update connection banner */}
      {(sseState === 'reconnecting' || sseState === 'closed') && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${sseState === 'closed' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
          <span className={`w-2 h-2 rounded-full ${sseState === 'closed' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'}`} />
          {sseState === 'reconnecting' ? 'Reconnecting to live updates…' : 'Live updates disconnected. Refresh to reload.'}
        </div>
      )}

      {/* Status Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-2">
          {['all', 'draft', 'submitted', 'confirmed', 'shipped', 'partial_received', 'delivered', 'cancelled'].map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  statusFilter === status
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                <span
                  className={`px-1.5 py-0.5 rounded text-xs ${
                    statusFilter === status
                      ? 'bg-white/20'
                      : 'bg-slate-200'
                  }`}
                >
                  {statusCounts[status] || 0}
                </span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Orders Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-4" role="status" aria-label="Loading orders">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 py-3 border-b border-slate-100">
                <div className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: '15%' }} />
                <div className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: '20%' }} />
                <div className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: '12%' }} />
                <div className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: '18%' }} />
                <div className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: '10%' }} />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center">
            <p className="text-red-600 font-medium">Failed to load orders</p>
            <p className="text-sm text-slate-500 mt-1">Please check your connection and try again.</p>
            <button onClick={() => refetch()} className="mt-3 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              Retry
            </button>
          </div>
        ) : filteredOrders && filteredOrders.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Order ID
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Store
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Items
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Total
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Date
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-b border-slate-100">
                  <td className="py-3 px-4 font-mono text-sm">
                    {order.id.slice(0, 8)}...
                  </td>
                  <td className="py-3 px-4 font-medium">{order.storeName}</td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {order.items.length} items
                  </td>
                  <td className="py-3 px-4 font-medium">
                    {formatCurrency(order.totalAmount)}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        statusColors[order.status] || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {order.status}
                    </span>
                    {/* T-246: Reorder badge */}
                    {order.orderType === 'reorder' && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700" title="Auto-generated reorder">
                        <Repeat size={10} />
                        Reorder
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-500">
                    {formatDateTime(order.createdAt)}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            icon={ShoppingCart}
            title="No orders yet"
            description="Orders will appear here when retailers place orders for your products."
          />
        )}
      </div>

      {/* GL-WF-063: Pagination Controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-4 py-3 bg-white border border-slate-200 rounded-lg">
          <div className="text-sm text-slate-600">
            Showing {((currentPage - 1) * pageSize) + 1} to{' '}
            {Math.min(currentPage * pageSize, pagination.total)} of {pagination.total} orders
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm text-slate-600">
              Page {currentPage} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={currentPage === pagination.totalPages}
              className="px-3 py-1 text-sm border border-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          tabIndex={-1}
          ref={(el) => { if (el) el.focus(); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !isAnyMutationPending) {
              setSelectedOrder(null);
              setShowNotesSection(false);
              setNewNoteText('');
            }
          }}
          onClick={() => {
            // ISSUE-MICRO-004: Prevent modal close during in-flight mutations
            if (isAnyMutationPending) return;
            setSelectedOrder(null);
            setShowNotesSection(false);
            setNewNoteText('');
          }}
        >
          <div
            className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Order Details</h2>
              <div className="flex items-center gap-2">
                {/* STBT-185.7: Force-close after mutation hang */}
                {showForceClose && (
                  <button
                    onClick={() => { setSelectedOrder(null); setShowNotesSection(false); setNewNoteText(''); setShowForceClose(false); }}
                    className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    Force Close
                  </button>
                )}
                <button
                  onClick={() => {
                    // ISSUE-MICRO-004: Prevent modal close during in-flight mutations
                    if (isAnyMutationPending && !showForceClose) return;
                    setSelectedOrder(null);
                    setShowNotesSection(false);
                    setNewNoteText('');
                  }}
                  className="text-slate-400 hover:text-slate-600"
                  aria-label="Close order details"
                >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              </div>
            </div>

            {/* Order Info — SUP-POS-008: Enhanced with store contact + order number */}
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div>
                <p className="text-slate-500">Order ID</p>
                <p className="font-mono font-medium">{orderDetail?.orderNumber || selectedOrder.id.slice(0, 8)}</p>
              </div>
              <div>
                <p className="text-slate-500">Store</p>
                <p className="font-medium">{selectedOrder.storeName}</p>
                {orderDetail?.storeCity && (
                  <p className="text-slate-400 text-xs">{orderDetail.storeCity}</p>
                )}
                {orderDetail?.storePhone && (
                  <div className="flex items-center gap-1.5">
                    <p className="text-slate-400 text-xs">{orderDetail.storePhone}</p>
                    <button
                      onClick={() => {
                        const orderNum = orderDetail?.orderNumber || selectedOrder.id.slice(0, 8);
                        const msg = `Hi, update on order #${orderNum}: ${selectedOrder.status}.`;
                        window.open(`https://wa.me/${(orderDetail?.storePhone ?? '').replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
                      }}
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-green-50 transition-colors"
                      title="Contact store on WhatsApp"
                      aria-label="Contact store on WhatsApp"
                    >
                      <WhatsAppIcon size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div>
                <p className="text-slate-500">Date</p>
                <p className="font-medium">{formatDateTime(selectedOrder.createdAt)}</p>
              </div>
              <div>
                <p className="text-slate-500">Status</p>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    statusColors[selectedOrder.status]
                  }`}
                >
                  {selectedOrder.status}
                </span>
              </div>
              {/* T-246: Reorder context */}
              {orderDetail?.isReorder && (
                <div>
                  <p className="text-slate-500">Order Type</p>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                    <Repeat size={12} />
                    Auto Reorder
                  </span>
                </div>
              )}
              {/* T-246: Payment terms */}
              {orderDetail?.paymentTerms && (
                <div>
                  <p className="text-slate-500">Payment Terms</p>
                  <p className="font-medium">{orderDetail.paymentTerms}</p>
                </div>
              )}
              {orderDetail?.expectedDeliveryDate && (
                <div>
                  <p className="text-slate-500">Expected Delivery</p>
                  <p className="font-medium">{formatDateTime(orderDetail.expectedDeliveryDate)}</p>
                </div>
              )}
              {/* T-246: Actual delivery date */}
              {orderDetail?.actualDeliveryDate && (
                <div>
                  <p className="text-slate-500">Delivered On</p>
                  <p className="font-medium text-green-700">{formatDateTime(orderDetail.actualDeliveryDate)}</p>
                </div>
              )}
              {orderDetail?.storeNotes && (
                <div>
                  <p className="text-slate-500">Store Notes</p>
                  <p className="font-medium text-slate-600">{orderDetail.storeNotes}</p>
                </div>
              )}
            </div>

            {/* Order Items - GL-WF-038: With per-item status tracking */}
            <div className="border border-slate-200 rounded-lg overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left py-2 px-4 font-medium text-slate-500">
                      Product
                    </th>
                    <th className="text-center py-2 px-4 font-medium text-slate-500">
                      Ordered
                    </th>
                    <th className="text-center py-2 px-4 font-medium text-slate-500">
                      Received
                    </th>
                    <th className="text-right py-2 px-4 font-medium text-slate-500">
                      Price
                    </th>
                    <th className="text-right py-2 px-4 font-medium text-slate-500">
                      Total
                    </th>
                    <th className="text-center py-2 px-4 font-medium text-slate-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item) => {
                    // SUP-POS-008: Get barcode + SKU from detail data
                    const detailItem = orderDetail?.items?.find((di: OrderDetailItem) => di.id === item.id);
                    return (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="py-2 px-4">
                        <div>{item.productName}</div>
                        {detailItem?.barcode && (
                          <span className="text-xs text-slate-400 font-mono">{detailItem.barcode}</span>
                        )}
                        {detailItem?.supplierSku && (
                          <span className="text-xs text-slate-400 ml-2">SKU: {detailItem.supplierSku}</span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-center">{item.quantity}</td>
                      <td className="py-2 px-4 text-center">
                        {/* GL-WF-038: Editable received quantity */}
                        {selectedOrder.status === 'shipped' || selectedOrder.status === 'delivered' ? (
                          <input
                            type="number"
                            min={0}
                            max={item.quantity}
                            value={item.receivedQuantity || 0}
                            onChange={(e) => {
                              // GL-CRIT-0032: Cap received quantity at ordered quantity
                              const raw = parseInt(e.target.value) || 0;
                              const qty = Math.max(0, Math.min(raw, item.quantity));
                              const newStatus = qty === 0 ? 'pending' : qty < item.quantity ? 'partial' : 'received';
                              // AUDIT-SUP-018: Debounce quantity mutation (500ms)
                              if (qtyDebounceRef.current) clearTimeout(qtyDebounceRef.current);
                              qtyDebounceRef.current = setTimeout(() => {
                                itemStatusMutation.mutate({
                                  orderId: selectedOrder.id,
                                  itemId: item.id,
                                  status: newStatus,
                                  receivedQuantity: qty,
                                });
                              }, 500);
                            }}
                            className="w-16 px-2 py-1 border border-slate-300 rounded text-center text-sm"
                          />
                        ) : (
                          <span className="text-slate-400">{item.receivedQuantity || 0}</span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-right">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="py-2 px-4 text-right font-medium">
                        {formatCurrency(item.total)}
                      </td>
                      <td className="py-2 px-4 text-center">
                        {/* GL-WF-038: Item status with dropdown for shipped/delivered orders */}
                        {selectedOrder.status === 'shipped' || selectedOrder.status === 'delivered' ? (
                          <select
                            value={item.status}
                            onChange={(e) => {
                              itemStatusMutation.mutate({
                                orderId: selectedOrder.id,
                                itemId: item.id,
                                status: e.target.value as OrderItem['status'],
                              });
                            }}
                            className={`px-2 py-1 rounded text-xs font-medium border-0 cursor-pointer ${
                              itemStatusColors[item.status] || 'bg-slate-100'
                            }`}
                          >
                            <option value="pending">Pending</option>
                            <option value="partial">Partial</option>
                            <option value="received">Received</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        ) : (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            itemStatusColors[item.status] || 'bg-slate-100'
                          }`}>
                            {item.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ); })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={4} className="py-3 px-4 text-right font-medium">
                      Total Amount
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-lg">
                      {formatCurrency(selectedOrder.totalAmount)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* SUP-POS-008: Order Timeline */}
            {orderEvents && orderEvents.length > 0 && (
              <div className="border border-slate-200 rounded-lg p-4 mb-6">
                <h3 className="font-medium text-slate-800 mb-3">Order Timeline</h3>
                <div className="space-y-3">
                  {orderEvents.map((event: OrderEvent) => (
                    <div key={event.id} className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-slate-700 font-medium">
                          {event.eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </p>
                        <p className="text-slate-400 text-xs">{formatDateTime(event.createdAt)} &middot; {event.actorType}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* GL-WF-039: Shipment Form - GL-CRIT-0062: Allow from pending or confirmed */}
            {/* GO-LIVE-029: Added shipment date fields */}
            {showShipmentForm && (selectedOrder.status === 'confirmed' || selectedOrder.status === 'submitted') && (
              <div className="border border-slate-200 rounded-lg p-4 mb-6 bg-slate-50">
                <h3 className="font-medium text-slate-800 mb-3">Add Shipment Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">Carrier</label>
                    <select
                      value={shipmentData.carrier}
                      onChange={(e) => setShipmentData({ ...shipmentData, carrier: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="">Select carrier...</option>
                      {CARRIERS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">Tracking Number</label>
                    <input
                      type="text"
                      value={shipmentData.trackingNumber}
                      onChange={(e) => setShipmentData({ ...shipmentData, trackingNumber: e.target.value })}
                      placeholder="Enter AWB/tracking number"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">Shipment Date</label>
                    <input
                      type="date"
                      value={shipmentData.shipmentDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setShipmentData({ ...shipmentData, shipmentDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">Expected Delivery Date</label>
                    <input
                      type="date"
                      value={shipmentData.expectedDeliveryDate}
                      onChange={(e) => setShipmentData({ ...shipmentData, expectedDeliveryDate: e.target.value })}
                      min={shipmentData.shipmentDate}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (!shipmentData.carrier || !shipmentData.trackingNumber) {
                        toast.error('Please enter carrier and tracking number');
                        return;
                      }
                      shipmentMutation.mutate({
                        id: selectedOrder.id,
                        trackingNumber: shipmentData.trackingNumber,
                        carrier: shipmentData.carrier,
                        shipmentDate: shipmentData.shipmentDate || undefined,
                        expectedDeliveryDate: shipmentData.expectedDeliveryDate || undefined,
                      });
                    }}
                    disabled={shipmentMutation.isPending}
                    className="btn btn-primary"
                  >
                    {shipmentMutation.isPending ? 'Adding...' : 'Add Tracking & Ship'}
                  </button>
                  <button
                    onClick={() => setShowShipmentForm(false)}
                    className="btn bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* T-246: Delivery Confirmation Form */}
            {showDeliveryForm && selectedOrder.status === 'shipped' && (
              <div className="border border-green-200 rounded-lg p-4 mb-6 bg-green-50">
                <h3 className="font-medium text-green-800 mb-3">Confirm Delivery</h3>
                <p className="text-sm text-green-700 mb-3">
                  Confirming delivery will mark this order as delivered and record the delivery date.
                </p>
                <div className="mb-4">
                  <label className="block text-sm text-green-800 mb-1">Delivery Notes (optional)</label>
                  <textarea
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    placeholder="Add any delivery notes (condition, issues, etc.)"
                    rows={2}
                    maxLength={500}
                    className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      deliveryMutation.mutate({
                        orderId: selectedOrder.id,
                        deliveryNotes: deliveryNotes.trim() || undefined,
                      });
                    }}
                    disabled={deliveryMutation.isPending}
                    className="btn bg-green-600 text-white hover:bg-green-700"
                  >
                    {deliveryMutation.isPending ? 'Confirming...' : 'Confirm Delivery'}
                  </button>
                  <button
                    onClick={() => { setShowDeliveryForm(false); setDeliveryNotes(''); }}
                    className="btn bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* GO-LIVE-030: Order Notes/Communication Section */}
            <div className="border-t border-slate-200 pt-4 mt-4">
              <button
                onClick={() => setShowNotesSection(!showNotesSection)}
                className="flex items-center justify-between w-full text-left"
              >
                <span className="font-medium text-slate-700">
                  Order Notes & Communication
                </span>
                <span className="text-slate-400">
                  {showNotesSection
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>}
                </span>
              </button>

              {showNotesSection && (
                <div className="mt-4 space-y-4">
                  {/* Notes List */}
                  <div className="max-h-48 overflow-y-auto space-y-3">
                    {notesLoading ? (
                      <div className="space-y-3">{[1,2].map(i => <div key={i} className="animate-pulse"><div className="h-3 bg-slate-200 rounded w-1/4 mb-2"/><div className="h-3 bg-slate-200 rounded w-3/4"/></div>)}</div>
                    ) : orderNotes && orderNotes.length > 0 ? (
                      orderNotes.map((note: OrderNote) => (
                        <div
                          key={note.id}
                          className={`p-3 rounded-lg text-sm ${
                            note.authorType === 'supplier'
                              ? 'bg-blue-50 border border-blue-100 ml-4'
                              : note.authorType === 'system'
                              ? 'bg-slate-100 border border-slate-200'
                              : 'bg-green-50 border border-green-100 mr-4'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-slate-700">
                              {note.authorName}
                              {note.authorType === 'system' && ' (System)'}
                            </span>
                            <span className="text-xs text-slate-400">
                              {new Date(note.createdAt).toLocaleString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-slate-600">{note.message}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500 text-center py-2">
                        No notes yet. Add a note to communicate with the retailer.
                      </p>
                    )}
                  </div>

                  {/* Add Note Form */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="Type a message..."
                      maxLength={2000}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newNoteText.trim()) {
                          addNoteMutation.mutate({
                            orderId: selectedOrder.id,
                            message: newNoteText.trim(),
                          });
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (newNoteText.trim()) {
                          addNoteMutation.mutate({
                            orderId: selectedOrder.id,
                            message: newNoteText.trim(),
                          });
                        }
                      }}
                      disabled={addNoteMutation.isPending || !newNoteText.trim()}
                      className="btn btn-primary px-4"
                    >
                      {addNoteMutation.isPending ? '...' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* UIUX-SUP-010: Styled confirmation for shipping with pending items */}
            {pendingShipConfirm && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-800 mb-2">
                  {pendingShipConfirm.count} item(s) have not been marked as received.
                </p>
                <p className="text-xs text-amber-600 mb-3">Ship anyway? This cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPendingShipConfirm(null)}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white hover:bg-slate-50"
                  >Cancel</button>
                  <button
                    onClick={() => { setPendingShipConfirm(null); setShowShipmentForm(true); }}
                    className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-md hover:bg-amber-700"
                  >Ship Anyway</button>
                </div>
              </div>
            )}

            {/* REQ.AUDIT.W5.SUPPLIER.ORDERS-STATUS-NO-CONFIRMATION.001: Confirmation gate */}
            {pendingStatusConfirm && (
              <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm font-medium text-orange-800 mb-1">
                  Mark order as <strong>{pendingStatusConfirm.newStatus}</strong>?
                </p>
                <p className="text-xs text-orange-600 mb-3">This change cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPendingStatusConfirm(null)}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white hover:bg-slate-50"
                  >Cancel</button>
                  <button
                    onClick={() => {
                      if (pendingStatusConfirm) {
                        updateStatusMutation.mutate({ id: pendingStatusConfirm.id, status: pendingStatusConfirm.newStatus });
                        setPendingStatusConfirm(null);
                      }
                    }}
                    disabled={updateStatusMutation.isPending}
                    className={`px-3 py-1.5 text-xs text-white rounded-md ${
                      pendingStatusConfirm.newStatus === 'cancelled'
                        ? 'bg-red-600 hover:bg-red-700'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >{updateStatusMutation.isPending ? 'Updating...' : 'Confirm'}</button>
                </div>
              </div>
            )}

            {/* Status Actions */}
            {statusFlow[selectedOrder.status]?.length > 0 && !showShipmentForm && !showDeliveryForm && !pendingShipConfirm && !pendingStatusConfirm && (
              <div className="mt-4">
                <p className="text-sm text-slate-500 mb-3">Update Status</p>
                <div className="flex gap-3">
                  {statusFlow[selectedOrder.status].map((newStatus) => (
                    <button
                      key={newStatus}
                      onClick={() => {
                        // GL-CRIT-0062: Allow shipment from pending or confirmed status
                        if (newStatus === 'shipped' && (selectedOrder.status === 'confirmed' || selectedOrder.status === 'submitted')) {
                          // GL-CRIT-0063: Warn if any items still pending
                          // UIUX-SUP-010: Use styled confirmation instead of window.confirm
                          const pendingItems = selectedOrder.items.filter(item => item.status === 'pending' || !item.receivedQuantity);
                          if (pendingItems.length > 0) {
                            setPendingShipConfirm({ count: pendingItems.length });
                            return;
                          }
                          // GL-WF-039: Show shipment form instead of directly updating
                          setShowShipmentForm(true);
                        } else if (newStatus === 'delivered') {
                          // T-246: Use delivery confirmation form instead of generic status update
                          setShowDeliveryForm(true);
                        } else {
                          // REQ.AUDIT.W5.SUPPLIER.ORDERS-STATUS-NO-CONFIRMATION.001: confirm before any status change
                          setPendingStatusConfirm({
                            id: selectedOrder.id,
                            newStatus: newStatus as Order['status'],
                          });
                        }
                      }}
                      disabled={updateStatusMutation.isPending}
                      className={`btn ${
                        newStatus === 'cancelled'
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : newStatus === 'delivered'
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'btn-primary'
                      }`}
                    >
                      {updateStatusMutation.isPending
                        ? 'Updating...'
                        : newStatus === 'delivered'
                        ? 'Confirm Delivery'
                        : `Mark as ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
