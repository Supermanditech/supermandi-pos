// ISSUE-MICRO-098: Loading skeleton for dashboard page transitions

export default function DashboardLoading() {
  return (
    <div className="p-6 animate-pulse">
      <div className="h-6 w-2/5 bg-slate-200 rounded mb-4" />
      <div className="h-4 w-3/5 bg-slate-200 rounded mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-xl" />
        ))}
      </div>
      <div className="mt-6 h-64 bg-slate-100 rounded-xl" />
    </div>
  );
}
