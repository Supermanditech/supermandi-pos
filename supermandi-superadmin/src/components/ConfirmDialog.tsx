// STBT-186.1: Generic confirmation dialog for destructive actions
// Replaces all alert()/window.confirm() with proper modals

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  detail?: string;
  confirmLabel: string;
  variant: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
}

interface ConfirmDialogProps extends ConfirmDialogConfig {
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({ title, message, detail, confirmLabel, variant, onConfirm, onCancel, loading }: ConfirmDialogProps) {
  const btnStyle = variant === 'warning'
    ? { background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 } as const
    : variant === 'info'
    ? { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 } as const
    : undefined;

  return (
    <div className="modalOverlay" onClick={() => { if (!loading) onCancel(); }}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modalHeader"><h3>{title}</h3></div>
        <div className="modalBody">
          <p>{message}</p>
          {detail && <p className="muted" style={{ marginTop: 8 }}>{detail}</p>}
        </div>
        <div className="modalFooter">
          <button className="btnGhost" onClick={onCancel} disabled={loading}>Cancel</button>
          <button
            className={variant === 'danger' ? 'btnDanger' : undefined}
            style={btnStyle}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// STBT-186.1: Enrollment code result modal (replaces alert() in RegistrationsTab)
export interface EnrollmentResult {
  enrollmentCode: string;
  expiresAt: string;
  smsSent: boolean;
  emailSent: boolean;
}

interface EnrollmentResultModalProps {
  result: EnrollmentResult;
  onClose: () => void;
}

export function EnrollmentResultModal({ result, onClose }: EnrollmentResultModalProps) {
  const copyCode = () => {
    navigator.clipboard?.writeText(result.enrollmentCode).catch(() => {});
  };

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modalHeader"><h3>Enrollment Code Sent</h3></div>
        <div className="modalBody">
          <div style={{ textAlign: 'center', margin: '16px 0' }}>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 4, padding: '12px 24px', background: '#f0fdf4', borderRadius: 8, border: '2px dashed #22c55e', display: 'inline-block' }}>
              {result.enrollmentCode}
            </div>
            <button
              onClick={copyCode}
              style={{ display: 'block', margin: '8px auto 0', fontSize: 12, padding: '4px 12px', background: '#e0f2fe', border: '1px solid #0ea5e9', borderRadius: 4, cursor: 'pointer', color: '#0369a1' }}
            >
              Copy to Clipboard
            </button>
          </div>
          <div style={{ fontSize: 13, color: '#666' }}>
            <div>Expires: {new Date(result.expiresAt).toLocaleTimeString()}</div>
            <div>SMS: {result.smsSent ? 'Sent' : 'Skipped'}</div>
            <div>Email: {result.emailSent ? 'Sent' : 'Skipped'}</div>
          </div>
        </div>
        <div className="modalFooter">
          <button className="btnGhost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
