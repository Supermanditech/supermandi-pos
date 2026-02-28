import { Link, useParams } from 'react-router-dom';

// T-115: Branded 404 page for retailer admin portal
export default function NotFoundPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const dashboardPath = storeCode ? `/s/${storeCode}` : '/retailer/login';

  return (
    <div className="not-found">
      <div className="not-found-code">404</div>
      <h1 className="not-found-title">Page Not Found</h1>
      <p className="not-found-desc">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to={dashboardPath} className="not-found-link">
        Back to Dashboard
      </Link>
    </div>
  );
}
