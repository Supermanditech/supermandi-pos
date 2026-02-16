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
    <nav style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748B', marginBottom: 16 }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {i > 0 && <span style={{ color: '#CBD5E1' }}>&rsaquo;</span>}
          {item.path ? (
            <Link to={item.path} style={{ color: '#64748B', textDecoration: 'none' }}>{item.label}</Link>
          ) : item.onClick ? (
            <a onClick={item.onClick} style={{ color: '#64748B', textDecoration: 'none', cursor: 'pointer' }}>{item.label}</a>
          ) : (
            <span style={{ color: '#0F172A', fontWeight: 500 }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
