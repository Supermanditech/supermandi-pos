import type { Request, Response, NextFunction } from "express";

/**
 * FINDING-004: Standardize 404 response format
 * All 404 responses should return consistent JSON format:
 * { error: { code: "NOT_FOUND", message: "..." } }
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Cannot ${req.method} ${req.originalUrl}`,
      path: req.originalUrl,
      method: req.method
    }
  });
}
