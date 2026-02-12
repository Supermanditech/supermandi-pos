import { useParams, Link } from 'react-router-dom';

const pages = [
  { path: '', name: 'Dashboard', description: 'Overview and stats' },
  { path: 'products', name: 'Products', description: 'Manage product catalog' },
  { path: 'import', name: 'Import (CSV)', description: 'Bulk import products from CSV' },
  { path: 'inventory', name: 'Inventory', description: 'View inventory ledger' },
  { path: 'suppliers', name: 'Suppliers', description: 'Manage suppliers' },
  { path: 'compliance', name: 'Compliance', description: 'Upload compliance documents' },
  { path: 'login', name: 'Login (Public)', description: 'Phone OTP authentication' },
];

export default function AllPagesPage() {
  const { storeCode } = useParams<{ storeCode: string }>();

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">🧪 All Pages (QA Hub)</h1>
      </header>

      <div className="page-content">
        {/* Info Banner */}
        <div style={{
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <p style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
            🧪 QA Test Hub - Development Only
          </p>
          <p style={{ fontSize: '0.875rem', color: '#92400e' }}>
            This page lists all routes in the retailer admin portal for quick testing.
            Each card links directly to the page with the current store context.
          </p>
        </div>

        {/* Pages Grid */}
        <div className="pages-list">
          {pages.map((page) => (
            <Link
              key={page.path}
              to={page.path === 'login' ? `/s/${storeCode}/login` : `/s/${storeCode}/${page.path}`}
              className="page-link-card"
            >
              <span className="page-link-title">{page.name}</span>
              <span className="page-link-path">/s/{storeCode}/{page.path || '(index)'}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                {page.description}
              </span>
            </Link>
          ))}
        </div>

        {/* Route Reference */}
        <div className="card" style={{ marginTop: '2rem' }}>
          <h3 className="card-title">Route Reference</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Auth Required</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => (
                <tr key={page.path}>
                  <td style={{ fontFamily: 'monospace' }}>/s/:storeCode/{page.path || '(index)'}</td>
                  <td>{page.path === 'login' ? 'No' : 'Yes'}</td>
                  <td><span className="badge badge-success">Implemented</span></td>
                </tr>
              ))}
              <tr>
                <td style={{ fontFamily: 'monospace' }}>/s/:storeCode/_pages</td>
                <td>Yes</td>
                <td><span className="badge badge-success">You are here</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* API Endpoints Reference */}
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3 className="card-title">API Endpoints</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Method</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontFamily: 'monospace' }}>/api/v1/retailer-admin/auth/firebase-login</td>
                <td><span className="badge badge-success">POST</span></td>
                <td>Firebase token exchange</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'monospace' }}>/api/v1/retailer-admin/store</td>
                <td><span className="badge badge-warning">GET</span></td>
                <td>Get store info</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'monospace' }}>/api/v1/retailer-admin/products</td>
                <td><span className="badge badge-warning">GET/POST</span></td>
                <td>Products CRUD</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'monospace' }}>/api/v1/retailer-admin/inventory</td>
                <td><span className="badge badge-warning">GET</span></td>
                <td>Inventory ledger</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'monospace' }}>/api/v1/retailer-admin/suppliers</td>
                <td><span className="badge badge-warning">GET/POST</span></td>
                <td>Suppliers CRUD</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'monospace' }}>/api/v1/retailer-admin/compliance</td>
                <td><span className="badge badge-warning">GET/POST</span></td>
                <td>Compliance docs</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
