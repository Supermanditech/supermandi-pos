// SA-009/010: Skeleton loader for data tables
// Replaces "Loading..." text with animated shimmer placeholders

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  const widths = ["30%", "20%", "25%", "15%", "10%", "18%"];

  return (
    <div className="skeletonTable" role="status" aria-label="Loading data">
      {Array.from({ length: rows }).map((_, r) => (
        <div className="skeletonRow" key={r}>
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={c}
              className="skeleton skeletonCell"
              style={{ width: widths[c % widths.length], flex: c === 0 ? 2 : 1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
