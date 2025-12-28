import { Router } from "express";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/httpError";
import { requireAuth } from "../middleware/auth";

export const productsRouter = Router();

// All product endpoints require auth for now.
productsRouter.use(requireAuth);

productsRouter.get("/", async (req, res, next) => {
  try {
    const barcode = typeof req.query.barcode === "string" ? req.query.barcode : undefined;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(barcode ? { barcode } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { sku: { contains: q } },
                { barcode: { contains: q } }
              ]
            }
          : {})
      },
      orderBy: { name: "asc" }
    });

    res.json({ products });
  } catch (e) {
    next(e);
  }
});

productsRouter.post("/", async (req, res, next) => {
  try {
    const { name, barcode, sku, price, currency, stock } = (req.body ?? {}) as {
      name?: string;
      barcode?: string | null;
      sku?: string | null;
      price?: number;
      currency?: string;
      stock?: number;
    };

    if (!name?.trim()) throw new HttpError(400, "name is required");
    const priceInt = Number.isInteger(price) ? price : undefined;
    if (priceInt === undefined) throw new HttpError(400, "price must be an integer (minor units)");

    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        barcode: barcode ?? undefined,
        sku: sku ?? undefined,
        price: priceInt,
        currency: currency?.trim() ? currency.trim().toUpperCase() : "AED",
        stock: Number.isInteger(stock) ? stock : 0
      }
    });
    res.status(201).json({ product });
  } catch (e) {
    next(e);
  }
});

productsRouter.get("/:id", async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw new HttpError(404, "Product not found");
    res.json({ product });
  } catch (e) {
    next(e);
  }
});

productsRouter.patch("/:id", async (req, res, next) => {
  try {
    const { name, barcode, sku, price, currency, stock, isActive } = (req.body ?? {}) as {
      name?: string;
      barcode?: string | null;
      sku?: string | null;
      price?: number;
      currency?: string;
      stock?: number;
      isActive?: boolean;
    };

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...(typeof name === "string" ? { name: name.trim() } : {}),
        ...(barcode !== undefined ? { barcode: barcode ?? null } : {}),
        ...(sku !== undefined ? { sku: sku ?? null } : {}),
        ...(Number.isInteger(price) ? { price } : {}),
        ...(typeof currency === "string" ? { currency: currency.trim().toUpperCase() } : {}),
        ...(Number.isInteger(stock) ? { stock } : {}),
        ...(typeof isActive === "boolean" ? { isActive } : {})
      }
    });

    res.json({ product });
  } catch (e) {
    next(e);
  }
});

productsRouter.delete("/:id", async (req, res, next) => {
  try {
    // Soft-delete
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });
    res.json({ product });
  } catch (e) {
    next(e);
  }
});

