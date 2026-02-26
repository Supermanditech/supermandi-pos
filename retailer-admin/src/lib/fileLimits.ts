// REQ.AUDIT.W4.CROSS.HARDCODED-FILE-SIZE-LIMIT.001
// Additive constants file: centralises all file size limits so they can be
// overridden via environment variables without code changes.
// This is a NEW file — does not modify any existing code.
// Wire-up (importing from ImportPage.tsx, products/page.tsx, onboard/page.tsx)
// requires operator approval under immutable-core mode.

/** Maximum file size for CSV product imports (bytes). Default: 5 MB. */
export const MAX_CSV_IMPORT_SIZE_BYTES: number =
  Number(import.meta.env.VITE_MAX_CSV_IMPORT_SIZE_MB ?? 5) * 1024 * 1024;

/** Maximum file size for product images (bytes). Default: 5 MB. */
export const MAX_PRODUCT_IMAGE_SIZE_BYTES: number =
  Number(import.meta.env.VITE_MAX_PRODUCT_IMAGE_SIZE_MB ?? 5) * 1024 * 1024;

/** Human-readable label for the CSV import size limit. */
export const MAX_CSV_IMPORT_SIZE_LABEL: string =
  `${import.meta.env.VITE_MAX_CSV_IMPORT_SIZE_MB ?? 5}MB`;

/** Human-readable label for the product image size limit. */
export const MAX_PRODUCT_IMAGE_SIZE_LABEL: string =
  `${import.meta.env.VITE_MAX_PRODUCT_IMAGE_SIZE_MB ?? 5}MB`;
