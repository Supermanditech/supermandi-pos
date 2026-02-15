// T-100: Loading skeleton for dashboard page transitions (upgraded from spinner)
import { Skeleton, TableSkeleton } from '@/components/Skeleton';

export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Page title skeleton */}
      <div>
        <Skeleton className="h-6 mb-2" width="40%" />
        <Skeleton className="h-4" width="60%" />
      </div>
      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <Skeleton className="h-3" width="50%" />
            <Skeleton className="h-8" width="30%" />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <TableSkeleton rows={5} cols={4} />
    </div>
  );
}
