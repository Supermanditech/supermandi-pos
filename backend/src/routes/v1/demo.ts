// Demo Routes - MED-004: Add demo seed endpoint
// Seeds products for demo stores
// GO-LIVE-139: Demo mode JWT token handling

import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getPool } from "../../db/client";
import { randomUUID } from "crypto";
import { devOnlyMiddleware, isProduction } from "../../middleware/devOnly";

export const demoRouter = Router();

// =============================================================================
// GO-LIVE-139: Demo Token Configuration
// =============================================================================

// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'
const JWT_SECRET = (() => {
  const secret = process.env['JWT_SECRET'];
  if (!secret || secret.length < 32) {
    const env = (process.env.NODE_ENV || '').toLowerCase();
    if (env === 'development' || env === 'test') {
      return 'dev-secret-change-in-prod';
    }
    throw new Error('JWT_SECRET must be set and at least 32 characters');
  }
  return secret;
})();
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-auth';

// Demo store and user constants
const DEMO_STORE_ID = 'a0000000-0000-0000-0000-000000000001';
const DEMO_STORE_CODE = 'DEMO001';
const DEMO_STORE_NAME = 'SuperMandi Demo Store';
const DEMO_USER_ID = 'demo-user-001';
const DEMO_PHONE = '+919999999999';

/**
 * POST /api/v1/demo/token
 * GO-LIVE-139: Generate a proper demo JWT token (dev-only)
 *
 * This endpoint generates a valid JWT token for demo mode that:
 * 1. Is a properly signed JWT (not a fake string)
 * 2. Has a `demo: true` claim for identification
 * 3. Only works in non-production environments
 * 4. References the standard demo store
 */
demoRouter.post("/token", devOnlyMiddleware(), async (req: Request, res: Response) => {
  console.log('[GO-LIVE-139] Generating demo token');

  // Generate JTI for potential revocation tracking
  const jti = randomUUID();

  // Create JWT payload with demo claim
  const jwtPayload = {
    sub: DEMO_USER_ID,
    actorType: 'STORE',
    actorId: DEMO_STORE_ID,
    permissions: ['retailer:read', 'retailer:write', 'inventory:read', 'inventory:write'],
    demo: true,  // GO-LIVE-139: Mark as demo token
    jti,
  };

  const accessToken = jwt.sign(jwtPayload, JWT_SECRET, {
    issuer: JWT_ISSUER,
    expiresIn: '24h',
  });

  // Generate refresh token with demo flag
  const refreshJti = randomUUID();
  const refreshPayload = {
    sub: DEMO_USER_ID,
    type: 'refresh',
    storeId: DEMO_STORE_ID,
    demo: true,  // GO-LIVE-139: Mark as demo token
    jti: refreshJti,
  };

  const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, {
    issuer: JWT_ISSUER,
    expiresIn: '7d',
  });

  console.log(`[GO-LIVE-139] Demo token generated for user ${DEMO_USER_ID}, store ${DEMO_STORE_ID}`);

  return res.json({
    token: accessToken,
    accessToken,
    refreshToken,
    user: {
      id: DEMO_USER_ID,
      phone: DEMO_PHONE,
      role: 'RETAILER_ADMIN',
    },
    store: {
      id: DEMO_STORE_ID,
      code: DEMO_STORE_CODE,
      name: DEMO_STORE_NAME,
    },
    expiresIn: 86400, // 24 hours in seconds
    _warning: 'DEMO TOKEN - FOR DEVELOPMENT ONLY - NOT FOR PRODUCTION USE',
  });
});

// Demo store code patterns
function isDemoStoreCode(code: string): boolean {
  if (!code) return false;
  const upper = code.toUpperCase();
  return upper.startsWith("DEMO") || upper.startsWith("TEST") || upper === "SM001";
}

// Demo seed products
const DEMO_PRODUCTS = [
  // Groceries
  { name: "Tata Salt 1kg", category: "Groceries", unit: "pcs", mrp: 2800, sell_price: 2600, barcode: "8901030001001" },
  { name: "Aashirvaad Atta 5kg", category: "Groceries", unit: "pcs", mrp: 28500, sell_price: 27500, barcode: "8901030001002" },
  { name: "Fortune Sunflower Oil 1L", category: "Groceries", unit: "pcs", mrp: 19500, sell_price: 18500, barcode: "8901030001003" },
  { name: "Tata Tea Gold 500g", category: "Groceries", unit: "pcs", mrp: 29500, sell_price: 28000, barcode: "8901030001004" },
  { name: "Sugar 1kg", category: "Groceries", unit: "pcs", mrp: 5500, sell_price: 5200, barcode: "8901030001005" },
  { name: "Rice Basmati 1kg", category: "Groceries", unit: "pcs", mrp: 18000, sell_price: 17000, barcode: "8901030001006" },
  // Dairy
  { name: "Amul Butter 500g", category: "Dairy", unit: "pcs", mrp: 28000, sell_price: 27500, barcode: "8901030002001" },
  { name: "Amul Milk 1L", category: "Dairy", unit: "pcs", mrp: 6800, sell_price: 6600, barcode: "8901030002002" },
  { name: "Amul Cheese 200g", category: "Dairy", unit: "pcs", mrp: 12000, sell_price: 11500, barcode: "8901030002003" },
  { name: "Amul Paneer 200g", category: "Dairy", unit: "pcs", mrp: 9000, sell_price: 8500, barcode: "8901030002004" },
  // Beverages
  { name: "Coca-Cola 2L", category: "Beverages", unit: "pcs", mrp: 9500, sell_price: 9000, barcode: "8901030003001" },
  { name: "Pepsi 2L", category: "Beverages", unit: "pcs", mrp: 9500, sell_price: 9000, barcode: "8901030003002" },
  { name: "Sprite 1.5L", category: "Beverages", unit: "pcs", mrp: 7500, sell_price: 7200, barcode: "8901030003003" },
  { name: "Bisleri Water 1L", category: "Beverages", unit: "pcs", mrp: 2000, sell_price: 2000, barcode: "8901030003006" },
  // Snacks
  { name: "Maggi Noodles 70g", category: "Snacks", unit: "pcs", mrp: 1400, sell_price: 1400, barcode: "8901030004001" },
  { name: "Lays Classic 52g", category: "Snacks", unit: "pcs", mrp: 2000, sell_price: 2000, barcode: "8901030004002" },
  { name: "Parle-G Biscuit 800g", category: "Snacks", unit: "pcs", mrp: 7500, sell_price: 7200, barcode: "8901030004006" },
  { name: "Oreo Cream 150g", category: "Snacks", unit: "pcs", mrp: 4000, sell_price: 3800, barcode: "8901030004007" },
  // Personal Care
  { name: "Colgate 100g", category: "Personal Care", unit: "pcs", mrp: 5500, sell_price: 5200, barcode: "8901030005001" },
  { name: "Dove Soap 100g", category: "Personal Care", unit: "pcs", mrp: 5500, sell_price: 5200, barcode: "8901030005003" },
  // Household
  { name: "Vim Dish Bar 250g", category: "Household", unit: "pcs", mrp: 3500, sell_price: 3200, barcode: "8901030006001" },
  { name: "Surf Excel 1kg", category: "Household", unit: "pcs", mrp: 22000, sell_price: 21500, barcode: "8901030006002" },
];

/**
 * POST /api/v1/demo/seed
 * Seed demo store with products
 *
 * Body: { storeId: string }
 */
demoRouter.post("/seed", devOnlyMiddleware(), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
  }

  const { storeId } = req.body;

  if (!storeId || typeof storeId !== "string") {
    return res.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "storeId is required" } });
  }

  const client = await pool.connect();
  try {
    // Check if store exists and is a demo store
    const storeRes = await client.query(
      "SELECT id, name, code, status FROM platform.stores WHERE id = $1",
      [storeId]
    );

    if (storeRes.rows.length === 0) {
      return res.status(404).json({ error: { code: "STORE_NOT_FOUND", message: "Store not found" } });
    }

    const store = storeRes.rows[0];
    const storeCode = store.code || "";

    if (!isDemoStoreCode(storeCode)) {
      return res.status(403).json({ error: { code: "NOT_DEMO_STORE", message: "Seed only allowed for demo stores" } });
    }

    console.log(`[Demo Seed] Starting seed for store ${storeId} (${storeCode})`);

    await client.query("BEGIN");

    let productsSeeded = 0;
    let storeProductsSeeded = 0;

    for (const prod of DEMO_PRODUCTS) {
      // 1. Ensure product exists in catalog.products
      const existingProduct = await client.query(
        "SELECT id FROM catalog.products WHERE primary_barcode = $1",
        [prod.barcode]
      );

      let productId: string;
      if (existingProduct.rows.length > 0) {
        productId = existingProduct.rows[0].id;
      } else {
        productId = randomUUID();
        await client.query(
          `INSERT INTO catalog.products (id, name, category, unit, primary_barcode, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
           ON CONFLICT (primary_barcode) DO NOTHING`,
          [productId, prod.name, prod.category, prod.unit, prod.barcode]
        );
        productsSeeded++;
      }

      // 2. Add to catalog.store_products with initial stock
      const initialStock = Math.floor(Math.random() * 50) + 10; // 10-60 units
      await client.query(
        `INSERT INTO catalog.store_products (id, store_id, product_id, display_name, sell_price, mrp, current_stock, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
         ON CONFLICT (store_id, product_id) DO UPDATE SET
           current_stock = EXCLUDED.current_stock,
           updated_at = NOW()`,
        [randomUUID(), storeId, productId, prod.name, prod.sell_price, prod.mrp, initialStock]
      );
      storeProductsSeeded++;

      // 3. Add barcode mapping
      await client.query(
        `INSERT INTO catalog.product_barcodes (id, product_id, barcode, is_primary, created_at)
         VALUES ($1, $2, $3, true, NOW())
         ON CONFLICT (barcode) DO NOTHING`,
        [randomUUID(), productId, prod.barcode]
      );
    }

    await client.query("COMMIT");

    console.log(`[Demo Seed] Completed: ${productsSeeded} products, ${storeProductsSeeded} store products`);

    return res.json({
      success: true,
      message: "Demo store seeded successfully",
      seeded: {
        products: productsSeeded,
        store_products: storeProductsSeeded,
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[Demo Seed] Error:", error.message);
    // SEC-004: Never leak SQL error details (table/column names) to client
    return res.status(500).json({ error: { code: "SEED_FAILED", message: "Demo seed failed. Check server logs." } });
  } finally {
    client.release();
  }
});

export default demoRouter;
