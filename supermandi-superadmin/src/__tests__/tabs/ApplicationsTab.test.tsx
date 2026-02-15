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

  it('renders header', () => {
    render(<ApplicationsTab {...createProps()} />);
    expect(screen.getByText('Registration Applications')).toBeTruthy();
  });

  it('shows empty state when no applications', () => {
    render(<ApplicationsTab {...createProps()} />);
    expect(screen.getByText('No pending applications.')).toBeTruthy();
  });

  it('shows loading state', () => {
    render(<ApplicationsTab {...createProps({ applicationsLoading: true })} />);
    expect(screen.getByText('Loading applications...')).toBeTruthy();
  });

  it('shows error banner', () => {
    render(<ApplicationsTab {...createProps({ applicationsError: 'Network error' })} />);
    expect(screen.getByText('Network error')).toBeTruthy();
  });

  it('renders application cards', () => {
    const apps = [makeApp()];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('Test Store')).toBeTruthy();
    expect(screen.getByText('John Doe')).toBeTruthy();
    expect(screen.getByText('12ABCDE1234Z5')).toBeTruthy();
  });

  it('calls handleApproveApplication on approve click', () => {
    const handleApprove = vi.fn();
    const apps = [makeApp()];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1, handleApproveApplication: handleApprove })} />);
    fireEvent.click(screen.getByText('Approve Store'));
    expect(handleApprove).toHaveBeenCalledWith('app-1');
  });

  it('calls handleRejectApplication on reject click', () => {
    const handleReject = vi.fn();
    const apps = [makeApp()];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1, handleRejectApplication: handleReject })} />);
    fireEvent.click(screen.getByText('Reject'));
    expect(handleReject).toHaveBeenCalledWith('app-1');
  });

  it('shows supplier type badge for supplier applications', () => {
    const apps = [makeApp({ entityType: 'supplier' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('supplier')).toBeTruthy();
  });

  it('shows NEEDS_FIX status with resubmission message', () => {
    const apps = [makeApp({ status: 'NEEDS_FIX' })];
    render(<ApplicationsTab {...createProps({ applications: apps, applicationsTotal: 1 })} />);
    expect(screen.getByText('Awaiting applicant resubmission')).toBeTruthy();
    expect(screen.getByText('Re-Reject')).toBeTruthy();
  });

  it('shows count info', () => {
    render(<ApplicationsTab {...createProps({ applicationsTotal: 42 })} />);
    expect(screen.getByText(/Showing 0 of 42 pending applications/)).toBeTruthy();
  });

  it('calls refreshApplications on refresh click', () => {
    const refresh = vi.fn();
    render(<ApplicationsTab {...createProps({ refreshApplications: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });
});
