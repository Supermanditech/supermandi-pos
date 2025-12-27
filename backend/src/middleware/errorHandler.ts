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

  const message = err instanceof Error ? err.message : "Unknown error";
  res.status(500).json({ error: message });
}

