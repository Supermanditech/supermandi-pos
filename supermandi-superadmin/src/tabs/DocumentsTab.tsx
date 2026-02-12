// SA-001: Documents verification tab extracted from App.tsx
import type { DocumentRecord } from "../api/documents";
import { formatDateTime } from "../lib/formatters";

interface DocumentsTabProps {
  pendingDocuments: DocumentRecord[];
  pendingDocsTotal: number;
  documentsLoading: boolean;
  documentsError: string;
  documentsPage: number;
  documentsEntityFilter: "" | "store" | "supplier";
  selectedDocument: DocumentRecord | null;
  docRejectReason: string;
  documentActionLoading: string | null;
  setDocumentsPage: (fn: (p: number) => number) => void;
  setDocumentsEntityFilter: (v: "" | "store" | "supplier") => void;
  setSelectedDocument: (v: DocumentRecord | null) => void;
  setDocRejectReason: (v: string) => void;
  refreshDocuments: () => void;
  handleApproveDocument: (id: string) => void;
  handleRejectDocument: (id: string, reason: string) => void;
}

export function DocumentsTab({
  pendingDocuments, pendingDocsTotal, documentsLoading, documentsError,
  documentsPage, documentsEntityFilter, selectedDocument, docRejectReason,
  documentActionLoading, setDocumentsPage, setDocumentsEntityFilter,
  setSelectedDocument, setDocRejectReason, refreshDocuments,
  handleApproveDocument, handleRejectDocument,
}: DocumentsTabProps) {
  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">Document Verification Queue</div>
        <div className="muted">Review and approve/reject KYC documents ({pendingDocsTotal} pending)</div>
      </div>

      <div className="tableWrap">
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <button onClick={() => refreshDocuments()} disabled={documentsLoading}>
            {documentsLoading ? "Loading..." : "Refresh"}
          </button>
          <select value={documentsEntityFilter} onChange={(e) => { setDocumentsEntityFilter(e.target.value as "" | "store" | "supplier"); setDocumentsPage(() => 0); }} style={{ padding: "6px 10px" }}>
            <option value="">All Entities</option>
            <option value="store">Stores</option>
            <option value="supplier">Suppliers</option>
          </select>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button disabled={documentsPage === 0} onClick={() => setDocumentsPage(prev => Math.max(0, prev - 1))} aria-label="Previous page">← Prev</button>
            <span className="muted">Page {documentsPage + 1} of {Math.max(1, Math.ceil(pendingDocsTotal / 50))}</span>
            <button disabled={(documentsPage + 1) * 50 >= pendingDocsTotal} onClick={() => setDocumentsPage(prev => prev + 1)} aria-label="Next page">Next →</button>
          </div>
        </div>

        {documentsError && <div className="errorText" style={{ marginBottom: 8 }}>{documentsError}</div>}

        {pendingDocuments.length === 0 ? (
          <div className="empty">No pending documents to review.</div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Entity</th><th>Document Type</th><th>File</th><th>Uploaded</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {pendingDocuments.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase" }}>{doc.entity_type}</div>
                    <div className="mono" style={{ fontSize: 11 }}>{doc.entity_name || doc.entity_id.slice(0, 8)}</div>
                    {doc.owner_name && <div style={{ fontSize: 11, color: "#666" }}>{doc.owner_name}</div>}
                  </td>
                  <td>{doc.document_type}</td>
                  <td>
                    <div>{doc.file_name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{(doc.file_size / 1024).toFixed(1)} KB • {doc.content_type}</div>
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>{formatDateTime(doc.uploaded_at)}</td>
                  <td>
                    <span className={`badge ${doc.status === "pending" ? "badgeWarn" : doc.status === "approved" ? "badgeGood" : "badgeBad"}`}>{doc.status}</span>
                  </td>
                  <td>
                    <button onClick={() => setSelectedDocument(doc)} style={{ padding: "4px 8px", fontSize: 12 }}>Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedDocument && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setSelectedDocument(null)}>
          <div style={{ backgroundColor: "#1a1a2e", borderRadius: 8, padding: 24, maxWidth: "90vw", maxHeight: "90vh", overflow: "auto", minWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Review Document</h3>
              <button onClick={() => setSelectedDocument(null)} style={{ padding: "4px 8px" }} aria-label="Close document review">✕</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}><strong>Entity:</strong> {selectedDocument.entity_type} - {selectedDocument.entity_name || selectedDocument.entity_id}</div>
              <div style={{ marginBottom: 8 }}><strong>Document Type:</strong> {selectedDocument.document_type}</div>
              <div style={{ marginBottom: 8 }}><strong>File:</strong> {selectedDocument.file_name} ({(selectedDocument.file_size / 1024).toFixed(1)} KB)</div>
              <div style={{ marginBottom: 8 }}><strong>Uploaded:</strong> {formatDateTime(selectedDocument.uploaded_at)}</div>
            </div>
            <div style={{ marginBottom: 16, textAlign: "center", backgroundColor: "#0f0f23", padding: 16, borderRadius: 4 }}>
              {selectedDocument.content_type.startsWith("image/") ? (
                <img src={selectedDocument.view_url} alt={selectedDocument.file_name} style={{ maxWidth: "100%", maxHeight: 400 }} />
              ) : selectedDocument.content_type === "application/pdf" ? (
                <iframe src={selectedDocument.view_url} title={selectedDocument.file_name} style={{ width: "100%", height: 400, border: "none" }} />
              ) : (
                <div><a href={selectedDocument.view_url} target="_blank" rel="noopener noreferrer" style={{ color: "#7c3aed" }}>Download {selectedDocument.file_name}</a></div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
              <button onClick={() => handleApproveDocument(selectedDocument.id)} disabled={documentActionLoading === selectedDocument.id} style={{ padding: "10px 20px", backgroundColor: "#22c55e", color: "white", border: "none", borderRadius: 4, cursor: documentActionLoading ? "wait" : "pointer" }}>
                {documentActionLoading === selectedDocument.id ? "Processing..." : "✓ Approve Document"}
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" placeholder="Rejection reason (required)" value={docRejectReason} onChange={(e) => setDocRejectReason(e.target.value)} style={{ flex: 1, padding: "8px 12px" }} />
                <button onClick={() => handleRejectDocument(selectedDocument.id, docRejectReason)} disabled={documentActionLoading === selectedDocument.id || !docRejectReason.trim()} style={{ padding: "10px 20px", backgroundColor: "#ef4444", color: "white", border: "none", borderRadius: 4, cursor: documentActionLoading || !docRejectReason.trim() ? "not-allowed" : "pointer", opacity: !docRejectReason.trim() ? 0.5 : 1 }}>
                  ✕ Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
