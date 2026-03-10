// SuperAdmin — Test ApplicationsTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApplicationsTab } from '../../tabs/ApplicationsTab';
import type { Application } from '../../api/applications';

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

const makeApp = (overrides: Partial<Application> = {}): Application => ({
  id: 'app-1',
  entityType: 'retailer',
  businessName: 'Test Store',
  ownerName: 'John Doe',
  phone: '9876543210',
  gstin: '12ABCDE1234Z5',
  email: 'test@test.com',
  status: 'KYC_SUBMITTED',
  createdAt: '2026-01-01T00:00:00Z',
  submittedAt: '2026-01-02T00:00:00Z',
  ...overrides,
} as Application);

function createProps(overrides: Partial<Parameters<typeof ApplicationsTab>[0]> = {}) {
  return {
    applications: [],
    applicationsTotal: 0,
    applicationsLoading: false,
    applicationsError: '',
    appEntityFilter: '',
    setAppEntityFilter: vi.fn(),
    appActionLoading: {},
    appRejectReason: {},
    setAppRejectReason: vi.fn(),
    refreshApplications: vi.fn(),
    handleApproveApplication: vi.fn(),
    handleRejectApplication: vi.fn(),
    ...overrides,
  };
}

describe('ApplicationsTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── Header ──────────────────────────────────────────────────

  it('renders header', () => {
    render(<ApplicationsTab {...createProps()} />);
    expect(screen.getByText('Registration Applications')).toBeTruthy();
  });

  it('renders subtitle description', () => {
    render(<ApplicationsTab {...createProps()} />);
    expect(screen.getByText('Review and approve/reject retailer and supplier registration applications')).toBeTruthy();
  });

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty state when no applications', () => {
    render(<ApplicationsTab {...createProps()} />);
    expect(screen.getByText('No pending applications.')).toBeTruthy();
  });

  it('shows loading state', () => {
    render(<ApplicationsTab {...createProps({ applicationsLoading: true })} />);
    expect(screen.getByText('Loading applications...')).toBeTruthy();
  });

  // ── Error State ─────────────────────────────────────────────

  it('shows error banner', () => {
    render(<ApplicationsTab {...createProps({ applicationsError: 'Network error' })} />);
    expect(screen.getByText('Network error')).toBeTruthy();
  });

  it('shows error with role=alert', () => {
    render(<ApplicationsTab {...createProps({ applicationsError: 'Server error' })} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('does not show error banner when no error', () => {
    render(<ApplicationsTab {...createProps()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // ── Entity Type Filter ────────────────────────────────────────

  it('renders entity type filter dropdown', () => {
    render(<ApplicationsTab {...createProps()} />);
    expect(screen.getByLabelText('Filter applications by type')).toBeTruthy();
  });

  it('renders All Types option in filter', () => {
    render(<ApplicationsTab {...createProps()} />);
    expect(screen.getByDisplayValue('All Types')).toBeTruthy();
  });

  it('calls setAppEntityFilter on filter change', () => {
    const setFilter = vi.fn();
    render(<ApplicationsTab {...createProps({ setAppEntityFilter: setFilter })} />);
    fireEvent.change(screen.getByLabelText('Filter applications by type'), { target: { value: 'supplier' } });
    expect(setFilter).toHaveBeenCalledWith('supplier');
  });

  // ── Refresh Button ──────────────────────────────────────────

  it('calls refreshApplications on refresh click', () => {
    const refresh = vi.fn();
    render(<ApplicationsTab {...createProps({ refreshApplications: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows Refreshing... when loading', () => {
    render(<ApplicationsTab {...createProps({ applicationsLoading: true })} />);
    expect(screen.getByText('Refreshing...')).toBeTruthy();
  });

  it('disables refresh button when loading', () => {
    render(<ApplicationsTab {...createProps({ applicationsLoading: true })} />);
    expect((screen.getByText('Refreshing...') as HTMLButtonElement).disabled).toBe(true);
  });

  // ── Application Cards ───────────────────────────────────────

  it('renders application cards', () => {
    const apps = [makeApp()];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('Test Store')).toBeTruthy();
    expect(screen.getByText('John Doe')).toBeTruthy();
    expect(screen.getByText('12ABCDE1234Z5')).toBeTruthy();
  });

  it('renders phone number', () => {
    const apps = [makeApp({ phone: '1234567890' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('1234567890')).toBeTruthy();
  });

  it('renders email', () => {
    const apps = [makeApp({ email: 'owner@shop.com' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('owner@shop.com')).toBeTruthy();
  });

  it('renders entity type badge for retailer', () => {
    const apps = [makeApp({ entityType: 'retailer' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('retailer')).toBeTruthy();
  });

  it('shows supplier type badge for supplier applications', () => {
    const apps = [makeApp({ entityType: 'supplier' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('supplier')).toBeTruthy();
  });

  it('renders status badge with formatted status', () => {
    const apps = [makeApp({ status: 'KYC_SUBMITTED' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('KYC SUBMITTED')).toBeTruthy();
  });

  it('renders formatted createdAt timestamp', () => {
    const apps = [makeApp({ createdAt: '2026-03-10T10:00:00Z' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('2026-03-10T10:00:00Z')).toBeTruthy();
  });

  it('renders KYC submitted timestamp', () => {
    const apps = [makeApp({ submittedAt: '2026-03-11T08:00:00Z' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('2026-03-11T08:00:00Z')).toBeTruthy();
  });

  it('renders city and state location', () => {
    const apps = [makeApp({ city: 'Mumbai', state: 'MH', pincode: '400001' } as any)];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('Mumbai, MH - 400001')).toBeTruthy();
  });

  it('renders document count', () => {
    const apps = [makeApp({ documentUrls: { pan: 'url1', aadhaar: 'url2' } } as any)];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('2 uploaded')).toBeTruthy();
  });

  it('renders previous rejection reason', () => {
    const apps = [makeApp({ rejectionReason: 'Invalid GSTIN' } as any)];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('Invalid GSTIN')).toBeTruthy();
  });

  it('renders Unknown Business for empty business name', () => {
    const apps = [makeApp({ businessName: '' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('Unknown Business')).toBeTruthy();
  });

  // ── Approve / Reject Actions ─────────────────────────────────

  it('calls handleApproveApplication on approve click', () => {
    const handleApprove = vi.fn();
    const apps = [makeApp()];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1, handleApproveApplication: handleApprove })} />);
    fireEvent.click(screen.getByText('Approve Store'));
    expect(handleApprove).toHaveBeenCalledWith('app-1');
  });

  it('shows Approve Supplier for supplier applications', () => {
    const apps = [makeApp({ entityType: 'supplier' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('Approve Supplier')).toBeTruthy();
  });

  it('calls handleRejectApplication on reject click', () => {
    const handleReject = vi.fn();
    const apps = [makeApp()];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1, handleRejectApplication: handleReject })} />);
    fireEvent.click(screen.getByText('Reject'));
    expect(handleReject).toHaveBeenCalledWith('app-1');
  });

  it('shows Approving... when action is loading', () => {
    const apps = [makeApp({ id: 'app-x' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1, appActionLoading: { 'app-x': true } })} />);
    expect(screen.getByText('Approving...')).toBeTruthy();
    expect(screen.getByText('Rejecting...')).toBeTruthy();
  });

  it('disables buttons when action is loading', () => {
    const apps = [makeApp({ id: 'app-x' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1, appActionLoading: { 'app-x': true } })} />);
    expect((screen.getByText('Approving...') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Rejecting...') as HTMLButtonElement).disabled).toBe(true);
  });

  // ── NEEDS_FIX Status ────────────────────────────────────────

  it('shows NEEDS_FIX status with resubmission message', () => {
    const apps = [makeApp({ status: 'NEEDS_FIX' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('Awaiting applicant resubmission')).toBeTruthy();
    expect(screen.getByText('Update Rejection')).toBeTruthy();
  });

  it('shows Approve button for NEEDS_FIX applications', () => {
    const apps = [makeApp({ status: 'NEEDS_FIX' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('Approve')).toBeTruthy();
  });

  it('shows Updating... for NEEDS_FIX when action loading', () => {
    const apps = [makeApp({ id: 'app-nf', status: 'NEEDS_FIX' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1, appActionLoading: { 'app-nf': true } })} />);
    expect(screen.getByText('Updating...')).toBeTruthy();
  });

  // ── Rejection Reason Textarea ───────────────────────────────

  it('renders rejection reason textarea', () => {
    const apps = [makeApp()];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByPlaceholderText(/Describe what the applicant needs to fix/)).toBeTruthy();
  });

  it('calls setAppRejectReason on textarea change', () => {
    const setReason = vi.fn();
    const apps = [makeApp()];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1, setAppRejectReason: setReason })} />);
    fireEvent.change(screen.getByPlaceholderText(/Describe what the applicant needs to fix/), { target: { value: 'Bad docs' } });
    expect(setReason).toHaveBeenCalled();
  });

  it('populates textarea with existing reject reason', () => {
    const apps = [makeApp({ id: 'app-1' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1, appRejectReason: { 'app-1': 'Blurry photo' } })} />);
    expect(screen.getByDisplayValue('Blurry photo')).toBeTruthy();
  });

  // ── Count Info ──────────────────────────────────────────────

  it('shows count info', () => {
    render(<ApplicationsTab {...createProps({ applicationsTotal: 42 })} />);
    expect(screen.getByText(/Showing 0 of 42 pending applications/)).toBeTruthy();
  });

  it('shows count info with applications', () => {
    const apps = [makeApp()];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 5 })} />);
    expect(screen.getByText(/Showing 1 of 5 pending applications/)).toBeTruthy();
  });

  // ── Load More ───────────────────────────────────────────────

  it('shows Load More button when more applications exist', () => {
    const apps = [makeApp()];
    const onLoadMore = vi.fn();
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 10, onLoadMore })} />);
    expect(screen.getByText('Load More')).toBeTruthy();
  });

  it('calls onLoadMore on button click', () => {
    const apps = [makeApp()];
    const onLoadMore = vi.fn();
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 10, onLoadMore })} />);
    fireEvent.click(screen.getByText('Load More'));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('does not show Load More when all loaded', () => {
    const apps = [makeApp()];
    const onLoadMore = vi.fn();
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1, onLoadMore })} />);
    expect(screen.queryByText('Load More')).toBeNull();
  });

  // ── Multiple Cards ──────────────────────────────────────────

  it('renders multiple application cards', () => {
    const apps = [
      makeApp({ id: 'a1', businessName: 'Alpha Store', entityType: 'retailer' }),
      makeApp({ id: 'a2', businessName: 'Beta Supply', entityType: 'supplier' }),
    ];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 2 })} />);
    expect(screen.getByText('Alpha Store')).toBeTruthy();
    expect(screen.getByText('Beta Supply')).toBeTruthy();
  });
});
