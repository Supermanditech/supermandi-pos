// REG-AUTH-301: LIMITED MODE Banner Component
// Displays when user's application status is not ACTIVE
// Shows restrictions and provides information about what actions are blocked

interface LimitedModeBannerProps {
  status: string;
  storeName?: string;
  onDismiss?: () => void;
}

// Status display configuration
const STATUS_CONFIG: Record<string, { color: string; bgColor: string; borderColor: string; label: string; message: string }> = {
  DRAFT: {
    color: '#92400e',
    bgColor: '#fef3c7',
    borderColor: '#fcd34d',
    label: 'Draft',
    message: 'Complete your registration and upload documents to get approved.',
  },
  KYC_SUBMITTED: {
    color: '#1e40af',
    bgColor: '#dbeafe',
    borderColor: '#60a5fa',
    label: 'Under Review',
    message: 'Your documents are being reviewed. Once approved, download the SuperMandi POS app and enter your phone number to activate.',
  },
  PAYMENTS_SUBMITTED: {
    color: '#1e40af',
    bgColor: '#dbeafe',
    borderColor: '#60a5fa',
    label: 'Final Review',
    message: 'Your application is in final review stage.',
  },
  NEEDS_FIX: {
    color: '#991b1b',
    bgColor: '#fee2e2',
    borderColor: '#f87171',
    label: 'Action Required',
    message: 'Please update your information and resubmit.',
  },
  // SA-P0-001: Store suspension display
  SUSPENDED: {
    color: '#991b1b',
    bgColor: '#fee2e2',
    borderColor: '#f87171',
    label: 'Suspended',
    message: 'Your store has been temporarily suspended. Please contact SuperMandi support.',
  },
  EXPIRED: {
    color: '#374151',
    bgColor: '#f3f4f6',
    borderColor: '#9ca3af',
    label: 'Expired',
    message: 'Your application has expired. Please contact support.',
  },
};

// Actions that are blocked in LIMITED MODE
const BLOCKED_ACTIONS = [
  'Create Sales',
  'Accept Payments',
  'Place Reorders',
  'Generate Invoices',
  'Access Financial Reports',
];

// Actions that are allowed in LIMITED MODE
const ALLOWED_ACTIONS = [
  'View Dashboard',
  'View Products & Inventory',
  'Edit Store Profile',
  'Upload Documents',
];

export default function LimitedModeBanner({ status, storeName: _storeName, onDismiss }: LimitedModeBannerProps) {
  // Don't show for ACTIVE status
  if (status === 'ACTIVE' || status === 'active') {
    return null;
  }

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;

  return (
    <div className="limited-banner" style={{ background: config.bgColor, border: `1px solid ${config.borderColor}` }}>
      <div className="limited-banner-row">
        <div className="limited-banner-body">
          {/* Header */}
          <div className="limited-banner-header">
            <span className="limited-banner-badge" style={{ background: config.borderColor, color: config.color }}>
              ⚠ LIMITED MODE
            </span>
            <span className="limited-banner-status" style={{ color: config.color }}>
              Status: {config.label}
            </span>
          </div>

          {/* Message */}
          <p className="limited-banner-message" style={{ color: config.color }}>
            {config.message}
          </p>

          {/* Restrictions info */}
          <details className="limited-banner-details">
            <summary>
              View restrictions
            </summary>
            <div className="limited-banner-grid">
              {/* Blocked actions */}
              <div>
                <p className="limited-banner-label--blocked">
                  ❌ Blocked Actions:
                </p>
                <ul className="limited-banner-list">
                  {BLOCKED_ACTIONS.map(action => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
              {/* Allowed actions */}
              <div>
                <p className="limited-banner-label--allowed">
                  ✓ Allowed Actions:
                </p>
                <ul className="limited-banner-list">
                  {ALLOWED_ACTIONS.map(action => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </div>

        {/* Dismiss button (optional) */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="limited-banner-dismiss"
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// Compact version for sidebar/header
export function LimitedModeIndicator({ status }: { status: string }) {
  if (status === 'ACTIVE' || status === 'active') {
    return null;
  }

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;

  return (
    <span className="limited-indicator" style={{ background: config.bgColor, color: config.color, border: `1px solid ${config.borderColor}` }}>
      ⚠ {config.label}
    </span>
  );
}
