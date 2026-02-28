'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getDashboardStats, getOrders, getProducts } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCurrency } from '@/lib/formatters';
// T-113: Breadcrumb navigation
import Breadcrumb from '@/components/Breadcrumb';
import { Package, Clock, ShoppingCart, DollarSign, AlertTriangle, FileText, Plus } from 'lucide-react';

function StatCard({
  title,
  value,
  icon,
  color,
  href,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  href?: string;
}) {
  const content = (
    <div
      className={`card hover:shadow-md transition-shadow ${
        href ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          {value === '-' ? (
            <div className="h-8 w-20 bg-slate-200 rounded mt-1 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
          )}
        </div>
        <div
          className={`w-12 h-12 rounded-lg ${color} flex items-center justify-center text-2xl`}
        >
          {icon}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

export default function DashboardPage() {
  const { supplier } = useAuth();

  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
  });

  // GL-WF-063: Use paginated API calls
  // REQ.AUDIT.W5.SUPPLIER.DASHBOARD-RETRY-WRONG-QUERY-SCOPE.001: expose refetch on all queries
  // STG-007: Destructure isLoading/isError for proper loading states
  const { data: ordersResponse, isLoading: ordersLoading, isError: ordersError, refetch: refetchOrders } = useQuery({
    queryKey: ['recent-orders'],
    queryFn: () => getOrders({ page: 1, limit: 5 }),
  });
  const recentOrders = ordersResponse?.data;

  const { data: productsResponse, isLoading: productsLoading, isError: productsError, refetch: refetchProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts({ page: 1, limit: 100 }),
  });

  // GL-CRIT-0099: Server totals only — client-side pagination counts are inaccurate
  // (W4-FIX: removed products?.length and recentOrders?.length client-side fallbacks)
  const displayStats = stats ?? {
    totalProducts: productsResponse?.pagination?.total ?? null,
    pendingProducts: null,
    approvedProducts: null,
    totalOrders: ordersResponse?.pagination?.total ?? null,
    pendingOrders: null,
    totalRevenue: null,
  };

  return (
    <div>
      {/* T-113: Breadcrumb navigation */}
      <Breadcrumb items={[{ label: 'Dashboard' }]} />
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">
          Welcome, {supplier?.businessName}
        </h1>
        <p className="text-slate-500 mt-1">
          Here's what's happening with your products and orders.
        </p>
      </div>

      {/* GL-WF-058: Pending products visibility indicator */}
      {(displayStats.pendingProducts ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="text-amber-500 flex-shrink-0" size={20} />
          <div>
            <p className="font-medium text-amber-800">
              {displayStats.pendingProducts} product{(displayStats.pendingProducts ?? 0) > 1 ? 's' : ''} pending approval
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Pending products are <strong>not visible to retailers</strong> until approved by SuperMandi.
              Review takes 1-2 business days.
            </p>
            <Link
              href="/products"
              className="text-sm text-amber-800 font-medium hover:underline mt-2 inline-block"
            >
              View pending products →
            </Link>
          </div>
        </div>
      )}

      {/* STBT-185.6: Dashboard stats error state with retry */}
      {statsError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="font-medium text-red-800">Failed to load dashboard stats</p>
            <p className="text-sm text-red-600 mt-1">Please check your connection and try again.</p>
          </div>
          <button onClick={() => { void refetchStats(); void refetchOrders(); void refetchProducts(); }} className="btn btn-secondary text-sm">
            Retry
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Products"
          value={statsLoading ? '-' : (displayStats.totalProducts ?? '—')}
          icon={<Package size={24} className="text-blue-600" />}
          color="bg-blue-100"
          href="/products"
        />
        <StatCard
          title="Pending Approval"
          value={statsLoading ? '-' : (displayStats.pendingProducts ?? '—')}
          icon={<Clock size={24} className="text-yellow-600" />}
          color="bg-yellow-100"
          href="/products"
        />
        <StatCard
          title="Active Orders"
          value={statsLoading ? '-' : (displayStats.pendingOrders ?? '—')}
          icon={<ShoppingCart size={24} className="text-green-600" />}
          color="bg-green-100"
          href="/orders"
        />
        <StatCard
          title="Total Revenue"
          value={statsLoading ? '-' : (displayStats.totalRevenue != null ? formatCurrency(displayStats.totalRevenue) : '—')}
          icon={<DollarSign size={24} className="text-purple-600" />}
          color="bg-purple-100"
        />
      </div>

      {/* Quick Actions */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          Quick Actions
        </h2>
        {/* STG-008: Disable actions for unverified suppliers */}
        <div className="flex flex-wrap gap-3">
          {supplier?.verificationStatus === 'ACTIVE' ? (
            <Link
              href="/products?action=add"
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> Add Product
            </Link>
          ) : (
            <button
              disabled
              className="btn btn-primary flex items-center gap-2 opacity-50 cursor-not-allowed"
              title="Supplier verification required"
            >
              <Plus size={16} /> Add Product
            </button>
          )}
          {supplier?.verificationStatus === 'ACTIVE' ? (
            <Link
              href="/upload"
              className="btn btn-secondary flex items-center gap-2"
            >
              <FileText size={16} /> Upload CSV
            </Link>
          ) : (
            <button
              disabled
              className="btn btn-secondary flex items-center gap-2 opacity-50 cursor-not-allowed"
              title="Supplier verification required"
            >
              <FileText size={16} /> Upload CSV
            </button>
          )}
          <Link
            href="/orders"
            className="btn btn-secondary flex items-center gap-2"
          >
            <ShoppingCart size={16} /> View Orders
          </Link>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Recent Orders</h2>
          <Link
            href="/orders"
            className="text-primary-600 hover:text-primary-700 text-sm font-medium"
          >
            View All →
          </Link>
        </div>

        {/* STG-007: Show loading/error states before "No orders yet" */}
        {ordersLoading ? (
          <div className="py-8 text-center text-slate-500">
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-slate-300 border-t-primary-600 rounded-full animate-spin" />
              <span>Loading orders...</span>
            </div>
          </div>
        ) : ordersError ? (
          <div className="py-8 text-center">
            <p className="text-red-600 font-medium">Failed to load orders</p>
            <button onClick={() => { void refetchOrders(); }} className="text-sm text-primary-600 hover:underline mt-2">Retry</button>
          </div>
        ) : recentOrders && recentOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
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
                </tr>
              </thead>
              <tbody>
                {recentOrders.slice(0, 5).map((order) => (
                  <tr key={order.id} className="border-b border-slate-100">
                    <td className="py-3 px-4 font-mono text-sm">
                      {order.id.slice(0, 8)}
                    </td>
                    <td className="py-3 px-4">{order.storeName}</td>
                    <td className="py-3 px-4">{order.items.length} items</td>
                    <td className="py-3 px-4 font-medium">
                      {formatCurrency(order.totalAmount)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          order.status === 'delivered'
                            ? 'bg-green-100 text-green-700'
                            : order.status === 'submitted'
                            ? 'bg-yellow-100 text-yellow-700'
                            : order.status === 'cancelled'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <p>No orders yet.</p>
            <p className="text-sm mt-1">
              Orders will appear here when retailers place orders.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
