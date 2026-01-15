# Seed Policy - STORECODE-004

> Generated: 2026-01-15
> Related Ticket: STORECODE-004

---

## Purpose

This document defines the seed data policy for SuperMandi POS to ensure:
1. Demo/QA stores can be seeded with sample data for testing
2. Production go-live stores are NEVER accidentally seeded
3. Clear separation between demo and production environments

---

## Store Code Prefix Policy

### Demo Store Prefixes
Demo and QA stores MUST use specific store_code prefixes:

| Prefix | Purpose | Example Code |
|--------|---------|--------------|
| `DM` | Demo stores for sales demos | DM260115-001 |
| `QA` | QA testing stores | QA260115-001 |
| `TS` | Automated test stores | TS260115-001 |
| `ST` | Staging stores | ST260115-001 |

### Production Store Prefixes
Production stores use standard prefixes derived from store names:

| Prefix | Store Name Pattern | Example |
|--------|-------------------|---------|
| `SU` | Starts with "Su*" | SuperMart -> SU260115-001 |
| `MO` | Starts with "Mo*" | More Store -> MO260115-001 |
| `KI` | Starts with "Ki*" | Kirana Shop -> KI260115-001 |
| etc. | First 2 letters | BigBazaar -> BI260115-001 |

---

## Seed Data Rules

### Rule 1: Demo Stores Can Be Seeded
Stores with demo prefixes (`DM`, `QA`, `TS`, `ST`) may receive seed data:
- Sample products
- Sample suppliers
- Sample inventory
- Sample sales history (for testing)

### Rule 2: Production Stores NEVER Seeded
Stores with production prefixes (any non-demo prefix) must NEVER have seed data:
- No sample products
- No sample inventory
- No fake transactions
- Store starts with clean slate

### Rule 3: Environment Guard
Seed scripts are blocked in production regardless of store code:
- `NODE_ENV=production` -> All seed operations blocked
- Requires `--confirm` flag in dev/staging

---

## Technical Implementation

### Guard Functions

```typescript
// backend/src/middleware/devOnly.ts
assertNotProduction('seed-script-name');       // Blocks in production
assertNotProductionWithConfirm('name', flag);  // Requires --confirm

// backend/src/services/storeCodeService.ts
isDemoStoreCode(code: string): boolean;        // Checks for demo prefix
```

### Demo Store Code Detection

```typescript
// New format prefixes
const DEMO_PREFIXES = ['DM', 'QA', 'TS', 'ST'];

// Legacy patterns (for pre-migration codes)
const LEGACY_DEMO_PATTERNS = ['demo', 'test', 'qa-', 'staging'];

function isDemoStoreCode(code: string): boolean {
  // Check new format
  const prefix = code.substring(0, 2).toUpperCase();
  if (DEMO_PREFIXES.includes(prefix)) return true;

  // Check legacy patterns
  const lowerCode = code.toLowerCase();
  return LEGACY_DEMO_PATTERNS.some(p => lowerCode.includes(p));
}
```

### Legacy Demo Codes
These legacy codes are also recognized as demo stores:
- `sm-demo02` - contains "demo"
- `test-store-1` - contains "test"
- `qa-bangalore` - contains "qa-"
- `staging-store` - contains "staging"

### Seed Script Guard Pattern

```typescript
// Before seeding ANY store, verify it's a demo store
const store = await getStore(storeId);
if (!isDemoStoreCode(store.store_code)) {
  throw new Error(`BLOCKED: Cannot seed production store ${store.store_code}`);
}
```

---

## API Endpoint Protection

### Seed Endpoints (Dev Only)
These endpoints return 404 in production:

| Endpoint | Method | Protection |
|----------|--------|------------|
| `/api/v1/dev/seed-store` | POST | devOnlyMiddleware() |
| `/api/v1/dev/reset-store` | POST | devOnlyMiddleware() |
| `/api/v1/dev/generate-sales` | POST | devOnlyMiddleware() |

### Double Protection Pattern
All seed operations require TWO checks:
1. Environment check (not production)
2. Store code check (must be demo prefix)

```typescript
// Example seed endpoint
router.post('/seed-store', devOnlyMiddleware(), async (req, res) => {
  const { storeCode } = req.body;

  // Double-check store is demo
  if (!isDemoStoreCode(storeCode)) {
    return res.status(400).json({
      error: 'seed_blocked',
      message: 'Can only seed demo stores (DM, QA, TS, ST prefixes)'
    });
  }

  // Proceed with seeding...
});
```

---

## Go-Live Checklist

### New Store Onboarding
1. SuperAdmin creates store with production name
2. Store code auto-generated (e.g., SU260115-003)
3. Enrollment code created for device
4. Device enrolls with empty catalog
5. Store owner adds products manually or via bulk import

### Demo Store Setup
1. SuperAdmin creates store named "Demo Store [Region]"
2. Store code: DM260115-XXX (auto-generated)
3. Run seed script: `npx ts-node scripts/seed-qa-data.ts --confirm`
4. Demo store has sample data ready

---

## Verification Queries

```sql
-- List all demo stores
SELECT id, name, store_code, created_at
FROM stores
WHERE store_code ~ '^(DM|QA|TS|ST)'
ORDER BY created_at DESC;

-- List all production stores (should have NO seed data)
SELECT id, name, store_code, created_at
FROM stores
WHERE store_code !~ '^(DM|QA|TS|ST)'
ORDER BY created_at DESC;

-- Check for accidentally seeded production stores
SELECT s.store_code, s.name, COUNT(sp.id) as product_count
FROM stores s
LEFT JOIN catalog.store_products sp ON s.id = sp.store_id
WHERE s.store_code !~ '^(DM|QA|TS|ST)'
GROUP BY s.id
HAVING COUNT(sp.id) > 0;
-- Should return NO rows for new production stores
```

---

## Emergency Procedures

### If Production Store Accidentally Seeded

1. **Stop Immediately** - Do not proceed with go-live
2. **Document** - Record which store was affected
3. **Cleanup** - Remove seeded data:
   ```sql
   -- WARNING: Only run for accidentally seeded production stores
   DELETE FROM catalog.store_products WHERE store_id = '<STORE_ID>';
   DELETE FROM sales.bills WHERE store_id = '<STORE_ID>';
   DELETE FROM inventory.ledger WHERE store_id = '<STORE_ID>';
   ```
4. **Verify** - Confirm store is clean
5. **RCA** - Investigate how it happened

---

## Audit Log

Seed operations must be logged:

```typescript
console.log('[SEED] store_code=%s env=%s user=%s timestamp=%s',
  storeCode,
  process.env.NODE_ENV,
  'system',
  new Date().toISOString()
);
```

---

## Summary

| Store Type | Can Seed? | Auto-Created? | Example Code |
|------------|-----------|---------------|--------------|
| Demo | Yes | No (manual) | DM260115-001 |
| QA | Yes | Via script | QA260115-001 |
| Production | NO | Yes | SU260115-001 |

**Golden Rule**: If `store_code` doesn't start with `DM`, `QA`, `TS`, or `ST`, it's production and must NEVER be seeded.
