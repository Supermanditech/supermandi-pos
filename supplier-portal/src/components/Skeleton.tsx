export function Skeleton({ className = '', width, height }: { className?: string; width?: string; height?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className}`} style={{ width, height }} />;
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex gap-4 mb-4 pb-3 border-b border-slate-200">
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-3" width={`${100/cols - 2}%`} />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 py-3 border-b border-slate-100">
          {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} className="h-3" width={`${100/cols - 2}%`} />)}
        </div>
      ))}
    </div>
  );
}
