import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function DashboardPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { store, user } = useAuth();

  const stats = [
    { label: 'Total Products', value: '1,234', icon: '📦' },
    { label: 'Low Stock Items', value: '23', icon: '⚠️' },
    { label: 'Pending Orders', value: '5', icon: '📋' },
    { label: 'Compliance Docs', value: '4/5', icon: '📄' },
  ];

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </header>

      <div className="page-content">
        {/* Welcome Card */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
            Welcome back! 👋
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Store: <strong>{store?.name || storeCode}</strong> ({store?.code || storeCode})
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Logged in as: {user?.phone || 'Unknown'} ({user?.role || 'N/A'})
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
          {stats.map((stat) => (
            <div key={stat.label} className="stat-card">
              <div className="stat-label">
                {stat.icon} {stat.label}
              </div>
              <div className="stat-value">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h3 className="card-title">Quick Actions</h3>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <a href={`/s/${storeCode}/products`} className="btn btn-primary">
              ➕ Add Product
            </a>
            <a href={`/s/${storeCode}/import`} className="btn btn-secondary">
              📥 Import CSV
            </a>
            <a href={`/s/${storeCode}/compliance`} className="btn btn-secondary">
              📄 Upload Documents
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
