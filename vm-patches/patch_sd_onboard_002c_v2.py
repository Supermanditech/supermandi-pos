#!/usr/bin/env python3
"""
Patch enroll-service for SD-ONBOARD-002C (v2):
- Cross-store prefill (search other stores' digitised inventory)
- Version banner update to SD-ONBOARD-002C
"""

import sys
import re

# Read the original file
with open("/tmp/enroll-index.js", "r") as f:
    content = f.read()

# ============================================================================
# PATCH 1: Update version banner
# ============================================================================
# Find any version banner and update to SD-ONBOARD-002C
banner_regex = r'console\.log\([`"]Enroll service v6 \([^)]+\) running on port'
if re.search(banner_regex, content):
    content = re.sub(
        r'(console\.log\([`"])Enroll service v6 \([^)]+\)( running on port)',
        r'\1Enroll service v6 (SD-ONBOARD-002C)\2',
        content
    )
    print("PATCH 1: Updated version banner to SD-ONBOARD-002C")
else:
    print("PATCH 1: WARNING - Could not find version banner pattern")

# ============================================================================
# PATCH 2: Insert cross-store prefill before "Step 5: Not found anywhere"
# ============================================================================
# Check if cross-store prefill already exists
if "Cross-store prefill" in content or "other_store" in content:
    print("PATCH 2: Cross-store prefill already present, skipping")
else:
    # Find the marker for Step 5
    step5_marker = '// Step 5: Not found anywhere - return NEEDS_CREATE without prefill'

    if step5_marker in content:
        # Cross-store prefill code to insert
        cross_store_code = '''// Step 5: Cross-store prefill (SD-ONBOARD-002C)
      // Search other stores' digitised inventory for metadata (no prices/stock)
      const crossStoreResult = await db.query(`
        SELECT DISTINCT ON (spb.barcode)
          p.id AS product_id,
          COALESCE(sp.display_name, p.name) AS name,
          p.description,
          p.unit,
          p.brand,
          p.variant,
          p.pack_size,
          spb.barcode
        FROM catalog.store_product_barcodes spb
        JOIN catalog.store_products sp ON sp.id = spb.store_product_id
        JOIN catalog.products p ON p.id = sp.product_id
        WHERE spb.barcode = $1
          AND spb.store_id != $2
          AND sp.is_active = true
        ORDER BY spb.barcode, sp.updated_at DESC
        LIMIT 1
      `, [barcode, storeId]);

      if (crossStoreResult.rows.length > 0) {
        const row = crossStoreResult.rows[0];
        console.log(`[scan/resolve] NEEDS_CREATE with prefill from other_store: ${barcode}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          status: "NEEDS_CREATE",
          barcode: barcode,
          prefill: {
            barcode: row.barcode,
            name: row.name || "",
            description: row.description || "",
            unit: row.unit || "pcs",
            imageUrl: "",
            brand: row.brand || "",
            variant: row.variant || "",
            packSize: row.pack_size || "",
            source: "other_store",
            confidence: "medium",
            productId: row.product_id
          }
        }));
      }

      '''

        # Also update Step 5 to Step 6
        new_step6_marker = '// Step 6: Not found anywhere - return NEEDS_CREATE without prefill'

        # Replace Step 5 marker with cross-store code + Step 6 marker
        content = content.replace(step5_marker, cross_store_code + new_step6_marker)
        print("PATCH 2: Inserted cross-store prefill (Step 5) and renumbered to Step 6")
    else:
        print("PATCH 2: ERROR - Could not find Step 5 marker")
        print("         Looking for:", step5_marker[:50])
        sys.exit(1)

# Write the patched file
with open("/tmp/enroll-index.js", "w") as f:
    f.write(content)

print("SUCCESS: All patches applied for SD-ONBOARD-002C")
