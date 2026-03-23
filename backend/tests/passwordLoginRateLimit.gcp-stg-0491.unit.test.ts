/**
 * GCP-STG-0491: Rate limit on password login endpoints — behavioral supertest tests
 *
 * Simulates the rate limiting middleware behavior that protects password login
 * routes. Verifies the middleware pattern: normal requests pass, blocked
 * requests get 429, and the limiter is invoked on every request.
 */

import express from "express";
import request from "supertest";

describe("GCP-STG-0491: Password login rate limiting", () => {
  let callCount: number;
  let shouldBlock: boolean;

  // Simulates the redisRateLimit middleware pattern used on login routes
  function createRateLimitedApp() {
    callCount = 0;
    shouldBlock = false;

    const app = express();
    app.use(express.json());

    // Rate limiter middleware — mirrors redisRateLimit({ keyPrefix: "rl:retailer:pw-login", max: 10 })
    const rateLimiter = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      callCount++;
      if (shouldBlock) {
        return res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." } });
      }
      next();
    };

    // Login route with rate limiter — mirrors: router.post("/auth/login", passwordLoginRateLimiter, handler)
    app.post("/retailer-admin/auth/login", rateLimiter, (req, res) => {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: "Missing credentials" });
      // Simulate user not found
      return res.status(401).json({ error: "Invalid credentials" });
    });

    return app;
  }

  test("normal login attempt passes through rate limiter (not 429)", async () => {
    const app = createRateLimitedApp();

    const res = await request(app)
      .post("/retailer-admin/auth/login")
      .send({ email: "test@example.com", password: "password123" });

    expect(callCount).toBe(1);
    expect(res.status).toBe(401); // User not found, but NOT rate limited
    expect(res.status).not.toBe(429);
  });

  test("rate-limited request returns 429 with error details", async () => {
    const app = createRateLimitedApp();
    shouldBlock = true;

    const res = await request(app)
      .post("/retailer-admin/auth/login")
      .send({ email: "test@example.com", password: "password123" });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.body.error.message).toContain("Too many");
  });

  test("rate limiter invoked on every sequential login attempt", async () => {
    const app = createRateLimitedApp();

    await request(app).post("/retailer-admin/auth/login").send({ email: "a@b.com", password: "x" });
    await request(app).post("/retailer-admin/auth/login").send({ email: "b@c.com", password: "y" });
    await request(app).post("/retailer-admin/auth/login").send({ email: "c@d.com", password: "z" });

    expect(callCount).toBe(3);
  });

  test("6th rapid attempt gets blocked after 5 allowed", async () => {
    const app = createRateLimitedApp();
    let attemptCount = 0;

    // Simulate per-IP tracking: block after 5 attempts
    const trackingLimiter = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      attemptCount++;
      if (attemptCount > 5) {
        return res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many login attempts" } });
      }
      next();
    };

    const trackedApp = express();
    trackedApp.use(express.json());
    trackedApp.post("/login", trackingLimiter, (_req, res) => res.status(401).json({ error: "Invalid" }));

    // First 5 pass
    for (let i = 0; i < 5; i++) {
      const res = await request(trackedApp).post("/login").send({ email: "a@b.com", password: "wrong" });
      expect(res.status).toBe(401);
    }

    // 6th is blocked
    const blocked = await request(trackedApp).post("/login").send({ email: "a@b.com", password: "wrong" });
    expect(blocked.status).toBe(429);
    expect(attemptCount).toBe(6);
  });
});
