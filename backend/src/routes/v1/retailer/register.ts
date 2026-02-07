/**
 * RO-001: Canonical Registration Route
 *
 * POST /api/v1/retailer/register
 *
 * Creates store + owner user instantly from any surface (Portal, POS Device, POS Mobile).
 * Idempotent: returns existing store if GSTIN or phone match.
 * Rate limited: 5 req/min per IP.
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getPool } from "../../../db/client";
import {
  validateRegistration,
} from "@supermandi/common";
import {
  registerRetailer,
  recordFailedRegistration,
} from "../../../services/retailerRegistrationService";
import { registrationAbuseGuard } from "../../../middleware/registrationRateLimiter";

export const retailerRegisterRouter = Router();

// RO-001: Rate limit registration to 5 req/min per IP
const registrationRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "RATE_LIMITED",
    message: "Too many registration attempts. Please try again in a minute.",
  },
});

// Firebase token verification (lazy loaded like auth.ts pattern)
let verifyFirebaseIdToken: ((
  idToken: string
) => Promise<{
  success: boolean;
  payload?: { phone_number?: string; uid?: string };
  error?: string;
  code?: string;
}>) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const firebase = require("@supermandi/common");
  if (firebase.verifyFirebaseIdToken) {
    verifyFirebaseIdToken = firebase.verifyFirebaseIdToken;
    console.log("[RetailerRegister] Firebase server-side verification available");
  }
} catch {
  console.warn("[RetailerRegister] Firebase verification not available");
}

/**
 * POST /api/v1/retailer/register
 *
 * Body: RetailerRegistrationInput (phone, otpProof, businessName, ownerName, ...)
 * Returns: { storeId, storeCode, ownerUserId, storeName, isExisting }
 */
retailerRegisterRouter.post(
  "/register",
  registrationRateLimiter,
  registrationAbuseGuard,  // DR-006: Phone + GSTIN rate limiting
  async (req, res) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database not available" });
    }

    // Step 1: Validate input using shared schema (RO-002)
    const validation = validateRegistration(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        fields: validation.errors,
      });
    }

    const data = validation.data;

    // Step 2: Verify OTP proof (Firebase ID token)
    if (!verifyFirebaseIdToken) {
      // In dev/local mode, allow registration without Firebase
      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({
          error: "OTP_UNAVAILABLE",
          message: "Phone verification service is not configured",
        });
      }
      console.warn("[RetailerRegister] Skipping OTP verification (dev mode)");
    } else {
      const verifyResult = await verifyFirebaseIdToken(data.otpProof);
      if (!verifyResult.success) {
        return res.status(401).json({
          error: "OTP_INVALID",
          message: "Phone verification failed. Please request a new OTP.",
          code: verifyResult.code,
        });
      }

      // Verify phone matches token
      const tokenPhone = verifyResult.payload?.phone_number;
      if (tokenPhone && tokenPhone !== data.phone) {
        return res.status(400).json({
          error: "PHONE_MISMATCH",
          message: "Phone number does not match the verified OTP",
        });
      }
    }

    // Step 3: Register
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      undefined;
    const userAgent = req.headers["user-agent"] || undefined;

    try {
      const result = await registerRetailer(pool, data, {
        ipAddress,
        userAgent,
      });

      const statusCode = result.isExisting ? 200 : 201;
      return res.status(statusCode).json({
        storeId: result.storeId,
        storeCode: result.storeCode,
        ownerUserId: result.ownerUserId,
        storeName: result.storeName,
        isExisting: result.isExisting,
        enrollmentCode: result.enrollmentCode || undefined,  // DRX-003
      });
    } catch (err: any) {
      console.error("[RetailerRegister] Registration failed:", err?.message);

      // Record failed event (non-blocking — must not mask the actual error response)
      recordFailedRegistration(pool, {
        source: data.source,
        outcome: "ERROR",
        errorCode: err?.code || "UNKNOWN",
        ipAddress,
        userAgent,
        deviceMeta: data.deviceMeta as Record<string, unknown>,
        phone: data.phone,
        businessName: data.businessName,
        gstin: data.gstin,
      }).catch(() => {});

      // DR-009: Handle PG unique violations with generic message (no field leakage)
      if (err?.code === "23505") {
        console.warn("[DR-009] Registration duplicate constraint hit:", err?.constraint);
        return res.status(409).json({
          error: "DUPLICATE_ENTRY",
          message: "Registration could not be completed. An account with these details may already exist. Please try logging in instead.",
        });
      }

      return res.status(500).json({
        error: "REGISTRATION_FAILED",
        message: "Could not complete registration. Please try again.",
      });
    }
  }
);
