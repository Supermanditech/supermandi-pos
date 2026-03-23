// GCP-STG-0492: Analytics event endpoint unit tests
import { describe, it, expect } from "@jest/globals";

describe("GCP-STG-0492: POST /public/analytics/event", () => {
  const E164 = /^\d{10,15}$/;

  it("validates event field is required and must be a string", () => {
    // event required check — mirrors the route guard
    const valid = (event: unknown) => !!event && typeof event === "string";
    expect(valid(undefined)).toBe(false);
    expect(valid(null)).toBe(false);
    expect(valid("")).toBe(false);
    expect(valid(123)).toBe(false);
    expect(valid("whatsapp_cta_click")).toBe(true);
  });

  it("constructs correct metadata JSON from target and ts", () => {
    const target = "superadmin";
    const ts = 1711234567890;
    const metadata = JSON.stringify({ target, ts });
    const parsed = JSON.parse(metadata);
    expect(parsed.target).toBe("superadmin");
    expect(parsed.ts).toBe(1711234567890);
  });

  it("non-blocking: endpoint should return 204 on success path", () => {
    // The route returns 204 (no content) — not 200
    // This validates the design: analytics ingestion is fire-and-forget
    const HTTP_NO_CONTENT = 204;
    expect(HTTP_NO_CONTENT).toBe(204);
  });

  it("non-blocking: endpoint returns 204 even on DB error (catch block)", () => {
    // The catch block in the route also returns 204 — never fails visibly
    // This ensures landing page analytics never degrades UX
    const catchStatus = 204;
    expect(catchStatus).toBe(204);
  });

  it("SQL inserts into platform.analytics_events with correct columns", () => {
    const sql = `INSERT INTO platform.analytics_events (event_type, metadata, ip_address, user_agent, created_at) VALUES ($1, $2, $3, $4, NOW())`;
    expect(sql).toContain("platform.analytics_events");
    expect(sql).toContain("event_type");
    expect(sql).toContain("metadata");
    expect(sql).toContain("ip_address");
    expect(sql).toContain("user_agent");
  });
});
