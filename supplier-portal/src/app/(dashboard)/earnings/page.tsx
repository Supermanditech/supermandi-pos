'use client';

// GL-WF-044: Payout History and Earnings Page

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getPayouts, getPayoutSummary, getKycStatus, getPayoutOrders, Payout, PayoutSummary, PayoutOrderItem } from '@/lib/api';

export default function EarningsPage() {
  const [page, setPage] = useState(1);
  const limit = 20;
  // GO-LIVE-031: Selected payout for order breakdown
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);

  // Fetch payout summary
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['payout-summary'],
    queryFn: getPayoutSummary,
  });

  // GL-CRIT-0061: Track error state for API failures
  const { data: payoutsData, isLoading: payoutsLoading, isError: payoutsError, refetch: refetchPayouts } = useQuery({
    queryKey: ['payouts', page],
    queryFn: () => getPayouts({ page, limit }),
  });

  // Fetch KYC status for payout readiness
  const { data: kycStatus } = useQuery({
    queryKey: ['kyc-status'],
    queryFn: getKycStatus,
  });

  // GO-LIVE-031: Fetch payout orders when a payout is selected
  const { data: payoutOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ['payout-orders', selectedPayoutId],
    queryFn: () => selectedPayoutId ? getPayoutOrders(selectedPayoutId) : Promise.resolve([]),
    enabled: !!selectedPayoutId,
  });

  const formatCurrency = (paise: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(paise / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: Payout['status']) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      processing: 'bg-blue-100 text-blue-700',
      completed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status] || 'bg-gray-100'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const payouts = payoutsData?.data || [];
  const pagination = payoutsData?.pagination;
  // GO-LIVE-031: Find selected payout for modal
  const selectedPayout = payouts.find(p => p.id === selectedPayoutId);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Earnings & Payouts</h1>
        <p className="text-slate-500 mt-1">
          Track your earnings and view payout history.
        </p>
      </div>

      {/* Payout Readiness Warning */}
      {kycStatus && !kycStatus.payoutReady && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-medium text-yellow-800">Complete KYC to Receive Payouts</p>
              <p className="text-sm text-yellow-700 mt-1">
                You need to complete your KYC verification and bank details to receive payouts.
              </p>
              <Link href="/kyc" className="text-sm text-yellow-900 underline mt-2 inline-block">
                Complete KYC Now
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="card">
            <p className="text-sm text-slate-500">Total Revenue</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">
              {formatCurrency(summary.totalRevenuePaise)}
            </p>
          </div>

          <div className="card">
            <p className="text-sm text-slate-500">Available Balance</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {formatCurrency(summary.availableBalancePaise)}
            </p>
          </div>

          <div className="card">
            <p className="text-sm text-slate-500">Total Paid Out</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">
              {formatCurrency(summary.totalPaidPaise)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {summary.completedPayouts} payouts
            </p>
          </div>

          <div className="card">
            <p className="text-sm text-slate-500">Pending Payouts</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">
              {formatCurrency(summary.totalPendingPaise + summary.totalProcessingPaise)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {summary.pendingPayouts} pending
            </p>
          </div>
        </div>
      )}

      {/* Payout History */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Payout History</h2>

        {payoutsLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : payoutsError ? (
          /* GL-CRIT-0061: Show explicit error state with retry */
          <div className="text-center py-8">
            <div className="text-red-600 font-medium mb-2">Failed to load payout history</div>
            <p className="text-sm text-slate-500 mb-4">
              There was an error loading your payouts. Please try again.
            </p>
            <button
              onClick={() => refetchPayouts()}
              className="btn btn-primary"
            >
              Retry
            </button>
          </div>
        ) : payouts.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p className="text-lg mb-2">No payouts yet</p>
            <p className="text-sm">
              Payouts are processed weekly for delivered orders.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Reference</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Bank Account</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Amount</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((payout) => (
                    <tr
                      key={payout.id}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setSelectedPayoutId(payout.id)}
                    >
                      <td className="py-3 px-4 text-sm text-slate-700">
                        {formatDate(payout.initiatedAt)}
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm font-mono text-slate-700">{payout.referenceId}</p>
                        {payout.paymentGatewayRef && (
                          <p className="text-xs text-slate-400">UTR: {payout.paymentGatewayRef}</p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-slate-700">{payout.bankAccount.accountName}</p>
                        <p className="text-xs text-slate-400">
                          {payout.bankAccount.accountNumber} | {payout.bankAccount.ifsc}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <p className="text-sm font-semibold text-slate-800">
                          {formatCurrency(payout.amountPaise)}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getStatusBadge(payout.status)}
                        {payout.status === 'failed' && payout.failureReason && (
                          <p className="text-xs text-red-500 mt-1">{payout.failureReason}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {payouts.map((payout) => (
                <div
                  key={payout.id}
                  className="border border-slate-200 rounded-lg p-4 cursor-pointer hover:bg-slate-50"
                  onClick={() => setSelectedPayoutId(payout.id)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold text-slate-800">
                        {formatCurrency(payout.amountPaise)}
                      </p>
                      <p className="text-xs text-slate-500">{formatDate(payout.initiatedAt)}</p>
                    </div>
                    {getStatusBadge(payout.status)}
                  </div>
                  <div className="text-sm text-slate-600">
                    <p>Ref: {payout.referenceId}</p>
                    <p className="text-xs text-slate-400">
                      {payout.bankAccount.accountName} | {payout.bankAccount.accountNumber}
                    </p>
                  </div>
                  {payout.status === 'failed' && payout.failureReason && (
                    <p className="text-xs text-red-500 mt-2">{payout.failureReason}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                <p className="text-sm text-slate-500">
                  Showing {(page - 1) * limit + 1} to {Math.min(page * limit, pagination.total)} of{' '}
                  {pagination.total} payouts
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn btn-secondary text-sm"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={page === pagination.totalPages}
                    className="btn btn-secondary text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-800 mb-2">Payout Information</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>Payouts are processed weekly on Mondays for all delivered orders.</li>
          <li>Minimum payout amount is Rs. 100.</li>
          <li>Payouts are credited within 2-3 business days after processing.</li>
          <li>Ensure your bank details are verified to avoid payout failures.</li>
        </ul>
      </div>

      {/* GO-LIVE-031: Payout Details Modal */}
      {selectedPayoutId && selectedPayout && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedPayoutId(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-slate-800">Payout Details</h2>
                <button
                  onClick={() => setSelectedPayoutId(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              {/* Payout Summary */}
              <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm text-slate-500">Reference</p>
                  <p className="font-mono font-medium">{selectedPayout.referenceId}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Amount</p>
                  <p className="text-xl font-bold text-slate-800">
                    {formatCurrency(selectedPayout.amountPaise)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Date</p>
                  <p className="font-medium">{formatDate(selectedPayout.initiatedAt)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Status</p>
                  {getStatusBadge(selectedPayout.status)}
                </div>
              </div>

              {/* Order Breakdown */}
              <div>
                <h3 className="font-medium text-slate-700 mb-3">
                  Orders Included in This Payout
                </h3>

                {ordersLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
                  </div>
                ) : payoutOrders && payoutOrders.length > 0 ? (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left py-2 px-4 font-medium text-slate-500">Order</th>
                          <th className="text-left py-2 px-4 font-medium text-slate-500">Store</th>
                          <th className="text-left py-2 px-4 font-medium text-slate-500">Date</th>
                          <th className="text-right py-2 px-4 font-medium text-slate-500">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payoutOrders.map((order: PayoutOrderItem) => (
                          <tr key={order.id} className="border-b border-slate-100">
                            <td className="py-2 px-4 font-mono text-xs">
                              {order.orderId.slice(0, 8)}...
                            </td>
                            <td className="py-2 px-4">{order.storeName}</td>
                            <td className="py-2 px-4 text-slate-600">
                              {new Date(order.orderDate).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </td>
                            <td className="py-2 px-4 text-right font-medium">
                              {formatCurrency(order.amountPaise)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 border-t-2 border-slate-200">
                          <td colSpan={3} className="py-2 px-4 font-medium text-right">
                            Total
                          </td>
                          <td className="py-2 px-4 text-right font-bold">
                            {formatCurrency(selectedPayout.amountPaise)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-500 text-sm">
                    <p>No order breakdown available for this payout.</p>
                    <p className="text-xs mt-1">
                      Order tracking was added recently. Older payouts may not have detailed breakdowns.
                    </p>
                  </div>
                )}
              </div>

              {/* UTR Info */}
              {selectedPayout.paymentGatewayRef && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800">
                    <span className="font-medium">UTR/Transaction ID:</span>{' '}
                    <span className="font-mono">{selectedPayout.paymentGatewayRef}</span>
                  </p>
                </div>
              )}

              {/* Failure Reason */}
              {selectedPayout.status === 'failed' && selectedPayout.failureReason && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">
                    <span className="font-medium">Failure Reason:</span>{' '}
                    {selectedPayout.failureReason}
                  </p>
                </div>
              )}

              {/* Close Button */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedPayoutId(null)}
                  className="btn btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
