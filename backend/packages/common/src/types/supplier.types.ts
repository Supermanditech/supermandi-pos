// Supplier types - V3.0.9 compliant

import { UUID, BaseEntity } from './base';

// Verification status
export type VerificationStatus = 'pending' | 'verified' | 'rejected';

// Supplier status
export type SupplierStatus = 'active' | 'inactive' | 'suspended';

// Supplier entity (supplier.suppliers)
export interface Supplier extends BaseEntity {
  gstin: string;
  pan?: string;
  businessName: string;
  tradeName?: string;
  businessType?: string;
  primaryContactName?: string;
  primaryPhone?: string;
  primaryEmail?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  verificationStatus: VerificationStatus;
  verifiedByUserId?: UUID;
  verifiedAt?: Date;
  rating: number;
  status: SupplierStatus;
}

// Supplier-Store link status
export type LinkStatus = 'active' | 'inactive';

// Supplier-Store link (supplier.supplier_store_links)
export interface SupplierStoreLink extends BaseEntity {
  supplierId: UUID;
  storeId: UUID;
  status: LinkStatus;
  creditDays: number;
  minOrderValue: number;
  expectedDeliveryDays: number;
  priority: number;
  isPreferred: boolean;
  linkedByUserId?: UUID;
}

// Supplier request status
export type SupplierRequestStatus = 'pending' | 'approved' | 'rejected';

// Supplier request (supplier.supplier_requests)
export interface SupplierRequest extends BaseEntity {
  storeId: UUID;
  requestedGstin?: string;
  requestedName?: string;
  requestedPhone?: string;
  requestedEmail?: string;
  status: SupplierRequestStatus;
  createdByUserId?: UUID;
  reviewedByUserId?: UUID;
  reviewedAt?: Date;
  reviewNotes?: string;
}

// Supplier with link info (for store context)
export interface SupplierWithLink extends Supplier {
  link: SupplierStoreLink;
}
