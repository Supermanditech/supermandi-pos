import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/httpError";
import { log } from "../lib/logger";

// RO-006: Map PostgreSQL unique violation constraint names to user-facing error codes
const CONSTRAINT_ERROR_MAP: Record<string, { code: string; message: string }> = {
  uk_stores_phone: { code: "PHONE_EXISTS", message: "A store with this phone number already exists" },
  ux_stores_gstin: { code: "GSTIN_EXISTS", message: "A store with this GSTIN already exists" },
  ux_stores_gst_number: { code: "GSTIN_EXISTS", message: "A store with this GST number already exists" },
  ux_users_phone: { code: "PHONE_EXISTS", message: "A user with this phone number already exists" },
  ux_users_email: { code: "EMAIL_EXISTS", message: "A user with this email already exists" },
  store_users_store_user_unique: { code: "ALREADY_LINKED", message: "User is already linked to this store" },
};

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // STG-183: Include requestId in all error responses for tracing consistency
  const requestId = (_req as any).correlationId as string | undefined;

  if (err instanceof HttpError) {
    // STG-536: Standardize error format — always use { error: { code, message } }
    res.status(err.statusCode).json({
      error: {
        code: err.code ?? "HTTP_ERROR",
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
      ...(requestId && { requestId }),
    });
    return;
  }

  // RO-006: Handle PostgreSQL unique_violation (23505) as 409 Conflict
  const pgCode = (err as any)?.code;
  if (pgCode === "23505") {
    const constraint = (err as any)?.constraint ?? "";
    const mapped = CONSTRAINT_ERROR_MAP[constraint];
    if (mapped) {
      return void res.status(409).json({ error: mapped.code, message: mapped.message, ...(requestId && { requestId }) });
    }
    // Unknown constraint — still 409 but generic message
    return void res.status(409).json({ error: "DUPLICATE_ENTRY", message: "A record with this value already exists", ...(requestId && { requestId }) });
  }

  // ITER4-P1-007 + STG-522: Never expose internal error messages to client
  // Log full details server-side for debugging; return generic message always
  if (err instanceof Error) {
    log.error('[ErrorHandler] Internal server error:', err.message);
    log.error(err.stack);
  }

  // STG-536: Standardized error format
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" }, ...(requestId && { requestId }) });
}

