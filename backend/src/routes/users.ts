import { Router } from "express";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/httpError";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/me", async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true }
    });
    if (!user) throw new HttpError(404, "User not found");
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

