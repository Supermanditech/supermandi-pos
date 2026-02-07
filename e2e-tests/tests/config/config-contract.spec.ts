/**
 * CONFIG-CONTRACT: Config wiring smoke test @config
 *
 * Hits GET /api/v1/config-status and asserts every boolean is true.
 * Catches env var wiring mismatches (e.g. code reads REDIS_HOST but
 * compose only sets REDIS_URL, or ADMIN_EMAIL_ALLOWLIST is missing).
 *
 * Run alongside onboarding tests:
 *   npx playwright test --grep "@onboarding|@config"
 */

import { test, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE_URL || "http://localhost:3010";

test.describe("@config Contract", () => {
  // ONB-GATE-004: Locked-down schema — if a key is renamed or removed, this fails
  const REQUIRED_KEYS = [
    "sms",
    "email",
    "portalUrl",
    "posAppUrl",
    "hasRedisHost",
    "hasAdminAllowlist",
    "hasSmsProvider",
    "hasDatabaseUrl",
    "hasJwtSecret",
  ];

  test("Schema: all required keys present and boolean", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/config-status`);
    expect(res.status()).toBe(200);

    const body = await res.json();

    for (const key of REQUIRED_KEYS) {
      expect(body).toHaveProperty(key);
      expect(typeof body[key], `${key} must be boolean, got ${typeof body[key]}`).toBe("boolean");
    }
  });

  test("Wiring: all infra booleans are true under local-prod", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/config-status`);
    expect(res.status()).toBe(200);

    const body = await res.json();

    // Infrastructure wiring — every key must be true
    const infraKeys = [
      "hasRedisHost",
      "hasAdminAllowlist",
      "hasSmsProvider",
      "hasDatabaseUrl",
      "hasJwtSecret",
    ];

    for (const key of infraKeys) {
      expect(body[key], `${key} must be true — env var wiring broken`).toBe(true);
    }

    // Onboarding feature URLs — must be configured
    expect(body.portalUrl, "PORTAL_BASE_URL not set").toBe(true);
    expect(body.posAppUrl, "POS_APP_DOWNLOAD_URL not set").toBe(true);
  });

  test("SMS is either enabled or explicitly disabled", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/config-status`);
    const body = await res.json();

    // hasSmsProvider means SMS_PROVIDER is set OR SMS_DISABLED=true
    // This catches the case where neither is set (silent misconfiguration)
    expect(body.hasSmsProvider, "SMS neither enabled nor explicitly disabled").toBe(true);
  });
});
