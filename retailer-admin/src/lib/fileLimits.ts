// REQ.AUDIT.W4.CROSS.HARDCODED-FILE-SIZE-LIMIT.001
// Centralised file size limits — overrideable via env vars without code changes.

/** Maximum file size for CSV product imports (bytes). Default: 5 MB. */
export const MAX_CSV_IMPORT_SIZE_BYTES: number =
  Number(import.meta.env.VITE_MAX_CSV_IMPORT_SIZE_MB ?? 5) * 1024 * 1024;

/** Maximum file size for product images (bytes). Default: 5 MB. */
export const MAX_PRODUCT_IMAGE_SIZE_BYTES: number =
  Number(import.meta.env.VITE_MAX_PRODUCT_IMAGE_SIZE_MB ?? 5) * 1024 * 1024;

/** Maximum file size for KYC / compliance documents (bytes). Default: 5 MB. */
export const MAX_DOCUMENT_SIZE_BYTES: number =
  Number(import.meta.env.VITE_MAX_DOCUMENT_SIZE_MB ?? 5) * 1024 * 1024;

/** Human-readable label for the CSV import size limit. */
export const MAX_CSV_IMPORT_SIZE_LABEL: string =
  `${import.meta.env.VITE_MAX_CSV_IMPORT_SIZE_MB ?? 5}MB`;

/** Human-readable label for the product image size limit. */
export const MAX_PRODUCT_IMAGE_SIZE_LABEL: string =
  `${import.meta.env.VITE_MAX_PRODUCT_IMAGE_SIZE_MB ?? 5}MB`;

/** Human-readable label for the document size limit. */
export const MAX_DOCUMENT_SIZE_LABEL: string =
  `${import.meta.env.VITE_MAX_DOCUMENT_SIZE_MB ?? 5}MB`;
