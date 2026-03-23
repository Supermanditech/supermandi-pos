import * as fs from "fs";
import * as path from "path";

/**
 * GCP-STG-0362: Verify invoice_dispatch_logs is dead schema and cleanup migration exists
 *
 * This test proves:
 * 1. No application code references invoice_dispatch_logs (dead schema)
 * 2. The cleanup migration (228) drops the table
 * 3. The cleanup migration includes rollback instructions
 */
describe("GCP-STG-0362: invoice_dispatch_logs dead schema cleanup", () => {
  const backendSrcDir = path.resolve(__dirname, "../src");
  const migrationFile = path.resolve(
    __dirname,
    "../migrations/228_gcp_stg_0362_drop_invoice_dispatch_logs.sql"
  );

  function walkFiles(dir: string, ext: string): string[] {
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== "node_modules") {
          results.push(...walkFiles(full, ext));
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
          results.push(full);
        }
      }
    } catch {
      // directory may not exist
    }
    return results;
  }

  it("no backend/src .ts file references invoice_dispatch_logs", () => {
    const tsFiles = walkFiles(backendSrcDir, ".ts");
    expect(tsFiles.length).toBeGreaterThan(0); // sanity: src has .ts files

    const violations: string[] = [];
    for (const file of tsFiles) {
      const content = fs.readFileSync(file, "utf8");
      if (content.includes("invoice_dispatch_logs")) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });

  it("no backend/src .js file references invoice_dispatch_logs", () => {
    const jsFiles = walkFiles(backendSrcDir, ".js");
    // Some projects may not have .js files in src — that's fine
    for (const file of jsFiles) {
      const content = fs.readFileSync(file, "utf8");
      expect(content).not.toContain("invoice_dispatch_logs");
    }
  });

  it("cleanup migration 228 exists and drops the table", () => {
    expect(fs.existsSync(migrationFile)).toBe(true);

    const sql = fs.readFileSync(migrationFile, "utf8");
    expect(sql).toContain("DROP TABLE IF EXISTS public.invoice_dispatch_logs");
  });

  it("cleanup migration includes ROLLBACK comment with CREATE TABLE", () => {
    const sql = fs.readFileSync(migrationFile, "utf8");
    expect(sql).toContain("ROLLBACK:");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.invoice_dispatch_logs");
  });

  it("cleanup migration drops associated indexes", () => {
    const sql = fs.readFileSync(migrationFile, "utf8");
    expect(sql).toContain("DROP INDEX IF EXISTS idx_invoice_dispatch_invoice_id");
    expect(sql).toContain("DROP INDEX IF EXISTS idx_invoice_dispatch_status");
  });
});
