import { Skeleton } from './Skeleton';

export default function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card table-skeleton">
      {/* Header row */}
      <div className="table-skeleton-header">
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} height={14} width={`${100/cols - 2}%`} />)}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="table-skeleton-row">
          {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} height={14} width={`${100/cols - 2}%`} />)}
        </div>
      ))}
    </div>
  );
}
