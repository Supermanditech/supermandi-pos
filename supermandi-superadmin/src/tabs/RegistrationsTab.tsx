// SA-001: Registration events tab extracted from App.tsx
import { useState } from "react";
import type { RegistrationEvent } from "../api/registrationEvents";
import { sendEnrollmentCodeToStore } from "../api/registrationEvents";
import { EnrollmentResultModal, type EnrollmentResult } from "../components/ConfirmDialog";
import { formatDateTime } from "../lib/formatters";

interface RegistrationsTabProps {
  regEvents: RegistrationEvent[];
  regEventsTotal: number;
  regEventsLoading: boolean;
  regEventsError: string;
  regEventsPage: number;
  regEventsSourceFilter: string;
  regEventsOutcomeFilter: string;
  sendingEnrollment: string;
  setRegEventsPage: (fn: (p: number) => number) => void;
  setRegEventsSourceFilter: (v: string) => void;
  setRegEventsOutcomeFilter: (v: string) => void;
  setSendingEnrollment: (v: string) => void;
  refreshRegEvents: () => void;
}

export function RegistrationsTab({
  regEvents,
  regEventsTotal,
  regEventsLoading,
  regEventsError,
  regEventsPage,
  regEventsSourceFilter,
  regEventsOutcomeFilter,
  sendingEnrollment,
  setRegEventsPage,
  setRegEventsSourceFilter,
  setRegEventsOutcomeFilter,
  setSendingEnrollment,
  refreshRegEvents,
}: RegistrationsTabProps) {
  // STBT-186.4: Enrollment code result modal state (replaces alert())
  const [enrollmentResult, setEnrollmentResult] = useState<EnrollmentResult | null>(null);
  const [enrollmentError, setEnrollmentError] = useState("");

  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">Registration Events</div>
        <div className="muted">Store registrations across all surfaces ({regEventsTotal} total)</div>
      </div>

      <div className="tableWrap">
        <div className="sa-flex sa-gap-8 sa-mb-12 sa-flex-wrap">
          <button onClick={() => refreshRegEvents()} disabled={regEventsLoading}>
            {regEventsLoading ? "Loading..." : "Refresh"}
          </button>

          <label htmlFor="filter-registrations-source" className="sa-sr-only">Source</label>
          <select
            id="filter-registrations-source"
            value={regEventsSourceFilter}
            onChange={(e) => { setRegEventsSourceFilter(e.target.value); setRegEventsPage(() => 0); }}
            className="sa-select"
          >
            <option value="">All Sources</option>
            <option value="PORTAL">Portal</option>
            <option value="POS_DEVICE">POS Device</option>
            <option value="POS_MOBILE">POS Mobile</option>
            <option value="ADMIN">Admin</option>
          </select>

          <label htmlFor="filter-registrations-outcome" className="sa-sr-only">Outcome</label>
          <select
            id="filter-registrations-outcome"
            value={regEventsOutcomeFilter}
            onChange={(e) => { setRegEventsOutcomeFilter(e.target.value); setRegEventsPage(() => 0); }}
            className="sa-select"
          >
            <option value="">All Outcomes</option>
            <option value="SUCCESS">Success</option>
            <option value="IDEMPOTENT">Idempotent</option>
            <option value="BLOCKED">Blocked</option>
            <option value="ERROR">Error</option>
          </select>

          <div className="sa-flex sa-gap-8" style={{ marginLeft: "auto" }}>
            <button
              disabled={regEventsPage === 0}
              onClick={() => setRegEventsPage(prev => Math.max(0, prev - 1))}
            >
              &larr; Prev
            </button>
            <span className="muted">Page {regEventsPage + 1} of {Math.max(1, Math.ceil(regEventsTotal / 50))}</span>
            <button
              disabled={(regEventsPage + 1) * 50 >= regEventsTotal}
              onClick={() => setRegEventsPage(prev => prev + 1)}
            >
              Next &rarr;
            </button>
          </div>
        </div>

        {regEventsError && <div className="errorText sa-mb-8">{regEventsError}</div>}

        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Source</th>
              <th>Outcome</th>
              <th>Phone</th>
              <th>Business Name</th>
              <th>Store</th>
              <th>GSTIN</th>
              <th>IP</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {regEvents.map((evt) => (
              <tr key={evt.id}>
                <td className="mono sa-text-xs sa-nowrap">
                  {formatDateTime(evt.createdAt)}
                </td>
                <td>
                  <span className={evt.source === "PORTAL" ? "sa-badge-info" : evt.source === "POS_MOBILE" ? "sa-badge-ok" : "sa-badge-muted"}>
                    {evt.source}
                  </span>
                </td>
                <td>
                  <span className={evt.outcome === "SUCCESS" ? "sa-badge-ok" : evt.outcome === "IDEMPOTENT" ? "sa-badge-warn" : "sa-badge-error"}>
                    {evt.outcome}
                  </span>
                </td>
                <td className="mono sa-text-sm">{evt.phone}</td>
                <td>{evt.businessName}</td>
                <td>
                  {evt.storeName ? (
                    <span>
                      {evt.storeName}
                      {evt.storeCode && <span className="muted sa-text-xs" style={{ marginLeft: 4 }}>({evt.storeCode})</span>}
                    </span>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
                <td className="mono sa-text-xs">{evt.gstin || "-"}</td>
                <td className="mono sa-text-xs">{evt.ipAddress || "-"}</td>
                <td>
                  {evt.storeId && (evt.outcome === "SUCCESS" || evt.outcome === "IDEMPOTENT") ? (
                    <button
                      className="sa-btn-xs sa-fw-600 sa-text-green"
                      style={{
                        border: "1px solid var(--color-success)",
                        background: sendingEnrollment === evt.storeId ? "var(--color-success-soft)" : "var(--color-success-soft)",
                        cursor: sendingEnrollment === evt.storeId ? "wait" : "pointer",
                      }}
                      disabled={!!sendingEnrollment}
                      onClick={async () => {
                        setSendingEnrollment(evt.storeId!);
                        setEnrollmentError("");
                        try {
                          const resp = await sendEnrollmentCodeToStore(evt.storeId!);
                          setEnrollmentResult({
                            enrollmentCode: resp.enrollmentCode,
                            expiresAt: resp.expiresAt,
                            smsSent: resp.notification.smsSent,
                            emailSent: resp.notification.emailSent,
                          });
                        } catch (err: any) {
                          setEnrollmentError(err?.message || "Failed to send enrollment code");
                        } finally {
                          setSendingEnrollment("");
                        }
                      }}
                    >
                      {sendingEnrollment === evt.storeId ? "Sending..." : "Send Code"}
                    </button>
                  ) : (
                    <span className="muted sa-text-xs">-</span>
                  )}
                </td>
              </tr>
            ))}
            {regEvents.length === 0 && !regEventsLoading && (
              <tr>
                <td colSpan={9} className="sa-text-center sa-text-muted sa-p-24">
                  No registration events found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* STBT-186.4: Enrollment error banner */}
      {enrollmentError && (
        <div className="sa-alert-error sa-mt-8">
          {enrollmentError}
        </div>
      )}

      {/* STBT-186.4: Enrollment code result modal */}
      {enrollmentResult && (
        <EnrollmentResultModal result={enrollmentResult} onClose={() => setEnrollmentResult(null)} />
      )}
    </section>
  );
}
