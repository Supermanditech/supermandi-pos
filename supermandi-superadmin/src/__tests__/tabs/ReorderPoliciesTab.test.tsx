// SuperAdmin — Test ReorderPoliciesTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReorderPoliciesTab } from '../../tabs/ReorderPoliciesTab';
import type { ReorderPolicyRecord, ReorderAuditEntry } from '../../api/reorderPolicies';

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

const makePolicy = (overrides: Partial<ReorderPolicyRecord> = {}): ReorderPolicyRecord => ({
  id: 'pol-1',
  storeId: 's1',
  storeName: 'Test Store',
  productId: 'p1',
  productName: 'Rice 5kg',
  minStock: 5,
  targetStock: 30,
  maxReorderQty: 100,
  preferredSupplierId: 'sup-1',
  supplierName: 'Wholesale Mart',
  isEnabled: true,
  createdByUserId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  ...overrides,
});

const makeAuditEntry = (overrides: Partial<ReorderAuditEntry> = {}): ReorderAuditEntry => ({
  id: 'audit-1',
  adminId: 'admin-1',
  adminEmail: 'admin@test.com',
  method: 'POST',
  route: '/reorder/policies/pol-1',
  statusCode: 201,
  entityType: 'reorder_policy',
  entityId: 's1',
  storeName: 'Test Store',
  productName: 'Rice 5kg',
  changes: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

function createProps(overrides: Partial<Parameters<typeof ReorderPoliciesTab>[0]> = {}) {
  return {
    policies: [],
    policiesLoading: false,
    policiesError: '',
    policiesTotal: 0,
    policiesOffset: 0,
    auditLog: [],
    auditLoading: false,
    auditError: '',
    auditTotal: 0,
    auditOffset: 0,
    setPoliciesOffset: vi.fn(),
    setAuditOffset: vi.fn(),
    refreshPolicies: vi.fn(),
    refreshAudit: vi.fn(),
    ...overrides,
  };
}

describe('ReorderPoliciesTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── Header ──────────────────────────────────────────────────

  it('renders policies header', () => {
    render(<ReorderPoliciesTab {...createProps()} />);
    expect(screen.getByText('Reorder Policies')).toBeTruthy();
  });

  it('renders policies subtitle', () => {
    render(<ReorderPoliciesTab {...createProps()} />);
    expect(screen.getByText('Per-product reorder thresholds and preferences across all stores (read-only)')).toBeTruthy();
  });

  it('renders audit log header', () => {
    render(<ReorderPoliciesTab {...createProps()} />);
    expect(screen.getByText('Policy Change Audit Log')).toBeTruthy();
  });

  it('renders audit log subtitle', () => {
    render(<ReorderPoliciesTab {...createProps()} />);
    expect(screen.getByText('Recent reorder policy changes (created, updated, deleted)')).toBeTruthy();
  });

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty state for policies', () => {
    render(<ReorderPoliciesTab {...createProps()} />);
    expect(screen.getByText('No reorder policies found.')).toBeTruthy();
  });

  it('shows empty state for audit log', () => {
    render(<ReorderPoliciesTab {...createProps()} />);
    expect(screen.getByText('No audit log entries found.')).toBeTruthy();
  });

  it('does not show empty state when policies exist', () => {
    render(<ReorderPoliciesTab {...createProps({ policies: [makePolicy()], policiesTotal: 1 })} />);
    expect(screen.queryByText('No reorder policies found.')).toBeNull();
  });

  it('does not show empty state when audit entries exist', () => {
    render(<ReorderPoliciesTab {...createProps({ auditLog: [makeAuditEntry()], auditTotal: 1 })} />);
    expect(screen.queryByText('No audit log entries found.')).toBeNull();
  });

  // ── Error State ─────────────────────────────────────────────

  it('shows policies error', () => {
    render(<ReorderPoliciesTab {...createProps({ policiesError: 'Failed to load' })} />);
    expect(screen.getByText('Failed to load')).toBeTruthy();
  });

  it('shows audit error', () => {
    render(<ReorderPoliciesTab {...createProps({ auditError: 'Audit failed' })} />);
    expect(screen.getByText('Audit failed')).toBeTruthy();
  });

  it('shows error with role=alert for policies', () => {
    render(<ReorderPoliciesTab {...createProps({ policiesError: 'err' })} />);
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  it('shows error with role=alert for audit', () => {
    render(<ReorderPoliciesTab {...createProps({ auditError: 'err' })} />);
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  it('does not show error banner when no errors', () => {
    render(<ReorderPoliciesTab {...createProps()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows Loading... on policies refresh button when loading', () => {
    render(<ReorderPoliciesTab {...createProps({ policiesLoading: true })} />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows Loading... on audit refresh button when loading', () => {
    render(<ReorderPoliciesTab {...createProps({ auditLoading: true })} />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('does not show empty state when policies loading', () => {
    render(<ReorderPoliciesTab {...createProps({ policiesLoading: true })} />);
    expect(screen.queryByText('No reorder policies found.')).toBeNull();
  });

  it('does not show empty state when audit loading', () => {
    render(<ReorderPoliciesTab {...createProps({ auditLoading: true })} />);
    expect(screen.queryByText('No audit log entries found.')).toBeNull();
  });

  it('does not show policies empty state when error is present', () => {
    render(<ReorderPoliciesTab {...createProps({ policiesError: 'err' })} />);
    expect(screen.queryByText('No reorder policies found.')).toBeNull();
  });

  it('does not show audit empty state when error is present', () => {
    render(<ReorderPoliciesTab {...createProps({ auditError: 'err' })} />);
    expect(screen.queryByText('No audit log entries found.')).toBeNull();
  });

  // ── Count Display ───────────────────────────────────────────

  it('shows policies total count', () => {
    render(<ReorderPoliciesTab {...createProps({ policiesTotal: 5 })} />);
    expect(screen.getByText('5 policies total')).toBeTruthy();
  });

  it('shows singular policy text for count of 1', () => {
    render(<ReorderPoliciesTab {...createProps({ policiesTotal: 1 })} />);
    expect(screen.getByText('1 policy total')).toBeTruthy();
  });

  it('shows audit entries total count', () => {
    render(<ReorderPoliciesTab {...createProps({ auditTotal: 3 })} />);
    expect(screen.getByText('3 entries total')).toBeTruthy();
  });

  it('shows singular entry text for count of 1', () => {
    render(<ReorderPoliciesTab {...createProps({ auditTotal: 1 })} />);
    expect(screen.getByText('1 entry total')).toBeTruthy();
  });

  // ── Policies Table ──────────────────────────────────────────

  it('renders policies table column headers', () => {
    const policies = [makePolicy()];
    render(<ReorderPoliciesTab {...createProps({ policies, policiesTotal: 1 })} />);
    expect(screen.getByText('Store')).toBeTruthy();
    expect(screen.getByText('Product')).toBeTruthy();
    expect(screen.getByText('Min Stock')).toBeTruthy();
    expect(screen.getByText('Target Stock')).toBeTruthy();
    expect(screen.getByText('Max Reorder')).toBeTruthy();
    expect(screen.getByText('Supplier')).toBeTruthy();
    expect(screen.getByText('Enabled')).toBeTruthy();
    expect(screen.getByText('Updated')).toBeTruthy();
  });

  it('renders policy rows', () => {
    const policies = [makePolicy()];
    render(<ReorderPoliciesTab {...createProps({ policies, policiesTotal: 1 })} />);
    expect(screen.getByText('Test Store')).toBeTruthy();
    expect(screen.getByText('Rice 5kg')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy();
    expect(screen.getByText('Wholesale Mart')).toBeTruthy();
  });

  it('renders enabled badge as Yes when enabled', () => {
    const policies = [makePolicy({ isEnabled: true })];
    render(<ReorderPoliciesTab {...createProps({ policies, policiesTotal: 1 })} />);
    expect(screen.getByText('Yes')).toBeTruthy();
  });

  it('renders enabled badge as No when disabled', () => {
    const policies = [makePolicy({ isEnabled: false })];
    render(<ReorderPoliciesTab {...createProps({ policies, policiesTotal: 1 })} />);
    expect(screen.getByText('No')).toBeTruthy();
  });

  it('renders product name with title tooltip', () => {
    const policies = [makePolicy({ productName: 'Basmati Rice' })];
    render(<ReorderPoliciesTab {...createProps({ policies, policiesTotal: 1 })} />);
    expect(screen.getByTitle('Basmati Rice')).toBeTruthy();
  });

  it('falls back to storeId slice when storeName is empty', () => {
    const policies = [makePolicy({ storeName: null, storeId: 'abcdefghij' })];
    render(<ReorderPoliciesTab {...createProps({ policies, policiesTotal: 1 })} />);
    expect(screen.getByText('abcdefgh')).toBeTruthy();
  });

  it('falls back to productId slice when productName is empty', () => {
    const policies = [makePolicy({ productName: null, productId: 'xyz12345ab' })];
    render(<ReorderPoliciesTab {...createProps({ policies, policiesTotal: 1 })} />);
    expect(screen.getByText('xyz12345')).toBeTruthy();
  });

  it('shows dash when maxReorderQty is null', () => {
    const policies = [makePolicy({ maxReorderQty: null })];
    render(<ReorderPoliciesTab {...createProps({ policies, policiesTotal: 1 })} />);
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to supplierId slice when supplierName is empty', () => {
    const policies = [makePolicy({ supplierName: null, preferredSupplierId: 'sup-abcdefgh' })];
    render(<ReorderPoliciesTab {...createProps({ policies, policiesTotal: 1 })} />);
    expect(screen.getByText('sup-abcd')).toBeTruthy();
  });

  it('renders multiple policy rows', () => {
    const policies = [
      makePolicy({ id: 'p1', productName: 'Rice 5kg' }),
      makePolicy({ id: 'p2', productName: 'Wheat 10kg', minStock: 10 }),
    ];
    render(<ReorderPoliciesTab {...createProps({ policies, policiesTotal: 2 })} />);
    expect(screen.getByText('Rice 5kg')).toBeTruthy();
    expect(screen.getByText('Wheat 10kg')).toBeTruthy();
  });

  it('renders formatted timestamp for policy', () => {
    const policies = [makePolicy({ updatedAt: '2026-03-10T10:00:00Z' })];
    render(<ReorderPoliciesTab {...createProps({ policies, policiesTotal: 1 })} />);
    expect(screen.getByText('2026-03-10T10:00:00Z')).toBeTruthy();
  });

  // ── Audit Log Table ─────────────────────────────────────────

  it('renders audit log table column headers', () => {
    const auditLog = [makeAuditEntry()];
    render(<ReorderPoliciesTab {...createProps({ auditLog, auditTotal: 1 })} />);
    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Action')).toBeTruthy();
    expect(screen.getByText('Admin')).toBeTruthy();
    expect(screen.getByText('Entity')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
  });

  it('renders audit log rows', () => {
    const auditLog = [makeAuditEntry()];
    render(<ReorderPoliciesTab {...createProps({ auditLog, auditTotal: 1 })} />);
    expect(screen.getByText('admin@test.com')).toBeTruthy();
    expect(screen.getByText('POST')).toBeTruthy();
    expect(screen.getByText('201')).toBeTruthy();
  });

  it('renders audit entry with storeName as entity', () => {
    const auditLog = [makeAuditEntry({ storeName: 'My Store', productName: null })];
    render(<ReorderPoliciesTab {...createProps({ auditLog, auditTotal: 1 })} />);
    expect(screen.getByText('My Store')).toBeTruthy();
  });

  it('renders audit entry with productName as entity fallback', () => {
    const auditLog = [makeAuditEntry({ storeName: null, productName: 'Sugar 1kg' })];
    render(<ReorderPoliciesTab {...createProps({ auditLog, auditTotal: 1 })} />);
    expect(screen.getByText('Sugar 1kg')).toBeTruthy();
  });

  it('falls back to entityId slice when no names', () => {
    const auditLog = [makeAuditEntry({ storeName: null, productName: null, entityId: 'ent-12345678' })];
    render(<ReorderPoliciesTab {...createProps({ auditLog, auditTotal: 1 })} />);
    expect(screen.getByText('ent-1234')).toBeTruthy();
  });

  it('falls back to adminId slice when no email', () => {
    const auditLog = [makeAuditEntry({ adminEmail: null, adminId: 'adm-12345678' })];
    render(<ReorderPoliciesTab {...createProps({ auditLog, auditTotal: 1 })} />);
    expect(screen.getByText('adm-1234')).toBeTruthy();
  });

  it('renders formatted timestamp for audit entry', () => {
    const auditLog = [makeAuditEntry({ createdAt: '2026-02-15T12:00:00Z' })];
    render(<ReorderPoliciesTab {...createProps({ auditLog, auditTotal: 1 })} />);
    expect(screen.getByText('2026-02-15T12:00:00Z')).toBeTruthy();
  });

  it('renders multiple audit entries', () => {
    const auditLog = [
      makeAuditEntry({ id: 'a1', method: 'POST', adminEmail: 'admin@test.com' }),
      makeAuditEntry({ id: 'a2', method: 'PUT', adminEmail: 'other@test.com' }),
    ];
    render(<ReorderPoliciesTab {...createProps({ auditLog, auditTotal: 2 })} />);
    expect(screen.getByText('admin@test.com')).toBeTruthy();
    expect(screen.getByText('other@test.com')).toBeTruthy();
    expect(screen.getByText('PUT')).toBeTruthy();
  });

  // ── Refresh ─────────────────────────────────────────────────

  it('calls refreshPolicies on button click', () => {
    const refresh = vi.fn();
    render(<ReorderPoliciesTab {...createProps({ refreshPolicies: refresh })} />);
    const buttons = screen.getAllByText('Refresh');
    fireEvent.click(buttons[0]);
    expect(refresh).toHaveBeenCalled();
  });

  it('calls refreshAudit on button click', () => {
    const refresh = vi.fn();
    render(<ReorderPoliciesTab {...createProps({ refreshAudit: refresh })} />);
    const buttons = screen.getAllByText('Refresh');
    fireEvent.click(buttons[1]);
    expect(refresh).toHaveBeenCalled();
  });

  it('disables policies refresh button when loading', () => {
    render(<ReorderPoliciesTab {...createProps({ policiesLoading: true })} />);
    const loadingBtns = screen.getAllByText('Loading...');
    expect((loadingBtns[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables audit refresh button when loading', () => {
    render(<ReorderPoliciesTab {...createProps({ auditLoading: true })} />);
    const loadingBtns = screen.getAllByText('Loading...');
    expect((loadingBtns[0] as HTMLButtonElement).disabled).toBe(true);
  });

  // ── Policies Pagination ─────────────────────────────────────

  it('shows policies pagination when total exceeds 50', () => {
    render(<ReorderPoliciesTab {...createProps({ policiesTotal: 60, policiesOffset: 0 })} />);
    expect(screen.getByText('1–50 of 60')).toBeTruthy();
  });

  it('does not show policies pagination for 50 or fewer', () => {
    render(<ReorderPoliciesTab {...createProps({ policiesTotal: 50, policiesOffset: 0 })} />);
    expect(screen.queryByText(/of 50/)).toBeNull();
  });

  it('disables Previous on first page of policies', () => {
    render(<ReorderPoliciesTab {...createProps({ policiesTotal: 100, policiesOffset: 0 })} />);
    const prevBtns = screen.getAllByText('Previous');
    expect((prevBtns[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Previous on subsequent pages of policies', () => {
    render(<ReorderPoliciesTab {...createProps({ policiesTotal: 100, policiesOffset: 50 })} />);
    const prevBtns = screen.getAllByText('Previous');
    expect((prevBtns[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables Next on last page of policies', () => {
    render(<ReorderPoliciesTab {...createProps({ policiesTotal: 100, policiesOffset: 50 })} />);
    const nextBtns = screen.getAllByText('Next');
    expect((nextBtns[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls setPoliciesOffset on Next click', () => {
    const setOffset = vi.fn();
    render(<ReorderPoliciesTab {...createProps({ policiesTotal: 100, policiesOffset: 0, setPoliciesOffset: setOffset })} />);
    const nextBtns = screen.getAllByText('Next');
    fireEvent.click(nextBtns[0]);
    expect(setOffset).toHaveBeenCalledWith(50);
  });

  it('calls setPoliciesOffset on Previous click', () => {
    const setOffset = vi.fn();
    render(<ReorderPoliciesTab {...createProps({ policiesTotal: 100, policiesOffset: 50, setPoliciesOffset: setOffset })} />);
    const prevBtns = screen.getAllByText('Previous');
    fireEvent.click(prevBtns[0]);
    expect(setOffset).toHaveBeenCalledWith(0);
  });

  // ── Audit Pagination ────────────────────────────────────────

  it('shows audit pagination when total exceeds 50', () => {
    render(<ReorderPoliciesTab {...createProps({ auditTotal: 80, auditOffset: 0 })} />);
    expect(screen.getByText('1–50 of 80')).toBeTruthy();
  });

  it('does not show audit pagination for 50 or fewer', () => {
    render(<ReorderPoliciesTab {...createProps({ auditTotal: 30, auditOffset: 0 })} />);
    expect(screen.queryByText(/of 30/)).toBeNull();
  });

  it('calls setAuditOffset on Next click', () => {
    const setOffset = vi.fn();
    render(<ReorderPoliciesTab {...createProps({ auditTotal: 100, auditOffset: 0, setAuditOffset: setOffset })} />);
    const nextBtns = screen.getAllByText('Next');
    // Audit pagination Next is the second (or only) Next button
    fireEvent.click(nextBtns[nextBtns.length - 1]);
    expect(setOffset).toHaveBeenCalledWith(50);
  });

  it('shows correct audit pagination range text on page 2', () => {
    render(<ReorderPoliciesTab {...createProps({ auditTotal: 120, auditOffset: 50 })} />);
    expect(screen.getByText('51–100 of 120')).toBeTruthy();
  });

  // ── Status badge styling ────────────────────────────────────

  it('renders success status badge for status < 300', () => {
    const auditLog = [makeAuditEntry({ statusCode: 200 })];
    render(<ReorderPoliciesTab {...createProps({ auditLog, auditTotal: 1 })} />);
    expect(screen.getByText('200')).toBeTruthy();
  });

  it('renders warning status badge for status >= 300', () => {
    const auditLog = [makeAuditEntry({ statusCode: 400 })];
    render(<ReorderPoliciesTab {...createProps({ auditLog, auditTotal: 1 })} />);
    expect(screen.getByText('400')).toBeTruthy();
  });
});
