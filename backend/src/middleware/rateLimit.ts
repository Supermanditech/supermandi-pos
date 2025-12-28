import type { NextFunction, Request, Response } from "express";

// Simple in-memory rate limit (per PM2 process) to control costs.
export function rateLimitAi(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip || "unknown";
    const arr = hits.get(key) ?? [];
    const filtered = arr.filter((t) => now - t < opts.windowMs);
    filtered.push(now);
    hits.set(key, filtered);

    if (filtered.length > opts.max) {
      res.status(429).json({ error: "Rate limit exceeded" });
      return;
    }

    next();
  };
}
