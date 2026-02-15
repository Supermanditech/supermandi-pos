import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: '#EFF6FF', marginBottom: '1rem' }}>
        <Icon style={{ width: 24, height: 24, color: '#2563EB' }} />
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0F172A', marginBottom: '0.5rem' }}>{title}</h3>
      <p style={{ fontSize: 14, color: '#64748B', maxWidth: 360, margin: '0 auto' }}>{description}</p>
      {action && <div style={{ marginTop: '1.5rem' }}>{action}</div>}
    </div>
  );
}
