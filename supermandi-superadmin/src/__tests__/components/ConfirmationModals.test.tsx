// SuperAdmin — Test ConfirmationModals component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmationModals } from '../../components/ConfirmationModals';
import type { ConfirmationModalsProps } from '../../components/ConfirmationModals';

function createProps(overrides: Partial<ConfirmationModalsProps> = {}): ConfirmationModalsProps {
  return {
    pendingStatusChange: null,
    setPendingStatusChange: vi.fn(),
    executeUserStatusChange: vi.fn(),
    pendingDeviceAction: null,
    setPendingDeviceAction: vi.fn(),
    executeDeviceSave: vi.fn(),
    executeDeviceReset: vi.fn(),
    executeForceReEnroll: vi.fn(),
    executeForceSync: vi.fn(),
    pendingAdminUser: null,
    adminVerificationReason: '',
    createUserError: '',
    createUserLoading: false,
    setPendingAdminUser: vi.fn(),
    setAdminVerificationReason: vi.fn(),
    setCreateUserError: vi.fn(),
    confirmAdminUserCreation: vi.fn(),
    pendingSupplierSuspend: null,
    suspendReason: '',
    supplierSuspendLoading: false,
    supplierActionError: '',
    setPendingSupplierSuspend: vi.fn(),
    setSuspendReason: vi.fn(),
    executeSupplierStatusChange: vi.fn(),
    pendingStoreSuspend: null,
    storeSuspendReason: '',
    storeSuspendLoading: false,
    storeSuspendError: '',
    setPendingStoreSuspend: vi.fn(),
    setStoreSuspendReason: vi.fn(),
    executeStoreStatusChange: vi.fn(),
    ...overrides,
  };
}

describe('ConfirmationModals', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders nothing when all modals are null', () => {
    const { container } = render(<ConfirmationModals {...createProps()} />);
    expect(container.querySelector('.modalOverlay')).toBeNull();
  });

  // ── User Suspension Modal ──
  describe('User Suspension Modal', () => {
    it('renders when pendingStatusChange is suspended', () => {
      render(<ConfirmationModals {...createProps({
        pendingStatusChange: { userId: 'u1', newStatus: 'suspended', userName: 'Alice' },
      })} />);
      expect(screen.getByText('Confirm User Suspension')).toBeTruthy();
      expect(screen.getByText(/Alice/)).toBeTruthy();
    });

    it('does not render for non-suspended status', () => {
      render(<ConfirmationModals {...createProps({
        pendingStatusChange: { userId: 'u1', newStatus: 'active' },
      })} />);
      expect(screen.queryByText('Confirm User Suspension')).toBeNull();
    });

    it('calls executeUserStatusChange on Suspend User click', () => {
      const exec = vi.fn();
      render(<ConfirmationModals {...createProps({
        pendingStatusChange: { userId: 'u1', newStatus: 'suspended' },
        executeUserStatusChange: exec,
      })} />);
      fireEvent.click(screen.getByText('Suspend User'));
      expect(exec).toHaveBeenCalledWith('u1', 'suspended');
    });

    it('calls setPendingStatusChange(null) on Cancel', () => {
      const setChange = vi.fn();
      render(<ConfirmationModals {...createProps({
        pendingStatusChange: { userId: 'u1', newStatus: 'suspended' },
        setPendingStatusChange: setChange,
      })} />);
      fireEvent.click(screen.getByText('Cancel'));
      expect(setChange).toHaveBeenCalledWith(null);
    });
  });

  // ── Device Action Modal ──
  describe('Device Action Modal', () => {
    it('renders deactivate modal', () => {
      render(<ConfirmationModals {...createProps({
        pendingDeviceAction: { deviceId: 'd1', deviceLabel: 'POS-1', action: 'deactivate' },
      })} />);
      expect(screen.getByText('Confirm Device Deactivation')).toBeTruthy();
      expect(screen.getByText(/POS-1/)).toBeTruthy();
    });

    it('renders token reset modal', () => {
      render(<ConfirmationModals {...createProps({
        pendingDeviceAction: { deviceId: 'd1', deviceLabel: 'POS-1', action: 'resetToken' },
      })} />);
      expect(screen.getByText('Confirm Token Reset')).toBeTruthy();
    });

    it('calls executeDeviceSave on deactivate confirm', () => {
      const save = vi.fn();
      render(<ConfirmationModals {...createProps({
        pendingDeviceAction: { deviceId: 'd1', action: 'deactivate' },
        executeDeviceSave: save,
      })} />);
      fireEvent.click(screen.getByText('Deactivate Device'));
      expect(save).toHaveBeenCalledWith('d1');
    });

    it('calls executeDeviceReset on reset confirm', () => {
      const reset = vi.fn();
      render(<ConfirmationModals {...createProps({
        pendingDeviceAction: { deviceId: 'd1', action: 'resetToken' },
        executeDeviceReset: reset,
      })} />);
      fireEvent.click(screen.getByText('Reset Token'));
      expect(reset).toHaveBeenCalledWith('d1');
    });

    // SA-P2-001: Force Re-Enroll modal
    it('renders force re-enroll modal', () => {
      render(<ConfirmationModals {...createProps({
        pendingDeviceAction: { deviceId: 'd1', deviceLabel: 'POS-1', action: 'forceReEnroll' },
      })} />);
      expect(screen.getByText('Confirm Force Re-Enrollment')).toBeTruthy();
      expect(screen.getByText(/POS-1/)).toBeTruthy();
      expect(screen.getByText(/deregister the device/)).toBeTruthy();
    });

    it('calls executeForceReEnroll on force re-enroll confirm', () => {
      const exec = vi.fn();
      render(<ConfirmationModals {...createProps({
        pendingDeviceAction: { deviceId: 'd1', action: 'forceReEnroll' },
        executeForceReEnroll: exec,
      })} />);
      fireEvent.click(screen.getByText('Force Re-Enroll'));
      expect(exec).toHaveBeenCalledWith('d1');
    });

    it('shows Processing... for force re-enroll when loading', () => {
      render(<ConfirmationModals {...createProps({
        pendingDeviceAction: { deviceId: 'd1', action: 'forceReEnroll' },
        deviceActionLoading: true,
      })} />);
      expect(screen.getByText('Processing...')).toBeTruthy();
    });
  });

  // ── SA-P2-005: Force Sync Modal ──
  describe('Force Sync Modal', () => {
    it('renders force sync confirmation modal', () => {
      render(<ConfirmationModals {...createProps({
        pendingDeviceAction: { deviceId: 'd1', deviceLabel: 'POS-1', action: 'forceSync' },
      })} />);
      expect(screen.getByText('Confirm Force Sync')).toBeTruthy();
      expect(screen.getByText(/POS-1/)).toBeTruthy();
      expect(screen.getByText(/full data sync/)).toBeTruthy();
    });

    it('calls executeForceSync on confirm', () => {
      const exec = vi.fn();
      render(<ConfirmationModals {...createProps({
        pendingDeviceAction: { deviceId: 'd1', action: 'forceSync' },
        executeForceSync: exec,
      })} />);
      fireEvent.click(screen.getByText('Queue Force Sync'));
      expect(exec).toHaveBeenCalledWith('d1');
    });

    it('shows Processing... when loading', () => {
      render(<ConfirmationModals {...createProps({
        pendingDeviceAction: { deviceId: 'd1', action: 'forceSync' },
        deviceActionLoading: true,
      })} />);
      expect(screen.getByText('Processing...')).toBeTruthy();
    });

    it('uses non-danger button style for force sync', () => {
      render(<ConfirmationModals {...createProps({
        pendingDeviceAction: { deviceId: 'd1', action: 'forceSync' },
      })} />);
      const btn = screen.getByText('Queue Force Sync');
      expect(btn.className).toContain('tab');
      expect(btn.className).not.toContain('btnDanger');
    });
  });

  // ── Admin User Modal ──
  describe('Admin User Verification Modal', () => {
    it('renders when pendingAdminUser is set', () => {
      render(<ConfirmationModals {...createProps({
        pendingAdminUser: { name: 'Bob', email: 'bob@test.com', phone: '1234567890', actor_type: 'platform' },
      })} />);
      expect(screen.getByText('Confirm Platform Admin Creation')).toBeTruthy();
      expect(screen.getByText('Bob')).toBeTruthy();
      expect(screen.getByText('bob@test.com')).toBeTruthy();
    });

    it('disables confirm when reason is too short', () => {
      render(<ConfirmationModals {...createProps({
        pendingAdminUser: { name: 'Bob', actor_type: 'platform' },
        adminVerificationReason: 'short',
      })} />);
      const btn = screen.getByText('Confirm & Create Admin');
      expect(btn).toHaveProperty('disabled', true);
    });

    it('enables confirm when reason is 10+ chars', () => {
      render(<ConfirmationModals {...createProps({
        pendingAdminUser: { name: 'Bob', actor_type: 'platform' },
        adminVerificationReason: 'This is a valid reason',
      })} />);
      const btn = screen.getByText('Confirm & Create Admin');
      expect(btn).toHaveProperty('disabled', false);
    });

    it('calls confirmAdminUserCreation on confirm', () => {
      const confirm = vi.fn();
      render(<ConfirmationModals {...createProps({
        pendingAdminUser: { name: 'Bob', actor_type: 'platform' },
        adminVerificationReason: 'Valid reason here',
        confirmAdminUserCreation: confirm,
      })} />);
      fireEvent.click(screen.getByText('Confirm & Create Admin'));
      expect(confirm).toHaveBeenCalled();
    });

    it('shows createUserError', () => {
      render(<ConfirmationModals {...createProps({
        pendingAdminUser: { name: 'Bob', actor_type: 'platform' },
        createUserError: 'Admin creation failed',
      })} />);
      expect(screen.getByText('Admin creation failed')).toBeTruthy();
    });

    it('shows Creating... when loading', () => {
      render(<ConfirmationModals {...createProps({
        pendingAdminUser: { name: 'Bob', actor_type: 'platform' },
        adminVerificationReason: 'Valid reason here',
        createUserLoading: true,
      })} />);
      expect(screen.getByText('Creating...')).toBeTruthy();
    });
  });

  // ── Supplier Suspend Modal ──
  describe('Supplier Suspend Modal', () => {
    it('renders suspend modal', () => {
      render(<ConfirmationModals {...createProps({
        pendingSupplierSuspend: { supplierId: 'sup1', businessName: 'Fresh Farms', action: 'suspend' },
      })} />);
      expect(screen.getByText('Confirm Supplier Suspension')).toBeTruthy();
      expect(screen.getByText(/Fresh Farms/)).toBeTruthy();
    });

    it('renders reactivate modal', () => {
      render(<ConfirmationModals {...createProps({
        pendingSupplierSuspend: { supplierId: 'sup1', businessName: 'Fresh Farms', action: 'reactivate' },
      })} />);
      expect(screen.getByText('Confirm Supplier Reactivation')).toBeTruthy();
    });

    it('disables suspend when reason too short', () => {
      render(<ConfirmationModals {...createProps({
        pendingSupplierSuspend: { supplierId: 'sup1', businessName: 'Farm', action: 'suspend' },
        suspendReason: 'short',
      })} />);
      const btn = screen.getByText('Suspend Supplier');
      expect(btn).toHaveProperty('disabled', true);
    });

    it('calls executeSupplierStatusChange on confirm', () => {
      const exec = vi.fn();
      render(<ConfirmationModals {...createProps({
        pendingSupplierSuspend: { supplierId: 'sup1', businessName: 'Farm', action: 'reactivate' },
        executeSupplierStatusChange: exec,
      })} />);
      fireEvent.click(screen.getByText('Reactivate Supplier'));
      expect(exec).toHaveBeenCalled();
    });

    it('shows supplier action error', () => {
      render(<ConfirmationModals {...createProps({
        pendingSupplierSuspend: { supplierId: 'sup1', businessName: 'Farm', action: 'suspend' },
        supplierActionError: 'Suspension failed',
      })} />);
      expect(screen.getByText('Suspension failed')).toBeTruthy();
    });
  });

  // ── Store Suspend Modal ──
  describe('Store Suspend Modal', () => {
    it('renders suspend modal', () => {
      render(<ConfirmationModals {...createProps({
        pendingStoreSuspend: { storeId: 'st1', storeName: 'Main Street Store', action: 'suspend' },
      })} />);
      expect(screen.getByText('Confirm Store Suspension')).toBeTruthy();
      expect(screen.getByText(/Main Street Store/)).toBeTruthy();
    });

    it('renders reactivate modal', () => {
      render(<ConfirmationModals {...createProps({
        pendingStoreSuspend: { storeId: 'st1', storeName: 'Store X', action: 'reactivate' },
      })} />);
      expect(screen.getByText('Confirm Store Reactivation')).toBeTruthy();
    });

    it('disables suspend when reason too short', () => {
      render(<ConfirmationModals {...createProps({
        pendingStoreSuspend: { storeId: 'st1', storeName: 'Store', action: 'suspend' },
        storeSuspendReason: 'short',
      })} />);
      const btn = screen.getByText('Suspend Store');
      expect(btn).toHaveProperty('disabled', true);
    });

    it('calls executeStoreStatusChange on confirm', () => {
      const exec = vi.fn();
      render(<ConfirmationModals {...createProps({
        pendingStoreSuspend: { storeId: 'st1', storeName: 'Store', action: 'reactivate' },
        executeStoreStatusChange: exec,
      })} />);
      fireEvent.click(screen.getByText('Reactivate Store'));
      expect(exec).toHaveBeenCalled();
    });

    it('shows store suspend error', () => {
      render(<ConfirmationModals {...createProps({
        pendingStoreSuspend: { storeId: 'st1', storeName: 'Store', action: 'suspend' },
        storeSuspendError: 'Store suspend failed',
      })} />);
      expect(screen.getByText('Store suspend failed')).toBeTruthy();
    });
  });
});
