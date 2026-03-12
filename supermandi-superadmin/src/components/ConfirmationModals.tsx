// SA-001: Confirmation modals extracted from App.tsx

interface UserSuspendModalProps {
  pendingStatusChange: { userId: string; newStatus: "active" | "inactive" | "suspended"; userName?: string } | null;
  setPendingStatusChange: (v: null) => void;
  executeUserStatusChange: (userId: string, newStatus: "active" | "inactive" | "suspended") => void;
  userStatusSaving?: Record<string, boolean>;
}

interface DeviceActionModalProps {
  pendingDeviceAction: { deviceId: string; deviceLabel?: string; action: "deactivate" | "resetToken" | "forceReEnroll" | "forceSync" | "revokeToken" } | null;
  setPendingDeviceAction: (v: null) => void;
  executeDeviceSave: (deviceId: string) => void;
  executeDeviceReset: (deviceId: string) => void;
  executeForceReEnroll: (deviceId: string) => void;
  executeForceSync: (deviceId: string) => void;
  deviceActionLoading?: boolean;
}

interface AdminUserModalProps {
  pendingAdminUser: { name: string; email?: string; phone?: string; actor_type: string } | null;
  adminVerificationReason: string;
  createUserError: string;
  createUserLoading: boolean;
  setPendingAdminUser: (v: null) => void;
  setAdminVerificationReason: (v: string) => void;
  setCreateUserError: (v: string) => void;
  confirmAdminUserCreation: () => void;
}

interface SupplierSuspendModalProps {
  pendingSupplierSuspend: { supplierId: string; businessName: string; action: "suspend" | "reactivate" } | null;
  suspendReason: string;
  supplierSuspendLoading: boolean;
  supplierActionError: string;
  setPendingSupplierSuspend: (v: null) => void;
  setSuspendReason: (v: string) => void;
  executeSupplierStatusChange: () => void;
}

interface StoreSuspendModalProps {
  pendingStoreSuspend: { storeId: string; storeName: string; action: "suspend" | "reactivate" } | null;
  storeSuspendReason: string;
  storeSuspendLoading: boolean;
  storeSuspendError: string;
  setPendingStoreSuspend: (v: null) => void;
  setStoreSuspendReason: (v: string) => void;
  executeStoreStatusChange: () => void;
}

export type ConfirmationModalsProps = UserSuspendModalProps & DeviceActionModalProps & AdminUserModalProps & SupplierSuspendModalProps & StoreSuspendModalProps;

export function ConfirmationModals(props: ConfirmationModalsProps) {
  return (
    <>
      {/* GL-CRIT-0021: User Suspension Confirmation Modal */}
      {props.pendingStatusChange && props.pendingStatusChange.newStatus === "suspended" && (
        <div className="modalOverlay" onClick={() => props.setPendingStatusChange(null)} onKeyDown={(e) => { if (e.key === "Escape") props.setPendingStatusChange(null); }}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader"><h3>Confirm User Suspension</h3></div>
            <div className="modalBody">
              <p>Are you sure you want to suspend user <strong>{props.pendingStatusChange.userName || props.pendingStatusChange.userId}</strong>?</p>
              <p className="muted">This action will prevent the user from accessing the system.</p>
            </div>
            <div className="modalFooter">
              <button className="btnGhost" onClick={() => props.setPendingStatusChange(null)} disabled={props.userStatusSaving?.[props.pendingStatusChange!.userId]}>Cancel</button>
              <button className="btnDanger" onClick={() => props.executeUserStatusChange(props.pendingStatusChange!.userId, props.pendingStatusChange!.newStatus)} disabled={props.userStatusSaving?.[props.pendingStatusChange!.userId]}>
                {props.userStatusSaving?.[props.pendingStatusChange!.userId] ? "Suspending..." : "Suspend User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GL-CRIT-0022 & GL-CRIT-0052 & SA-P2-001: Device Action Confirmation Modal */}
      {props.pendingDeviceAction && (
        <div className="modalOverlay" onClick={() => props.setPendingDeviceAction(null)} onKeyDown={(e) => { if (e.key === "Escape" && !props.deviceActionLoading) props.setPendingDeviceAction(null); }}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h3>{props.pendingDeviceAction.action === "deactivate" ? "Confirm Device Deactivation" : props.pendingDeviceAction.action === "forceReEnroll" ? "Confirm Force Re-Enrollment" : props.pendingDeviceAction.action === "forceSync" ? "Confirm Force Sync" : "Confirm Token Reset"}</h3>
            </div>
            <div className="modalBody">
              {props.pendingDeviceAction.action === "deactivate" ? (
                <>
                  <p>Are you sure you want to deactivate device <strong>{props.pendingDeviceAction.deviceLabel}</strong>?</p>
                  <p className="muted">This will prevent the device from accessing the system until reactivated.</p>
                </>
              ) : props.pendingDeviceAction.action === "forceReEnroll" ? (
                <>
                  <p>Are you sure you want to force re-enrollment for device <strong>{props.pendingDeviceAction.deviceLabel}</strong>?</p>
                  <p className="muted sa-text-amber">This will deregister the device and require re-enrollment. The device will immediately lose access and must scan a new enrollment QR code to reconnect.</p>
                </>
              ) : props.pendingDeviceAction.action === "forceSync" ? (
                <>
                  <p>Queue a force sync for device <strong>{props.pendingDeviceAction.deviceLabel}</strong>?</p>
                  <p className="muted">The device will perform a full data sync (products, stock, settings) on its next check-in. This is safe and non-destructive.</p>
                </>
              ) : (
                <>
                  <p>Are you sure you want to reset the token for device <strong>{props.pendingDeviceAction.deviceLabel}</strong>?</p>
                  <p className="muted">The device will need to be re-enrolled with a new QR code.</p>
                </>
              )}
            </div>
            <div className="modalFooter">
              <button className="btnGhost" onClick={() => props.setPendingDeviceAction(null)} disabled={props.deviceActionLoading}>Cancel</button>
              <button className={props.pendingDeviceAction.action === "forceSync" ? "tab" : "btnDanger"} disabled={props.deviceActionLoading} onClick={() => {
                if (props.pendingDeviceAction!.action === "deactivate") {
                  props.executeDeviceSave(props.pendingDeviceAction!.deviceId);
                } else if (props.pendingDeviceAction!.action === "forceReEnroll") {
                  props.executeForceReEnroll(props.pendingDeviceAction!.deviceId);
                } else if (props.pendingDeviceAction!.action === "forceSync") {
                  props.executeForceSync(props.pendingDeviceAction!.deviceId);
                } else {
                  props.executeDeviceReset(props.pendingDeviceAction!.deviceId);
                }
              }}>
                {props.deviceActionLoading ? "Processing..." : props.pendingDeviceAction.action === "deactivate" ? "Deactivate Device" : props.pendingDeviceAction.action === "forceReEnroll" ? "Force Re-Enroll" : props.pendingDeviceAction.action === "forceSync" ? "Queue Force Sync" : "Reset Token"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GL-CRIT-0053: Admin User Verification Modal */}
      {props.pendingAdminUser && (
        <div className="modalOverlay" onClick={() => props.setPendingAdminUser(null)} onKeyDown={(e) => { if (e.key === "Escape" && !props.createUserLoading) props.setPendingAdminUser(null); }}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader"><h3>Confirm Platform Admin Creation</h3></div>
            <div className="modalBody">
              <p>You are about to create a <strong>Platform Admin</strong> user:</p>
              <ul className="sa-modal-list">
                <li><strong>Name:</strong> {props.pendingAdminUser.name}</li>
                {props.pendingAdminUser.email && <li><strong>Email:</strong> {props.pendingAdminUser.email}</li>}
                {props.pendingAdminUser.phone && <li><strong>Phone:</strong> {props.pendingAdminUser.phone}</li>}
              </ul>
              <p className="muted sa-text-amber">Platform admins have full system access. This action is logged for audit compliance.</p>
              <div className="control sa-mt-12">
                <label>Reason for creating this admin user *</label>
                <textarea value={props.adminVerificationReason} onChange={(e) => props.setAdminVerificationReason(e.target.value)} placeholder="Enter reason (minimum 10 characters)..." rows={3} className="sa-w-full" />
              </div>
              {props.createUserError && <p className="errorText sa-mt-8">{props.createUserError}</p>}
            </div>
            <div className="modalFooter">
              <button className="btnGhost" onClick={() => { props.setPendingAdminUser(null); props.setCreateUserError(""); }}>Cancel</button>
              <button className="btnDanger" onClick={props.confirmAdminUserCreation} disabled={props.createUserLoading || props.adminVerificationReason.trim().length < 10}>
                {props.createUserLoading ? "Creating..." : "Confirm & Create Admin"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SA-P1-005: Supplier Suspension/Reactivation Confirmation Modal */}
      {props.pendingSupplierSuspend && (
        <div className="modalOverlay" onClick={() => { if (!props.supplierSuspendLoading) props.setPendingSupplierSuspend(null); }} onKeyDown={(e) => { if (e.key === "Escape" && !props.supplierSuspendLoading) props.setPendingSupplierSuspend(null); }}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h3>{props.pendingSupplierSuspend.action === "suspend" ? "Confirm Supplier Suspension" : "Confirm Supplier Reactivation"}</h3>
            </div>
            <div className="modalBody">
              {props.pendingSupplierSuspend.action === "suspend" ? (
                <>
                  <p>Are you sure you want to suspend <strong>{props.pendingSupplierSuspend.businessName}</strong>?</p>
                  <p className="muted sa-text-amber">This will block supplier login, revoke active sessions, and hide them from retailer/POS lists.</p>
                  <div className="control sa-mt-12">
                    <label>Reason for suspension (required)</label>
                    <textarea value={props.suspendReason} onChange={(e) => props.setSuspendReason(e.target.value)} placeholder="Enter reason (minimum 10 characters)..." rows={3} className="sa-w-full" />
                  </div>
                </>
              ) : (
                <>
                  <p>Are you sure you want to reactivate <strong>{props.pendingSupplierSuspend.businessName}</strong>?</p>
                  <p className="muted">This will restore supplier login access and visibility in retailer/POS lists.</p>
                </>
              )}
              {props.supplierActionError && <p className="errorText sa-mt-8">{props.supplierActionError}</p>}
            </div>
            <div className="modalFooter">
              <button className="btnGhost" onClick={() => props.setPendingSupplierSuspend(null)} disabled={props.supplierSuspendLoading}>Cancel</button>
              {props.pendingSupplierSuspend.action === "suspend" ? (
                <button className="btnDanger" onClick={props.executeSupplierStatusChange} disabled={props.supplierSuspendLoading || props.suspendReason.trim().length < 10}>
                  {props.supplierSuspendLoading ? "Suspending..." : "Suspend Supplier"}
                </button>
              ) : (
                <button className="sa-btn-reactivate" onClick={props.executeSupplierStatusChange} disabled={props.supplierSuspendLoading}>
                  {props.supplierSuspendLoading ? "Reactivating..." : "Reactivate Supplier"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SA-P0-001: Store Suspension/Reactivation Confirmation Modal */}
      {props.pendingStoreSuspend && (
        <div className="modalOverlay" onClick={() => { if (!props.storeSuspendLoading) props.setPendingStoreSuspend(null); }} onKeyDown={(e) => { if (e.key === "Escape" && !props.storeSuspendLoading) props.setPendingStoreSuspend(null); }}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h3>{props.pendingStoreSuspend.action === "suspend" ? "Confirm Store Suspension" : "Confirm Store Reactivation"}</h3>
            </div>
            <div className="modalBody">
              {props.pendingStoreSuspend.action === "suspend" ? (
                <>
                  <p>Are you sure you want to suspend <strong>{props.pendingStoreSuspend.storeName}</strong>?</p>
                  <p className="muted sa-text-amber">This will immediately block all POS transactions for this store. The store's devices will show a "Suspended" screen.</p>
                  <div className="control sa-mt-12">
                    <label>Reason for suspension (required)</label>
                    <textarea value={props.storeSuspendReason} onChange={(e) => props.setStoreSuspendReason(e.target.value)} placeholder="Enter reason (minimum 10 characters)..." rows={3} className="sa-w-full" />
                  </div>
                </>
              ) : (
                <>
                  <p>Are you sure you want to reactivate <strong>{props.pendingStoreSuspend.storeName}</strong>?</p>
                  <p className="muted">This will restore POS transactions and normal operations for this store.</p>
                </>
              )}
              {props.storeSuspendError && <p className="errorText sa-mt-8">{props.storeSuspendError}</p>}
            </div>
            <div className="modalFooter">
              <button className="btnGhost" onClick={() => props.setPendingStoreSuspend(null)} disabled={props.storeSuspendLoading}>Cancel</button>
              {props.pendingStoreSuspend.action === "suspend" ? (
                <button className="btnDanger" onClick={props.executeStoreStatusChange} disabled={props.storeSuspendLoading || props.storeSuspendReason.trim().length < 10}>
                  {props.storeSuspendLoading ? "Suspending..." : "Suspend Store"}
                </button>
              ) : (
                <button className="sa-btn-reactivate" onClick={props.executeStoreStatusChange} disabled={props.storeSuspendLoading}>
                  {props.storeSuspendLoading ? "Reactivating..." : "Reactivate Store"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
