// TICKET-001: Suppliers API for POS
// Fetches suppliers linked to the current store

import { apiClient } from "./apiClient";

// =============================================================================
// TYPES
// =============================================================================

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  isActive: boolean;
}

interface GetSuppliersResponse {
  success: boolean;
  data: {
    suppliers: Supplier[];
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
 * Get all suppliers linked to the current store.
 * Requires device token authentication.
 */
export async function getSuppliers(): Promise<Supplier[]> {
  try {
    const response = await apiClient.get<GetSuppliersResponse>(SUPPLIERS_BASE);
    // Handle missing data gracefully - return empty array if no suppliers
    // API returns { success: true, data: { suppliers: [...] } }
    return response.data?.suppliers ?? [];
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
