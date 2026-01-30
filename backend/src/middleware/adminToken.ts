import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";

// ITER3-P1-017: Use timing-safe comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do comparison to prevent length-based timing attacks
    const dummy = Buffer.alloc(32);
    crypto.timingSafeEqual(dummy, dummy);
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// GO-LIVE-103: Read ADMIN_TOKEN from Docker secret file (preferred) or env var (fallback)
function loadAdminToken(): string | undefined {
  // Try reading from Docker secret file first (more secure - not exposed in docker inspect)
  const tokenFilePath = process.env.ADMIN_TOKEN_FILE;
  if (tokenFilePath) {
    try {
      const token = fs.readFileSync(tokenFilePath, 'utf8').trim();
      if (token) {
        console.log('[AdminToken] ADMIN_TOKEN loaded from secret file');
        return token;
      }
    } catch {
      // File doesn't exist or can't be read - fall through to env var
      console.warn('[AdminToken] Could not read ADMIN_TOKEN_FILE, falling back to env var');
    }
  }
  // Fallback to environment variable (for backwards compatibility)
  const envToken = process.env.ADMIN_TOKEN?.trim();
  if (envToken) {
    console.log('[AdminToken] ADMIN_TOKEN loaded from environment variable');
  }
  return envToken;
}

// Cache the loaded token (loaded once at startup)
const ADMIN_TOKEN_CACHE = loadAdminToken();

// Require ADMIN_TOKEN via X-Admin-Token. Missing token disables admin APIs.
export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const required = ADMIN_TOKEN_CACHE;
  if (!required) {
    res.status(503).json({ error: "admin_disabled" });
    return;
  }

  const token = req.header("x-admin-token")?.trim();

  if (!token || !timingSafeEqual(token, required)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
