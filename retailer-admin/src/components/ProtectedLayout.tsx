import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function ProtectedLayout() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { logout, store } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate(`/s/${storeCode}/login`);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Sidebar */}
      <aside style={{
        width: '240px',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '4px 0 20px rgba(0,0,0,0.1)',
      }}>
        {/* Brand Header */}
        <div style={{
          padding: '1.75rem 1.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{
            fontWeight: '800',
            fontSize: '1.5rem',
            background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.5px',
          }}>
            SuperMandi
          </div>
          <div style={{
            fontSize: '0.8rem',
            color: '#94a3b8',
            marginTop: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              background: '#22c55e',
              borderRadius: '50%',
              display: 'inline-block',
            }}></span>
            {store?.name || storeCode}
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '1rem' }}>
          <a
            href={`/s/${storeCode}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.875rem 1rem',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(6, 182, 212, 0.2))',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              fontWeight: '500',
              fontSize: '0.95rem',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>📊</span>
            Dashboard
          </a>
        </nav>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: '#fca5a5',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '500',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.color = '#fecaca';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              e.currentTarget.style.color = '#fca5a5';
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Main Content */}
        <main style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </main>

        {/* Debug Footer - Fixed at bottom */}
        <footer style={{
          padding: '0.6rem 2rem',
          background: '#0f172a',
          color: '#64748b',
          fontSize: '0.7rem',
          display: 'flex',
          gap: '2rem',
          borderTop: '1px solid #1e293b',
        }}>
          <span>StoreCode: <strong style={{ color: '#38bdf8' }}>{storeCode}</strong></span>
          <span>StoreId: <strong style={{ color: '#38bdf8' }}>{store?.id || '...'}</strong></span>
          <span>API: <strong style={{ color: '#38bdf8' }}>{window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin}</strong></span>
        </footer>
      </div>
    </div>
  );
}
