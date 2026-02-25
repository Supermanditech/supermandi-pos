// Supplier Service Barrel - R7.BE.022
// Split from monolithic supplierService.ts into focused modules.

export {
  searchSuppliersService,
  getStoreSuppliers,
  requestNewSupplier,
  getStoreSupplierRequests,
  validateGstinService,
} from './supplierDiscoveryService';
export type {
  SearchSuppliersInput,
  SearchSuppliersResult,
  RequestSupplierInput,
} from './supplierDiscoveryService';

export {
  linkSupplierToStore,
  updateSupplierLinkService,
  unlinkSupplierService,
  reactivateSupplierLinkService,
} from './supplierLinkLifecycleService';
export type {
  LinkSupplierInput,
  UpdateSupplierLinkInput,
  UnlinkSupplierInput,
} from './supplierLinkLifecycleService';
