'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getOrders, updateOrderStatus, Order } from '@/lib/api';

function formatPrice(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const statusFlow: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: getOrders,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Order['status'] }) =>
      updateOrderStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order status updated');
      setSelectedOrder(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update order');
    },
  });

  const filteredOrders = orders?.filter(
    (order) => statusFilter === 'all' || order.status === statusFilter
  );

  const statusCounts = orders?.reduce(
    (acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  ) || {};

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Orders</h1>
        <p className="text-slate-500 mt-1">
          Manage incoming orders from retailers. Update order status to keep
          customers informed.
        </p>
      </div>

      {/* Status Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-2">
          {['all', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].map(
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
          <div className="p-8 text-center text-slate-500">Loading orders...</div>
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
                    {formatPrice(order.totalAmount)}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        statusColors[order.status] || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-500">
                    {formatDate(order.createdAt)}
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
          <div className="p-8 text-center text-slate-500">
            <p>No orders found.</p>
            <p className="text-sm mt-1">
              Orders will appear here when retailers place orders.
            </p>
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Order Details</h2>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {/* Order Info */}
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div>
                <p className="text-slate-500">Order ID</p>
                <p className="font-mono font-medium">{selectedOrder.id}</p>
              </div>
              <div>
                <p className="text-slate-500">Store</p>
                <p className="font-medium">{selectedOrder.storeName}</p>
              </div>
              <div>
                <p className="text-slate-500">Date</p>
                <p className="font-medium">{formatDate(selectedOrder.createdAt)}</p>
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
            </div>

            {/* Order Items */}
            <div className="border border-slate-200 rounded-lg overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left py-2 px-4 font-medium text-slate-500">
                      Product
                    </th>
                    <th className="text-center py-2 px-4 font-medium text-slate-500">
                      Qty
                    </th>
                    <th className="text-right py-2 px-4 font-medium text-slate-500">
                      Price
                    </th>
                    <th className="text-right py-2 px-4 font-medium text-slate-500">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-2 px-4">{item.productName}</td>
                      <td className="py-2 px-4 text-center">{item.quantity}</td>
                      <td className="py-2 px-4 text-right">
                        {formatPrice(item.unitPrice)}
                      </td>
                      <td className="py-2 px-4 text-right font-medium">
                        {formatPrice(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={3} className="py-3 px-4 text-right font-medium">
                      Total Amount
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-lg">
                      {formatPrice(selectedOrder.totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Status Actions */}
            {statusFlow[selectedOrder.status]?.length > 0 && (
              <div>
                <p className="text-sm text-slate-500 mb-3">Update Status</p>
                <div className="flex gap-3">
                  {statusFlow[selectedOrder.status].map((newStatus) => (
                    <button
                      key={newStatus}
                      onClick={() =>
                        updateStatusMutation.mutate({
                          id: selectedOrder.id,
                          status: newStatus as Order['status'],
                        })
                      }
                      disabled={updateStatusMutation.isPending}
                      className={`btn ${
                        newStatus === 'cancelled'
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'btn-primary'
                      }`}
                    >
                      {updateStatusMutation.isPending
                        ? 'Updating...'
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
