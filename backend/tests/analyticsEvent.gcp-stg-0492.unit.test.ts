/**
 * GCP-STG-0492: POST /public/analytics/event — behavioral supertest tests
 *
 * Mounts publicConfigRouter, mocks getPool, verifies HTTP responses + DB calls.
 */

const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../src/middleware/rateLimit", () => ({
  redisRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

import express from "express";
import request from "supertest";
import { publicConfigRouter } from "../src/routes/v1/publicConfig";

const app = express();
app.use(express.json());
app.use("/public", publicConfigRouter);

beforeEach(() => mockQuery.mockReset());

describe("GCP-STG-0492: POST /public/analytics/event", () => {
  test("valid event returns 204 and inserts to DB", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/public/analytics/event")
      .send({ event: "whatsapp_cta_click", target: "superadmin", ts: 1711234567890 });

    expect(res.status).toBe(204);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("INSERT INTO platform.analytics_events");
    expect(sql).toContain("event_type");
    const params = mockQuery.mock.calls[0][1];
    expect(params[0]).toBe("whatsapp_cta_click");
    expect(JSON.parse(params[1])).toEqual({ target: "superadmin", ts: 1711234567890 });
  });

  test("missing event field returns 400", async () => {
    const res = await request(app)
      .post("/public/analytics/event")
      .send({ target: "company" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("event required");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("empty string event returns 400", async () => {
    const res = await request(app)
      .post("/public/analytics/event")
      .send({ event: "" });

    expect(res.status).toBe(400);
  });

  test("DB error still returns 204 (non-blocking)", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(app)
      .post("/public/analytics/event")
      .send({ event: "whatsapp_cta_click", target: "superadmin" });

    expect(res.status).toBe(204);
  });

  test("numeric event field returns 400 (must be string)", async () => {
    const res = await request(app)
      .post("/public/analytics/event")
      .send({ event: 123 });

    expect(res.status).toBe(400);
  });
});
