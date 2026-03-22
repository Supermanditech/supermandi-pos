/**
 * GCP-STG-0280: Quality dashboard uses schema-qualified table names
 * Verifies ALLOWED_TABLES Map contains correct schema.table references
 */
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../src/routes/v1/admin/qualityDashboard.ts");

describe("GCP-STG-0280: qualityDashboard schema-qualified tables", () => {
  const source = fs.readFileSync(SRC, "utf8");

  test("ALLOWED_TABLES is a Map (not a Set)", () => {
    expect(source).toContain("new Map([");
    expect(source).not.toMatch(/ALLOWED_TABLES\s*=\s*new\s+Set/);
  });

  const requiredTables = [
    ["stores", "platform.stores"],
    ["users", "auth.users"],
    ["products", "catalog.products"],
    ["purchase_orders", "orders.purchase_orders"],
    ["devices", "public.pos_devices"],
    ["suppliers", "supplier.suppliers"],
    ["sell_payments", "payments.sell_payments"],
  ];

  for (const [label, qualified] of requiredTables) {
    test(`maps '${label}' → '${qualified}'`, () => {
      expect(source).toContain(`['${label}', '${qualified}']`);
    });
  }

  test("uses schema-qualified name in query (no double-quoted bare table)", () => {
    expect(source).toContain("FROM ${qualifiedName}");
    expect(source).not.toMatch(/FROM\s+"\$\{table\}"/);
  });

  test("no unqualified table names in allowlist", () => {
    // Extract only the ALLOWED_TABLES Map block
    const mapBlock = source.match(/ALLOWED_TABLES\s*=\s*new\s+Map\(\[([\s\S]*?)\]\)/);
    expect(mapBlock).not.toBeNull();
    const entries = mapBlock![1].match(/\['[^']+',\s*'([^']+)'\]/g) || [];
    expect(entries.length).toBe(7);
    for (const entry of entries) {
      const match = entry.match(/,\s*'([^']+)'\]/);
      if (match) {
        expect(match[1]).toContain(".");
      }
    }
  });
});
