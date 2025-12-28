import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { requireEnv } from "../lib/env";
import { HttpError } from "../lib/httpError";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

export const authRouter = Router();

authRouter.post("/register", async (req, res, next) => {
  try {
    const { email, password, name, role } = (req.body ?? {}) as {
      email?: string;
      password?: string;
      name?: string;
      role?: "ADMIN" | "CASHIER";
    };

    if (!email || !password) {
      throw new HttpError(400, "email and password are required");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new HttpError(409, "User already exists");

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name: name?.trim() ? name.trim() : undefined,
        passwordHash,
        role: role ?? "CASHIER"
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });

    res.status(201).json({ user });
  } catch (e) {
    next(e);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = (req.body ?? {}) as {
      email?: string;
      password?: string;
    };
    if (!email || !password) throw new HttpError(400, "email and password are required");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new HttpError(401, "Invalid credentials");

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new HttpError(401, "Invalid credentials");

    const secret = requireEnv("JWT_SECRET");
    const token = jwt.sign({ sub: user.id }, secret, { expiresIn: "7d" });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (e) {
    next(e);
  }
});

authRouter.get("/me", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });
    if (!user) throw new HttpError(404, "User not found");
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

