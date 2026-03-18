/**
 * V3-FIX-140: Supplier SKU intake lifecycle states
 *
 * Lifecycle: Draft → Submitted → (Changes Requested | Approved) → Published → Paused
 *
 * State transitions:
 * - Draft → Submitted: Supplier submits SKU with all mandatory fields
 * - Submitted → Changes Requested: SuperAdmin requests edits
 * - Submitted → Approved: SuperAdmin approves
 * - Changes Requested → Submitted: Supplier resubmits after edits
 * - Approved → Published: SuperAdmin publishes to store catalog
 * - Published → Paused: SuperAdmin/supplier pauses availability
 * - Paused → Published: Resume
 *
 * Mandatory fields for submission (blocks Draft → Submitted):
 * - name, brand, category, hsn_code, gst_rate, unit, pack_size, barcode,
 *   purchase_price, image_url, moq
 */

export type SkuLifecycleState =
  | "draft"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "published"
  | "paused";

export const VALID_SKU_TRANSITIONS: Record<SkuLifecycleState, SkuLifecycleState[]> = {
  draft: ["submitted"],
  submitted: ["changes_requested", "approved"],
  changes_requested: ["submitted"],
  approved: ["published"],
  published: ["paused"],
  paused: ["published"],
};

/**
 * Check if a state transition is valid.
 */
export function isValidTransition(from: SkuLifecycleState, to: SkuLifecycleState): boolean {
  return VALID_SKU_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Mandatory fields that must be present for Draft → Submitted transition.
 */
export const SUBMISSION_REQUIRED_FIELDS = [
  "name",
  "brand",
  "category",
  "unit",
  "purchase_price",
  "moq",
] as const;

/**
 * Optional but recommended fields for higher approval likelihood.
 */
export const SUBMISSION_RECOMMENDED_FIELDS = [
  "hsn_code",
  "barcode",
  "image_url",
  "pack_size",
  "gst_rate",
] as const;

/**
 * Validate that a product has all mandatory fields for submission.
 */
export function validateForSubmission(product: Record<string, any>): {
  valid: boolean;
  missingRequired: string[];
  missingRecommended: string[];
} {
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];

  for (const field of SUBMISSION_REQUIRED_FIELDS) {
    const value = product[field];
    if (value === null || value === undefined || value === "" || value === 0) {
      missingRequired.push(field);
    }
  }

  for (const field of SUBMISSION_RECOMMENDED_FIELDS) {
    const value = product[field];
    if (value === null || value === undefined || value === "") {
      missingRecommended.push(field);
    }
  }

  return {
    valid: missingRequired.length === 0,
    missingRequired,
    missingRecommended,
  };
}
