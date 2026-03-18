/**
 * V3-FIX-139: Supplier catalogue participation readiness gate
 *
 * Blocks SKU submission, publish eligibility, and procurement-order acceptance
 * until the supplier meets all legal and operational requirements.
 *
 * Requirements:
 * 1. Email verified (email_verified = true)
 * 2. KYC docs approved (PAN + GSTIN certificate + cancelled cheque)
 * 3. Bank details verified (bank_verification_status = 'verified')
 * 4. Verification status = 'verified' or ACTIVE
 * 5. Has dispatch address (city + state not null)
 */

import type { PoolClient, Pool } from "pg";

export interface ReadinessCheck {
  field: string;
  label: string;
  met: boolean;
  reason?: string;
}

export interface SupplierReadinessResult {
  supplierId: string;
  ready: boolean;
  checks: ReadinessCheck[];
  blockers: string[];
}

/**
 * Check if a supplier meets all catalogue participation requirements.
 */
export async function checkSupplierReadiness(
  pool: Pool | PoolClient,
  supplierId: string
): Promise<SupplierReadinessResult> {
  // 1. Load supplier profile
  const supplierRes = await pool.query(
    `SELECT id, email_verified, verification_status, bank_verification_status,
            city, state, gstin
     FROM supplier.suppliers
     WHERE id = $1`,
    [supplierId]
  );

  if (supplierRes.rows.length === 0) {
    return {
      supplierId,
      ready: false,
      checks: [],
      blockers: ["Supplier not found"],
    };
  }

  const s = supplierRes.rows[0];

  // 2. Load KYC doc statuses
  const kycRes = await pool.query(
    `SELECT document_type, status
     FROM supplier.kyc_documents
     WHERE supplier_id = $1`,
    [supplierId]
  );

  const kycMap = new Map<string, string>();
  for (const row of kycRes.rows) {
    kycMap.set(row.document_type, row.status);
  }

  // 3. Build checks
  const checks: ReadinessCheck[] = [
    {
      field: "email_verified",
      label: "Email verified",
      met: s.email_verified === true,
      reason: s.email_verified ? undefined : "Email not yet verified",
    },
    {
      field: "verification_status",
      label: "SuperAdmin verified",
      met: s.verification_status === "verified" || s.verification_status === "ACTIVE",
      reason: ["verified", "ACTIVE"].includes(s.verification_status) ? undefined : `Current status: ${s.verification_status}`,
    },
    {
      field: "bank_verified",
      label: "Bank details verified",
      met: s.bank_verification_status === "verified",
      reason: s.bank_verification_status === "verified" ? undefined : "Bank not verified",
    },
    {
      field: "pan_card",
      label: "PAN card approved",
      met: kycMap.get("pan_card") === "approved",
      reason: kycMap.get("pan_card") === "approved" ? undefined : `PAN: ${kycMap.get("pan_card") ?? "not uploaded"}`,
    },
    {
      field: "gstin_certificate",
      label: "GSTIN certificate approved",
      met: kycMap.get("gstin_certificate") === "approved",
      reason: kycMap.get("gstin_certificate") === "approved" ? undefined : `GSTIN cert: ${kycMap.get("gstin_certificate") ?? "not uploaded"}`,
    },
    {
      field: "cancelled_cheque",
      label: "Cancelled cheque approved",
      met: kycMap.get("cancelled_cheque") === "approved",
      reason: kycMap.get("cancelled_cheque") === "approved" ? undefined : `Cheque: ${kycMap.get("cancelled_cheque") ?? "not uploaded"}`,
    },
    {
      field: "dispatch_address",
      label: "Dispatch address provided",
      met: Boolean(s.city && s.state),
      reason: (s.city && s.state) ? undefined : "City or state missing",
    },
  ];

  const blockers = checks.filter((c) => !c.met).map((c) => c.reason ?? c.label);

  return {
    supplierId,
    ready: blockers.length === 0,
    checks,
    blockers,
  };
}
