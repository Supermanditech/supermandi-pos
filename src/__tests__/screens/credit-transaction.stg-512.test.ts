/**
 * STG-512: Credit score calculation — REPEATABLE READ transaction
 *
 * Verifies that calculateCreditScore wraps all queries in a single
 * REPEATABLE READ transaction with proper client lifecycle.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../../backend/src/routes/v1/pos/credit.ts"
);

describe("STG-512: Credit score REPEATABLE READ transaction", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("acquires a client from pool", () => {
    expect(content).toContain("pool.connect()");
  });

  test("begins REPEATABLE READ transaction", () => {
    expect(content).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ");
  });

  test("commits the transaction", () => {
    expect(content).toContain("await client.query('COMMIT')");
  });

  test("releases client in finally block", () => {
    expect(content).toContain("client.release()");
  });

  test("all queries within calculateCreditScore use client, not pool", () => {
    // Extract the calculateCreditScore function body
    const fnStart = content.indexOf("async function calculateCreditScore");
    const fnEnd = content.indexOf("\n}", fnStart) + 2;
    const fnBody = content.slice(fnStart, fnEnd);

    // After BEGIN, all .query calls should be client.query, not pool.query
    const afterBegin = fnBody.slice(fnBody.indexOf("BEGIN ISOLATION LEVEL"));
    const poolQueryCount = (afterBegin.match(/pool\.query/g) || []).length;
    expect(poolQueryCount).toBe(0);
  });
});
