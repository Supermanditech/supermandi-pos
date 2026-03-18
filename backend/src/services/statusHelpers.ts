/**
 * V3-HARDEN-101: Shared status normalization helpers
 * Canonical vocabulary:
 *   Supplier verification: 'verified' (lowercase in DB) maps to SupplierStatus.ACTIVE
 *   Supplier status field: 'ACTIVE' (uppercase canonical)
 *   Store-supplier link: 'active' (lowercase in DB)
 *   Product approval: 'APPROVED' (uppercase canonical)
 */

/** Check if a supplier is effectively active (handles mixed-case drift) */
export function isSupplierActive(status: string | null | undefined): boolean {
  if (!status) return false;
  const normalized = status.toUpperCase();
  return normalized === "ACTIVE" || normalized === "VERIFIED";
}

/** Check if a supplier verification status is approved */
export function isSupplierVerified(verificationStatus: string | null | undefined): boolean {
  if (!verificationStatus) return false;
  return verificationStatus.toLowerCase() === "verified";
}

/** Check if a store-supplier link is active */
export function isStoreLinkActive(linkStatus: string | null | undefined): boolean {
  if (!linkStatus) return false;
  return linkStatus.toLowerCase() === "active";
}

/** Normalize supplier status for display/comparison */
export function normalizeSupplierStatus(status: string | null | undefined): string {
  if (!status) return "UNKNOWN";
  return status.toUpperCase();
}

// ── SQL helpers for WHERE clauses ──────────────────────────────────────────
// Use these in query builders to eliminate raw status comparisons in routes.

/** SQL fragment: supplier is verified/active (case-insensitive) */
export const SQL_SUPPLIER_IS_ACTIVE = "UPPER(s.verification_status) IN ('VERIFIED','ACTIVE') OR UPPER(s.status) IN ('ACTIVE','VERIFIED')";

/** SQL fragment: store-supplier link is active (case-insensitive) */
export const SQL_LINK_IS_ACTIVE = "UPPER(ssl.status) = 'ACTIVE'";

/** SQL fragment: supplier status is active (s. alias, case-insensitive) */
export const SQL_STATUS_IS_ACTIVE = "UPPER(s.status) = 'ACTIVE'";

/** SQL fragment: supplier verified for product operations */
export const SQL_SUPPLIER_VERIFIED = "UPPER(s.verification_status) IN ('VERIFIED','ACTIVE')";

/** Canonical status values for INSERT/UPDATE writes */
export const STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  REJECTED: "REJECTED",
  UNVERIFIED: "UNVERIFIED",
  SUSPENDED: "SUSPENDED",
} as const;
