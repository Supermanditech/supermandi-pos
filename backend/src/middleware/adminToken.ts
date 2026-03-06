import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { getPool } from "../db/client";
import { log } from "../lib/logger";
import { asError } from "../lib/errorUtils";

// ISSUE-MICRO-025: Extract cookie value without cookie-parser dependency
function extractCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const match = header.split(';').find(c => c.trim().startsWith(`${name}=`));
  return match ? decodeURIComponent(match.trim().slice(name.length + 1)) : undefined;
}

// GO-LIVE-128: Admin type definitions for RBAC
export type AdminRole = "super_admin" | "admin" | "moderator" | "viewer";

export interface AdminInfo {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      adminId?: string;
      adminRole?: AdminRole;
      adminInfo?: AdminInfo;
    }
  }
}

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

// SECRET-CLEANUP-001: ADMIN_TOKEN from env var only (Cloud Run compatible)
// File-based secrets removed — Cloud Run uses Secret Manager → env vars
function loadAdminToken(): string | undefined {
  const envToken = process.env.ADMIN_TOKEN?.trim();
  if (envToken) {
    log.info('[AdminToken] ADMIN_TOKEN loaded from environment variable');
    return envToken;
  }
  if (process.env.NODE_ENV === 'production') {
    log.error('[AdminToken] FATAL: ADMIN_TOKEN is required in production but not set');
    process.exit(1);
  }
  return undefined;
}

// Cache the loaded token (loaded once at startup)
const ADMIN_TOKEN_CACHE = loadAdminToken();

// GO-LIVE-128: Hash an API key for storage/comparison
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// GO-LIVE-128: Verify admin by API key and return admin info
async function verifyAdminApiKey(apiKey: string): Promise<AdminInfo | null> {
  const pool = getPool();
  if (!pool) return null;

  try {
    const apiKeyHash = hashApiKey(apiKey);
    const result = await pool.query(
      `SELECT id::TEXT, email, name, role, status, locked_until
       FROM admin.admins
       WHERE api_key_hash = $1`,
      [apiKeyHash]
    );

    if (result.rowCount === 0) {
      return null;
    }

    const admin = result.rows[0];

    // Check if account is active
    if (admin.status !== 'active') {
      log.warn(`[AdminToken] GO-LIVE-128: Admin account ${admin.email} is ${admin.status}`);
      return null;
    }

    // Check if account is locked
    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      log.warn(`[AdminToken] GO-LIVE-128: Admin account ${admin.email} is locked until ${admin.locked_until}`);
      return null;
    }

    // Update last login
    await pool.query(
      `UPDATE admin.admins
       SET last_login_at = NOW(), last_login_ip = $2, failed_login_count = 0
       WHERE id = $1::uuid`,
      [admin.id, null] // IP would come from request in real scenario
    );

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role as AdminRole,
    };
  } catch (_error: unknown) {
    const error = asError(_error);
    // If table doesn't exist, fall back to legacy auth
    if (error?.code === '42P01') {
      log.info('[AdminToken] GO-LIVE-128: admin.admins table not yet created, using legacy auth');
      return null;
    }
    log.error('[AdminToken] GO-LIVE-128: Error verifying admin API key:', error?.message);
    return null;
  }
}

// W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment
const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    log.error('[FATAL] JWT_SECRET environment variable is not set — service startup aborted');
    process.exit(1);
  }
  return secret;
})();

/**
 * GO-LIVE-128: Enhanced admin token middleware with RBAC support
 *
 * Authentication methods (in order of precedence):
 * 1. Authorization: Bearer <jwt> - Session JWT from email OTP login (GO-LIVE-SESSION)
 * 2. X-Admin-Api-Key header - Individual admin API key (RBAC)
 * 3. X-Admin-Token header - Legacy master token (super_admin by default)
 *
 * Sets on request:
 * - adminId: UUID of the admin (or 'jwt-session'/'master-token' for session/legacy)
 * - adminRole: The admin's role
 * - adminInfo: Full admin details (for RBAC auth only)
 */
export async function requireAdminToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Method 0: ISSUE-MICRO-025 — Check HttpOnly cookie (XSS-safe, preferred)
  const cookieToken = extractCookie(req, 'admin_session');
  if (cookieToken) {
    try {
      // LIVE.BE.JWT_ALGORITHM_PINNING.001: Pin HS256 algorithm
      const decoded = jwt.verify(cookieToken, JWT_SECRET, { algorithms: ['HS256'], clockTolerance: 30 }) as { email?: string; role?: string; type?: string };
      if (decoded.type === 'admin' || decoded.role === 'super_admin') {
        req.adminId = decoded.email || 'jwt-session';
        req.adminRole = (decoded.role as AdminRole) || 'super_admin';
        return next();
      }
    } catch (err) {
      // Cookie JWT invalid or expired - fall through to other methods
      log.warn('[AdminToken] Cookie JWT verification failed:', err instanceof Error ? err.message : 'unknown error');
    }
  }

  // Method 1: Check for JWT Bearer token (GO-LIVE-SESSION - from email OTP login)
  const authHeader = req.header("authorization")?.trim();
  if (authHeader?.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7);
    try {
      // LIVE.BE.JWT_ALGORITHM_PINNING.001: Pin HS256 algorithm
      // ISSUE-187: 30s clock tolerance
      const decoded = jwt.verify(bearerToken, JWT_SECRET, { algorithms: ['HS256'], clockTolerance: 30 }) as { email?: string; role?: string; type?: string };
      if (decoded.type === 'admin' || decoded.role === 'super_admin') {
        req.adminId = decoded.email || 'jwt-session';
        req.adminRole = (decoded.role as AdminRole) || 'super_admin';
        return next();
      }
    } catch (err) {
      // JWT invalid or expired - fall through to other methods
      log.warn('[AdminToken] JWT verification failed:', err instanceof Error ? err.message : 'unknown error');
    }
  }

  // Method 2: Check for individual admin API key (GO-LIVE-128 RBAC)
  const apiKey = req.header("x-admin-api-key")?.trim();
  if (apiKey) {
    const adminInfo = await verifyAdminApiKey(apiKey);
    if (adminInfo) {
      req.adminId = adminInfo.id;
      req.adminRole = adminInfo.role;
      req.adminInfo = adminInfo;
      return next();
    }
    // Invalid API key - reject
    res.status(401).json({ error: "invalid_api_key" });
    return;
  }

  // Method 3: Legacy master token (backwards compatible)
  const masterToken = ADMIN_TOKEN_CACHE;
  if (!masterToken) {
    res.status(503).json({ error: "admin_disabled" });
    return;
  }

  const token = req.header("x-admin-token")?.trim();
  if (!token || !timingSafeEqual(token, masterToken)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // LIVE.BE.SUPERADMIN_TRUST_MODEL_HARDENING.001: Structured audit logging for master token usage
  // Legacy token grants super_admin access — log for audit trail
  req.adminId = "master-token";
  req.adminRole = "super_admin";
  log.warn(JSON.stringify({
    event: 'admin_master_token_used',
    method: req.method,
    path: req.path,
    ip: req.ip || req.socket.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent']?.substring(0, 100),
    gatewayForwarded: !!req.headers['x-correlation-id'],
  }));
  next();
}

/**
 * GO-LIVE-128: Permission checking middleware factory
 *
 * Usage:
 *   router.post("/stores", requireAdminToken, requirePermission("stores", "create"), handler)
 *   router.get("/stores", requireAdminToken, requirePermission("stores", "read"), handler)
 */
export function requirePermission(resource: string, action: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const role = req.adminRole;

    if (!role) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }

    // Super admin has all permissions
    if (role === "super_admin") {
      return next();
    }

    // Check permission from database
    const pool = getPool();
    if (!pool) {
      // If no DB, fall back to role-based defaults
      const allowed = checkDefaultPermission(role, resource, action);
      if (allowed) {
        return next();
      }
      res.status(403).json({
        error: "permission_denied",
        message: `Role '${role}' cannot perform '${action}' on '${resource}'`
      });
      return;
    }

    try {
      const result = await pool.query(
        `SELECT allowed FROM admin.permissions
         WHERE role = $1 AND resource = $2 AND action = $3`,
        [role, resource, action]
      );

      if (result.rowCount === 0 || !result.rows[0].allowed) {
        log.warn(`[AdminToken] GO-LIVE-128: Permission denied - ${role} cannot ${action} ${resource}`);
        res.status(403).json({
          error: "permission_denied",
          message: `Role '${role}' cannot perform '${action}' on '${resource}'`
        });
        return;
      }

      next();
    } catch (_error: unknown) {
    const error = asError(_error);
      // If permissions table doesn't exist, fall back to defaults
      if (error?.code === '42P01') {
        const allowed = checkDefaultPermission(role, resource, action);
        if (allowed) {
          return next();
        }
      }
      log.error('[AdminToken] GO-LIVE-128: Permission check error:', error?.message);
      res.status(403).json({
        error: "permission_denied",
        message: `Role '${role}' cannot perform '${action}' on '${resource}'`
      });
    }
  };
}

/**
 * GO-LIVE-128: Default permission check (fallback when DB unavailable)
 */
function checkDefaultPermission(role: AdminRole, resource: string, action: string): boolean {
  // Admin can do most things except delete and admin management
  if (role === "admin") {
    if (action === "delete") return false;
    if (resource === "admins" && action !== "read") return false;
    return true;
  }

  // Moderator can read and approve/reject
  if (role === "moderator") {
    if (action === "read") return true;
    if (action === "approve" || action === "reject") {
      return resource === "suppliers" || resource === "products";
    }
    return false;
  }

  // Viewer can only read
  if (role === "viewer") {
    return action === "read" && resource !== "admins";
  }

  return false;
}

/**
 * GO-LIVE-128: Generate a new admin API key
 */
export function generateAdminApiKey(): string {
  return `smadm_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * GO-LIVE-128: Hash an API key for storage
 */
export function hashAdminApiKey(apiKey: string): string {
  return hashApiKey(apiKey);
}
