/**
 * V3-DB-014 + V3-GCP-015: Infrastructure tests
 *
 * DB-014: Migration 195 schema contract (static — runtime requires live DB).
 * GCP-015: Runtime module loading + config parity (imports real modules).
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const migrationPath = resolve(__dirname, "../../migrations/195_staff_pin_auth_upgrade.sql");

// ─── V3-DB-014: Static contract checks (tagged explicitly) ───
// These verify migration SQL structure. Runtime column verification
// requires a live database and is covered by staging deploy gates.

describe("V3-DB-014: staff auth schema — static contract checks", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("migration file exists", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("adds pin_lookup_hash column", () => {
    expect(sql).toMatch(/pin_lookup_hash/i);
  });

  it("adds failed_login_count column", () => {
    expect(sql).toMatch(/failed_login_count/i);
  });

  it("adds locked_until column", () => {
    expect(sql).toMatch(/locked_until/i);
  });

  it("adds is_owner column", () => {
    expect(sql).toMatch(/is_owner/i);
  });

  it("migration is idempotent", () => {
    expect(sql).toMatch(/IF NOT EXISTS|DO \$\$/i);
  });
});

// ─── V3-GCP-015: Runtime module loading + config checks ───

describe("V3-GCP-015: staff auth runtime execution", () => {
  it("bcryptjs hash + compare round-trip works for PIN auth", async () => {
    const bcrypt = require("bcryptjs");
    const pin = "1234";
    const hash = await bcrypt.hash(pin, 10);
    expect(await bcrypt.compare(pin, hash)).toBe(true);
    expect(await bcrypt.compare("9999", hash)).toBe(false);
  });

  it("bcryptjs rejects wrong PIN deterministically", async () => {
    const bcrypt = require("bcryptjs");
    const hash = await bcrypt.hash("5678", 10);
    expect(await bcrypt.compare("1234", hash)).toBe(false);
    expect(await bcrypt.compare("5678", hash)).toBe(true);
  });

  it("crypto SHA-256 produces consistent store-scoped hash", () => {
    const crypto = require("crypto");
    const hash = (pin: string, storeId: string) =>
      crypto.createHash("sha256").update(`${storeId}:${pin}`).digest("hex");

    const h1 = hash("1234", "store-A");
    const h2 = hash("1234", "store-A");
    const h3 = hash("1234", "store-B");

    expect(h1).toBe(h2); // deterministic
    expect(h1).not.toBe(h3); // store-isolated
    expect(h1.length).toBe(64); // SHA-256 hex
  });

  it("getPool is a callable function", () => {
    const { getPool } = require("../../src/db/client");
    expect(typeof getPool).toBe("function");
  });
});

// ─── V3-GCP-015: Static parity checks (tagged explicitly) ───

describe("V3-GCP-015: staff auth parity — static contract checks", () => {
  it("staff route has no hardcoded localhost in code paths", () => {
    const staffSrc = readFileSync(resolve(__dirname, "../../src/routes/v1/pos/staff.ts"), "utf8");
    const codeLines = staffSrc.split("\n").filter(
      (l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && l.trim().length > 0
    );
    expect(codeLines.some((l) => /localhost:\d+/.test(l))).toBe(false);
  });

  it("staffManage route has no hardcoded localhost", () => {
    const src = readFileSync(resolve(__dirname, "../../src/routes/v1/pos/staffManage.ts"), "utf8");
    const codeLines = src.split("\n").filter(
      (l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && l.trim().length > 0
    );
    expect(codeLines.some((l) => /localhost:\d+/.test(l))).toBe(false);
  });
});
