/**
 * V3-FIX-154: Canonical taxonomy-assignment contract
 *
 * ALL store-entry paths must resolve category through this service:
 * 1. Store digitisation / onboarding → assignTaxonomy()
 * 2. Retailer manual product create → assignTaxonomy()
 * 3. Supplier-catalog add to store → assignTaxonomy()
 * 4. Admin publish of supplier products → assignTaxonomy()
 *
 * Resolution chain:
 * 1. If explicit taxonomyId provided (manual override) → use it directly
 * 2. If DB function catalog.assign_taxonomy_by_name exists → use DB assignment
 * 3. Application-level keyword matching → suggestCategory()
 * 4. Fallback → UNCATEGORIZED (explicit, not null)
 *
 * V3-HARDEN-155: Repeated purchase rules
 * - If store_product already exists for this product → PRESERVE existing taxonomy_id
 * - If retailer manually overrode category → NEVER overwrite on repeat procurement
 * - Only NEW products (no existing store_product) get fresh assignment
 *
 * V3-HARDEN-156: Category truth contract
 * - taxonomy_id is the canonical category truth for all surfaces
 * - Raw text category is informational metadata, not authority
 * - Uncategorized items use taxonomy_id = UNCATEGORIZED (explicit, not null/empty)
 */

import type { PoolClient, Pool } from "pg";
import { suggestCategory } from "../utils/autoCategorization";

/** The canonical uncategorized taxonomy value */
export const UNCATEGORIZED = "Uncategorized" as const;

/** Entry path that triggered the taxonomy assignment */
export type TaxonomyEntryPath =
  | "STORE_DIGITISATION"
  | "RETAILER_MANUAL_CREATE"
  | "SUPPLIER_CATALOG_ADD"
  | "ADMIN_PUBLISH"
  | "CSV_IMPORT";

export interface TaxonomyAssignmentInput {
  /** Product name — used for keyword-based suggestion */
  productName: string;
  /** Raw text category from supplier/import (informational, not authority) */
  rawCategory?: string | null;
  /** Explicit taxonomy override from retailer/admin */
  explicitTaxonomyId?: string | null;
  /** Entry path for audit logging */
  entryPath: TaxonomyEntryPath;
}

export interface TaxonomyAssignmentResult {
  /** Resolved taxonomy_id — always non-null */
  taxonomyId: string;
  /** How the taxonomy was resolved */
  method: "explicit_override" | "db_function" | "keyword_match" | "raw_category" | "uncategorized";
  /** Original raw category preserved for metadata */
  rawCategory: string | null;
}

/**
 * V3-FIX-154: Assign taxonomy through the canonical resolution chain.
 * Always returns a non-null taxonomyId.
 */
export async function assignTaxonomy(
  pool: Pool | PoolClient,
  input: TaxonomyAssignmentInput
): Promise<TaxonomyAssignmentResult> {
  const rawCategory = input.rawCategory?.trim() || null;

  // 1. Explicit override (retailer/admin set category manually)
  if (input.explicitTaxonomyId?.trim()) {
    return {
      taxonomyId: input.explicitTaxonomyId.trim(),
      method: "explicit_override",
      rawCategory,
    };
  }

  // 2. Try DB function catalog.assign_taxonomy_by_name (if it exists)
  try {
    const dbResult = await pool.query(
      `SELECT catalog.assign_taxonomy_by_name($1) AS taxonomy_id`,
      [input.productName]
    );
    const dbTaxonomy = dbResult.rows[0]?.taxonomy_id;
    if (dbTaxonomy && dbTaxonomy !== UNCATEGORIZED) {
      return {
        taxonomyId: dbTaxonomy,
        method: "db_function",
        rawCategory,
      };
    }
  } catch {
    // DB function doesn't exist — fall through to application logic
  }

  // 3. Application-level keyword matching
  const suggested = suggestCategory(input.productName);
  if (suggested) {
    return {
      taxonomyId: suggested,
      method: "keyword_match",
      rawCategory,
    };
  }

  // 4. Raw supplier text category is NOT used as taxonomyId — it's informational only
  // Store-facing category truth must be a real taxonomy_id or UNCATEGORIZED

  // 5. Explicit uncategorized
  return {
    taxonomyId: UNCATEGORIZED,
    method: "uncategorized",
    rawCategory,
  };
}

/**
 * V3-HARDEN-155: Check if a store product already exists for this product.
 * If yes, return its existing taxonomy_id (preserve on repeat procurement).
 * If no, return null (needs fresh assignment).
 */
export async function getExistingStoreTaxonomy(
  pool: Pool | PoolClient,
  storeId: string,
  productId: string
): Promise<string | null> {
  try {
    const result = await pool.query(
      `SELECT taxonomy_id FROM catalog.store_products
       WHERE store_id = $1 AND product_id = $2 AND is_active = true
       LIMIT 1`,
      [storeId, productId]
    );
    return result.rows[0]?.taxonomy_id || null;
  } catch {
    return null;
  }
}

/**
 * V3-HARDEN-155: Resolve taxonomy for a product being added to a store.
 * Preserves existing category for repeat purchases; assigns fresh for new SKUs.
 */
export async function resolveStoreTaxonomy(
  pool: Pool | PoolClient,
  storeId: string,
  productId: string | null,
  input: TaxonomyAssignmentInput
): Promise<TaxonomyAssignmentResult> {
  // If product already exists in store, preserve its category
  if (productId) {
    const existing = await getExistingStoreTaxonomy(pool, storeId, productId);
    if (existing) {
      return {
        taxonomyId: existing,
        method: "explicit_override", // Treated as preserved override
        rawCategory: input.rawCategory?.trim() || null,
      };
    }
  }

  // New product — assign through canonical chain
  return assignTaxonomy(pool, input);
}

/**
 * V3-HARDEN-156: Category truth rules for cross-surface consistency.
 */
export const CATEGORY_TRUTH_RULES = {
  /** taxonomy_id is the canonical source of truth */
  AUTHORITY: "taxonomy_id" as const,
  /** Raw text category is informational metadata only */
  RAW_CATEGORY_ROLE: "informational_metadata" as const,
  /** Uncategorized items use explicit UNCATEGORIZED value */
  UNCATEGORIZED_VALUE: UNCATEGORIZED,
  /** Correction precedence: admin > retailer > automatic */
  CORRECTION_PRECEDENCE: ["admin", "retailer", "automatic"] as const,
  /** Store-local override is preserved on repeat procurement */
  PRESERVE_STORE_OVERRIDE: true,
  /** Sync rule: admin correction propagates to all surfaces */
  ADMIN_CORRECTION_PROPAGATES: true,
  /** Sync rule: retailer override stays store-local only */
  RETAILER_OVERRIDE_SCOPE: "store_local" as const,
} as const;
