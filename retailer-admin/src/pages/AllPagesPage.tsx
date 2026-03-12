import { useParams, Link } from 'react-router-dom';

interface PageRoute {
  path: string;
  name: string;
  description: string;
  isPublic?: boolean;
}


const pages: PageRoute[] = [
  { path: '', name: 'Dashboard', description: 'Overview and stats' },
  { path: 'products', name: 'Products', description: 'Manage product catalog' },
  { path: 'import', name: 'Import (CSV)', description: 'Bulk import products from CSV' },
  { path: 'inventory', name: 'Inventory', description: 'View inventory ledger' },
  { path: 'suppliers', name: 'Suppliers', description: 'Manage suppliers' },
  { path: 'supplier-catalog', name: 'Supplier Catalog', description: 'Browse supplier products' },
  { path: 'invoices', name: 'Invoices', description: 'View purchase invoices' },
  { path: 'customers', name: 'Customers', description: 'Customer CRM' },
  { path: 'orders', name: 'Orders', description: 'Order management' },
  { path: 'analytics', name: 'Analytics', description: 'Sales analytics dashboard' },
  { path: 'reorder', name: 'Reorder', description: 'Reorder suggestions & settings' },
  { path: 'chat', name: 'Messages', description: 'Chat with suppliers & support' },
  { path: 'notifications', name: 'Notifications', description: 'Notification center' },
  { path: 'settings', name: 'Settings', description: 'Store settings' },
  { path: 'settings/payments', name: 'Payment Settings', description: 'UPI & bank config' },
  { path: 'compliance', name: 'Compliance', description: 'Upload compliance documents' },
  { path: 'login', name: 'Login (Public)', description: 'Phone OTP authentication', isPublic: true },
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
        <div className="qa-info-banner">
          <p className="qa-info-title">
            🧪 QA Test Hub - Development Only
          </p>
          <p className="qa-info-desc">
            This page lists all routes in the retailer admin portal for quick testing.
            Each card links directly to the page with the current store context.
          </p>
        </div>

        {/* Pages Grid */}
        <div className="pages-list">
          {pages.map((page) => (
            <Link
              key={page.path}
              to={page.isPublic ? `/retailer/login` : `/s/${storeCode}/${page.path}`}
              className="page-link-card"
            >
              <span className="page-link-title">{page.name}</span>
              <span className="page-link-path">/s/{storeCode}/{page.path || '(index)'}</span>
              <span className="page-link-desc">
                {page.description}
              </span>
            </Link>
          ))}
        </div>

        {/* Route Reference */}
        <div className="card card-mt-lg">
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
                  <td className="cell-mono">/s/:storeCode/{page.path || '(index)'}</td>
                  <td>{page.isPublic ? 'No' : 'Yes'}</td>
                  <td><span className="badge badge-success">Implemented</span></td>
                </tr>
              ))}
              <tr>
                <td className="cell-mono">/s/:storeCode/_pages</td>
                <td>Yes</td>
                <td><span className="badge badge-success">You are here</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* API Endpoints Reference */}
        <div className="card card-mt-md">
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
                <td className="cell-mono">/api/v1/retailer-admin/auth/firebase-login</td>
                <td><span className="badge badge-success">POST</span></td>
                <td>Firebase token exchange</td>
              </tr>
              <tr>
                <td className="cell-mono">/api/v1/retailer-admin/store</td>
                <td><span className="badge badge-warning">GET</span></td>
                <td>Get store info</td>
              </tr>
              <tr>
                <td className="cell-mono">/api/v1/retailer-admin/products</td>
                <td><span className="badge badge-warning">GET/POST</span></td>
                <td>Products CRUD</td>
              </tr>
              <tr>
                <td className="cell-mono">/api/v1/retailer-admin/inventory</td>
                <td><span className="badge badge-warning">GET</span></td>
                <td>Inventory ledger</td>
              </tr>
              <tr>
                <td className="cell-mono">/api/v1/retailer-admin/suppliers</td>
                <td><span className="badge badge-warning">GET/POST</span></td>
                <td>Suppliers CRUD</td>
              </tr>
              <tr>
                <td className="cell-mono">/api/v1/retailer-admin/compliance</td>
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
