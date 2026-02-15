import { Skeleton } from './Skeleton';

export default function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card" style={{ padding: '1rem' }}>
      {/* Header row */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} height={14} width={`${100/cols - 2}%`} />)}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: '1rem', padding: '0.75rem 0', borderBottom: '1px solid #f1f5f9' }}>
          {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} height={14} width={`${100/cols - 2}%`} />)}
        </div>
      ))}
    </div>
  );
}
