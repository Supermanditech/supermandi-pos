'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getDashboardStats, getOrders, getProducts } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function StatCard({
  title,
  value,
  icon,
  color,
  href,
}: {
  title: string;
  value: string | number;
  icon: string;
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
          <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
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

function formatCurrency(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function DashboardPage() {
  const { supplier } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
  });

  const { data: recentOrders } = useQuery({
    queryKey: ['recent-orders'],
    queryFn: getOrders,
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
  });

  // Mock stats if API not ready
  const displayStats = stats || {
    totalProducts: products?.length || 0,
    pendingProducts: products?.filter((p) => p.approvalStatus === 'pending').length || 0,
    approvedProducts: products?.filter((p) => p.approvalStatus === 'approved').length || 0,
    totalOrders: recentOrders?.length || 0,
    pendingOrders: recentOrders?.filter((o) => o.status === 'pending').length || 0,
    totalRevenue: recentOrders?.reduce((sum, o) => sum + o.totalAmount, 0) || 0,
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">
          Welcome, {supplier?.businessName}
        </h1>
        <p className="text-slate-500 mt-1">
          Here's what's happening with your products and orders.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Products"
          value={statsLoading ? '...' : displayStats.totalProducts}
          icon="📦"
          color="bg-blue-100"
          href="/products"
        />
        <StatCard
          title="Pending Approval"
          value={statsLoading ? '...' : displayStats.pendingProducts}
          icon="⏳"
          color="bg-yellow-100"
          href="/products"
        />
        <StatCard
          title="Active Orders"
          value={statsLoading ? '...' : displayStats.pendingOrders}
          icon="🛒"
          color="bg-green-100"
          href="/orders"
        />
        <StatCard
          title="Total Revenue"
          value={statsLoading ? '...' : formatCurrency(displayStats.totalRevenue)}
          icon="💰"
          color="bg-purple-100"
        />
      </div>

      {/* Quick Actions */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/products?action=add"
            className="btn btn-primary flex items-center gap-2"
          >
            <span>+</span> Add Product
          </Link>
          <Link
            href="/upload"
            className="btn btn-secondary flex items-center gap-2"
          >
            <span>📄</span> Upload CSV
          </Link>
          <Link
            href="/orders"
            className="btn btn-secondary flex items-center gap-2"
          >
            <span>🛒</span> View Orders
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

        {recentOrders && recentOrders.length > 0 ? (
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
                            : order.status === 'pending'
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
