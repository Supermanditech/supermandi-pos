import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { requireEnv } from "../lib/env";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/httpError";

export type AuthenticatedRequest = Request & {
  user?: { id: string; email: string; role: string };
};

type JwtPayload = { sub: string };

export async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new HttpError(401, "Missing Authorization header");
    }

    const token = header.slice("Bearer ".length);
    const secret = requireEnv("JWT_SECRET");
    const decoded = jwt.verify(token, secret) as JwtPayload;

    const userId = decoded.sub;
    if (!userId) throw new HttpError(401, "Invalid token");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, isActive: true }
    });
    if (!user || !user.isActive) throw new HttpError(401, "User not found or inactive");

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (e) {
    next(e);
  }
}

