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
    <div style={{
      background: config.bgColor,
      border: `1px solid ${config.borderColor}`,
      borderRadius: '0.5rem',
      padding: '1rem',
      marginBottom: '1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.25rem 0.5rem',
              background: config.borderColor,
              color: config.color,
              borderRadius: '0.25rem',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}>
              ⚠ LIMITED MODE
            </span>
            <span style={{
              padding: '0.25rem 0.5rem',
              background: 'white',
              color: config.color,
              borderRadius: '0.25rem',
              fontSize: '0.75rem',
              fontWeight: 500,
            }}>
              Status: {config.label}
            </span>
          </div>

          {/* Message */}
          <p style={{
            margin: '0 0 0.75rem',
            color: config.color,
            fontSize: '0.875rem',
          }}>
            {config.message}
          </p>

          {/* Restrictions info */}
          <details style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 500, marginBottom: '0.5rem' }}>
              View restrictions
            </summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
              {/* Blocked actions */}
              <div>
                <p style={{ fontWeight: 500, color: '#991b1b', margin: '0 0 0.25rem' }}>
                  ❌ Blocked Actions:
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#6b7280' }}>
                  {BLOCKED_ACTIONS.map(action => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
              {/* Allowed actions */}
              <div>
                <p style={{ fontWeight: 500, color: '#059669', margin: '0 0 0.25rem' }}>
                  ✓ Allowed Actions:
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#6b7280' }}>
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
            style={{
              background: 'none',
              border: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              padding: '0.25rem',
              fontSize: '1rem',
              lineHeight: 1,
            }}
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
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      padding: '0.25rem 0.5rem',
      background: config.bgColor,
      color: config.color,
      border: `1px solid ${config.borderColor}`,
      borderRadius: '0.25rem',
      fontSize: '0.625rem',
      fontWeight: 600,
      textTransform: 'uppercase',
    }}>
      ⚠ {config.label}
    </span>
  );
}
