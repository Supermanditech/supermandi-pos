// T-276: KYC Routing Layer
// Collects shared KYC documents once, routes to each provider's verification
// Supports: PAN, Aadhaar, GSTIN, bank statement, GST returns, ITR

import type { Pool, PoolClient } from 'pg';

export type KycDocumentType = 'pan' | 'aadhaar' | 'gstin' | 'bank_statement' | 'gst_returns' | 'itr' | 'business_proof';

export interface KycDocument {
  id: string;
  storeId: string;
  documentType: KycDocumentType;
  documentNumber: string | null;
  verificationStatus: 'pending' | 'submitted' | 'verified' | 'rejected' | 'expired';
  verifiedByProvider: string | null;
  verifiedAt: string | null;
}

export interface KycSubmissionResult {
  documentId: string;
  type: KycDocumentType;
  status: 'submitted' | 'verified' | 'rejected';
  message?: string;
}

/**
 * Upsert a KYC document for a store (shared across providers)
 */
export async function upsertKycDocument(
  pool: Pool,
  storeId: string,
  documentType: KycDocumentType,
  documentNumber: string | null,
  documentData: Record<string, unknown> = {}
): Promise<KycDocument> {
  const result = await pool.query(
    `INSERT INTO payments.kyc_documents (store_id, document_type, document_number, document_data, verification_status)
     VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT (store_id, document_type) DO UPDATE SET
       document_number = COALESCE(EXCLUDED.document_number, payments.kyc_documents.document_number),
       document_data = payments.kyc_documents.document_data || EXCLUDED.document_data,
       verification_status = CASE
         WHEN payments.kyc_documents.verification_status = 'verified' THEN 'verified'
         ELSE 'pending'
       END,
       updated_at = NOW()
     RETURNING id, store_id, document_type, document_number, verification_status, verified_by_provider, verified_at`,
    [storeId, documentType, documentNumber, JSON.stringify(documentData)]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    storeId: row.store_id,
    documentType: row.document_type,
    documentNumber: row.document_number,
    verificationStatus: row.verification_status,
    verifiedByProvider: row.verified_by_provider,
    verifiedAt: row.verified_at,
  };
}

/**
 * Get all KYC documents for a store
 */
export async function getStoreKycDocuments(pool: Pool, storeId: string): Promise<KycDocument[]> {
  const result = await pool.query(
    `SELECT id, store_id, document_type, document_number, verification_status, verified_by_provider, verified_at
     FROM payments.kyc_documents WHERE store_id = $1 ORDER BY document_type`,
    [storeId]
  );
  return result.rows.map(row => ({
    id: row.id,
    storeId: row.store_id,
    documentType: row.document_type,
    documentNumber: row.document_number,
    verificationStatus: row.verification_status,
    verifiedByProvider: row.verified_by_provider,
    verifiedAt: row.verified_at,
  }));
}

/**
 * Check if a store has all required KYC for a given provider
 */
export async function checkKycReadiness(
  pool: Pool,
  storeId: string,
  requiredFields: KycDocumentType[]
): Promise<{ ready: boolean; missing: KycDocumentType[]; verified: KycDocumentType[] }> {
  const docs = await getStoreKycDocuments(pool, storeId);
  const verifiedTypes = docs.filter(d => d.verificationStatus === 'verified').map(d => d.documentType);
  const submittedTypes = docs.filter(d => d.verificationStatus !== 'rejected').map(d => d.documentType);

  const missing = requiredFields.filter(f => !submittedTypes.includes(f));

  return {
    ready: missing.length === 0,
    missing,
    verified: verifiedTypes,
  };
}

/**
 * Record that a KYC document was submitted to a specific provider
 */
export async function recordKycSubmission(
  pool: Pool,
  kycDocumentId: string,
  providerId: string,
  providerRef?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO payments.kyc_provider_submissions (kyc_document_id, provider_id, submission_status, provider_ref, submitted_at)
     VALUES ($1, $2, 'submitted', $3, NOW())
     ON CONFLICT DO NOTHING`,
    [kycDocumentId, providerId, providerRef || null]
  );
}

/**
 * Mark a KYC document as verified (by any provider — shared verification)
 */
export async function markKycVerified(
  pool: Pool,
  storeId: string,
  documentType: KycDocumentType,
  verifiedByProvider: string
): Promise<void> {
  await pool.query(
    `UPDATE payments.kyc_documents
     SET verification_status = 'verified', verified_by_provider = $1, verified_at = NOW(), updated_at = NOW()
     WHERE store_id = $2 AND document_type = $3`,
    [verifiedByProvider, storeId, documentType]
  );
}

/**
 * Validate PAN format (ABCDE1234F)
 */
export function validatePan(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase());
}

/**
 * Validate GSTIN format (22AAAAA0000A1Z5)
 */
export function validateGstin(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$/.test(gstin.toUpperCase());
}

/**
 * Validate IFSC format (SBIN0001234)
 */
export function validateIfsc(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase());
}
