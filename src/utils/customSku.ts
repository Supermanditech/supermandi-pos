const CUSTOM_SKU_PREFIX = "CUSTOM:";
const CATEGORY_FALLBACK = "General";

export function normalizeCategory(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return CATEGORY_FALLBACK.toLowerCase();
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || CATEGORY_FALLBACK.toLowerCase();
}

export function formatCategoryLabel(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return CATEGORY_FALLBACK;
  return trimmed
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function buildCustomSkuBarcode(category: string): string {
  return `${CUSTOM_SKU_PREFIX}${normalizeCategory(category)}`;
}

export function buildCustomSkuName(category: string): string {
  return `Custom ${formatCategoryLabel(category)}`;
}

export function isCustomSkuBarcode(barcode: string): boolean {
  return barcode.startsWith(CUSTOM_SKU_PREFIX);
}
