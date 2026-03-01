// STBT-186.1: Generic confirmation dialog for destructive actions
// Replaces all alert()/window.confirm() with proper modals
import { formatDateTime } from '../lib/formatters';

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
  return (
    <div className="modalOverlay" onClick={() => { if (!loading) onCancel(); }}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modalHeader"><h3>{title}</h3></div>
        <div className="modalBody">
          <p>{message}</p>
          {detail && <p className="muted sa-mt-8">{detail}</p>}
        </div>
        <div className="modalFooter">
          <button className="btnGhost" onClick={onCancel} disabled={loading}>Cancel</button>
          <button
            className={variant === 'danger' ? 'btnDanger' : variant === 'warning' ? 'sa-btn-warning' : 'sa-btn-info-action'}
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
          <div className="sa-enrollment-code-wrap">
            <div className="sa-enrollment-code">
              {result.enrollmentCode}
            </div>
            <button
              onClick={copyCode}
              className="sa-copy-btn"
            >
              Copy to Clipboard
            </button>
          </div>
          <div className="sa-enrollment-meta">
            <div>Expires: {formatDateTime(result.expiresAt)}</div>
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
