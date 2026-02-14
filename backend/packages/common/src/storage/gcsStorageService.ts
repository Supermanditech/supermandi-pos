// GCS Storage Service - Retailer Admin Portal
// Handles signed URL generation for compliance documents and CSV imports

import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';
import crypto from 'crypto';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface GcsConfig {
  projectId: string;
  complianceBucket: string;
  importsBucket: string;
  credentialsPath?: string;
}

let storage: Storage | null = null;
let gcsConfig: GcsConfig | null = null;

/**
 * Initialize GCS client with configuration
 */
export function initializeGcs(config: GcsConfig): void {
  gcsConfig = config;

  const storageOptions: { projectId: string; keyFilename?: string } = {
    projectId: config.projectId,
  };

  if (config.credentialsPath) {
    storageOptions.keyFilename = config.credentialsPath;
  }

  storage = new Storage(storageOptions);
  console.log(`[GCS] Initialized with project: ${config.projectId}`);
}

/**
 * Get GCS client (throws if not initialized)
 */
function getStorage(): Storage {
  if (!storage) {
    throw new Error('GCS not initialized. Call initializeGcs() first.');
  }
  return storage;
}

/**
 * Get GCS config (throws if not initialized)
 */
function getConfig(): GcsConfig {
  if (!gcsConfig) {
    throw new Error('GCS not initialized. Call initializeGcs() first.');
  }
  return gcsConfig;
}

// =============================================================================
// TYPES
// =============================================================================

export interface SignedUploadUrlRequest {
  storeId: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  bucketType: 'compliance' | 'imports';
}

export interface SignedUploadUrlResponse {
  uploadUrl: string;
  bucket: string;
  objectKey: string;
  expiresAt: Date;
}

export interface SignedDownloadUrlRequest {
  bucket: string;
  objectKey: string;
}

export interface SignedDownloadUrlResponse {
  downloadUrl: string;
  expiresAt: Date;
}

export interface FileExistsResult {
  exists: boolean;
  size?: number;
  contentType?: string;
}

// =============================================================================
// SIGNED URL GENERATION
// =============================================================================

/**
 * Generate a signed upload URL for direct browser upload to GCS
 * URL expires in 5 minutes
 */
export async function generateSignedUploadUrl(
  request: SignedUploadUrlRequest
): Promise<SignedUploadUrlResponse> {
  const gcs = getStorage();
  const config = getConfig();

  const bucket =
    request.bucketType === 'compliance' ? config.complianceBucket : config.importsBucket;

  // Sanitize filename for GCS object key
  const sanitizedFileName = sanitizeFileName(request.fileName);
  const objectKey = `${request.storeId}/${request.documentId}_${sanitizedFileName}`;

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  const options: GetSignedUrlConfig = {
    version: 'v4',
    action: 'write',
    expires: expiresAt,
    contentType: request.mimeType,
  };

  const [url] = await gcs.bucket(bucket).file(objectKey).getSignedUrl(options);

  return {
    uploadUrl: url,
    bucket,
    objectKey,
    expiresAt,
  };
}

/**
 * Generate a signed download URL for secure file access
 * URL expires in 15 minutes
 */
export async function generateSignedDownloadUrl(
  request: SignedDownloadUrlRequest
): Promise<SignedDownloadUrlResponse> {
  const gcs = getStorage();

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  const options: GetSignedUrlConfig = {
    version: 'v4',
    action: 'read',
    expires: expiresAt,
  };

  const [url] = await gcs.bucket(request.bucket).file(request.objectKey).getSignedUrl(options);

  return {
    downloadUrl: url,
    expiresAt,
  };
}

// =============================================================================
// SERVER-SIDE FILE OPERATIONS
// =============================================================================

/**
 * Upload a buffer directly to GCS (server-side upload via multer memoryStorage)
 * STBT-179: Replaces disk storage for Cloud Run ephemeral filesystem
 */
export async function uploadBuffer(
  bucket: string,
  objectKey: string,
  buffer: Buffer,
  contentType: string
): Promise<{ bucket: string; objectKey: string; size: number }> {
  const gcs = getStorage();
  const file = gcs.bucket(bucket).file(objectKey);
  await file.save(buffer, {
    contentType,
    resumable: false, // small files, no need for resumable
    metadata: { contentType },
  });
  return { bucket, objectKey, size: buffer.length };
}

/**
 * Stream a file from GCS as a readable stream (for download proxying)
 * STBT-179: Replaces fs.createReadStream for Cloud Run
 */
export function streamFile(
  bucket: string,
  objectKey: string
): NodeJS.ReadableStream {
  const gcs = getStorage();
  return gcs.bucket(bucket).file(objectKey).createReadStream();
}

// =============================================================================
// FILE METADATA OPERATIONS
// =============================================================================

/**
 * Check if a file exists in GCS and get its metadata
 */
export async function checkFileExists(bucket: string, objectKey: string): Promise<FileExistsResult> {
  const gcs = getStorage();

  try {
    const [metadata] = await gcs.bucket(bucket).file(objectKey).getMetadata();

    return {
      exists: true,
      size: typeof metadata.size === 'string' ? parseInt(metadata.size, 10) : metadata.size,
      contentType: metadata.contentType,
    };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === 404) {
      return { exists: false };
    }
    throw error;
  }
}

/**
 * Delete a file from GCS
 */
export async function deleteFile(bucket: string, objectKey: string): Promise<boolean> {
  const gcs = getStorage();

  try {
    await gcs.bucket(bucket).file(objectKey).delete();
    return true;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Get file content as buffer (for small files like CSVs)
 * Max 10MB to prevent memory issues
 */
export async function getFileContent(
  bucket: string,
  objectKey: string,
  maxSizeBytes: number = 10 * 1024 * 1024
): Promise<Buffer> {
  const gcs = getStorage();

  // Check file size first
  const { exists, size } = await checkFileExists(bucket, objectKey);
  if (!exists) {
    throw new Error(`File not found: ${bucket}/${objectKey}`);
  }

  if (size && size > maxSizeBytes) {
    throw new Error(`File too large: ${size} bytes (max: ${maxSizeBytes} bytes)`);
  }

  const [content] = await gcs.bucket(bucket).file(objectKey).download();
  return content;
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Sanitize filename for safe GCS object key usage
 */
function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace unsafe chars with underscore
    .replace(/_+/g, '_') // Collapse multiple underscores
    .toLowerCase();
}

/**
 * Calculate SHA256 hash of a buffer
 */
export function calculateSha256(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Validate MIME type for compliance documents
 */
export function isValidComplianceMimeType(mimeType: string): boolean {
  const validTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
  ];
  return validTypes.includes(mimeType.toLowerCase());
}

/**
 * Validate MIME type for CSV imports
 */
export function isValidImportMimeType(mimeType: string): boolean {
  const validTypes = [
    'text/csv',
    'text/plain',
    'application/csv',
    'application/vnd.ms-excel',
  ];
  return validTypes.includes(mimeType.toLowerCase());
}

/**
 * Get maximum file size for a bucket type
 */
export function getMaxFileSize(bucketType: 'compliance' | 'imports'): number {
  // Compliance docs: 10MB max
  // CSV imports: 5MB max
  return bucketType === 'compliance' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
}
