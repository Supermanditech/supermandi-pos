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
    auditLogs: [],
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

  it('renders header with total', () => {
    render(<AuditTab {...createProps({ auditLogsTotal: 42 })} />);
    expect(screen.getByText('Audit Logs')).toBeTruthy();
    expect(screen.getByText(/42 total/)).toBeTruthy();
  });

  it('shows empty state', () => {
    render(<AuditTab {...createProps()} />);
    expect(screen.getByText('No audit logs found')).toBeTruthy();
  });

  it('renders audit log rows', () => {
    const logs = [makeLog()];
    render(<AuditTab {...createProps({ auditLogs: logs, auditLogsTotal: 1 })} />);
    expect(screen.getByText('CREATE')).toBeTruthy();
    expect(screen.getByText('store')).toBeTruthy();
    expect(screen.getByText('r1')).toBeTruthy();
  });

  it('shows error state', () => {
    render(<AuditTab {...createProps({ auditLogsError: 'Failed to load' })} />);
    expect(screen.getByText('Failed to load')).toBeTruthy();
  });

  it('calls refreshAuditLogs on button click', () => {
    const refresh = vi.fn();
    render(<AuditTab {...createProps({ refreshAuditLogs: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows loading state on refresh button', () => {
    render(<AuditTab {...createProps({ auditLogsLoading: true })} />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows error message for failed actions', () => {
    const logs = [makeLog({ error_message: 'Something went wrong', response_status: 500 })];
    render(<AuditTab {...createProps({ auditLogs: logs, auditLogsTotal: 1 })} />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('shows pagination controls', () => {
    render(<AuditTab {...createProps({ auditLogsTotal: 100, auditLogsPage: 0 })} />);
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
  });

  it('enables Export CSV button when logs exist', () => {
    const logs = [makeLog()];
    render(<AuditTab {...createProps({ auditLogs: logs })} />);
    const btn = screen.getByText('Export CSV');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables Export CSV button when no logs', () => {
    render(<AuditTab {...createProps()} />);
    const btn = screen.getByText('Export CSV');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
