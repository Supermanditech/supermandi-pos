// SA-P2-008: Bulk Import Notification — shows recent CSV import jobs across stores
import { useState, useEffect } from "react";
import { fetchImportJobs, type ImportJobRecord } from "../api/imports";
import { formatDateTime } from "../lib/formatters";

const PAGE_SIZE = 20;

const STATUS_BADGE: Record<string, string> = {
  pending: "badgeWarn",
  validating: "badgeWarn",
  validated: "badgeInfo",
  committing: "badgeWarn",
  committed: "badgeOk",
  failed: "badgeError",
};

export function BulkImportNotifications() {
  const [imports, setImports] = useState<ImportJobRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchImportJobs({
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          status: statusFilter || undefined,
        });
        if (!cancelled) {
          setImports(data.imports);
          setTotal(data.total);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load import jobs");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    refresh();
    return () => { cancelled = true; };
  }, [page, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="card">
      <div className="cardHeader">
        <div>
          <div className="cardTitle">CSV Import Jobs</div>
          <div className="muted">{total} import job{total !== 1 ? "s" : ""} across all stores</div>
        </div>
      </div>

      {error && <div className="banner sa-mb-12" role="alert">{error}</div>}

      <div className="tableWrap" style={{ paddingTop: 0 }}>
        <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="control">
            <label>Status Filter</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              className="sa-select sa-radius-4"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="validating">Validating</option>
              <option value="validated">Validated</option>
              <option value="committing">Committing</option>
              <option value="committed">Committed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="control">
            <label>&nbsp;</label>
            <button onClick={() => refresh(page, statusFilter)} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {loading && imports.length === 0 ? (
        <div className="empty">Loading import jobs...</div>
      ) : imports.length === 0 ? (
        <div className="empty">No import jobs found{statusFilter ? ` with status "${statusFilter}"` : ""}.</div>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Store</th>
                <th>File</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Created/Updated</th>
                <th>Errors</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((job) => (
                <tr key={job.id}>
                  <td className="mono">{job.store_name || job.store_id}</td>
                  <td className="mono" title={job.file_name}>
                    {job.file_name.length > 30 ? job.file_name.slice(0, 27) + "..." : job.file_name}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[job.status] || ""}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="mono">
                    {job.total_rows} total / {job.valid_rows} valid
                  </td>
                  <td className="mono">
                    +{job.products_created} / ~{job.products_updated}
                  </td>
                  <td className={job.error_rows > 0 ? "sa-text-danger" : ""}>{job.error_rows}</td>
                  <td className="mono">{job.created_at ? formatDateTime(job.created_at) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="sa-flex sa-gap-8 sa-flex-wrap sa-py-8">
            <button
              className="tab"
              disabled={page === 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <button
              className="tab"
              disabled={page + 1 >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
            <span className="muted">
              Page {page + 1} / {totalPages}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
