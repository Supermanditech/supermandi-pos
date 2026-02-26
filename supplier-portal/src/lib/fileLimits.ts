// REQ.AUDIT.W4.CROSS.HARDCODED-FILE-SIZE-LIMIT.001
// Additive constants file: centralises all file size limits so they can be
// overridden via environment variables without code changes.
// This is a NEW file — does not modify any existing code.
// Wire-up (importing from products/page.tsx, onboard/page.tsx, upload/page.tsx)
// requires operator approval under immutable-core mode.

const getEnvMB = (key: string, fallback: number): number =>
  Number(process.env[key] ?? fallback);

/** Maximum file size for CSV product uploads (bytes). Default: 5 MB. */
export const MAX_CSV_UPLOAD_SIZE_BYTES: number =
  getEnvMB("NEXT_PUBLIC_MAX_CSV_UPLOAD_SIZE_MB", 5) * 1024 * 1024;

/** Maximum file size for product images (bytes). Default: 5 MB. */
export const MAX_PRODUCT_IMAGE_SIZE_BYTES: number =
  getEnvMB("NEXT_PUBLIC_MAX_PRODUCT_IMAGE_SIZE_MB", 5) * 1024 * 1024;

/** Maximum file size for KYC documents (bytes). Default: 5 MB. */
export const MAX_KYC_DOCUMENT_SIZE_BYTES: number =
  getEnvMB("NEXT_PUBLIC_MAX_KYC_DOCUMENT_SIZE_MB", 5) * 1024 * 1024;

/** Human-readable labels */
export const MAX_CSV_UPLOAD_SIZE_LABEL = `${getEnvMB("NEXT_PUBLIC_MAX_CSV_UPLOAD_SIZE_MB", 5)}MB`;
export const MAX_PRODUCT_IMAGE_SIZE_LABEL = `${getEnvMB("NEXT_PUBLIC_MAX_PRODUCT_IMAGE_SIZE_MB", 5)}MB`;
export const MAX_KYC_DOCUMENT_SIZE_LABEL = `${getEnvMB("NEXT_PUBLIC_MAX_KYC_DOCUMENT_SIZE_MB", 5)}MB`;
