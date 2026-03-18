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
