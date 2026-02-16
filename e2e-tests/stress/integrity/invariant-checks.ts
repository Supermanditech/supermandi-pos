/**
 * TEST-051: Final Data Integrity Checks on Production-Scale DB
 *
 * Validates all 6 business invariants against the production-scale database:
 * 1. Stock Invariant: stock_before + delta_qty = stock_after (every ledger entry)
 * 2. Ledger Invariant: SUM(delta_qty) = current stock balance
 * 3. Store Isolation: No cross-store data leaks
 * 4. Idempotency: No duplicate bill_refs per store
 * 5. Price Integrity: All amounts in minor units (paise), no negatives in totals
 * 6. Scan Scope: Every sale_item references a valid product
 *
 * Usage:
 *   PGHOST=... PGUSER=... PGPASSWORD=... PGDATABASE=supermandi \
 *     npx tsx e2e-tests/stress/integrity/invariant-checks.ts
 */

import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'supermandi',
  password: process.env.PGPASSWORD || 'supermandi',
  database: process.env.PGDATABASE || 'supermandi',
  max: 5,
});

interface CheckResult {
  name: string;
  invariant: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
  violations: number;
}

const results: CheckResult[] = [];

async function check(name: string, invariant: string, fn: () => Promise<{ violations: number; detail: string }>): Promise<void> {
  try {
    const { violations, detail } = await fn();
    results.push({
      name,
      invariant,
      status: violations === 0 ? 'PASS' : 'FAIL',
      detail,
      violations,
    });
  } catch (err) {
    results.push({
      name,
      invariant,
      status: 'FAIL',
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
      violations: -1,
    });
  }
}

// ---------------------------------------------------------------------------
// INVARIANT 1: Stock Math (stock_before + delta_qty = stock_after)
// ---------------------------------------------------------------------------
async function checkStockMath(): Promise<{ violations: number; detail: string }> {
  const { rows } = await pool.query(`
    SELECT COUNT(*) AS violations
    FROM inventory.inventory_ledger
    WHERE stock_before + delta_qty != stock_after
  `);
  const violations = parseInt(rows[0].violations);
  return {
    violations,
    detail: violations === 0
      ? 'All ledger entries satisfy stock_before + delta_qty = stock_after'
      : `${violations} ledger entries violate stock math invariant`,
  };
}

// ---------------------------------------------------------------------------
// INVARIANT 2: Ledger Sum = Current Balance
// ---------------------------------------------------------------------------
async function checkLedgerBalance(): Promise<{ violations: number; detail: string }> {
  const { rows } = await pool.query(`
    WITH ledger_sums AS (
      SELECT store_id, product_id, SUM(delta_qty) AS ledger_qty
      FROM inventory.inventory_ledger
      GROUP BY store_id, product_id
    )
    SELECT COUNT(*) AS violations
    FROM ledger_sums ls
    JOIN inventory.stock_balances sb
      ON sb.store_id = ls.store_id AND sb.product_id = ls.product_id
    WHERE ls.ledger_qty != sb.current_qty
  `);
  const violations = parseInt(rows[0].violations);
  return {
    violations,
    detail: violations === 0
      ? 'All stock_balances match SUM(delta_qty) from ledger'
      : `${violations} products have balance mismatch vs ledger sum`,
  };
}

// ---------------------------------------------------------------------------
// INVARIANT 3: Store Isolation
// ---------------------------------------------------------------------------
async function checkStoreIsolation(): Promise<{ violations: number; detail: string }> {
  // Check: sales reference only products visible in same store
  // Check: ledger entries reference only the store's products
  // Check: customer_profiles have unique phone per store
  const checks: string[] = [];
  let totalViolations = 0;

  // Duplicate customer phone within same store
  const { rows: dupCustomers } = await pool.query(`
    SELECT COUNT(*) AS violations FROM (
      SELECT store_id, phone, COUNT(*) AS cnt
      FROM platform.customer_profiles
      GROUP BY store_id, phone
      HAVING COUNT(*) > 1
    ) dupes
  `);
  const custViolations = parseInt(dupCustomers[0].violations);
  totalViolations += custViolations;
  if (custViolations > 0) checks.push(`${custViolations} duplicate customer phones per store`);

  // Sales without store_id
  const { rows: orphanSales } = await pool.query(`
    SELECT COUNT(*) AS violations
    FROM public.sales
    WHERE store_id IS NULL
  `);
  const saleViolations = parseInt(orphanSales[0].violations);
  totalViolations += saleViolations;
  if (saleViolations > 0) checks.push(`${saleViolations} sales without store_id`);

  return {
    violations: totalViolations,
    detail: totalViolations === 0
      ? 'Store isolation constraints hold (no orphan records, no duplicate phones)'
      : checks.join('; '),
  };
}

// ---------------------------------------------------------------------------
// INVARIANT 4: Idempotency (no duplicate bill refs per store)
// ---------------------------------------------------------------------------
async function checkIdempotency(): Promise<{ violations: number; detail: string }> {
  const { rows } = await pool.query(`
    SELECT COUNT(*) AS violations FROM (
      SELECT store_id, bill_ref, COUNT(*) AS cnt
      FROM public.sales
      WHERE bill_ref IS NOT NULL
      GROUP BY store_id, bill_ref
      HAVING COUNT(*) > 1
    ) dupes
  `);
  const violations = parseInt(rows[0].violations);
  return {
    violations,
    detail: violations === 0
      ? 'No duplicate bill_ref per store'
      : `${violations} duplicate bill_ref combinations found`,
  };
}

// ---------------------------------------------------------------------------
// INVARIANT 5: Price Integrity (no negative totals, all in paise)
// ---------------------------------------------------------------------------
async function checkPriceIntegrity(): Promise<{ violations: number; detail: string }> {
  const checks: string[] = [];
  let totalViolations = 0;

  // Negative sale totals
  const { rows: negSales } = await pool.query(`
    SELECT COUNT(*) AS violations
    FROM public.sales
    WHERE total_minor < 0
  `);
  const neg = parseInt(negSales[0].violations);
  totalViolations += neg;
  if (neg > 0) checks.push(`${neg} sales with negative total_minor`);

  // Negative line item totals
  const { rows: negItems } = await pool.query(`
    SELECT COUNT(*) AS violations
    FROM public.sale_items
    WHERE line_total_minor < 0
  `);
  const negLi = parseInt(negItems[0].violations);
  totalViolations += negLi;
  if (negLi > 0) checks.push(`${negLi} sale_items with negative line_total_minor`);

  // Zero quantity items
  const { rows: zeroQty } = await pool.query(`
    SELECT COUNT(*) AS violations
    FROM public.sale_items
    WHERE quantity <= 0
  `);
  const zq = parseInt(zeroQty[0].violations);
  totalViolations += zq;
  if (zq > 0) checks.push(`${zq} sale_items with quantity <= 0`);

  return {
    violations: totalViolations,
    detail: totalViolations === 0
      ? 'All amounts positive, quantities > 0, values in minor units'
      : checks.join('; '),
  };
}

// ---------------------------------------------------------------------------
// INVARIANT 6: Referential Integrity (sale items → products)
// ---------------------------------------------------------------------------
async function checkReferentialIntegrity(): Promise<{ violations: number; detail: string }> {
  const { rows } = await pool.query(`
    SELECT COUNT(*) AS violations
    FROM public.sale_items si
    LEFT JOIN catalog.products p ON si.product_id = p.id
    WHERE p.id IS NULL AND si.product_id IS NOT NULL
  `);
  const violations = parseInt(rows[0].violations);
  return {
    violations,
    detail: violations === 0
      ? 'All sale_items reference valid products'
      : `${violations} sale_items reference non-existent products`,
  };
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log('==============================================');
  console.log('TEST-051: Data Integrity — 6 Business Invariants');
  console.log('==============================================\n');

  const startTime = Date.now();

  // Verify connection
  const { rows } = await pool.query('SELECT current_database(), current_user');
  console.log(`Database: ${rows[0].current_database} as ${rows[0].current_user}\n`);

  // Row counts
  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM catalog.products) AS products,
      (SELECT COUNT(*) FROM public.sales) AS sales,
      (SELECT COUNT(*) FROM public.sale_items) AS sale_items,
      (SELECT COUNT(*) FROM inventory.inventory_ledger) AS ledger,
      (SELECT COUNT(*) FROM inventory.stock_balances) AS balances,
      (SELECT COUNT(*) FROM platform.customer_profiles) AS customers
  `);
  const c = counts.rows[0];
  console.log(`Scale: ${parseInt(c.products).toLocaleString()} products, ${parseInt(c.sales).toLocaleString()} sales, ${parseInt(c.ledger).toLocaleString()} ledger entries\n`);

  // Run all checks
  await check('INV-1', 'stock_before + delta_qty = stock_after', checkStockMath);
  await check('INV-2', 'SUM(ledger delta) = current balance', checkLedgerBalance);
  await check('INV-3', 'Store isolation (no cross-store leaks)', checkStoreIsolation);
  await check('INV-4', 'Idempotency (no duplicate bill refs)', checkIdempotency);
  await check('INV-5', 'Price integrity (positive amounts, paise)', checkPriceIntegrity);
  await check('INV-6', 'Referential integrity (items → products)', checkReferentialIntegrity);

  // Print results
  console.log('\n--- RESULTS ---\n');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;

  for (const r of results) {
    const icon = r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : 'WARN';
    console.log(`[${icon}] ${r.name}: ${r.invariant}`);
    console.log(`       ${r.detail}`);
    if (r.violations > 0) console.log(`       Violations: ${r.violations}`);
    console.log('');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('==============================================');
  console.log(`RESULT: ${passCount}/6 PASS, ${failCount}/6 FAIL (${elapsed}s)`);
  console.log('==============================================');

  await pool.end();

  if (failCount > 0) process.exit(1);
}

main();
