// SA-001: Registration events tab extracted from App.tsx
import { useState } from "react";
import type { RegistrationEvent } from "../api/registrationEvents";
import { sendEnrollmentCodeToStore } from "../api/registrationEvents";
import { EnrollmentResultModal, type EnrollmentResult } from "../components/ConfirmDialog";

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
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <button onClick={() => refreshRegEvents()} disabled={regEventsLoading}>
            {regEventsLoading ? "Loading..." : "Refresh"}
          </button>

          <select
            value={regEventsSourceFilter}
            onChange={(e) => { setRegEventsSourceFilter(e.target.value); setRegEventsPage(() => 0); }}
            style={{ padding: "6px 10px" }}
          >
            <option value="">All Sources</option>
            <option value="PORTAL">Portal</option>
            <option value="POS_DEVICE">POS Device</option>
            <option value="POS_MOBILE">POS Mobile</option>
            <option value="ADMIN">Admin</option>
          </select>

          <select
            value={regEventsOutcomeFilter}
            onChange={(e) => { setRegEventsOutcomeFilter(e.target.value); setRegEventsPage(() => 0); }}
            style={{ padding: "6px 10px" }}
          >
            <option value="">All Outcomes</option>
            <option value="SUCCESS">Success</option>
            <option value="IDEMPOTENT">Idempotent</option>
            <option value="BLOCKED">Blocked</option>
            <option value="ERROR">Error</option>
          </select>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
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

        {regEventsError && <div className="errorText" style={{ marginBottom: 8 }}>{regEventsError}</div>}

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
                <td className="mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                  {new Date(evt.createdAt).toLocaleString()}
                </td>
                <td>
                  <span style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    background: evt.source === "PORTAL" ? "#eff6ff" : evt.source === "POS_MOBILE" ? "var(--color-success-soft)" : "#f5f3ff",
                    color: evt.source === "PORTAL" ? "#1d4ed8" : evt.source === "POS_MOBILE" ? "var(--color-success)" : "#7c3aed",
                  }}>
                    {evt.source}
                  </span>
                </td>
                <td>
                  <span style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    background: evt.outcome === "SUCCESS" ? "var(--color-success-soft)" : evt.outcome === "IDEMPOTENT" ? "#fef9c3" : evt.outcome === "ERROR" ? "var(--color-error-soft)" : "var(--color-error-soft)",
                    color: evt.outcome === "SUCCESS" ? "#166534" : evt.outcome === "IDEMPOTENT" ? "#854d0e" : "#991b1b",
                  }}>
                    {evt.outcome}
                  </span>
                </td>
                <td className="mono" style={{ fontSize: 12 }}>{evt.phone}</td>
                <td>{evt.businessName}</td>
                <td>
                  {evt.storeName ? (
                    <span>
                      {evt.storeName}
                      {evt.storeCode && <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>({evt.storeCode})</span>}
                    </span>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
                <td className="mono" style={{ fontSize: 11 }}>{evt.gstin || "-"}</td>
                <td className="mono" style={{ fontSize: 11 }}>{evt.ipAddress || "-"}</td>
                <td>
                  {evt.storeId && (evt.outcome === "SUCCESS" || evt.outcome === "IDEMPOTENT") ? (
                    <button
                      style={{
                        fontSize: 11,
                        padding: "3px 10px",
                        borderRadius: 4,
                        border: "1px solid #10b981",
                        background: sendingEnrollment === evt.storeId ? "#d1fae5" : "var(--color-success-soft)",
                        color: "#059669",
                        cursor: sendingEnrollment === evt.storeId ? "wait" : "pointer",
                        fontWeight: 600,
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
                    <span className="muted" style={{ fontSize: 11 }}>-</span>
                  )}
                </td>
              </tr>
            ))}
            {regEvents.length === 0 && !regEventsLoading && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "var(--color-text-secondary)", padding: 24 }}>
                  No registration events found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* STBT-186.4: Enrollment error banner */}
      {enrollmentError && (
        <div style={{ color: 'var(--color-error)', background: 'var(--color-error-soft)', padding: '8px 12px', borderRadius: 6, marginTop: 8, fontSize: 13 }}>
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
