// Retailer Admin Queries - Portal Management
// Database operations for retailer portal, store users, compliance docs, and CSV imports

import { query } from '@supermandi/common';

// =============================================================================
// TYPES
// =============================================================================

export interface StoreUser {
  id: string;
  store_id: string;
  user_id: string;
  role: string;
  is_owner: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ComplianceDocument {
  id: string;
  store_id: string;
  document_type: string;
  file_name: string;
  gcs_bucket: string;
  gcs_object_key: string;
  mime_type: string;
  file_size: number;
  file_sha256: string;
  status: 'pending' | 'uploaded' | 'verified' | 'rejected';
  rejection_reason: string | null;
  uploaded_at: Date | null;
  uploaded_by_user_id: string | null;
  verified_by_user_id: string | null;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CsvImport {
  id: string;
  store_id: string;
  file_name: string;
  file_sha256: string;
  gcs_bucket: string | null;
  gcs_object_key: string | null;
  import_mode: 'replace' | 'merge' | 'skipExisting';
  status: 'pending' | 'validating' | 'validated' | 'committing' | 'committed' | 'failed';
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  products_created: number;
  products_updated: number;
  suppliers_created: number;
  validation_errors: ValidationError[] | null;
  uploaded_by_user_id: string;
  validated_at: Date | null;
  committed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ValidationError {
  row: number;
  field: string;
  error: string;
}

export interface ImpersonationLog {
  id: string;
  admin_user_id: string;
  target_store_id: string;
  ip_address: string | null;
  user_agent: string | null;
  token_expires_at: Date;
  created_at: Date;
}

export interface RetailerPortalInfo {
  retailer_portal_enabled: boolean;
  retailer_portal_phone: string | null;
  retailer_portal_enabled_at: Date | null;
  retailer_portal_enabled_by: string | null;
}

// =============================================================================
// STORE USERS
// =============================================================================

/**
 * Get store user by user ID and store ID
 */
export async function getStoreUser(
  storeId: string,
  userId: string
): Promise<StoreUser | null> {
  const result = await query<StoreUser>(
    `SELECT * FROM auth.store_users
     WHERE store_id = $1 AND user_id = $2`,
    [storeId, userId]
  );
  return result[0] || null;
}

/**
 * Get store user by user ID (for JWT claims lookup)
 */
export async function getStoreUserByUserId(userId: string): Promise<StoreUser | null> {
  const result = await query<StoreUser>(
    `SELECT * FROM auth.store_users
     WHERE user_id = $1 AND is_active = true
     ORDER BY is_owner DESC, created_at ASC
     LIMIT 1`,
    [userId]
  );
  return result[0] || null;
}

/**
 * Get all store users for a store
 */
export async function getStoreUsers(storeId: string): Promise<StoreUser[]> {
  const result = await query<StoreUser>(
    `SELECT * FROM auth.store_users
     WHERE store_id = $1
     ORDER BY is_owner DESC, created_at ASC`,
    [storeId]
  );
  return result;
}

/**
 * Create a store user
 */
export async function createStoreUser(params: {
  storeId: string;
  userId: string;
  role: string;
  isOwner: boolean;
  createdBy?: string;
}): Promise<StoreUser> {
  const result = await query<StoreUser>(
    `INSERT INTO auth.store_users (store_id, user_id, role, is_owner, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [params.storeId, params.userId, params.role, params.isOwner, params.createdBy || null]
  );
  return result[0]!;
}

/**
 * Update store user status
 */
export async function updateStoreUserStatus(
  id: string,
  isActive: boolean
): Promise<StoreUser | null> {
  const result = await query<StoreUser>(
    `UPDATE auth.store_users
     SET is_active = $2
     WHERE id = $1
     RETURNING *`,
    [id, isActive]
  );
  return result[0] || null;
}

/**
 * Delete store user
 */
export async function deleteStoreUser(storeId: string, userId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM auth.store_users WHERE store_id = $1 AND user_id = $2`,
    [storeId, userId]
  );
  return result.length > 0;
}

// =============================================================================
// RETAILER PORTAL SETTINGS
// =============================================================================

/**
 * Get retailer portal info for a store
 */
export async function getRetailerPortalInfo(storeId: string): Promise<RetailerPortalInfo | null> {
  const result = await query<RetailerPortalInfo>(
    `SELECT retailer_portal_enabled, retailer_portal_phone,
            retailer_portal_enabled_at, retailer_portal_enabled_by
     FROM platform.stores
     WHERE id = $1`,
    [storeId]
  );
  return result[0] || null;
}

/**
 * Enable retailer portal for a store
 */
export async function enableRetailerPortal(params: {
  storeId: string;
  phone: string;
  enabledBy: string;
}): Promise<void> {
  await query(
    `UPDATE platform.stores
     SET retailer_portal_enabled = true,
         retailer_portal_phone = $2,
         retailer_portal_enabled_at = NOW(),
         retailer_portal_enabled_by = $3
     WHERE id = $1`,
    [params.storeId, params.phone, params.enabledBy]
  );
}

/**
 * Update retailer portal phone
 */
export async function updateRetailerPortalPhone(
  storeId: string,
  phone: string
): Promise<void> {
  await query(
    `UPDATE platform.stores
     SET retailer_portal_phone = $2
     WHERE id = $1`,
    [storeId, phone]
  );
}

/**
 * Disable retailer portal for a store
 */
export async function disableRetailerPortal(storeId: string): Promise<void> {
  await query(
    `UPDATE platform.stores
     SET retailer_portal_enabled = false
     WHERE id = $1`,
    [storeId]
  );
}

// =============================================================================
// COMPLIANCE DOCUMENTS
// =============================================================================

/**
 * Create a compliance document record (pending upload)
 */
export async function createComplianceDocument(params: {
  storeId: string;
  documentType: string;
  fileName: string;
  gcsBucket: string;
  gcsObjectKey: string;
  mimeType: string;
  fileSize: number;
  fileSha256: string;
  uploadedByUserId: string;
}): Promise<ComplianceDocument> {
  const result = await query<ComplianceDocument>(
    `INSERT INTO platform.compliance_documents
     (store_id, document_type, file_name, gcs_bucket, gcs_object_key,
      mime_type, file_size, file_sha256, uploaded_by_user_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     RETURNING *`,
    [
      params.storeId,
      params.documentType,
      params.fileName,
      params.gcsBucket,
      params.gcsObjectKey,
      params.mimeType,
      params.fileSize,
      params.fileSha256,
      params.uploadedByUserId,
    ]
  );
  return result[0]!;
}

/**
 * Confirm compliance document upload
 */
export async function confirmComplianceDocumentUpload(id: string): Promise<ComplianceDocument | null> {
  const result = await query<ComplianceDocument>(
    `UPDATE platform.compliance_documents
     SET status = 'uploaded', uploaded_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id]
  );
  return result[0] || null;
}

/**
 * Get compliance documents for a store
 */
export async function getComplianceDocuments(storeId: string): Promise<ComplianceDocument[]> {
  const result = await query<ComplianceDocument>(
    `SELECT * FROM platform.compliance_documents
     WHERE store_id = $1
     ORDER BY created_at DESC`,
    [storeId]
  );
  return result;
}

/**
 * Get compliance document by ID
 */
export async function getComplianceDocumentById(id: string): Promise<ComplianceDocument | null> {
  const result = await query<ComplianceDocument>(
    `SELECT * FROM platform.compliance_documents WHERE id = $1`,
    [id]
  );
  return result[0] || null;
}

/**
 * Verify or reject a compliance document (SuperAdmin)
 */
export async function updateComplianceDocumentStatus(params: {
  id: string;
  status: 'verified' | 'rejected';
  rejectionReason?: string;
  verifiedByUserId: string;
}): Promise<ComplianceDocument | null> {
  const result = await query<ComplianceDocument>(
    `UPDATE platform.compliance_documents
     SET status = $2,
         rejection_reason = $3,
         verified_by_user_id = $4,
         verified_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [params.id, params.status, params.rejectionReason || null, params.verifiedByUserId]
  );
  return result[0] || null;
}

// =============================================================================
// CSV IMPORTS
// =============================================================================

/**
 * Create a CSV import job
 */
export async function createCsvImport(params: {
  storeId: string;
  fileName: string;
  fileSha256: string;
  gcsBucket?: string;
  gcsObjectKey?: string;
  importMode: 'replace' | 'merge' | 'skipExisting';
  uploadedByUserId: string;
}): Promise<CsvImport> {
  const result = await query<CsvImport>(
    `INSERT INTO platform.csv_imports
     (store_id, file_name, file_sha256, gcs_bucket, gcs_object_key,
      import_mode, uploaded_by_user_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING *`,
    [
      params.storeId,
      params.fileName,
      params.fileSha256,
      params.gcsBucket || null,
      params.gcsObjectKey || null,
      params.importMode,
      params.uploadedByUserId,
    ]
  );
  return result[0]!;
}

/**
 * Check for duplicate CSV import (same file hash)
 */
export async function checkDuplicateCsvImport(
  storeId: string,
  fileSha256: string
): Promise<CsvImport | null> {
  const result = await query<CsvImport>(
    `SELECT * FROM platform.csv_imports
     WHERE store_id = $1 AND file_sha256 = $2 AND status = 'committed'
     ORDER BY created_at DESC
     LIMIT 1`,
    [storeId, fileSha256]
  );
  return result[0] || null;
}

/**
 * Get CSV import by ID
 */
export async function getCsvImportById(id: string): Promise<CsvImport | null> {
  const result = await query<CsvImport>(
    `SELECT * FROM platform.csv_imports WHERE id = $1`,
    [id]
  );
  return result[0] || null;
}

/**
 * Get CSV imports for a store
 */
export async function getCsvImports(storeId: string, limit = 20): Promise<CsvImport[]> {
  const result = await query<CsvImport>(
    `SELECT * FROM platform.csv_imports
     WHERE store_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [storeId, limit]
  );
  return result;
}

/**
 * Update CSV import status to validating
 */
export async function startCsvValidation(id: string): Promise<CsvImport | null> {
  const result = await query<CsvImport>(
    `UPDATE platform.csv_imports
     SET status = 'validating'
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id]
  );
  return result[0] || null;
}

/**
 * Update CSV import with validation results
 */
export async function completeCsvValidation(params: {
  id: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  validationErrors: ValidationError[] | null;
}): Promise<CsvImport | null> {
  const status = params.errorRows > 0 ? 'validated' : 'validated';
  const result = await query<CsvImport>(
    `UPDATE platform.csv_imports
     SET status = $2, total_rows = $3, valid_rows = $4, error_rows = $5,
         validation_errors = $6, validated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      params.id,
      status,
      params.totalRows,
      params.validRows,
      params.errorRows,
      params.validationErrors ? JSON.stringify(params.validationErrors) : null,
    ]
  );
  return result[0] || null;
}

/**
 * Start CSV commit
 */
export async function startCsvCommit(id: string): Promise<CsvImport | null> {
  const result = await query<CsvImport>(
    `UPDATE platform.csv_imports
     SET status = 'committing'
     WHERE id = $1 AND status = 'validated'
     RETURNING *`,
    [id]
  );
  return result[0] || null;
}

/**
 * Complete CSV commit with counts
 */
export async function completeCsvCommit(params: {
  id: string;
  productsCreated: number;
  productsUpdated: number;
  suppliersCreated: number;
}): Promise<CsvImport | null> {
  const result = await query<CsvImport>(
    `UPDATE platform.csv_imports
     SET status = 'committed',
         products_created = $2,
         products_updated = $3,
         suppliers_created = $4,
         committed_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [params.id, params.productsCreated, params.productsUpdated, params.suppliersCreated]
  );
  return result[0] || null;
}

/**
 * Mark CSV import as failed
 */
export async function failCsvImport(id: string, errors: ValidationError[]): Promise<CsvImport | null> {
  const result = await query<CsvImport>(
    `UPDATE platform.csv_imports
     SET status = 'failed', validation_errors = $2
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(errors)]
  );
  return result[0] || null;
}

// =============================================================================
// IMPERSONATION LOGS
// =============================================================================

/**
 * Create an impersonation log entry
 */
export async function createImpersonationLog(params: {
  adminUserId: string;
  targetStoreId: string;
  ipAddress?: string;
  userAgent?: string;
  tokenExpiresAt: Date;
}): Promise<ImpersonationLog> {
  const result = await query<ImpersonationLog>(
    `INSERT INTO platform.impersonation_logs
     (admin_user_id, target_store_id, ip_address, user_agent, token_expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.adminUserId,
      params.targetStoreId,
      params.ipAddress || null,
      params.userAgent || null,
      params.tokenExpiresAt,
    ]
  );
  return result[0]!;
}

/**
 * Get impersonation logs for a store
 */
export async function getImpersonationLogs(
  storeId: string,
  limit = 50
): Promise<ImpersonationLog[]> {
  const result = await query<ImpersonationLog>(
    `SELECT * FROM platform.impersonation_logs
     WHERE target_store_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [storeId, limit]
  );
  return result;
}

/**
 * Get impersonation logs by admin
 */
export async function getImpersonationLogsByAdmin(
  adminUserId: string,
  limit = 50
): Promise<ImpersonationLog[]> {
  const result = await query<ImpersonationLog>(
    `SELECT * FROM platform.impersonation_logs
     WHERE admin_user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [adminUserId, limit]
  );
  return result;
}
