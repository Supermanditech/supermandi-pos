// SA-001: Documents verification tab extracted from App.tsx
import { useState, useEffect, useRef } from "react";
import type { DocumentRecord } from "../api/documents";
import { fetchDocumentBlob } from "../api/documents";
import { formatDateTime } from "../lib/formatters";
import { TableSkeleton } from "../components/TableSkeleton";

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
  handleOpenDocument: (doc: DocumentRecord) => void;  // T-119
  handleCloseDocument: () => void;  // T-119
  onModalDirty: (dirty: boolean) => void;  // T-119
  setDocRejectReason: (v: string) => void;
  refreshDocuments: () => void;
  handleApproveDocument: (id: string) => void;
  handleRejectDocument: (id: string, reason: string) => void;
}

export function DocumentsTab({
  pendingDocuments, pendingDocsTotal, documentsLoading, documentsError,
  documentsPage, documentsEntityFilter, selectedDocument, docRejectReason,
  documentActionLoading, setDocumentsPage, setDocumentsEntityFilter,
  handleOpenDocument, handleCloseDocument, onModalDirty,
  setDocRejectReason, refreshDocuments,
  handleApproveDocument, handleRejectDocument,
}: DocumentsTabProps) {
  // T-014: Fetch document via API with auth headers → blob URL for rendering
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blobLoading, setBlobLoading] = useState(false);
  const [blobError, setBlobError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedDocument) {
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
      setBlobUrl(null);
      setBlobError(null);
      return;
    }
    let cancelled = false;
    setBlobLoading(true);
    setBlobError(null);
    // Revoke previous blob URL before fetching new one
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    fetchDocumentBlob(selectedDocument.id)
      .then((url) => {
        if (!cancelled) { blobUrlRef.current = url; setBlobUrl(url); }
        else URL.revokeObjectURL(url);
      })
      .catch((err) => {
        if (!cancelled) setBlobError(err instanceof Error ? err.message : "Failed to load document");
      })
      .finally(() => {
        if (!cancelled) setBlobLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocument?.id]);

  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">Document Verification Queue</div>
        <div className="muted">Review and approve/reject KYC documents ({pendingDocsTotal} pending)</div>
      </div>

      <div className="tableWrap">
        <div className="sa-flex sa-gap-8 sa-mb-12 sa-flex-wrap">
          <button onClick={() => refreshDocuments()} disabled={documentsLoading}>
            {documentsLoading ? "Loading..." : "Refresh"}
          </button>
          <select value={documentsEntityFilter} onChange={(e) => { setDocumentsEntityFilter(e.target.value as "" | "store" | "supplier"); setDocumentsPage(() => 0); }} className="sa-select">
            <option value="">All Entities</option>
            <option value="store">Stores</option>
            <option value="supplier">Suppliers</option>
          </select>
          <div className="sa-flex sa-gap-8" style={{ marginLeft: "auto" }}>
            <button disabled={documentsPage === 0} onClick={() => setDocumentsPage(prev => Math.max(0, prev - 1))} aria-label="Previous page">← Prev</button>
            <span className="muted">Page {documentsPage + 1} of {Math.max(1, Math.ceil(pendingDocsTotal / 50))}</span>
            <button disabled={(documentsPage + 1) * 50 >= pendingDocsTotal} onClick={() => setDocumentsPage(prev => prev + 1)} aria-label="Next page">Next →</button>
          </div>
        </div>

        {documentsError && <div className="errorText sa-mb-8" role="alert">{documentsError}</div>}

        {documentsLoading ? (
          <TableSkeleton rows={5} columns={6} />
        ) : pendingDocuments.length === 0 ? (
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
                    <div className="sa-text-sm sa-text-muted sa-text-upper">{doc.entity_type}</div>
                    <div className="mono sa-text-xs">{doc.entity_name || doc.entity_id.slice(0, 8)}</div>
                    {doc.owner_name && <div className="sa-text-xs sa-text-muted">{doc.owner_name}</div>}
                  </td>
                  <td>{doc.document_type}</td>
                  <td>
                    <div>{doc.file_name}</div>
                    <div className="muted sa-text-xs">{(doc.file_size / 1024).toFixed(1)} KB • {doc.content_type}</div>
                  </td>
                  <td className="mono sa-text-xs">{formatDateTime(doc.uploaded_at)}</td>
                  <td>
                    <span className={`badge ${doc.status === "pending" ? "badgeWarn" : doc.status === "approved" ? "badgeOk" : "badgeError"}`}>{doc.status}</span>
                  </td>
                  <td>
                    <button onClick={() => handleOpenDocument(doc)} className="sa-btn-ghost-sm">Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* T-119: Document review modal with dirty guard on close */}
      {selectedDocument && (
        <div className="sa-modal-overlay" onClick={handleCloseDocument} onKeyDown={(e) => { if (e.key === "Escape") handleCloseDocument(); }}>
          <div className="sa-modal-lg" role="dialog" aria-modal="true" style={{ minWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="sa-flex-between sa-mb-16">
              <h3 style={{ margin: 0 }}>Review Document</h3>
              <button onClick={handleCloseDocument} className="sa-btn-xs" aria-label="Close document review">✕</button>
            </div>
            <div className="sa-mb-16">
              <div className="sa-mb-8"><strong>Entity:</strong> {selectedDocument.entity_type} - {selectedDocument.entity_name || selectedDocument.entity_id}</div>
              <div className="sa-mb-8"><strong>Document Type:</strong> {selectedDocument.document_type}</div>
              <div className="sa-mb-8"><strong>File:</strong> {selectedDocument.file_name} ({(selectedDocument.file_size / 1024).toFixed(1)} KB)</div>
              <div className="sa-mb-8"><strong>Uploaded:</strong> {formatDateTime(selectedDocument.uploaded_at)}</div>
            </div>
            {/* T-014: Document preview via authenticated blob URL */}
            <div className="sa-mb-16 sa-text-center sa-bg-surface-alt sa-p-16 sa-radius-4" style={{ minHeight: 120 }}>
              {blobLoading ? (
                <div className="sa-text-muted sa-p-20">Loading document preview...</div>
              ) : blobError ? (
                <div className="sa-text-danger sa-p-20">{blobError}</div>
              ) : blobUrl && selectedDocument.content_type.startsWith("image/") ? (
                <img src={blobUrl} alt={selectedDocument.file_name} style={{ maxWidth: "100%", maxHeight: 400 }} />
              ) : blobUrl && selectedDocument.content_type === "application/pdf" ? (
                <iframe src={blobUrl} title={selectedDocument.file_name} style={{ width: "100%", height: 400, border: "none" }} />
              ) : blobUrl ? (
                <div><a href={blobUrl} download={selectedDocument.file_name} className="sa-text-brand">Download {selectedDocument.file_name}</a></div>
              ) : null}
            </div>
            <div className="sa-flex-col sa-gap-8">
              {/* R3-DOC-007: Approve/Reject only active for PENDING documents */}
              <button onClick={() => { handleApproveDocument(selectedDocument.id); onModalDirty(false); }} disabled={documentActionLoading === selectedDocument.id || selectedDocument.status !== "pending"} className="btnSuccess sa-radius-4" style={{ padding: "10px 20px", cursor: documentActionLoading || selectedDocument.status !== "pending" ? "not-allowed" : "pointer" }}>
                {documentActionLoading === selectedDocument.id ? "Processing..." : "✓ Approve Document"}
              </button>
              <div className="sa-flex sa-gap-8">
                <input type="text" placeholder="Rejection reason (min 10 chars)" value={docRejectReason} onChange={(e) => { setDocRejectReason(e.target.value); onModalDirty(true); }} className="sa-input" style={{ flex: 1 }} disabled={selectedDocument.status !== "pending"} />
                <button onClick={() => { handleRejectDocument(selectedDocument.id, docRejectReason); onModalDirty(false); }} disabled={documentActionLoading === selectedDocument.id || docRejectReason.trim().length < 10 || selectedDocument.status !== "pending"} className="btnDanger sa-radius-4" style={{ padding: "10px 20px", cursor: documentActionLoading || docRejectReason.trim().length < 10 || selectedDocument.status !== "pending" ? "not-allowed" : "pointer", opacity: docRejectReason.trim().length < 10 || selectedDocument.status !== "pending" ? 0.5 : 1 }}>
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
