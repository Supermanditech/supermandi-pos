// SuperAdmin — Test UsersTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UsersTab } from '../../tabs/UsersTab';

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

  it('renders header', () => {
    render(<UsersTab {...createProps()} />);
    expect(screen.getByText('Users Management')).toBeTruthy();
  });

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

  it('shows create user form when showCreateUser is true', () => {
    render(<UsersTab {...createProps({ showCreateUser: true })} />);
    expect(screen.getByPlaceholderText('Full name')).toBeTruthy();
    expect(screen.getByPlaceholderText('email@example.com')).toBeTruthy();
    expect(screen.getByText('Create User')).toBeTruthy();
  });

  it('shows platform admin warning when actor_type is platform', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserForm: { name: '', email: '', phone: '', actor_type: 'platform', actor_id: '' } })} />);
    expect(screen.getByText(/Platform Admin grants full system access/)).toBeTruthy();
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

  it('shows create user error', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserError: 'Email required' })} />);
    expect(screen.getByText('Email required')).toBeTruthy();
  });

  it('shows create user success', () => {
    render(<UsersTab {...createProps({ showCreateUser: true, createUserSuccess: 'User created!' })} />);
    expect(screen.getByText('User created!')).toBeTruthy();
  });

  it('shows empty state when no users', () => {
    render(<UsersTab {...createProps()} />);
    expect(screen.getByText('No users found')).toBeTruthy();
  });

  it('shows loading skeleton when usersLoading', () => {
    render(<UsersTab {...createProps({ usersLoading: true })} />);
    expect(screen.getByTestId('skeleton')).toBeTruthy();
  });

  it('shows usersError', () => {
    render(<UsersTab {...createProps({ usersError: 'Failed to load users' })} />);
    expect(screen.getByText('Failed to load users')).toBeTruthy();
  });

  it('shows userActionError', () => {
    render(<UsersTab {...createProps({ userActionError: 'Action failed' })} />);
    expect(screen.getByText('Action failed')).toBeTruthy();
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

  it('calls refreshUsers on Refresh click', () => {
    const refresh = vi.fn();
    render(<UsersTab {...createProps({ refreshUsers: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows table headers', () => {
    const users = [makeUser()];
    render(<UsersTab {...createProps({ userRecords: users as any })} />);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Phone')).toBeTruthy();
    expect(screen.getByText('Type')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Created')).toBeTruthy();
    expect(screen.getByText('Actions')).toBeTruthy();
  });

  it('shows - for missing email and phone', () => {
    const users = [makeUser({ email: null, phone: null })];
    render(<UsersTab {...createProps({ userRecords: users as any })} />);
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('search placeholder is visible', () => {
    render(<UsersTab {...createProps()} />);
    expect(screen.getByPlaceholderText('Search by name, email, or phone...')).toBeTruthy();
  });
});
