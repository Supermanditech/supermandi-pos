import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  path?: string;
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="breadcrumb-nav">
      {items.map((item, i) => (
        <span key={i} className="breadcrumb-item">
          {i > 0 && <span className="breadcrumb-separator">&rsaquo;</span>}
          {item.path ? (
            <Link to={item.path} className="breadcrumb-link">{item.label}</Link>
          ) : item.onClick ? (
            <a onClick={item.onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.onClick?.(); } }} className="breadcrumb-link" role="button" tabIndex={0}>{item.label}</a>
          ) : (
            <span className="breadcrumb-current">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
