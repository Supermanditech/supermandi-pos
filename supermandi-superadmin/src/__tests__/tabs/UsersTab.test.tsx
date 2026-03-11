// SuperAdmin — Test UsersTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UsersTab } from '../../tabs/UsersTab';

vi.mock('../../lib/formatters', () => ({
  formatDate: vi.fn((v: string) => v || '--'),
}));

vi.mock('../../components/TableSkeleton', () => ({
  TableSkeleton: () => <div data-testid="skeleton">Loading skeleton</div>,
}));

function createProps(overrides: Partial<Parameters<typeof UsersTab>[0]> = {}) {
  return {
    userRecords: [],
    usersLoading: false,
    usersError: '',
    userSearch: '',
    userStatusSaving: {},
    userActionError: '',
    showCreateUser: false,
    createUserForm: { name: '', email: '', phone: '', actor_type: 'store', actor_id: '' },
    createUserLoading: false,
    createUserError: '',
    createUserSuccess: '',
    setUserSearch: vi.fn(),
    setShowCreateUser: vi.fn(),
    setCreateUserForm: vi.fn(),
    refreshUsers: vi.fn(),
    requestUserStatusChange: vi.fn(),
    requestCreateUser: vi.fn(),
    ...overrides,
  };
}

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'u1',
  name: 'Alice',
  email: 'alice@test.com',
  phone: '9999999999',
  actor_type: 'store',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('UsersTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── Header ──────────────────────────────────────────────────

  it('renders header', () => {
    render(<UsersTab {...createProps()} />);
    expect(screen.getByText('Users Management')).toBeTruthy();
  });

  it('renders subtitle description', () => {
    render(<UsersTab {...createProps()} />);
    expect(screen.getByText('Manage platform users and their access')).toBeTruthy();
  });

  // ── Create User Toggle ──────────────────────────────────────

  it('shows + Create User button', () => {
    render(<UsersTab {...createProps()} />);
    expect(screen.getByText('+ Create User')).toBeTruthy();
  });

  it('toggles create user form visibility', () => {
    const setShow = vi.fn();
    render(<UsersTab {...createProps({ setShowCreateUser: setShow })} />);
    fireEvent.click(screen.getByText('+ Create User'));
    expect(setShow).toHaveBeenCalledWith(true);
  });

  it('shows Cancel button when form is open', () => {
    render(<UsersTab {...createProps({ showCreateUser: true })} />);
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  // ── Create User Form ───────────────────────────────────────

  it('shows create user form when showCreateUser is true', () => {
    render(<UsersTab {...createProps({ showCreateUser: true })} />);
    expect(screen.getByPlaceholderText('Full name')).toBeTruthy();
    expect(screen.getByPlaceholderText('email@example.com')).toBeTruthy();
  });

  it('shows phone input in create form', () => {
    render(<UsersTab {...createProps({ showCreateUser: true })} />);
    expect(screen.getByPlaceholderText('+91 98765 43210')).toBeTruthy();
  });

  it('shows actor type dropdown in create form', () => {
    render(<UsersTab {...createProps({ showCreateUser: true })} />);
    expect(screen.getByText('Store')).toBeTruthy();
    expect(screen.getByText('Supplier')).toBeTruthy();
    expect(screen.getByText('Platform Admin')).toBeTruthy();
  });

  it('shows Store ID field for store actor type', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserForm: { name: '', email: '', phone: '', actor_type: 'store', actor_id: '' } })} />);
    expect(screen.getByPlaceholderText('Enter store UUID')).toBeTruthy();
  });

  it('shows Supplier ID field for supplier actor type', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserForm: { name: '', email: '', phone: '', actor_type: 'supplier', actor_id: '' } })} />);
    expect(screen.getByPlaceholderText('Enter supplier UUID')).toBeTruthy();
  });

  it('shows platform admin warning when actor_type is platform', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserForm: { name: '', email: '', phone: '', actor_type: 'platform', actor_id: '' } })} />);
    expect(screen.getByText(/Platform Admin grants full system access/)).toBeTruthy();
  });

  it('does not show ID field for platform actor type', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserForm: { name: '', email: '', phone: '', actor_type: 'platform', actor_id: '' } })} />);
    expect(screen.queryByPlaceholderText(/Enter .* UUID/)).toBeNull();
  });

  it('shows Create User submit button', () => {
    render(<UsersTab {...createProps({ showCreateUser: true })} />);
    expect(screen.getByText('Create User')).toBeTruthy();
  });

  it('calls requestCreateUser on Create User click', () => {
    const create = vi.fn();
    render(<UsersTab {...createProps({ showCreateUser: true, requestCreateUser: create, createUserForm: { name: 'Test User', email: 'test@example.com', phone: '', actor_type: 'store', actor_id: '' } })} />);
    fireEvent.click(screen.getByText('Create User'));
    expect(create).toHaveBeenCalled();
  });

  it('shows Creating... when createUserLoading', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserLoading: true })} />);
    expect(screen.getByText('Creating...')).toBeTruthy();
  });

  it('disables Create User button when loading', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserLoading: true })} />);
    expect((screen.getByText('Creating...') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows create user error', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserError: 'Email required' })} />);
    expect(screen.getByText('Email required')).toBeTruthy();
  });

  it('shows create user error with role=alert', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserError: 'Invalid' })} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('shows create user success', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserSuccess: 'User created!' })} />);
    expect(screen.getByText('User created!')).toBeTruthy();
  });

  it('shows required fields note', () => {
    render(<UsersTab {...createProps({ showCreateUser: true })} />);
    expect(screen.getByText(/Name and Email are required/)).toBeTruthy();
  });

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty state when no users', () => {
    render(<UsersTab {...createProps()} />);
    expect(screen.getByText('No users found')).toBeTruthy();
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows loading skeleton when usersLoading', () => {
    render(<UsersTab {...createProps({ usersLoading: true })} />);
    expect(screen.getByTestId('skeleton')).toBeTruthy();
  });

  // ── Error States ────────────────────────────────────────────

  it('shows usersError', () => {
    render(<UsersTab {...createProps({ usersError: 'Failed to load users' })} />);
    expect(screen.getByText('Failed to load users')).toBeTruthy();
  });

  it('shows userActionError', () => {
    render(<UsersTab {...createProps({ userActionError: 'Action failed' })} />);
    expect(screen.getByText('Action failed')).toBeTruthy();
  });

  // ── Search ──────────────────────────────────────────────────

  it('search placeholder is visible', () => {
    render(<UsersTab {...createProps()} />);
    expect(screen.getByPlaceholderText('Search by name, email, or phone...')).toBeTruthy();
  });

  it('search input has accessible label', () => {
    render(<UsersTab {...createProps()} />);
    expect(screen.getByLabelText('Search users')).toBeTruthy();
  });

  it('calls setUserSearch on input change', () => {
    const setSearch = vi.fn();
    render(<UsersTab {...createProps({ setUserSearch: setSearch })} />);
    fireEvent.change(screen.getByPlaceholderText('Search by name, email, or phone...'), { target: { value: 'alice' } });
    expect(setSearch).toHaveBeenCalledWith('alice');
  });

  // ── Table ───────────────────────────────────────────────────

  it('shows table headers', () => {
    const users = [makeUser()];
    render(<UsersTab {...createProps({ userRecords: users as any })} />);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Type')).toBeTruthy();
    expect(screen.getByText('Created')).toBeTruthy();
    expect(screen.getByText('Actions')).toBeTruthy();
  });

  it('renders user rows', () => {
    const users = [makeUser()];
    render(<UsersTab {...createProps({ userRecords: users as any })} />);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('alice@test.com')).toBeTruthy();
    expect(screen.getByText('9999999999')).toBeTruthy();
    expect(screen.getByText('store')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
  });

  it('renders multiple users', () => {
    const users = [
      makeUser({ id: 'u1', name: 'Alice', actor_type: 'store' }),
      makeUser({ id: 'u2', name: 'Bob', actor_type: 'supplier', email: 'bob@test.com' }),
    ];
    render(<UsersTab {...createProps({ userRecords: users as any })} />);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('bob@test.com')).toBeTruthy();
  });

  it('shows - for missing email and phone', () => {
    const users = [makeUser({ email: null, phone: null })];
    render(<UsersTab {...createProps({ userRecords: users as any })} />);
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders formatted created_at date', () => {
    const users = [makeUser({ created_at: '2026-03-10T10:00:00Z' })];
    render(<UsersTab {...createProps({ userRecords: users as any })} />);
    expect(screen.getByText('2026-03-10T10:00:00Z')).toBeTruthy();
  });

  // ── Status Change Dropdown ──────────────────────────────────

  it('renders status change dropdown per user', () => {
    const users = [makeUser({ name: 'Charlie' })];
    render(<UsersTab {...createProps({ userRecords: users as any })} />);
    expect(screen.getByLabelText('Change status for Charlie')).toBeTruthy();
  });

  it('calls requestUserStatusChange on status change', () => {
    const handler = vi.fn();
    const users = [makeUser({ id: 'u-test', name: 'Charlie' })];
    render(<UsersTab {...createProps({ userRecords: users as any, requestUserStatusChange: handler })} />);
    fireEvent.change(screen.getByLabelText('Change status for Charlie'), { target: { value: 'suspended' } });
    // ConfirmDialog appears — click the confirm button
    fireEvent.click(screen.getByText('Suspend User'));
    expect(handler).toHaveBeenCalledWith('u-test', 'suspended');
  });

  it('disables status dropdown when saving', () => {
    const users = [makeUser({ id: 'u-save', name: 'Charlie' })];
    render(<UsersTab {...createProps({ userRecords: users as any, userStatusSaving: { 'u-save': true } })} />);
    expect((screen.getByLabelText('Change status for Charlie') as HTMLSelectElement).disabled).toBe(true);
  });

  // ── Refresh ─────────────────────────────────────────────────

  it('calls refreshUsers on Refresh click', () => {
    const refresh = vi.fn();
    render(<UsersTab {...createProps({ refreshUsers: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows Loading... on refresh button when loading', () => {
    render(<UsersTab {...createProps({ usersLoading: true })} />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('disables refresh button when loading', () => {
    render(<UsersTab {...createProps({ usersLoading: true })} />);
    expect((screen.getByText('Loading...') as HTMLButtonElement).disabled).toBe(true);
  });

  // ── Client-Side Search Filter ───────────────────────────────

  it('shows all users when search is empty', () => {
    const users = [
      makeUser({ id: 'u1', name: 'Alice' }),
      makeUser({ id: 'u2', name: 'Bob' }),
    ];
    render(<UsersTab {...createProps({ userRecords: users as any, userSearch: '' })} />);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  // ── Client-side search filtering ─────────────────────────

  it('filters users by name search', () => {
    const users = [
      makeUser({ id: 'u1', name: 'Alice' }),
      makeUser({ id: 'u2', name: 'Bob', email: 'bob@test.com' }),
    ];
    render(<UsersTab {...createProps({ userRecords: users as any, userSearch: 'alice' })} />);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.queryByText('Bob')).toBeNull();
  });

  it('filters users by email search', () => {
    const users = [
      makeUser({ id: 'u1', name: 'Alice', email: 'alice@test.com' }),
      makeUser({ id: 'u2', name: 'Bob', email: 'bob@test.com' }),
    ];
    render(<UsersTab {...createProps({ userRecords: users as any, userSearch: 'bob@test' })} />);
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('filters users by phone search', () => {
    const users = [
      makeUser({ id: 'u1', name: 'Alice', phone: '1111111111' }),
      makeUser({ id: 'u2', name: 'Bob', phone: '2222222222' }),
    ];
    render(<UsersTab {...createProps({ userRecords: users as any, userSearch: '2222' })} />);
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('shows no results when search matches nothing', () => {
    const users = [makeUser({ id: 'u1', name: 'Alice' })];
    render(<UsersTab {...createProps({ userRecords: users as any, userSearch: 'zzzzz' })} />);
    expect(screen.queryByText('Alice')).toBeNull();
  });

  // ── Status badges ─────────────────────────────────────────

  it('shows suspended badge style for suspended users', () => {
    const users = [makeUser({ status: 'suspended' })];
    render(<UsersTab {...createProps({ userRecords: users as any })} />);
    expect(screen.getByText('suspended')).toBeTruthy();
  });

  it('shows inactive badge for inactive users', () => {
    const users = [makeUser({ status: 'inactive' })];
    render(<UsersTab {...createProps({ userRecords: users as any })} />);
    expect(screen.getByText('inactive')).toBeTruthy();
  });

  // ── Status change dropdown ────────────────────────────────

  it('shows status dropdown options', () => {
    const users = [makeUser({ name: 'TestUser' })];
    render(<UsersTab {...createProps({ userRecords: users as any })} />);
    const dropdown = screen.getByLabelText('Change status for TestUser') as HTMLSelectElement;
    expect(dropdown).toBeTruthy();
    // Should have Active, Inactive, Suspended options
    expect(dropdown.options.length).toBe(3);
  });

  it('shows ConfirmDialog with info variant when setting to inactive', () => {
    const users = [makeUser({ id: 'u-test', name: 'TestUser' })];
    render(<UsersTab {...createProps({ userRecords: users as any })} />);
    fireEvent.change(screen.getByLabelText('Change status for TestUser'), { target: { value: 'inactive' } });
    expect(screen.getByText('Change User Status')).toBeTruthy();
    expect(screen.getByText(/Change TestUser's status from "active" to "inactive"/)).toBeTruthy();
  });

  it('does not trigger status change when same status is selected', () => {
    const handler = vi.fn();
    const users = [makeUser({ id: 'u-test', name: 'TestUser', status: 'active' })];
    render(<UsersTab {...createProps({ userRecords: users as any, requestUserStatusChange: handler })} />);
    fireEvent.change(screen.getByLabelText('Change status for TestUser'), { target: { value: 'active' } });
    // No dialog or handler call
    expect(screen.queryByText('Change User Status')).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  // ── Create user form edge cases ───────────────────────────

  it('disables Create User button when name is empty', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserForm: { name: '', email: 'test@test.com', phone: '', actor_type: 'store', actor_id: '' } })} />);
    expect((screen.getByText('Create User') as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables Create User button when email is empty', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserForm: { name: 'Test', email: '', phone: '', actor_type: 'store', actor_id: '' } })} />);
    expect((screen.getByText('Create User') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Create User button when name and email are provided', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserForm: { name: 'Test', email: 'a@b.com', phone: '', actor_type: 'store', actor_id: '' } })} />);
    expect((screen.getByText('Create User') as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls setCreateUserForm on name input change', () => {
    const setForm = vi.fn();
    render(<UsersTab {...createProps({ showCreateUser: true, setCreateUserForm: setForm })} />);
    fireEvent.change(screen.getByPlaceholderText('Full name'), { target: { value: 'New User' } });
    expect(setForm).toHaveBeenCalled();
  });

  it('calls setCreateUserForm on email input change', () => {
    const setForm = vi.fn();
    render(<UsersTab {...createProps({ showCreateUser: true, setCreateUserForm: setForm })} />);
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'new@test.com' } });
    expect(setForm).toHaveBeenCalled();
  });

  it('calls setCreateUserForm on phone input change', () => {
    const setForm = vi.fn();
    render(<UsersTab {...createProps({ showCreateUser: true, setCreateUserForm: setForm })} />);
    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '+91 12345' } });
    expect(setForm).toHaveBeenCalled();
  });

  it('calls setCreateUserForm on actor type change', () => {
    const setForm = vi.fn();
    render(<UsersTab {...createProps({ showCreateUser: true, setCreateUserForm: setForm })} />);
    fireEvent.change(screen.getByLabelText('User type'), { target: { value: 'supplier' } });
    expect(setForm).toHaveBeenCalled();
  });

  it('shows Phone table header when users exist', () => {
    const users = [makeUser()];
    render(<UsersTab {...createProps({ userRecords: users as any })} />);
    expect(screen.getByText('Phone')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
  });

  it('toggles showCreateUser to false on Cancel click', () => {
    const setShow = vi.fn();
    render(<UsersTab {...createProps({ showCreateUser: true, setShowCreateUser: setShow })} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(setShow).toHaveBeenCalledWith(false);
  });

  it('shows both usersError and userActionError simultaneously', () => {
    render(<UsersTab {...createProps({ usersError: 'Load error', userActionError: 'Action error' })} />);
    expect(screen.getByText('Load error')).toBeTruthy();
    expect(screen.getByText('Action error')).toBeTruthy();
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(2);
  });

  it('shows actor_type badge for supplier user', () => {
    const users = [makeUser({ actor_type: 'supplier' })];
    render(<UsersTab {...createProps({ userRecords: users as any })} />);
    expect(screen.getByText('supplier')).toBeTruthy();
  });
});
