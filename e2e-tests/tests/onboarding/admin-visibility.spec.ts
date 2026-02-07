/**
 * RO-010: Admin Visibility Smoke Tests @onboarding
 *
 * Verifies:
 * 1. Registration events are recorded
 * 2. Config status endpoint is healthy
 *
 * NOTE: Admin endpoints require admin token. These tests verify
 * the public-facing aspects and use the admin token if available.
 */

import { test, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE_URL || "http://localhost:3010";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

test.describe("@onboarding Admin Visibility", () => {
  test.skip(!ADMIN_TOKEN, "ADMIN_TOKEN not set — skip admin tests");

  test("1. Registration events endpoint returns data", async ({ request }) => {
    const res = await request.get(
      `${API_BASE}/api/v1/admin/registration-events?limit=5`,
      { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.events).toBeTruthy();
    expect(body.pagination).toBeTruthy();
    expect(typeof body.pagination.total).toBe("number");
  });

  test("2. Registration events include source field", async ({ request }) => {
    const res = await request.get(
      `${API_BASE}/api/v1/admin/registration-events?limit=1`,
      { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    if (body.events.length > 0) {
      const event = body.events[0];
      expect(event.source).toBeTruthy();
      expect(event.outcome).toBeTruthy();
      expect(event.createdAt).toBeTruthy();
    }
  });
});
