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
    render(<UsersTab {...createProps({ showCreateUser: true, requestCreateUser: create })} />);
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
});
