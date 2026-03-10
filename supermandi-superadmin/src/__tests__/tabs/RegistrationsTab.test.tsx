// SuperAdmin — Test RegistrationsTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RegistrationsTab } from '../../tabs/RegistrationsTab';
import type { RegistrationEvent } from '../../api/registrationEvents';

vi.mock('../../api/registrationEvents', () => ({
  sendEnrollmentCodeToStore: vi.fn(),
}));

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

vi.mock('../../components/ConfirmDialog', () => ({
  EnrollmentResultModal: ({ result, onClose }: any) => (
    <div data-testid="enrollment-modal">
      <span>{result.enrollmentCode}</span>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

const makeRegEvent = (overrides: Partial<RegistrationEvent> = {}): RegistrationEvent => ({
  id: 'reg-1',
  storeId: 's1',
  storeName: 'Test Store',
  storeCode: 'TS01',
  userId: 'u1',
  source: 'PORTAL',
  outcome: 'SUCCESS',
  errorCode: null,
  ipAddress: '1.2.3.4',
  userAgent: null,
  deviceMeta: null,
  phone: '9876543210',
  businessName: 'Test Business',
  gstin: '12ABCDE1234Z5',
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

function createProps(overrides: Partial<Parameters<typeof RegistrationsTab>[0]> = {}) {
  return {
    regEvents: [],
    regEventsTotal: 0,
    regEventsLoading: false,
    regEventsError: '',
    regEventsPage: 0,
    regEventsSourceFilter: '',
    regEventsOutcomeFilter: '',
    sendingEnrollment: '',
    setRegEventsPage: vi.fn(),
    setRegEventsSourceFilter: vi.fn(),
    setRegEventsOutcomeFilter: vi.fn(),
    setSendingEnrollment: vi.fn(),
    refreshRegEvents: vi.fn(),
    ...overrides,
  };
}

describe('RegistrationsTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── Header ──────────────────────────────────────────────────

  it('renders header', () => {
    render(<RegistrationsTab {...createProps()} />);
    expect(screen.getByText('Registration Events')).toBeTruthy();
  });

  it('renders subtitle with total count', () => {
    render(<RegistrationsTab {...createProps({ regEventsTotal: 42 })} />);
    expect(screen.getByText(/42 total/)).toBeTruthy();
  });

  it('renders subtitle description', () => {
    render(<RegistrationsTab {...createProps()} />);
    expect(screen.getByText(/Store registrations across all surfaces/)).toBeTruthy();
  });

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty state', () => {
    render(<RegistrationsTab {...createProps()} />);
    expect(screen.getByText('No registration events found')).toBeTruthy();
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows Loading... on button when loading', () => {
    render(<RegistrationsTab {...createProps({ regEventsLoading: true })} />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows Refresh when not loading', () => {
    render(<RegistrationsTab {...createProps({ regEventsLoading: false })} />);
    expect(screen.getByText('Refresh')).toBeTruthy();
  });

  it('disables refresh button when loading', () => {
    render(<RegistrationsTab {...createProps({ regEventsLoading: true })} />);
    expect((screen.getByText('Loading...') as HTMLButtonElement).disabled).toBe(true);
  });

  // ── Error State ─────────────────────────────────────────────

  it('shows error', () => {
    render(<RegistrationsTab {...createProps({ regEventsError: 'Failed' })} />);
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('shows error with role=alert', () => {
    render(<RegistrationsTab {...createProps({ regEventsError: 'Server error' })} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('does not show error banner when no error', () => {
    render(<RegistrationsTab {...createProps()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // ── Table Headers ───────────────────────────────────────────

  it('renders table column headers', () => {
    render(<RegistrationsTab {...createProps()} />);
    expect(screen.getByText('Time')).toBeTruthy();
    expect(screen.getByText('Business Name')).toBeTruthy();
    expect(screen.getByText('GSTIN')).toBeTruthy();
    expect(screen.getByText('IP')).toBeTruthy();
    expect(screen.getByText('Actions')).toBeTruthy();
    // Source and Outcome appear in both table headers and filter labels
    const sourceElements = screen.getAllByText('Source');
    expect(sourceElements.length).toBeGreaterThanOrEqual(1);
    const outcomeElements = screen.getAllByText('Outcome');
    expect(outcomeElements.length).toBeGreaterThanOrEqual(1);
  });

  // ── Table Rows ──────────────────────────────────────────────

  it('renders registration event rows', () => {
    const events = [makeRegEvent()];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 1 })} />);
    expect(screen.getByText('Test Business')).toBeTruthy();
    expect(screen.getByText('9876543210')).toBeTruthy();
    expect(screen.getByText('PORTAL')).toBeTruthy();
    expect(screen.getByText('SUCCESS')).toBeTruthy();
  });

  it('renders store name with store code', () => {
    const events = [makeRegEvent({ storeName: 'Alpha Store', storeCode: 'AS01' })];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 1 })} />);
    expect(screen.getByText('Alpha Store')).toBeTruthy();
    expect(screen.getByText('(AS01)')).toBeTruthy();
  });

  it('renders dash for missing store name', () => {
    const events = [makeRegEvent({ storeName: null, storeId: null } as any)];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 1 })} />);
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders GSTIN', () => {
    const events = [makeRegEvent({ gstin: '29AABCT1332L1ZC' })];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 1 })} />);
    expect(screen.getByText('29AABCT1332L1ZC')).toBeTruthy();
  });

  it('renders IP address', () => {
    const events = [makeRegEvent({ ipAddress: '192.168.1.100' })];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 1 })} />);
    expect(screen.getByText('192.168.1.100')).toBeTruthy();
  });

  it('renders formatted timestamp', () => {
    const events = [makeRegEvent({ createdAt: '2026-03-10T10:00:00Z' })];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 1 })} />);
    expect(screen.getByText('2026-03-10T10:00:00Z')).toBeTruthy();
  });

  it('renders multiple event rows', () => {
    const events = [
      makeRegEvent({ id: 'r1', businessName: 'Store A', outcome: 'SUCCESS' }),
      makeRegEvent({ id: 'r2', businessName: 'Store B', outcome: 'ERROR' }),
    ];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 2 })} />);
    expect(screen.getByText('Store A')).toBeTruthy();
    expect(screen.getByText('Store B')).toBeTruthy();
    expect(screen.getByText('ERROR')).toBeTruthy();
  });

  // ── Source Filter ───────────────────────────────────────────

  it('renders source filter dropdown', () => {
    render(<RegistrationsTab {...createProps()} />);
    expect(screen.getByLabelText('Source')).toBeTruthy();
  });

  it('renders All Sources option', () => {
    render(<RegistrationsTab {...createProps()} />);
    expect(screen.getByDisplayValue('All Sources')).toBeTruthy();
  });

  it('calls setRegEventsSourceFilter on filter change', () => {
    const setFilter = vi.fn();
    render(<RegistrationsTab {...createProps({ setRegEventsSourceFilter: setFilter })} />);
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'POS_DEVICE' } });
    expect(setFilter).toHaveBeenCalledWith('POS_DEVICE');
  });

  // ── Outcome Filter ──────────────────────────────────────────

  it('renders outcome filter dropdown', () => {
    render(<RegistrationsTab {...createProps()} />);
    expect(screen.getByLabelText('Outcome')).toBeTruthy();
  });

  it('calls setRegEventsOutcomeFilter on filter change', () => {
    const setFilter = vi.fn();
    render(<RegistrationsTab {...createProps({ setRegEventsOutcomeFilter: setFilter })} />);
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'BLOCKED' } });
    expect(setFilter).toHaveBeenCalledWith('BLOCKED');
  });

  // ── Send Code Button ───────────────────────────────────────

  it('shows Send Code button for successful registrations', () => {
    const events = [makeRegEvent()];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 1 })} />);
    expect(screen.getByText('Send Code')).toBeTruthy();
  });

  it('shows Send Code for IDEMPOTENT registrations', () => {
    const events = [makeRegEvent({ outcome: 'IDEMPOTENT' })];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 1 })} />);
    expect(screen.getByText('Send Code')).toBeTruthy();
  });

  it('does not show Send Code for failed registrations', () => {
    const events = [makeRegEvent({ outcome: 'ERROR', storeId: null })];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 1 })} />);
    expect(screen.queryByText('Send Code')).toBeNull();
  });

  it('shows Sending... when sendingEnrollment matches storeId', () => {
    const events = [makeRegEvent({ storeId: 's1' })];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 1, sendingEnrollment: 's1' })} />);
    expect(screen.getByText('Sending...')).toBeTruthy();
  });

  it('does not disable Send Code when a different store enrollment is being sent', () => {
    const events = [makeRegEvent({ storeId: 's1' })];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 1, sendingEnrollment: 'other-store' })} />);
    // R2-R5 audit: button is only disabled for its own storeId, not globally
    expect((screen.getByText('Send Code') as HTMLButtonElement).disabled).toBe(false);
  });

  // ── Refresh ─────────────────────────────────────────────────

  it('calls refreshRegEvents on button click', () => {
    const refresh = vi.fn();
    render(<RegistrationsTab {...createProps({ refreshRegEvents: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });

  // ── Pagination ──────────────────────────────────────────────

  it('shows pagination controls', () => {
    render(<RegistrationsTab {...createProps({ regEventsTotal: 100 })} />);
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
  });

  it('shows Page 1 of 1 for small datasets', () => {
    render(<RegistrationsTab {...createProps({ regEventsTotal: 10 })} />);
    expect(screen.getByText('Page 1 of 1')).toBeTruthy();
  });

  it('disables Prev on first page', () => {
    render(<RegistrationsTab {...createProps({ regEventsTotal: 100, regEventsPage: 0 })} />);
    expect(screen.getByText(/Prev/)).toHaveProperty('disabled', true);
  });

  it('disables Next on last page', () => {
    render(<RegistrationsTab {...createProps({ regEventsTotal: 100, regEventsPage: 1 })} />);
    expect(screen.getByText(/Next/)).toHaveProperty('disabled', true);
  });

  it('calls setRegEventsPage on Next click', () => {
    const setPage = vi.fn();
    render(<RegistrationsTab {...createProps({ regEventsTotal: 100, regEventsPage: 0, setRegEventsPage: setPage })} />);
    fireEvent.click(screen.getByText(/Next/));
    expect(setPage).toHaveBeenCalled();
  });
});
