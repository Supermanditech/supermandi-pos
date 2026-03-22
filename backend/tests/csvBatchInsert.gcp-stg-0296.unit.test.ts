/**
 * GCP-STG-0296: Supplier CSV bulk insert uses batch transaction wrapping
 * (was one-by-one with pool.query, now chunks of 200 in client transactions)
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/supplier/products.ts"), "utf8"
);

describe("GCP-STG-0296: Supplier CSV batch INSERT + transaction", () => {
  test("supplier CSV uses chunked transaction loop", () => {
    expect(SRC).toContain("SUPPLIER_CSV_CHUNK");
    expect(SRC).toContain("chunkStart");
  });

  test("chunk loop wraps rows in BEGIN/COMMIT", () => {
    // The chunk processing must have BEGIN and COMMIT
    const beginCount = (SRC.match(/await client\.query\("BEGIN"\)/g) || []).length;
    const commitCount = (SRC.match(/await client\.query\("COMMIT"\)/g) || []).length;
    expect(beginCount).toBeGreaterThanOrEqual(1);
    expect(commitCount).toBeGreaterThanOrEqual(1);
  });

  test("chunk loop has ROLLBACK on error", () => {
    expect(SRC).toContain('await client.query("ROLLBACK")');
  });

  test("dedup queries use client (not pool) inside transaction", () => {
    // The barcode dedup query should use client.query, not pool.query
    const dedupSection = SRC.substring(
      SRC.indexOf("Dedup — check if barcode already exists for this supplier"),
      SRC.indexOf("end row loop")
    );
    expect(dedupSection).toContain("await client.query");
    expect(dedupSection).not.toContain("await pool.query");
  });

  test("client is released in finally block", () => {
    expect(SRC).toContain("client.release()");
  });

  test("chunk size is 200", () => {
    expect(SRC).toContain("SUPPLIER_CSV_CHUNK = 200");
  });
});
