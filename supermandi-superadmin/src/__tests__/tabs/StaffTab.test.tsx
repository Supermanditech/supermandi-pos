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

  it('renders header', () => {
    render(<StaffTab {...createProps()} />);
    expect(screen.getByText('Store Staff Management')).toBeTruthy();
  });

  it('shows store directory in dropdown', () => {
    const stores = [{ id: 's1', name: 'Store A' }, { id: 's2', name: 'Store B' }];
    render(<StaffTab {...createProps({ storeDirectory: stores as any })} />);
    expect(screen.getByText(/Store A/)).toBeTruthy();
    expect(screen.getByText(/Store B/)).toBeTruthy();
  });

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

  it('shows + Add Staff button when store is selected', () => {
    render(<StaffTab {...createProps({ staffStoreId: 's1' })} />);
    expect(screen.getByText('+ Add Staff')).toBeTruthy();
  });

  it('does not show + Add Staff when no store selected', () => {
    render(<StaffTab {...createProps({ staffStoreId: '' })} />);
    expect(screen.queryByText('+ Add Staff')).toBeNull();
  });

  it('shows error state', () => {
    render(<StaffTab {...createProps({ staffError: 'Staff fetch failed' })} />);
    expect(screen.getByText('Staff fetch failed')).toBeTruthy();
  });

  it('shows success message', () => {
    render(<StaffTab {...createProps({ staffSuccess: 'Staff added successfully' })} />);
    expect(screen.getByText('Staff added successfully')).toBeTruthy();
  });

  it('shows add staff form when showAddStaff is true', () => {
    render(<StaffTab {...createProps({ showAddStaff: true })} />);
    expect(screen.getByText('Add New Staff Member')).toBeTruthy();
    expect(screen.getByPlaceholderText('Staff name')).toBeTruthy();
    expect(screen.getByPlaceholderText('9876543210')).toBeTruthy();
    expect(screen.getByPlaceholderText('1234')).toBeTruthy();
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

  it('calls setShowAddStaff(false) on Cancel in add form', () => {
    const setShow = vi.fn();
    render(<StaffTab {...createProps({ showAddStaff: true, setShowAddStaff: setShow })} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(setShow).toHaveBeenCalledWith(false);
  });

  it('renders staff table with data', () => {
    const staff = [makeStaff()];
    render(<StaffTab {...createProps({ staffList: staff as any })} />);
    expect(screen.getByText('John Doe')).toBeTruthy();
    expect(screen.getByText('9876543210')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });

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

  it('shows Reset PIN button', () => {
    const staff = [makeStaff()];
    render(<StaffTab {...createProps({ staffList: staff as any })} />);
    expect(screen.getByText('Reset PIN')).toBeTruthy();
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

  it('shows empty state when store selected but no staff', () => {
    render(<StaffTab {...createProps({ staffStoreId: 's1' })} />);
    expect(screen.getByText(/No staff members found for this store/)).toBeTruthy();
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
});
