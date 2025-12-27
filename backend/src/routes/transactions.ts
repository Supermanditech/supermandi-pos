import { Router } from "express";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/httpError";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

export const transactionsRouter = Router();

transactionsRouter.use(requireAuth);

function generateReceiptNo(): string {
  // Example: SM-20251226-184955-AB12
  const now = new Date();
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SM-${y}${m}${d}-${hh}${mm}${ss}-${rand}`;
}

transactionsRouter.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const take = Math.min(100, Math.max(1, Number(req.query.take ?? 50)));
    const transactions = await prisma.transaction.findMany({
      take,
      orderBy: { createdAt: "desc" },
      include: { items: { include: { product: true } }, cashier: true }
    });

    res.json({ transactions });
  } catch (e) {
    next(e);
  }
});

transactionsRouter.post("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const { items, paymentMethod, currency } = (req.body ?? {}) as {
      items?: Array<{ productId?: string; quantity?: number }>;
      paymentMethod?: "CASH" | "CARD" | "OTHER";
      currency?: string;
    };

    if (!items?.length) throw new HttpError(400, "items are required");
    if (!paymentMethod) throw new HttpError(400, "paymentMethod is required");

    const userId = req.user!.id;
    const receiptNo = generateReceiptNo();
    const txCurrency = currency?.trim() ? currency.trim().toUpperCase() : "AED";

    const result = await prisma.$transaction(async (db) => {
      // Fetch products and validate quantities
      const productIds = items
        .map((i) => i.productId)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      if (productIds.length !== items.length) throw new HttpError(400, "Each item must include productId");

      const products = await db.product.findMany({
        where: { id: { in: productIds }, isActive: true }
      });
      if (products.length !== productIds.length) throw new HttpError(400, "One or more products not found");

      const byId = new Map(products.map((p) => [p.id, p] as const));

      const normalized = items.map((i) => {
        const qty = i.quantity;
        if (!Number.isInteger(qty) || (qty as number) <= 0) {
          throw new HttpError(400, "quantity must be a positive integer");
        }
        const p = byId.get(i.productId!);
        if (!p) throw new HttpError(400, "Product not found");
        if (p.stock < (qty as number)) throw new HttpError(409, `Insufficient stock for ${p.name}`);
        const unitPrice = p.price;
        const lineTotal = unitPrice * (qty as number);
        return {
          productId: p.id,
          quantity: qty as number,
          unitPrice,
          lineTotal
        };
      });

      const subtotal = normalized.reduce((sum, i) => sum + i.lineTotal, 0);
      const total = subtotal;

      // Create transaction + items
      const created = await db.transaction.create({
        data: {
          receiptNo,
          paymentMethod,
          subtotal,
          total,
          currency: txCurrency,
          cashierId: userId,
          items: {
            create: normalized
          }
        },
        include: { items: { include: { product: true } }, cashier: true }
      });

      // Decrement stock
      for (const item of normalized) {
        await db.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } }
        });
      }

      return created;
    });

    res.status(201).json({ transaction: result });
  } catch (e) {
    next(e);
  }
});

