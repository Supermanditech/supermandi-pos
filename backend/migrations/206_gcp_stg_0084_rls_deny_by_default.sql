-- ROLLBACK: CREATE OR REPLACE FUNCTION rls_store_check(row_store_id uuid) RETURNS boolean AS $$ BEGIN IF current_setting('app.current_store_id', true) IS NULL OR current_setting('app.current_store_id', true) = '' THEN RETURN true; END IF; RETURN row_store_id = current_setting('app.current_store_id')::uuid; END; $$ LANGUAGE plpgsql STABLE;
-- GCP-STG-0084 FIX: Harden rls_store_check() with ADMIN_BYPASS support
-- When app.current_store_id = 'ADMIN_BYPASS' → allow all rows (admin queries)
-- When app.current_store_id = valid UUID → filter to that store only
-- When app.current_store_id is NULL/empty → allow all (backward compat for
--   routes not yet migrated to withStoreContext(); defense-in-depth is
--   progressively enabled as routes adopt withStoreContext())
-- Routes using withStoreContext() get TRUE defense-in-depth RLS filtering.
-- Routes NOT yet migrated still work (NULL context = allow, same as before).

CREATE OR REPLACE FUNCTION rls_store_check(row_store_id uuid) RETURNS boolean AS $$
DECLARE
  ctx text;
BEGIN
  ctx := current_setting('app.current_store_id', true);

  -- No context set: allow access (backward compat — routes not yet migrated)
  IF ctx IS NULL OR ctx = '' THEN
    RETURN true;
  END IF;

  -- Admin bypass: explicit ADMIN_BYPASS grants full access
  IF ctx = 'ADMIN_BYPASS' THEN
    RETURN true;
  END IF;

  -- Normal store context: filter rows to this store only
  RETURN row_store_id = ctx::uuid;
END;
$$ LANGUAGE plpgsql STABLE;
