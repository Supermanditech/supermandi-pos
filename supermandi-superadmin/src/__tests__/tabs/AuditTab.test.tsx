// SuperAdmin — Test AuditTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditTab } from '../../tabs/AuditTab';
import type { AuditLogRecord } from '../../api/audit';

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

vi.mock('../../components/PayloadDetails', () => ({
  PayloadDetails: ({ payload }: { payload: unknown }) => <span data-testid="payload">{JSON.stringify(payload)}</span>,
}));

const makeLog = (overrides: Partial<AuditLogRecord> = {}): AuditLogRecord => ({
  id: 'log-1',
  action: 'create',
  resource_type: 'store',
  resource_id: 'r1',
  actor_user_id: 'admin-1',
  actor_ip: '1.2.3.4',
  store_id: null,
  response_status: 200,
  error_message: null,
  request_body: null,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

function createProps(overrides: Partial<Parameters<typeof AuditTab>[0]> = {}) {
  return {
    auditLogs: [] as AuditLogRecord[],
    auditLogsTotal: 0,
    auditLogsLoading: false,
    auditLogsError: '',
    auditLogsPage: 0,
    auditLogsFilter: {},
    setAuditLogsPage: vi.fn(),
    setAuditLogsFilter: vi.fn(),
    refreshAuditLogs: vi.fn(),
    ...overrides,
  };
}

describe('AuditTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── Header ──────────────────────────────────────────────────

  it('renders Audit Logs header', () => {
    render(<AuditTab {...createProps()} />);
    expect(screen.getByText('Audit Logs')).toBeTruthy();
  });

  it('renders subtitle with total count', () => {
    render(<AuditTab {...createProps({ auditLogsTotal: 42 })} />);
    expect(screen.getByText(/42 total/)).toBeTruthy();
  });

  it('renders subtitle description', () => {
    render(<AuditTab {...createProps()} />);
    expect(screen.getByText(/System activity and admin actions/)).toBeTruthy();
  });

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty state when no logs', () => {
    render(<AuditTab {...createProps()} />);
    expect(screen.getByText('No audit logs found')).toBeTruthy();
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows Loading... on refresh button when loading', () => {
    render(<AuditTab {...createProps({ auditLogsLoading: true })} />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows Refresh when not loading', () => {
    render(<AuditTab {...createProps({ auditLogsLoading: false })} />);
    expect(screen.getByText('Refresh')).toBeTruthy();
  });

  // ── Error State ─────────────────────────────────────────────

  it('shows error message', () => {
    render(<AuditTab {...createProps({ auditLogsError: 'Failed to load' })} />);
    expect(screen.getByText('Failed to load')).toBeTruthy();
  });

  it('shows error with role=alert', () => {
    render(<AuditTab {...createProps({ auditLogsError: 'Network error' })} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  // ── Table ───────────────────────────────────────────────────

  it('renders audit log rows with action, resource, resource ID', () => {
    const logs = [makeLog()];
    render(<AuditTab {...createProps({ auditLogs: logs, auditLogsTotal: 1 })} />);
    expect(screen.getByText('CREATE')).toBeTruthy();
    expect(screen.getByText('store')).toBeTruthy();
    expect(screen.getByText('r1')).toBeTruthy();
  });

  it('renders actor user ID', () => {
    const logs = [makeLog({ actor_user_id: 'admin-007' })];
    render(<AuditTab {...createProps({ auditLogs: logs, auditLogsTotal: 1 })} />);
    expect(screen.getByText('admin-007')).toBeTruthy();
  });

  it('renders response status', () => {
    const logs = [makeLog({ response_status: 200 })];
    render(<AuditTab {...createProps({ auditLogs: logs, auditLogsTotal: 1 })} />);
    expect(screen.getByText('200')).toBeTruthy();
  });

  it('renders formatted timestamp', () => {
    const logs = [makeLog({ created_at: '2026-03-10T10:00:00Z' })];
    render(<AuditTab {...createProps({ auditLogs: logs, auditLogsTotal: 1 })} />);
    expect(screen.getByText('2026-03-10T10:00:00Z')).toBeTruthy();
  });

  it('shows error message for failed actions', () => {
    const logs = [makeLog({ error_message: 'Something went wrong', response_status: 500 })];
    render(<AuditTab {...createProps({ auditLogs: logs, auditLogsTotal: 1 })} />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('renders multiple log rows', () => {
    const logs = [
      makeLog({ id: 'log-1', action: 'create', resource_type: 'store' }),
      makeLog({ id: 'log-2', action: 'update', resource_type: 'device' }),
    ];
    render(<AuditTab {...createProps({ auditLogs: logs, auditLogsTotal: 2 })} />);
    expect(screen.getByText('CREATE')).toBeTruthy();
    expect(screen.getByText('UPDATE')).toBeTruthy();
    expect(screen.getByText('device')).toBeTruthy();
  });

  it('renders delete action', () => {
    const logs = [makeLog({ action: 'delete', resource_type: 'product' })];
    render(<AuditTab {...createProps({ auditLogs: logs, auditLogsTotal: 1 })} />);
    expect(screen.getByText('DELETE')).toBeTruthy();
    expect(screen.getByText('product')).toBeTruthy();
  });

  // ── Refresh ─────────────────────────────────────────────────

  it('calls refreshAuditLogs on Refresh click', () => {
    const refresh = vi.fn();
    render(<AuditTab {...createProps({ refreshAuditLogs: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });

  // ── Filter Controls ─────────────────────────────────────────

  it('renders action filter dropdown', () => {
    render(<AuditTab {...createProps()} />);
    expect(screen.getByLabelText('Action')).toBeTruthy();
  });

  it('renders resource type filter dropdown', () => {
    render(<AuditTab {...createProps()} />);
    expect(screen.getByLabelText('Resource type')).toBeTruthy();
  });

  // ── Pagination ──────────────────────────────────────────────

  it('shows pagination when total exceeds page size', () => {
    render(<AuditTab {...createProps({ auditLogsTotal: 100, auditLogsPage: 0 })} />);
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
  });

  it('shows Page 1 of 1 for single page', () => {
    render(<AuditTab {...createProps({ auditLogsTotal: 10, auditLogsPage: 0 })} />);
    expect(screen.getByText(/Page 1 of 1/)).toBeTruthy();
  });

  it('disables Prev on first page', () => {
    render(<AuditTab {...createProps({ auditLogsTotal: 100, auditLogsPage: 0 })} />);
    expect(screen.getByText(/Prev/)).toHaveProperty('disabled', true);
  });

  // ── Export CSV ──────────────────────────────────────────────

  it('enables Export CSV button when logs exist', () => {
    const logs = [makeLog()];
    render(<AuditTab {...createProps({ auditLogs: logs })} />);
    expect((screen.getByText('Export CSV') as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables Export CSV button when no logs', () => {
    render(<AuditTab {...createProps()} />);
    expect((screen.getByText('Export CSV') as HTMLButtonElement).disabled).toBe(true);
  });

  // ── Filter changes call setAuditLogsFilter ────────────────────

  it('calls setAuditLogsFilter on action filter change', () => {
    const setFilter = vi.fn();
    render(<AuditTab {...createProps({ setAuditLogsFilter: setFilter })} />);
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'delete' } });
    expect(setFilter).toHaveBeenCalled();
  });

  it('calls setAuditLogsFilter on resource type filter change', () => {
    const setFilter = vi.fn();
    render(<AuditTab {...createProps({ setAuditLogsFilter: setFilter })} />);
    fireEvent.change(screen.getByLabelText('Resource type'), { target: { value: 'device' } });
    expect(setFilter).toHaveBeenCalled();
  });

  it('calls setAuditLogsPage(0) on filter change', () => {
    const setPage = vi.fn();
    render(<AuditTab {...createProps({ setAuditLogsPage: setPage })} />);
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'create' } });
    expect(setPage).toHaveBeenCalled();
  });

  // ── Date range filters ────────────────────────────────────────

  it('renders From date and To date filters', () => {
    render(<AuditTab {...createProps()} />);
    expect(screen.getByLabelText('From date')).toBeTruthy();
    expect(screen.getByLabelText('To date')).toBeTruthy();
  });

  it('shows inverted date range warning', () => {
    render(<AuditTab {...createProps({ auditLogsFilter: { from_date: '2026-03-10', to_date: '2026-03-01' } })} />);
    expect(screen.getByText(/"From" date is after "To" date/)).toBeTruthy();
  });

  it('does not show inverted date range warning for valid range', () => {
    render(<AuditTab {...createProps({ auditLogsFilter: { from_date: '2026-03-01', to_date: '2026-03-10' } })} />);
    expect(screen.queryByText(/"From" date is after "To" date/)).toBeNull();
  });

  // ── Pagination navigation ─────────────────────────────────────

  it('calls setAuditLogsPage on Next click', () => {
    const setPage = vi.fn();
    render(<AuditTab {...createProps({ auditLogsTotal: 100, auditLogsPage: 0, setAuditLogsPage: setPage })} />);
    fireEvent.click(screen.getByText(/Next/));
    expect(setPage).toHaveBeenCalled();
  });

  it('disables Next on last page', () => {
    render(<AuditTab {...createProps({ auditLogsTotal: 50, auditLogsPage: 0 })} />);
    expect(screen.getByText(/Next/)).toHaveProperty('disabled', true);
  });

  // ── Actor fallback to IP then system ──────────────────────────

  it('renders actor_ip when actor_user_id is null', () => {
    const logs = [makeLog({ actor_user_id: null, actor_ip: '192.168.1.1' })];
    render(<AuditTab {...createProps({ auditLogs: logs, auditLogsTotal: 1 })} />);
    expect(screen.getByText('192.168.1.1')).toBeTruthy();
  });

  it('renders "system" when both actor fields are null', () => {
    const logs = [makeLog({ actor_user_id: null, actor_ip: null })];
    render(<AuditTab {...createProps({ auditLogs: logs, auditLogsTotal: 1 })} />);
    expect(screen.getByText('system')).toBeTruthy();
  });

  // ── Resource ID fallback ──────────────────────────────────────

  it('shows dash for null resource_id', () => {
    const logs = [makeLog({ resource_id: null })];
    render(<AuditTab {...createProps({ auditLogs: logs, auditLogsTotal: 1 })} />);
    expect(screen.getByText('-')).toBeTruthy();
  });

  // ── Payload details ───────────────────────────────────────────

  it('renders PayloadDetails for log with request_body', () => {
    const logs = [makeLog({ request_body: { name: 'test' }, error_message: null })];
    render(<AuditTab {...createProps({ auditLogs: logs, auditLogsTotal: 1 })} />);
    expect(screen.getByTestId('payload')).toBeTruthy();
  });

  // ── Table column headers ──────────────────────────────────────

  it('renders all table column headers', () => {
    render(<AuditTab {...createProps()} />);
    expect(screen.getByText('Time')).toBeTruthy();
    // 'Action' appears in both header and filter — use getAllByText
    expect(screen.getAllByText('Action').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Resource ID')).toBeTruthy();
    expect(screen.getByText('Actor')).toBeTruthy();
    // 'Status' also appears in both header and filter context
    expect(screen.getAllByText('Status').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Details')).toBeTruthy();
  });
});
