/**
 * V3-HARDEN-134: Product Metadata Ownership and Bidirectional Sync Rules
 *
 * Defines who owns each product metadata field and how edits propagate.
 *
 * FIELD OWNERSHIP MATRIX:
 *
 * ┌────────────────────┬───────────┬──────────┬──────────┬──────────┬──────────┐
 * │ Field              │ Supplier  │ SuperAdm │ Retailer │ POS      │ CSV      │
 * ├────────────────────┼───────────┼──────────┼──────────┼──────────┼──────────┤
 * │ name               │ OWNER     │ OVERRIDE │ READ     │ READ     │ READ     │
 * │ primary_barcode    │ OWNER     │ OVERRIDE │ READ     │ READ     │ SEED     │
 * │ brand              │ OWNER     │ OVERRIDE │ READ     │ READ     │ SEED     │
 * │ brand_override     │ READ      │ READ     │ OWNER    │ OWNER    │ SEED     │
 * │ category           │ OWNER     │ OVERRIDE │ READ     │ READ     │ SEED     │
 * │ image_url          │ OWNER     │ OVERRIDE │ READ     │ READ     │ READ     │
 * │ default_gst_rate   │ OWNER     │ OVERRIDE │ READ     │ READ     │ SEED     │
 * │ hsn_code           │ OWNER     │ OVERRIDE │ READ     │ READ     │ SEED     │
 * │ unit               │ OWNER     │ OVERRIDE │ READ     │ READ     │ SEED     │
 * │ net_content_value  │ OWNER     │ OVERRIDE │ READ     │ READ     │ READ     │
 * │ net_content_unit   │ OWNER     │ OVERRIDE │ READ     │ READ     │ READ     │
 * │ description        │ OWNER     │ OVERRIDE │ READ     │ READ     │ READ     │
 * ├────────────────────┼───────────┼──────────┼──────────┼──────────┼──────────┤
 * │ display_name       │ READ      │ READ     │ OWNER    │ OWNER    │ SEED     │
 * │ sell_price         │ READ      │ READ     │ OWNER    │ OWNER    │ SEED     │
 * │ purchase_price     │ READ      │ READ     │ OWNER    │ OWNER    │ SEED     │
 * │ mrp                │ SUGGEST   │ OVERRIDE │ OWNER    │ OWNER    │ SEED     │
 * │ product_mode       │ READ      │ READ     │ OWNER    │ OWNER    │ SEED     │
 * │ current_stock      │ READ      │ READ     │ OWNER    │ OWNER    │ SEED     │
 * │ store barcodes     │ READ      │ READ     │ OWNER    │ OWNER    │ SEED     │
 * └────────────────────┴───────────┴──────────┴──────────┴──────────┴──────────┘
 *
 * OWNERSHIP LEVELS:
 * - OWNER:    Can create and update the field. Authoritative source.
 * - OVERRIDE: Can update the field, overriding the owner. Audit-logged.
 * - SUGGEST:  Can propose a value; retailer decides whether to accept.
 * - SEED:     Can set the initial value only (on product creation/import).
 * - READ:     Can read the field but cannot modify it.
 *
 * SYNC RULES:
 * 1. Global product fields (name, barcode, brand, category, etc.) are supplier-owned.
 *    SuperAdmin can override. Retailer/POS cannot modify global fields.
 * 2. Store product fields (display_name, sell_price, purchase_price, mrp, product_mode,
 *    current_stock, store barcodes) are retailer-owned.
 *    Both retailer-admin web and POS can edit these fields.
 * 3. POS and retailer-admin converge via LWW (last-write-wins) with metadata_updated_at.
 *    If POS edits display_name at T1 and retailer-admin edits at T2 > T1, T2 wins.
 * 4. CSV import SEEDs initial values but does NOT overwrite existing store product fields.
 * 5. Supplier publish updates global fields but does NOT overwrite store-level overrides.
 */

export type OwnershipLevel = "OWNER" | "OVERRIDE" | "SUGGEST" | "SEED" | "READ";

export type MetadataSource =
  | "SUPPLIER_PUBLISH"
  | "SUPERADMIN_EDIT"
  | "RETAILER_WEB"
  | "POS_APP"
  | "CSV_IMPORT";

export interface FieldOwnership {
  field: string;
  table: "catalog.products" | "catalog.store_products";
  supplier: OwnershipLevel;
  superAdmin: OwnershipLevel;
  retailer: OwnershipLevel;
  pos: OwnershipLevel;
  csv: OwnershipLevel;
}

/**
 * Canonical field ownership matrix.
 */
export const FIELD_OWNERSHIP: FieldOwnership[] = [
  // === Global product fields (supplier-owned) ===
  { field: "name",              table: "catalog.products",        supplier: "OWNER",   superAdmin: "OVERRIDE", retailer: "READ",  pos: "READ",  csv: "READ"  },
  { field: "primary_barcode",   table: "catalog.products",        supplier: "OWNER",   superAdmin: "OVERRIDE", retailer: "READ",  pos: "READ",  csv: "SEED"  },
  { field: "brand",             table: "catalog.products",        supplier: "OWNER",   superAdmin: "OVERRIDE", retailer: "READ",     pos: "READ",     csv: "SEED" },
  { field: "category",          table: "catalog.products",        supplier: "OWNER",   superAdmin: "OVERRIDE", retailer: "READ",  pos: "READ",  csv: "SEED"  },
  { field: "image_url",         table: "catalog.products",        supplier: "OWNER",   superAdmin: "OVERRIDE", retailer: "READ",  pos: "READ",  csv: "READ"  },
  { field: "default_gst_rate",  table: "catalog.products",        supplier: "OWNER",   superAdmin: "OVERRIDE", retailer: "READ",  pos: "READ",  csv: "SEED"  },
  { field: "hsn_code",          table: "catalog.products",        supplier: "OWNER",   superAdmin: "OVERRIDE", retailer: "READ",  pos: "READ",  csv: "SEED"  },
  { field: "unit",              table: "catalog.products",        supplier: "OWNER",   superAdmin: "OVERRIDE", retailer: "READ",  pos: "READ",  csv: "SEED"  },
  { field: "net_content_value", table: "catalog.products",        supplier: "OWNER",   superAdmin: "OVERRIDE", retailer: "READ",  pos: "READ",  csv: "READ"  },
  { field: "net_content_unit",  table: "catalog.products",        supplier: "OWNER",   superAdmin: "OVERRIDE", retailer: "READ",  pos: "READ",  csv: "READ"  },
  { field: "description",       table: "catalog.products",        supplier: "OWNER",   superAdmin: "OVERRIDE", retailer: "READ",  pos: "READ",  csv: "READ"  },

  // === Store product fields (retailer-owned) ===
  { field: "brand_override",    table: "catalog.store_products",  supplier: "READ",    superAdmin: "READ",     retailer: "OWNER", pos: "OWNER", csv: "SEED"  },
  { field: "display_name",      table: "catalog.store_products",  supplier: "READ",    superAdmin: "READ",     retailer: "OWNER", pos: "OWNER", csv: "SEED"  },
  { field: "sell_price",        table: "catalog.store_products",  supplier: "READ",    superAdmin: "READ",     retailer: "OWNER", pos: "OWNER", csv: "SEED"  },
  { field: "purchase_price",    table: "catalog.store_products",  supplier: "READ",    superAdmin: "READ",     retailer: "OWNER", pos: "OWNER", csv: "SEED"  },
  { field: "mrp",               table: "catalog.store_products",  supplier: "SUGGEST", superAdmin: "OVERRIDE", retailer: "OWNER", pos: "OWNER", csv: "SEED"  },
  { field: "product_mode",      table: "catalog.store_products",  supplier: "READ",    superAdmin: "READ",     retailer: "OWNER", pos: "OWNER", csv: "SEED"  },
  { field: "current_stock",     table: "catalog.store_products",  supplier: "READ",    superAdmin: "READ",     retailer: "OWNER", pos: "OWNER", csv: "SEED"  },
  { field: "store_barcodes",    table: "catalog.store_products",  supplier: "READ",    superAdmin: "READ",     retailer: "OWNER", pos: "OWNER", csv: "SEED"  },
];

/**
 * Check if a source is allowed to modify a field.
 */
export function canModifyField(field: string, source: MetadataSource): boolean {
  const ownership = FIELD_OWNERSHIP.find((f) => f.field === field);
  if (!ownership) return false;

  switch (source) {
    case "SUPPLIER_PUBLISH":
      return ownership.supplier === "OWNER" || ownership.supplier === "OVERRIDE" || ownership.supplier === "SUGGEST";
    case "SUPERADMIN_EDIT":
      return ownership.superAdmin === "OWNER" || ownership.superAdmin === "OVERRIDE";
    case "RETAILER_WEB":
      return ownership.retailer === "OWNER" || ownership.retailer === "OVERRIDE";
    case "POS_APP":
      return ownership.pos === "OWNER" || ownership.pos === "OVERRIDE";
    case "CSV_IMPORT":
      return ownership.csv === "OWNER" || ownership.csv === "SEED";
    default:
      return false;
  }
}

/**
 * Get all fields a source is allowed to modify.
 */
export function getModifiableFields(source: MetadataSource): string[] {
  return FIELD_OWNERSHIP
    .filter((f) => canModifyField(f.field, source))
    .map((f) => f.field);
}

/**
 * Sync precedence rule: when two sources edit the same field,
 * the one with the later metadata_updated_at wins (LWW).
 * This applies to retailer-owned fields (display_name, sell_price, etc.)
 * that can be edited from both POS and retailer-admin web.
 */
export const SYNC_PRECEDENCE = {
  strategy: "LAST_WRITE_WINS" as const,
  timestampField: "metadata_updated_at" as const,
  sourceField: "metadata_updated_by" as const,
  rule: "If POS edits at T1 and retailer-admin edits at T2 > T1, T2 wins. Vice versa.",
} as const;
