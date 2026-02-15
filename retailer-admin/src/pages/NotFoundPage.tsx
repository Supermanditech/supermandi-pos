import { Link, useParams } from 'react-router-dom';

// T-115: Branded 404 page for retailer admin portal
export default function NotFoundPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const dashboardPath = storeCode ? `/s/${storeCode}` : '/retailer/login';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem', textAlign: 'center' }}>
      <div style={{ fontSize: 72, fontWeight: 800, color: '#E2E8F0', lineHeight: 1 }}>404</div>
      <h1 style={{ fontSize: 24, fontWeight: 600, color: '#0F172A', margin: '1rem 0 0.5rem' }}>Page Not Found</h1>
      <p style={{ fontSize: 14, color: '#64748B', maxWidth: 400, margin: '0 auto 1.5rem' }}>
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to={dashboardPath} style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: '0.75rem 1.5rem', background: '#2563EB', color: 'white',
        borderRadius: 6, textDecoration: 'none', fontWeight: 500, fontSize: 14,
      }}>
        Back to Dashboard
      </Link>
    </div>
  );
}
