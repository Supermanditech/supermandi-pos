/**
 * V3-HARDEN-150 / V3-HARDEN-151 / V3-HARDEN-152 / V3-HARDEN-153
 * Portal-scale UX, catalog distribution, DB capacity, load gates
 */

import {
  CATALOG_SCALE_LIMITS,
  PAGINATION_CONTRACT,
  clampPageSize,
  CATALOG_QUERY_CONTRACT,
  CACHE_RULES,
} from "../../src/services/catalogDistribution";

// ═══════════════════════════════════════════════════════════════════════════════
// V3-HARDEN-150: Portal-scale UX virtualization
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-150: Portal-scale UX (executable + static)", () => {
  it("POS SELL FlatList is virtualized for 10k SKUs", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/screens/v3/SellScreenV3.tsx"), "utf8"
    );
    expect(src).toContain("removeClippedSubviews");
    expect(src).toContain("windowSize={5}");
    expect(src).toContain("maxToRenderPerBatch={15}");
    expect(src).toContain("initialNumToRender={12}");
  });

  it("POS BUY FlatList is virtualized for 5k supplier SKUs", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/screens/v3/BuyScreenV3.tsx"), "utf8"
    );
    expect(src).toContain("removeClippedSubviews");
    expect(src).toContain("windowSize={5}");
    expect(src).toContain("maxToRenderPerBatch");
    expect(src).toContain("initialNumToRender");
  });

  it("pagination max page size is 200", () => {
    expect(PAGINATION_CONTRACT.MAX_PAGE_SIZE).toBe(200);
    expect(PAGINATION_CONTRACT.DEFAULT_PAGE_SIZE).toBe(50);
  });

  it("clampPageSize enforces max 200", () => {
    expect(clampPageSize(50)).toBe(50);
    expect(clampPageSize(500)).toBe(200);
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(-1)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-HARDEN-151: Catalog distribution contract
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-151: Catalog distribution (executable)", () => {
  it("scale limits are defined for approved targets", () => {
    expect(CATALOG_SCALE_LIMITS.MAX_SKUS_PER_SUPPLIER).toBe(5_000);
    expect(CATALOG_SCALE_LIMITS.MAX_STORE_PRODUCTS).toBe(10_000);
    expect(CATALOG_SCALE_LIMITS.MAX_SUPPLIERS).toBe(1_000);
    expect(CATALOG_SCALE_LIMITS.MAX_AGGREGATE_SKUS).toBe(1_000_000);
    expect(CATALOG_SCALE_LIMITS.MAX_PUBLISHED_SKUS_PER_STORE).toBe(10_000);
  });

  it("BUY catalog query is store-scoped, not global", () => {
    expect(CATALOG_QUERY_CONTRACT.BUY_CATALOG).toContain("ssl.store_id = $1");
    expect(CATALOG_QUERY_CONTRACT.BUY_CATALOG).toContain("ssl.status = 'active'");
    expect(CATALOG_QUERY_CONTRACT.BUY_CATALOG).toContain("sp.approval_status = 'approved'");
  });

  it("store products query is store-scoped", () => {
    expect(CATALOG_QUERY_CONTRACT.STORE_PRODUCTS).toContain("sp.store_id = $1");
  });

  it("cache invalidation rules are defined", () => {
    expect(CACHE_RULES.STORE_CATALOG_PAGE1_TTL).toBe(300);
    expect(CACHE_RULES.INVALIDATE_ON).toContain("product_created");
    expect(CACHE_RULES.INVALIDATE_ON).toContain("stock_changed");
    expect(CACHE_RULES.INVALIDATE_ON.length).toBeGreaterThanOrEqual(5);
  });

  it("backend catalog endpoint enforces pagination (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/catalog.ts"), "utf8"
    );
    expect(src).toContain("LIMIT");
    expect(src).toContain("OFFSET");
    expect(src).toContain("pagination");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-HARDEN-152: DB/index/cache capacity
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-152: Capacity indexes (static — narrowly scoped)", () => {
  it("migration 197 has capacity indexes for store products", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../migrations/197_catalog_capacity_indexes.sql"), "utf8"
    );
    expect(src).toContain("idx_sp_store_active_product");
    expect(src).toContain("idx_sp_supplier_active");
    expect(src).toContain("idx_sp_approval_status");
    expect(src).toContain("idx_ssl_store_active");
    expect(src).toContain("idx_spb_store_barcode");
    expect(src).toContain("idx_sb_store_product");
  });

  it("indexes use CONCURRENTLY for zero-downtime creation", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../migrations/197_catalog_capacity_indexes.sql"), "utf8"
    );
    const indexLines = src.match(/CREATE INDEX/g);
    const concurrentLines = src.match(/CREATE INDEX CONCURRENTLY/g);
    expect(indexLines).not.toBeNull();
    expect(concurrentLines).not.toBeNull();
    expect(concurrentLines!.length).toBe(indexLines!.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-HARDEN-153: Load gates
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-153: Scale capacity gate (static — narrowly scoped)", () => {
  it("scale-capacity-gate.sh checks virtualization and pagination", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "scripts/gates/scale-capacity-gate.sh"), "utf8"
    );
    expect(src).toContain("windowSize");
    expect(src).toContain("removeClippedSubviews");
    expect(src).toContain("MAX_PAGE_SIZE");
    expect(src).toContain("197_catalog_capacity_indexes");
  });

  it("deploy.yml includes scale capacity gate", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", ".github/workflows/deploy.yml"), "utf8"
    );
    expect(src).toContain("scale-capacity-gate.sh");
  });
});
