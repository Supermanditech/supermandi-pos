import type { NextFunction, Request, Response } from "express";

/**
 * Simple in-memory rate limit (per PM2 process) to control costs.
 * GO-LIVE-191: Added periodic cleanup to prevent memory leaks.
 */
export function rateLimitAi(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();
  let lastCleanup = Date.now();
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  const MAX_ENTRIES = 10000; // Maximum entries to prevent unbounded growth

  // GO-LIVE-191: Cleanup function to prevent memory leaks
  function cleanupStaleEntries(now: number): void {
    // Only run cleanup every CLEANUP_INTERVAL_MS
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

    lastCleanup = now;
    const staleThreshold = now - opts.windowMs * 2; // Remove entries 2x older than window

    for (const [key, timestamps] of hits.entries()) {
      // Remove entries where all timestamps are stale
      const latestTimestamp = Math.max(...timestamps, 0);
      if (latestTimestamp < staleThreshold) {
        hits.delete(key);
      }
    }

    // GO-LIVE-191: If still over limit, remove oldest entries
    if (hits.size > MAX_ENTRIES) {
      const entriesToRemove = hits.size - MAX_ENTRIES;
      const iterator = hits.keys();
      for (let i = 0; i < entriesToRemove; i++) {
        const key = iterator.next().value;
        if (key) hits.delete(key);
      }
      console.log(`[rateLimitAi] GO-LIVE-191: Cache pruned, removed ${entriesToRemove} entries`);
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();

    // GO-LIVE-191: Run cleanup periodically
    cleanupStaleEntries(now);

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
