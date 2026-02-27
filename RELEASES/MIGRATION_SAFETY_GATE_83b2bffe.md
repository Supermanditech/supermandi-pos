# Migration Safety Gate

> Target SHA: `83b2bffe`
> Migrations: 27 (141–167)
> Generated: 2026-02-27
> Status: **CONDITIONAL GO** — requires Cloud SQL backup before execution

---

## 1. Migration Inventory

| # | File | Operation | Idempotent | Risk |
|---|------|-----------|------------|------|
| 141 | `141_t144_batch_lot_expiry.sql` | ADD COLUMN (batch_number, expiry_date) | YES | LOW |
| 142 | `142_t145_purchase_cart_drafts.sql` | CREATE TABLE | YES | LOW |
| 143 | `143_t150_refunds.sql` | CREATE TABLE | YES | LOW |
| 144 | `144_t177_stock_version.sql` | ADD COLUMN (stock_version) | YES | LOW |
| 145 | `145_t191_daily_closings.sql` | CREATE TABLE | YES | LOW |
| 146 | `146_t192_staff_shifts.sql` | CREATE TABLE + ADD COLUMNs | YES | LOW |
| 147 | `147_t132_trgm_search_index.sql` | CREATE INDEX (GIN trigram) | YES | LOW |
| 148 | `148_t202_store_bank_account.sql` | ADD COLUMN | YES | LOW |
| **149** | **`149_t216_row_level_security.sql`** | **ENABLE RLS + FORCE on 27 tables** | **YES** | **CRITICAL** |
| 150 | `150_t236_t237_reorder_schema_unification.sql` | UNIFY SCHEMA + DROP legacy tables | YES | MEDIUM |
| 151 | `151_t250_pending_reorder_fulfilled_status.sql` | ALTER CHECK CONSTRAINT | YES | MEDIUM |
| 152 | `152_phase8_notifications_and_compliance.sql` | CREATE 5 schemas + 7 tables | YES | LOW |
| 153 | `153_t258_payout_retry_queue.sql` | CREATE TABLE + ADD COLUMNs | YES | MEDIUM |
| 154 | `154_t263_credit_provider_abstraction.sql` | CREATE 5 tables + seed | YES | MEDIUM |
| 155 | `155_t291_chat_schema.sql` | CREATE 4 tables + seed | YES | LOW |
| 156 | `156_t303_t316_ai_automation_schema.sql` | CREATE 6 tables | YES | LOW |
| 157 | `157_fix011_refresh_token_hash_index.sql` | CREATE INDEX | YES | LOW |
| 159 | `159_whatsapp_message_log.sql` | CREATE SCHEMA + TABLE | YES | LOW |
| 160 | `160_pra080_concurrency_constraints.sql` | ADD CHECK + UNIQUE INDEX | YES | MEDIUM |
| **161** | **`161_pra084_rls_gap_coverage.sql`** | **ENABLE RLS on 8 gap tables** | **YES** | **CRITICAL** |
| 162 | `162_wave3_schema_integrity.sql` | ADD COLUMN + backfill + RLS | YES | MEDIUM |
| **163** | **`163_wave3b_type_normalization.sql`** | **TEXT→UUID conversion on 15+ tables** | **YES** | **HIGH** |
| **164** | **`164_wave3b_full_rls_coverage.sql`** | **ENABLE RLS on 27+ remaining tables** | **YES** | **CRITICAL** |
| 165 | `165_onboarding_schema_hardening.sql` | ADD FK + RLS + indexes | YES | MEDIUM |
| 166 | `166_add_enrollment_code_hash.sql` | ADD COLUMN + trigger + backfill | YES | MEDIUM |
| 167 | `167_whatsapp_cta_config.sql` | CREATE TABLE + seed | YES | LOW |

---

## 2. Execution Groups

### Group A: Schema Extensions (141–148) — LOW RISK
- Pure additive: new columns, new tables, new indexes
- No existing data modified
- All idempotent with `IF NOT EXISTS`
- **Estimated time**: 1–2 minutes
- **Rollback**: `ALTER TABLE DROP COLUMN IF EXISTS`, `DROP TABLE IF EXISTS`

### Group B: RLS Phase 1 (149) — CRITICAL
- Enables RLS on 27 store-scoped tables
- Creates `rls_store_check()` function using `app.current_store_id` session variable
- Uses `FORCE ROW LEVEL SECURITY` on table owner
- **Admin/system bypass**: Queries without `SET LOCAL app.current_store_id` see all rows
- **Estimated time**: 30 seconds
- **Rollback**: `ALTER TABLE DISABLE ROW LEVEL SECURITY` on all 27 tables

**PREREQUISITE**: Backend code MUST set `SET LOCAL app.current_store_id = '<uuid>'` before store-scoped queries. This is already implemented in the backend code at `83b2bffe`.

### Group C: Schema Unification + Features (150–159) — MEDIUM
- Reorder schema unification (150): drops legacy 044 conflict tables
- New schemas: notifications, chat, ai, whatsapp, invoicing
- Credit provider abstraction with seeded data
- **Estimated time**: 2–3 minutes
- **Rollback**: `DROP TABLE IF EXISTS` for new tables; legacy 044 tables cannot be restored (data migrated)

### Group D: Integrity Hardening (160–162) — MEDIUM
- Concurrency constraints (160)
- RLS gap coverage for 8 tables (161)
- sale_items store_id backfill from sales (162)
- **Estimated time**: 1–2 minutes
- **Rollback**: `DROP CONSTRAINT`, `ALTER TABLE DISABLE ROW LEVEL SECURITY`

### Group E: Type Normalization (163) — HIGH RISK
- Drops all dependent views
- Deletes non-UUID demo data from `pos_devices`
- Converts TEXT→UUID on store_id columns across 15+ tables
- Adds FK constraints
- **Estimated time**: 2–5 minutes (depends on data volume)
- **Rollback**: Complex — requires restoring from backup if data loss occurs
- **Safe on staging**: Staging has minimal data, so TEXT→UUID conversion will be fast

### Group F: Full RLS + Onboarding (164–167) — CRITICAL
- Full RLS on all remaining store-scoped tables (164)
- TEXT overload of `rls_store_check()` for pre-163 compatibility
- FK + RLS on auth.applications (165)
- Enrollment code hash with SHA256 trigger (166)
- WhatsApp CTA config table (167)
- **Estimated time**: 1–2 minutes
- **Rollback**: `ALTER TABLE DISABLE ROW LEVEL SECURITY`, `DROP TABLE IF EXISTS`

---

## 3. Dependency Chain

```
141–148 (independent, can run in any order)
  └→ 149 (RLS Phase 1 — creates rls_store_check function)
       └→ 150–159 (independent of each other, all need base schema from 141–148)
            └→ 160 (concurrency constraints)
            └→ 161 (RLS gap coverage — depends on 149's rls_store_check)
            └→ 162 (schema integrity — depends on 149's rls_store_check)
                 └→ 163 (type normalization — must run AFTER 149/161/162)
                      └→ 164 (full RLS — depends on 163's UUID columns)
                           └→ 165 (onboarding — depends on 164's RLS)
                           └→ 166 (enrollment code hash — independent)
                           └→ 167 (WhatsApp CTA — independent)
```

**STRICT ORDER**: Migrations MUST run sequentially 141→167. The migration runner enforces this.

---

## 4. Backward Compatibility

### During Rolling Deploy Window
- **Before migration**: Backend at `badc3fbe` continues to work (no RLS, no new tables)
- **After migration, before backend deploy**: Old backend code will NOT set `app.current_store_id` session variable → RLS bypass allows all rows → **no breakage, but no RLS enforcement**
- **After migration + backend deploy**: New backend sets `app.current_store_id` → RLS enforced → store isolation active
- **Conclusion**: Safe for rolling deploy. Migration can run before backend deploy without service disruption.

### Breaking Changes
- Migration 150 DROPS `reorder.store_settings` and `reorder.product_policies` (legacy 044 tables) after migrating data → irreversible without backup
- Migration 163 DROPS dependent views and converts column types → irreversible without backup
- Migration 166 triggers auto-hash on enrollment codes → no backward issue

---

## 5. Operator Backup Prerequisite

**MANDATORY before running ANY migration:**

```bash
# 1. Create Cloud SQL backup
gcloud sql backups create --instance=supermandi-db --project=supermandi-backend

# 2. Verify backup exists
gcloud sql backups list --instance=supermandi-db --project=supermandi-backend --limit=3

# 3. Note backup ID for rollback reference
```

**Backup must complete BEFORE migration 149.** If migration 163 fails (type conversion), restore from this backup.

---

## 6. Dry-Run Plan

```bash
# Run dry-run to preview pending migrations
node backend/scripts/migrate-prod.js --dry-run

# Expected output:
# Pending migrations: 27
# 141_t144_batch_lot_expiry.sql
# 142_t145_purchase_cart_drafts.sql
# ... (all 27 listed)
# DRY RUN — no changes applied
```

---

## 7. Execution Command

```bash
# Apply all 27 migrations (sequential, transactional)
node backend/scripts/migrate-prod.js

# Verify final migration version
# Expected: 167 (167_whatsapp_cta_config.sql)
```

---

## 8. Post-Migration Verification

```bash
# Verify RLS is active on critical tables
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname IN ('public', 'platform', 'catalog', 'inventory', 'orders', 'supplier', 'payments', 'reorder')
AND rowsecurity = true;
# Expected: 60+ rows

# Verify rls_store_check function exists
SELECT proname FROM pg_proc WHERE proname = 'rls_store_check';
# Expected: 2 rows (uuid + text overloads)

# Verify new schemas exist
SELECT schema_name FROM information_schema.schemata
WHERE schema_name IN ('notifications', 'chat', 'ai', 'whatsapp', 'invoicing');
# Expected: 5 rows

# Verify WhatsApp CTA config seeded
SELECT * FROM platform.whatsapp_cta_config;
# Expected: 1 row with default values
```

---

## 9. Safety Verdict

| Check | Status |
|-------|--------|
| All 27 migrations idempotent | **PASS** |
| Dependency order enforced by runner | **PASS** |
| Backward compatible during rolling deploy | **PASS** |
| No data loss risk (additive only, except M150/M163) | **CONDITIONAL** |
| Cloud SQL backup prerequisite documented | **PASS** |
| Dry-run command documented | **PASS** |
| Rollback plan per group documented | **PASS** |
| Post-migration verification queries documented | **PASS** |

**VERDICT**: **CONDITIONAL GO** — proceed with migrations ONLY after Cloud SQL backup completes.
