// SuperAdmin — Test StaffTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StaffTab } from '../../tabs/StaffTab';

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

function createProps(overrides: Partial<Parameters<typeof StaffTab>[0]> = {}) {
  return {
    staffList: [],
    staffLoading: false,
    staffError: '',
    staffStoreId: '',
    staffActionLoading: null,
    showAddStaff: false,
    newStaffName: '',
    newStaffPhone: '',
    newStaffPin: '',
    newStaffRole: 'CASHIER' as const,
    resetPinStaffId: null,
    resetPinValue: '',
    storeDirectory: [],
    setStaffStoreId: vi.fn(),
    setStaffList: vi.fn(),
    setShowAddStaff: vi.fn(),
    setNewStaffName: vi.fn(),
    setNewStaffPhone: vi.fn(),
    setNewStaffPin: vi.fn(),
    setNewStaffRole: vi.fn(),
    setResetPinStaffId: vi.fn(),
    setResetPinValue: vi.fn(),
    refreshStaff: vi.fn(),
    handleAddStaff: vi.fn(),
    handleToggleStaffActive: vi.fn(),
    handleResetPin: vi.fn(),
    handleStaffRoleChange: vi.fn(),
    staffSuccess: '',
    ...overrides,
  };
}

const makeStaff = (overrides: Record<string, unknown> = {}) => ({
  id: 'staff-1',
  store_id: 's1',
  name: 'John Doe',
  phone: '9876543210',
  role: 'CASHIER' as const,
  is_active: true,
  sales_count: 42,
  stock_in_count: 10,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('StaffTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── Header ──────────────────────────────────────────────────

  it('renders header', () => {
    render(<StaffTab {...createProps()} />);
    expect(screen.getByText('Store Staff Management')).toBeTruthy();
  });

  it('renders subtitle description', () => {
    render(<StaffTab {...createProps()} />);
    expect(screen.getByText('Add, edit, and manage POS staff per store')).toBeTruthy();
  });

  // ── Store Selection ─────────────────────────────────────────

  it('shows store directory in dropdown', () => {
    const stores = [{ id: 's1', name: 'Store A' }, { id: 's2', name: 'Store B' }];
    render(<StaffTab {...createProps({ storeDirectory: stores as any })} />);
    expect(screen.getByText(/Store A/)).toBeTruthy();
    expect(screen.getByText(/Store B/)).toBeTruthy();
  });

  it('renders store filter with accessible label', () => {
    render(<StaffTab {...createProps()} />);
    expect(screen.getByLabelText('Store')).toBeTruthy();
  });

  it('shows Select a store placeholder', () => {
    render(<StaffTab {...createProps()} />);
    expect(screen.getByDisplayValue('Select a store...')).toBeTruthy();
  });

  it('calls setStaffStoreId on store selection', () => {
    const setStore = vi.fn();
    const stores = [{ id: 's1', name: 'Store A' }];
    render(<StaffTab {...createProps({ storeDirectory: stores as any, setStaffStoreId: setStore })} />);
    fireEvent.change(screen.getByLabelText('Store'), { target: { value: 's1' } });
    expect(setStore).toHaveBeenCalledWith('s1');
  });

  it('clears staff list on store change', () => {
    const setList = vi.fn();
    const stores = [{ id: 's1', name: 'Store A' }];
    render(<StaffTab {...createProps({ storeDirectory: stores as any, setStaffList: setList })} />);
    fireEvent.change(screen.getByLabelText('Store'), { target: { value: 's1' } });
    expect(setList).toHaveBeenCalledWith([]);
  });

  // ── Load Staff Button ───────────────────────────────────────

  it('calls refreshStaff on Load Staff button', () => {
    const refresh = vi.fn();
    render(<StaffTab {...createProps({ staffStoreId: 's1', refreshStaff: refresh })} />);
    fireEvent.click(screen.getByText('Load Staff'));
    expect(refresh).toHaveBeenCalled();
  });

  it('disables Load Staff when no store selected', () => {
    render(<StaffTab {...createProps({ staffStoreId: '' })} />);
    const btn = screen.getByText('Load Staff');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('shows Loading... when staffLoading is true', () => {
    render(<StaffTab {...createProps({ staffStoreId: 's1', staffLoading: true })} />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('disables Load Staff when loading', () => {
    render(<StaffTab {...createProps({ staffStoreId: 's1', staffLoading: true })} />);
    expect((screen.getByText('Loading...') as HTMLButtonElement).disabled).toBe(true);
  });

  // ── Add Staff Button ────────────────────────────────────────

  it('shows + Add Staff button when store is selected', () => {
    render(<StaffTab {...createProps({ staffStoreId: 's1' })} />);
    expect(screen.getByText('+ Add Staff')).toBeTruthy();
  });

  it('does not show + Add Staff when no store selected', () => {
    render(<StaffTab {...createProps({ staffStoreId: '' })} />);
    expect(screen.queryByText('+ Add Staff')).toBeNull();
  });

  it('calls setShowAddStaff on + Add Staff click', () => {
    const setShow = vi.fn();
    render(<StaffTab {...createProps({ staffStoreId: 's1', setShowAddStaff: setShow })} />);
    fireEvent.click(screen.getByText('+ Add Staff'));
    expect(setShow).toHaveBeenCalledWith(true);
  });

  // ── Error / Success State ───────────────────────────────────

  it('shows error state', () => {
    render(<StaffTab {...createProps({ staffError: 'Staff fetch failed' })} />);
    expect(screen.getByText('Staff fetch failed')).toBeTruthy();
  });

  it('shows error with role=alert', () => {
    render(<StaffTab {...createProps({ staffError: 'Server error' })} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('shows success message', () => {
    render(<StaffTab {...createProps({ staffSuccess: 'Staff added successfully' })} />);
    expect(screen.getByText('Staff added successfully')).toBeTruthy();
  });

  // ── Add Staff Form ──────────────────────────────────────────

  it('shows add staff form when showAddStaff is true', () => {
    render(<StaffTab {...createProps({ showAddStaff: true })} />);
    expect(screen.getByText('Add New Staff Member')).toBeTruthy();
    expect(screen.getByPlaceholderText('Staff name')).toBeTruthy();
    expect(screen.getByPlaceholderText('9876543210')).toBeTruthy();
    expect(screen.getByPlaceholderText('1234')).toBeTruthy();
  });

  it('shows role options in add staff form', () => {
    render(<StaffTab {...createProps({ showAddStaff: true })} />);
    expect(screen.getByText('CASHIER (sell only)')).toBeTruthy();
    expect(screen.getByText('STOCK_MANAGER (sell + stock-in)')).toBeTruthy();
    expect(screen.getByText('MANAGER (all operations)')).toBeTruthy();
  });

  it('calls handleAddStaff on Add Staff form submit', () => {
    const handleAdd = vi.fn();
    render(<StaffTab {...createProps({ showAddStaff: true, handleAddStaff: handleAdd })} />);
    fireEvent.click(screen.getByText('Add Staff'));
    expect(handleAdd).toHaveBeenCalled();
  });

  it('shows Adding... when staffActionLoading is add', () => {
    render(<StaffTab {...createProps({ showAddStaff: true, staffActionLoading: 'add' })} />);
    expect(screen.getByText('Adding...')).toBeTruthy();
  });

  it('disables Add Staff button when adding', () => {
    render(<StaffTab {...createProps({ showAddStaff: true, staffActionLoading: 'add' })} />);
    expect((screen.getByText('Adding...') as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls setShowAddStaff(false) on Cancel in add form', () => {
    const setShow = vi.fn();
    render(<StaffTab {...createProps({ showAddStaff: true, setShowAddStaff: setShow })} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(setShow).toHaveBeenCalledWith(false);
  });

  it('calls setNewStaffName on name input change', () => {
    const setName = vi.fn();
    render(<StaffTab {...createProps({ showAddStaff: true, setNewStaffName: setName })} />);
    fireEvent.change(screen.getByPlaceholderText('Staff name'), { target: { value: 'New Staff' } });
    expect(setName).toHaveBeenCalledWith('New Staff');
  });

  // ── Staff Table ─────────────────────────────────────────────

  it('renders staff table with data', () => {
    const staff = [makeStaff()];
    render(<StaffTab {...createProps({ staffList: staff as any })} />);
    expect(screen.getByText('John Doe')).toBeTruthy();
    expect(screen.getByText('9876543210')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('shows table headers when staff present', () => {
    const staff = [makeStaff()];
    render(<StaffTab {...createProps({ staffList: staff as any })} />);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Phone')).toBeTruthy();
    expect(screen.getByText('Role')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Sales')).toBeTruthy();
    expect(screen.getByText('Stock-Ins')).toBeTruthy();
    expect(screen.getByText('Actions')).toBeTruthy();
  });

  it('renders multiple staff members', () => {
    const staff = [
      makeStaff({ id: 's1', name: 'Alice', role: 'MANAGER' }),
      makeStaff({ id: 's2', name: 'Bob', role: 'CASHIER' }),
    ];
    render(<StaffTab {...createProps({ staffList: staff as any })} />);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('renders formatted created_at date', () => {
    const staff = [makeStaff({ created_at: '2026-03-10T10:00:00Z' })];
    render(<StaffTab {...createProps({ staffList: staff as any })} />);
    expect(screen.getByText('2026-03-10T10:00:00Z')).toBeTruthy();
  });

  // ── Activate / Deactivate ───────────────────────────────────

  it('shows Deactivate button for active staff', () => {
    const staff = [makeStaff({ is_active: true })];
    render(<StaffTab {...createProps({ staffList: staff as any })} />);
    expect(screen.getByText('Deactivate')).toBeTruthy();
  });

  it('shows Activate button for inactive staff', () => {
    const staff = [makeStaff({ is_active: false })];
    render(<StaffTab {...createProps({ staffList: staff as any })} />);
    expect(screen.getByText('Activate')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('calls handleToggleStaffActive on Deactivate click', () => {
    const toggle = vi.fn();
    const staff = [makeStaff({ is_active: true })];
    render(<StaffTab {...createProps({ staffList: staff as any, handleToggleStaffActive: toggle })} />);
    fireEvent.click(screen.getByText('Deactivate'));
    expect(toggle).toHaveBeenCalledWith('staff-1', true);
  });

  it('calls handleToggleStaffActive on Activate click', () => {
    const toggle = vi.fn();
    const staff = [makeStaff({ id: 'staff-2', is_active: false })];
    render(<StaffTab {...createProps({ staffList: staff as any, handleToggleStaffActive: toggle })} />);
    fireEvent.click(screen.getByText('Activate'));
    expect(toggle).toHaveBeenCalledWith('staff-2', false);
  });

  it('disables action buttons when staffActionLoading matches staff id', () => {
    const staff = [makeStaff({ id: 'staff-x' })];
    render(<StaffTab {...createProps({ staffList: staff as any, staffActionLoading: 'staff-x' })} />);
    expect((screen.getByText('Deactivate') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Reset PIN') as HTMLButtonElement).disabled).toBe(true);
  });

  // ── Role Change Dropdown ────────────────────────────────────

  it('renders inline role change dropdown', () => {
    const staff = [makeStaff({ role: 'CASHIER' })];
    render(<StaffTab {...createProps({ staffList: staff as any })} />);
    const cashierElements = screen.getAllByText('CASHIER');
    expect(cashierElements.length).toBeGreaterThanOrEqual(1);
  });

  it('calls handleStaffRoleChange on role dropdown change', () => {
    const handleRole = vi.fn();
    const staff = [makeStaff({ id: 'staff-1', role: 'CASHIER' })];
    render(<StaffTab {...createProps({ staffList: staff as any, handleStaffRoleChange: handleRole })} />);
    const roleSelects = screen.getAllByDisplayValue('CASHIER');
    fireEvent.change(roleSelects[0], { target: { value: 'MANAGER' } });
    expect(handleRole).toHaveBeenCalledWith('staff-1', 'MANAGER');
  });

  // ── Reset PIN ───────────────────────────────────────────────

  it('shows Reset PIN button', () => {
    const staff = [makeStaff()];
    render(<StaffTab {...createProps({ staffList: staff as any })} />);
    expect(screen.getByText('Reset PIN')).toBeTruthy();
  });

  it('calls setResetPinStaffId on Reset PIN click', () => {
    const setResetId = vi.fn();
    const staff = [makeStaff()];
    render(<StaffTab {...createProps({ staffList: staff as any, setResetPinStaffId: setResetId })} />);
    fireEvent.click(screen.getByText('Reset PIN'));
    expect(setResetId).toHaveBeenCalledWith('staff-1');
  });

  it('shows PIN reset input when resetPinStaffId matches', () => {
    const staff = [makeStaff()];
    render(<StaffTab {...createProps({ staffList: staff as any, resetPinStaffId: 'staff-1', resetPinValue: '' })} />);
    expect(screen.getByPlaceholderText('New PIN')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('calls handleResetPin on Save', () => {
    const handleReset = vi.fn();
    const staff = [makeStaff()];
    render(<StaffTab {...createProps({ staffList: staff as any, resetPinStaffId: 'staff-1', resetPinValue: '5678', handleResetPin: handleReset })} />);
    fireEvent.click(screen.getByText('Save'));
    expect(handleReset).toHaveBeenCalled();
  });

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty state when store selected but no staff', () => {
    render(<StaffTab {...createProps({ staffStoreId: 's1' })} />);
    expect(screen.getByText(/No staff members found for this store/)).toBeTruthy();
  });

  it('does not show empty state when no store selected', () => {
    render(<StaffTab {...createProps({ staffStoreId: '' })} />);
    expect(screen.queryByText(/No staff members found/)).toBeNull();
  });
});
