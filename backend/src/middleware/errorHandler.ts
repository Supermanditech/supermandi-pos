import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/httpError";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details ?? undefined
    });
    return;
  }

  // ITER4-P1-007: Don't expose internal error messages/stack traces in production
  // Log the full error for debugging, but return generic message to client
  if (err instanceof Error) {
    console.error('[ErrorHandler] Internal server error:', err.message);
    if (process.env.NODE_ENV !== 'production') {
      console.error(err.stack);
    }
  }

  const message = process.env.NODE_ENV === 'production'
    ? "Internal server error"
    : (err instanceof Error ? err.message : "Unknown error");

  res.status(500).json({ error: message });
}

