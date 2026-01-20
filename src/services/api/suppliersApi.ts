// TICKET-001: Suppliers API for POS
// Fetches VERIFIED suppliers linked to the current store
// Per 10K Store Scale spec: only supplierVerified=true suppliers are visible on POS

import { apiClient } from "./apiClient";

// =============================================================================
// TYPES
// =============================================================================

export interface Supplier {
  id: string;
  supplierCode: string;
  businessName: string;
  tradeName?: string | null;
  gstin: string;
  primaryPhone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  // Store-specific terms
  creditDays: number;
  minOrderValue: number;
  expectedDeliveryDays: number;
  isPreferred: boolean;
  // Verification status (always true for POS - verified-only filter)
  supplierVerified: true;
  supplierAccountId: string;
  verificationSource: 'platform';
  // Legacy fields for backwards compatibility
  name: string;
  phone?: string;
  address?: string;
  isActive: boolean;
}

interface RawPosSupplier {
  id: string;
  supplierCode: string;
  businessName: string;
  tradeName?: string | null;
  gstin: string;
  primaryPhone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  creditDays: number;
  minOrderValue: number;
  expectedDeliveryDays: number;
  isPreferred: boolean;
  supplierVerified: true;
  supplierAccountId: string;
  verificationSource: 'platform';
}

interface GetSuppliersResponse {
  success: boolean;
  data: {
    suppliers: RawPosSupplier[];
  };
  count?: number;
}

interface GetSupplierResponse {
  success: boolean;
  data: Supplier;
}

interface CreateSupplierPayload {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
}

interface UpdateSupplierPayload {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  isActive?: boolean;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

const SUPPLIERS_BASE = "/api/v1/pos/suppliers";

/**
 * Get all VERIFIED suppliers linked to the current store.
 * Requires device token authentication.
 *
 * NOTE: Per 10K Store Scale spec, only verified suppliers
 * (supplierVerified=true) are returned. Local/unverified
 * suppliers are NOT visible on POS.
 */
export async function getSuppliers(): Promise<Supplier[]> {
  try {
    const response = await apiClient.get<GetSuppliersResponse>(SUPPLIERS_BASE);
    // Handle missing data gracefully - return empty array if no suppliers
    // API returns { success: true, data: { suppliers: [...] } }
    const rawSuppliers = response.data?.suppliers ?? [];

    // Map to Supplier interface with legacy field support
    return rawSuppliers.map((s) => ({
      ...s,
      // Legacy fields for backwards compatibility
      name: s.businessName,
      phone: s.primaryPhone ?? undefined,
      address: [s.city, s.state].filter(Boolean).join(', ') || undefined,
      isActive: true, // All returned suppliers are active
    }));
  } catch (error) {
    console.error("[suppliersApi] getSuppliers failed:", error);
    // Return empty array on error to prevent crashes
    return [];
  }
}

/**
 * Get a single supplier by ID.
 */
export async function getSupplier(supplierId: string): Promise<Supplier> {
  try {
    const response = await apiClient.get<GetSupplierResponse>(
      `${SUPPLIERS_BASE}/${supplierId}`
    );
    return response.data;
  } catch (error) {
    console.error("[suppliersApi] getSupplier failed:", error);
    throw error;
  }
}

/**
 * Create a new supplier for the current store.
 */
export async function createSupplier(
  payload: CreateSupplierPayload
): Promise<Supplier> {
  try {
    const response = await apiClient.post<GetSupplierResponse>(
      SUPPLIERS_BASE,
      payload
    );
    return response.data;
  } catch (error) {
    console.error("[suppliersApi] createSupplier failed:", error);
    throw error;
  }
}

/**
 * Update an existing supplier.
 */
export async function updateSupplier(
  supplierId: string,
  payload: UpdateSupplierPayload
): Promise<Supplier> {
  try {
    const response = await apiClient.patch<GetSupplierResponse>(
      `${SUPPLIERS_BASE}/${supplierId}`,
      payload
    );
    return response.data;
  } catch (error) {
    console.error("[suppliersApi] updateSupplier failed:", error);
    throw error;
  }
}

/**
 * Delete a supplier (soft delete - sets isActive=false).
 */
export async function deleteSupplier(supplierId: string): Promise<void> {
  try {
    await apiClient.del(`${SUPPLIERS_BASE}/${supplierId}`);
  } catch (error) {
    console.error("[suppliersApi] deleteSupplier failed:", error);
    throw error;
  }
}
