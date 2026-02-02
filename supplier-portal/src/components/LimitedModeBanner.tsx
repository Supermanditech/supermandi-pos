// REG-AUTH-302: LIMITED MODE Banner for Supplier Portal
// Displays when supplier's application status is not ACTIVE/verified

interface LimitedModeBannerProps {
  status: string;
  businessName?: string;
  onDismiss?: () => void;
}

// Status display configuration
const STATUS_CONFIG: Record<string, { color: string; bgColor: string; borderColor: string; label: string; message: string }> = {
  DRAFT: {
    color: 'text-amber-800',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    label: 'Draft',
    message: 'Complete your registration and upload documents to get approved.',
  },
  KYC_SUBMITTED: {
    color: 'text-blue-800',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    label: 'Under Review',
    message: 'Your documents are being reviewed. This usually takes 1-2 business days.',
  },
  PAYMENTS_SUBMITTED: {
    color: 'text-blue-800',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    label: 'Final Review',
    message: 'Your application is in final review stage.',
  },
  pending: {
    color: 'text-amber-800',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    label: 'Pending',
    message: 'Your account is pending admin approval.',
  },
  NEEDS_FIX: {
    color: 'text-red-800',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    label: 'Action Required',
    message: 'Please update your information and resubmit.',
  },
  rejected: {
    color: 'text-red-800',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    label: 'Rejected',
    message: 'Your application was not approved. Please contact support.',
  },
  EXPIRED: {
    color: 'text-slate-700',
    bgColor: 'bg-slate-100',
    borderColor: 'border-slate-300',
    label: 'Expired',
    message: 'Your application has expired. Please contact support.',
  },
};

// Actions blocked for suppliers in LIMITED MODE
const BLOCKED_ACTIONS = [
  'Add Products',
  'Process Orders',
  'Receive Payouts',
  'Access Financial Reports',
];

// Actions allowed in LIMITED MODE
const ALLOWED_ACTIONS = [
  'View Dashboard',
  'Edit Profile',
  'Upload Documents',
  'View Order History',
];

export default function LimitedModeBanner({ status, businessName, onDismiss }: LimitedModeBannerProps) {
  // Don't show for active/verified status
  const normalizedStatus = status?.toLowerCase();
  if (normalizedStatus === 'active' || normalizedStatus === 'verified') {
    return null;
  }

  const config = STATUS_CONFIG[status] || STATUS_CONFIG[normalizedStatus] || STATUS_CONFIG.pending;

  return (
    <div className={`${config.bgColor} border ${config.borderColor} rounded-lg p-4 mb-4`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${config.bgColor} ${config.color} rounded text-xs font-semibold`}>
              ⚠ LIMITED MODE
            </span>
            <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">
              Status: {config.label}
            </span>
          </div>

          {/* Message */}
          <p className={`${config.color} text-sm mb-3`}>
            {config.message}
          </p>

          {/* Restrictions */}
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer font-medium mb-2">
              View restrictions
            </summary>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <p className="font-medium text-red-700 mb-1">❌ Blocked:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {BLOCKED_ACTIONS.map(action => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-green-700 mb-1">✓ Allowed:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {ALLOWED_ACTIONS.map(action => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </div>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// Compact indicator for sidebar/header
export function LimitedModeIndicator({ status }: { status: string }) {
  const normalizedStatus = status?.toLowerCase();
  if (normalizedStatus === 'active' || normalizedStatus === 'verified') {
    return null;
  }

  const config = STATUS_CONFIG[status] || STATUS_CONFIG[normalizedStatus] || STATUS_CONFIG.pending;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${config.bgColor} ${config.color} border ${config.borderColor} rounded text-[10px] font-semibold uppercase`}>
      ⚠ {config.label}
    </span>
  );
}
