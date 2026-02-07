# Onboarding Migrations — Safety Contract

## Overview

5 migrations (109–113) support the onboarding V2.1 feature set.
All are **additive** and **idempotent** — safe to run multiple times.

## Migration Inventory

### 109 — Fix generate_store_code() (DRX-002)
- **Type:** Function CREATE OR REPLACE + table CREATE IF NOT EXISTS
- **Additive:** Yes — creates table and function if missing, replaces function if exists
- **Idempotent:** Yes — all statements use IF NOT EXISTS / OR REPLACE
- **Rollback:** `DROP FUNCTION IF EXISTS platform.generate_store_code(TEXT);`
- **Verification:** Built-in — generates 3 test codes and validates format + uniqueness

### 110 — De-duplication constraints (RO-006)
- **Type:** ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS + VIEW recreate
- **Additive:** Yes — adds `created_via` column and `ux_stores_gst_number` index
- **Idempotent:** Yes — guards on all DDL statements
- **Rollback:** `DROP INDEX IF EXISTS platform.ux_stores_gst_number; ALTER TABLE platform.stores DROP COLUMN IF EXISTS created_via;`
- **Verification:** Built-in — checks column and index existence at end
- **Note:** Deduplicates existing `gst_number` values (NULLs older duplicates) before creating unique index

### 111 — Registration events table (RO-001)
- **Type:** CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS
- **Additive:** Yes — creates `auth.registration_events` table
- **Idempotent:** Yes — all IF NOT EXISTS
- **Rollback:** `DROP TABLE IF EXISTS auth.registration_events CASCADE;`
- **Verification:** Table existence check in apply script

### 112 — Single-store per owner (DR-011)
- **Type:** CREATE UNIQUE INDEX IF NOT EXISTS
- **Additive:** Yes — partial unique index on `auth.store_users`
- **Idempotent:** Yes — IF NOT EXISTS
- **Rollback:** `DROP INDEX IF EXISTS auth.idx_store_users_single_owner;`
- **Verification:** Index existence check in apply script
- **Pre-condition:** No user should own multiple active stores (will fail if violated)

### 113 — Legacy application cleanup (DR-012)
- **Type:** UPDATE with idempotent guards (DO $$ block, not wrapped in BEGIN/COMMIT)
- **Additive:** Yes — only updates existing rows, never deletes
- **Idempotent:** Yes — WHERE guards prevent double-updates
- **Rollback:** Manual — review `auth.application_status_log` entries with reason prefix `DR-012:`
- **Verification:** Built-in — prints NOTICE report with counts

## Apply Order

Migrations MUST be applied in order: **109 → 110 → 111 → 112 → 113**

- 109 has no dependencies on others
- 110 depends on `platform.stores` table (pre-existing)
- 111 depends on `auth.users` and `platform.stores` (pre-existing)
- 112 depends on `auth.store_users` (pre-existing)
- 113 depends on `auth.applications` and `platform.stores` (pre-existing)

## Apply Script

```bash
# Bash (Linux/macOS/Git Bash on Windows)
bash scripts/db/apply_onboarding_migrations.sh

# PowerShell (Windows)
powershell -ExecutionPolicy Bypass -File scripts/db/apply_onboarding_migrations.ps1
```

Both scripts:
1. Apply migrations 109–113 in order
2. Run verification SQL checks after each
3. Print PASS/FAIL at end
4. Are safe to run twice (idempotent)
