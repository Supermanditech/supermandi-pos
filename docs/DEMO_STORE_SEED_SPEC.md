# Demo Store Seed Specification

> Generated: 2026-01-15
> Related Ticket: UI-AUDIT-005

---

## Purpose

Document the expected demo store seed data for end-to-end testing. The seed enables full functional testing of all POS flows.

---

## 1. Demo Store Identity

| Field | Value |
|-------|-------|
| Store ID | `a0000000-0000-0000-0000-000000000001` |
| Store Name | Demo Store (configured in platform.stores) |
| Environment | Development / Staging only |

---

## 2. Seed Data Counts

| Entity | Table | Expected Count | Purpose |
|--------|-------|----------------|---------|
| **Supplier** | `supplier.suppliers` | 1 | Primary supplier for all products |
| **Supplier Link** | `supplier.supplier_store_links` | 1 | Link supplier to demo store |
| **Products** | `catalog.products` | 31 | Product master records |
| **Barcodes** | `catalog.product_barcodes` | 31 | Barcode lookup entries |
| **Store Products** | `catalog.store_products` | 31 | Store-specific pricing/stock |
| **Supplier Products** | `catalog.supplier_product_map` | 31 | Supplier pricing |
| **Reorder Settings** | `reorder.store_reorder_settings` | 1 | Store reorder config |
| **Reorder Policies** | `reorder.reorder_policies` | 3 | Sample product policies |
| **Pending Reorders** | `reorder.pending_reorders` | 0-3 | Sample suggestions (optional) |
| **Purchase Orders** | `orders.purchase_orders` | 0+ | Optional sample orders |
| **Sales** | `inventory.sales` | 0+ | Optional sample transactions |

---

## 3. Product Categories

| Category | Count | Example Products |
|----------|-------|------------------|
| Grocery | 5 | Salt, Oil, Atta, Rice, Dal |
| Beverages | 5 | Coca Cola, Pepsi, Thums Up, Sprite, Maaza |
| Snacks | 5 | Lays, Kurkure, Haldiram, Parle-G, Good Day |
| Dairy | 5 | Butter, Milk, Cheese, Dahi, Paneer |
| Personal Care | 5 | Colgate, Dettol, Shampoos, Lotion |
| Household | 5 | Vim, Surf, Harpic, Colin, Good Knight |
| Test | 1 | Test Product 5004 (for barcode testing) |

---

## 4. Pricing Structure

All prices in **minor units (paise)**.

| Category | Sell Price Range | MRP Range | Cost Price Range |
|----------|------------------|-----------|------------------|
| Grocery | 2500-7500 | 3000-9000 | 2000-6000 |
| Beverages | 3500-4500 | 4000-5500 | 2800-3600 |
| Snacks | 2000-5000 | 2500-6500 | 1500-4000 |
| Dairy | 5000-15000 | 6000-18000 | 4000-12000 |
| Personal Care | 8000-23000 | 10000-30000 | 6000-18000 |
| Household | 5000-15000 | 6000-18000 | 4000-12000 |

---

## 5. Reorder Settings

| Setting | Value | Purpose |
|---------|-------|---------|
| `reorder_enabled` | `true` | Enable auto-reorder detection |
| `require_approval` | `true` | Pending reorders need manual approval |
| `notify_on_low_stock` | `true` | Trigger notifications |

---

## 6. Sample Reorder Policies

| Product | Min Stock | Target Stock | Supplier |
|---------|-----------|--------------|----------|
| Tata Salt 1kg | 5 | 30 | SuperMandi Wholesale |
| Fortune Oil 1L | 3 | 15 | SuperMandi Wholesale |
| Aashirvaad Atta 5kg | 5 | 20 | SuperMandi Wholesale |

---

## 7. Seed Files

### Primary Seed

| File | Location | Purpose |
|------|----------|---------|
| `seed_demo_data.sql` | `backend/migrations/` | Main seed file (runs as migration) |

### Characteristics

- **Idempotent:** Uses `ON CONFLICT DO NOTHING` for all inserts
- **Schema-aligned:** Matches current migration schema
- **Deterministic IDs:** Uses fixed UUIDs for predictable testing
- **Safe for production:** Demo store ID is distinct from real stores

---

## 8. Verification Queries

### Count Verification

```sql
-- Run after seed to verify counts
SELECT 'suppliers' as entity, COUNT(*) as count FROM supplier.suppliers WHERE id = 'b0000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'products', COUNT(*) FROM catalog.products WHERE id::text LIKE 'c0000000%'
UNION ALL
SELECT 'barcodes', COUNT(*) FROM catalog.product_barcodes WHERE product_id::text LIKE 'c0000000%'
UNION ALL
SELECT 'store_products', COUNT(*) FROM catalog.store_products WHERE store_id = 'a0000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'supplier_products', COUNT(*) FROM catalog.supplier_product_map WHERE supplier_id = 'b0000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'reorder_settings', COUNT(*) FROM reorder.store_reorder_settings WHERE store_id = 'a0000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'reorder_policies', COUNT(*) FROM reorder.reorder_policies WHERE store_id = 'a0000000-0000-0000-0000-000000000001';
```

**Expected Results:**

| entity | count |
|--------|-------|
| suppliers | 1 |
| products | 31 |
| barcodes | 31 |
| store_products | 31 |
| supplier_products | 31 |
| reorder_settings | 1 |
| reorder_policies | 3 |

### Data Quality Verification

```sql
-- Verify pricing is set correctly
SELECT
  p.name,
  sp.sell_price,
  sp.mrp,
  spm.cost_price,
  sp.current_stock
FROM catalog.store_products sp
JOIN catalog.products p ON p.id = sp.product_id
LEFT JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
WHERE sp.store_id = 'a0000000-0000-0000-0000-000000000001'
LIMIT 5;
```

### Barcode Lookup Verification

```sql
-- Verify barcode lookup works
SELECT
  pb.barcode,
  p.name,
  sp.sell_price
FROM catalog.product_barcodes pb
JOIN catalog.products p ON p.id = pb.product_id
JOIN catalog.store_products sp ON sp.product_id = p.id AND sp.store_id = 'a0000000-0000-0000-0000-000000000001'
WHERE pb.barcode = '8901725115159';  -- Tata Salt
```

### Reorder Policy Verification

```sql
-- Verify reorder policies are linked
SELECT
  rp.min_stock,
  rp.target_stock,
  p.name,
  s.trade_name as supplier
FROM reorder.reorder_policies rp
JOIN catalog.products p ON p.id = rp.product_id
LEFT JOIN supplier.suppliers s ON s.id = rp.preferred_supplier_id
WHERE rp.store_id = 'a0000000-0000-0000-0000-000000000001';
```

---

## 9. Environment Protection

### Seed Policy

| Environment | Seed Allowed | Method |
|-------------|--------------|--------|
| Local Dev | ✅ Yes | Auto-run on `pnpm db:migrate` |
| Staging | ✅ Yes | Manual or CI pipeline |
| Production | ❌ NO | Blocked at API level |

### Guard Implementation

```typescript
// In seed/migration runner
if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED_PRODUCTION) {
  throw new Error('SEED_BLOCKED: Cannot run seed in production');
}
```

---

## 10. Test Flows Enabled by Seed

### SELL Flow
- [x] Scan barcode → Product found
- [x] Search product → Results returned
- [x] Add to cart → Stock available
- [x] Checkout → Price calculated
- [x] Complete sale → Stock decremented

### BUY Flow
- [x] Browse catalog → Products displayed
- [x] Filter by category → Filtered results
- [x] View product detail → Supplier shown
- [x] Add to cart → Cost price displayed
- [x] Place order → Order created

### REORDER Flow
- [x] View settings → Config loaded
- [x] View policies → Policies listed
- [x] Edit policy → Update works
- [x] Approve reorder → Order created

### Reports
- [x] Stock Statement → Products listed
- [x] Purchase History → (Requires transactions)
- [x] Sales Statement → (Requires transactions)

---

## 11. Running the Seed

### Development

```bash
# Run migrations including seed
cd backend
pnpm db:migrate

# Or run seed directly
psql -d supermandi -f migrations/seed_demo_data.sql
```

### Verification

```bash
# Check counts
psql -d supermandi -c "SELECT 'products' as entity, COUNT(*) FROM catalog.products WHERE id::text LIKE 'c0000000%'"
```

---

## 12. Cleanup (Optional)

```sql
-- Remove demo data (use with caution)
DELETE FROM reorder.reorder_policies WHERE store_id = 'a0000000-0000-0000-0000-000000000001';
DELETE FROM reorder.store_reorder_settings WHERE store_id = 'a0000000-0000-0000-0000-000000000001';
DELETE FROM catalog.store_products WHERE store_id = 'a0000000-0000-0000-0000-000000000001';
DELETE FROM catalog.supplier_product_map WHERE supplier_id = 'b0000000-0000-0000-0000-000000000001';
DELETE FROM catalog.product_barcodes WHERE product_id::text LIKE 'c0000000%';
DELETE FROM catalog.products WHERE id::text LIKE 'c0000000%';
DELETE FROM supplier.supplier_store_links WHERE store_id = 'a0000000-0000-0000-0000-000000000001';
DELETE FROM supplier.suppliers WHERE id = 'b0000000-0000-0000-0000-000000000001';
```

---

## Conclusion

The demo store seed provides:
- 31 products across 7 categories
- Complete pricing (sell, MRP, cost)
- Stock levels (50-150 units each)
- Supplier linkage
- Reorder configuration
- Barcode lookup entries

All data uses predictable UUIDs for reliable testing and is safe to re-run multiple times.
