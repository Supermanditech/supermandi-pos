const http = require("http");
const { Client } = require("pg");

const PORT = 3009;
const dbConfig = {
  host: "postgres",
  port: 5432,
  database: "supermandi",
  user: "supermandi",
  password: "supermandi123"
};

async function getDb() {
  const client = new Client(dbConfig);
  await client.connect();
  return client;
}

// 3-layer demo detection
function isDemoCode(code) {
  return code && code.toUpperCase().startsWith("SM-DEMO");
}

function isDemoStoreCode(storeCode) {
  if (!storeCode) return false;
  const upper = storeCode.toUpperCase();
  const prefix = upper.slice(0, 2);
  if (["DM", "QA", "TS", "ST"].includes(prefix)) return true;
  const lower = storeCode.toLowerCase();
  return lower.includes("demo") || lower.includes("test") || lower.includes("qa-") || lower.includes("staging");
}

// ============================================================================
// PATCH DEV-072: UUID validation and barcode resolution for offline sales
// ============================================================================
function isValidUUID(value) {
  if (!value || typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolveProductId(db, storeId, rawId, barcode) {
  // If rawId is already a valid UUID, use it directly
  if (isValidUUID(rawId)) return rawId;

  // Otherwise, treat rawId or barcode as a barcode and look up the product
  const searchBarcode = barcode || rawId;
  if (searchBarcode) {
    const result = await db.query(
      "SELECT id FROM catalog.products WHERE primary_barcode = $1 LIMIT 1",
      [searchBarcode]
    );
    if (result.rows[0]) {
      console.log(`[Sale] Resolved barcode ${searchBarcode} to product ${result.rows[0].id}`);
      return result.rows[0].id;
    }
  }

  console.log("[Sale] Cannot resolve productId:", rawId, barcode);
  return null;
}
// ============================================================================

function buildBarcodeVariants(rawBarcode) {
  const raw = typeof rawBarcode === "string" ? rawBarcode.trim() : "";
  if (!raw) return { normalized: "", variants: [] };

  const normalized = raw.replace(/[#\s]/g, "");
  const variants = new Set();

  if (normalized) variants.add(normalized);
  if (raw && raw !== normalized) variants.add(raw);

  if (/^\d+$/.test(normalized)) {
    const stripped = normalized.replace(/^0+/, "");
    if (stripped && stripped !== normalized) variants.add(stripped);
    if (/^\d{12}$/.test(normalized)) variants.add(`0${normalized}`);
    if (/^0\d{12}$/.test(normalized)) variants.add(normalized.slice(1));
    if (stripped && /^\d{12}$/.test(stripped)) variants.add(`0${stripped}`);
  }

  return { normalized, variants: Array.from(variants) };
}

// Helper to get device info from token
async function getDeviceFromToken(db, token) {
  if (!token) return null;
  const result = await db.query(
    "SELECT id, store_id, active FROM pos_devices WHERE device_token = $1",
    [token]
  );
  return result.rows[0] || null;
}

// Helper to generate next bill reference
async function getNextBillRef(db, storeId) {
  // Upsert and increment bill sequence
  const result = await db.query(`
    INSERT INTO bill_sequences (store_id, last_number, prefix, updated_at)
    VALUES ($1, 1, 'B', NOW())
    ON CONFLICT (store_id) DO UPDATE
    SET last_number = bill_sequences.last_number + 1, updated_at = NOW()
    RETURNING last_number, prefix
  `, [storeId]);
  const row = result.rows[0];
  return `${row.prefix}${String(row.last_number).padStart(6, '0')}`;
}

// Helper to parse request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  console.log(req.method, url.pathname);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Device-Token");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const token = req.headers["x-device-token"] || req.headers["authorization"]?.replace("Bearer ", "");

  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok" }));
  }

  // ============================================================================
  // UI STATUS ENDPOINT
  // ============================================================================
  if (req.method === "GET" && (url.pathname === "/api/v1/pos/ui-status" || url.pathname === "/ui-status")) {
    const defaultResponse = {
      storeId: null, storeName: null, storeCode: null, deviceId: null,
      storeActive: true, deviceActive: true, pendingOutboxCount: 0,
      lastSyncAt: null, lastSeenOnline: new Date().toISOString(),
      upiVpa: null, printerOk: null, scannerOk: null,
      features: { scan_lookup_v2: false, reorderEnabled: true, buyEnabled: true, inventoryEnabled: true, suppliersEnabled: true, ordersEnabled: true }
    };

    if (!token) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(defaultResponse));
    }

    let db;
    try {
      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(defaultResponse));
      }
      let storeName = null, storeCode = null, storeActive = true, upiVpa = null;
      if (device.store_id) {
        const storeResult = await db.query("SELECT name, code, status FROM stores WHERE id = $1", [device.store_id]);
        if (storeResult.rows.length > 0) {
          storeName = storeResult.rows[0].name;
          storeCode = storeResult.rows[0].code;
          storeActive = storeResult.rows[0].status === 'active';
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        ...defaultResponse,
        storeId: device.store_id,
        storeName,
        storeCode,
        deviceId: device.id,
        storeActive,
        deviceActive: device.active !== false,
        upiVpa
      }));
    } catch (error) {
      console.error("[UI-Status] Error:", error);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(defaultResponse));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // LIST BILLS ENDPOINT
  // ============================================================================
  if (req.method === "GET" && (url.pathname === "/api/v1/pos/bills" || url.pathname === "/bills")) {
    let db;
    try {
      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ bills: [] }));
      }

      const result = await db.query(`
        SELECT id as "saleId", bill_ref as "billRef", total_minor as "totalMinor",
               status, payment_mode as "paymentMode", created_at as "createdAt", currency
        FROM sales
        WHERE store_id = $1
        ORDER BY created_at DESC
        LIMIT 100
      `, [device.store_id]);

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ bills: result.rows }));
    } catch (error) {
      console.error("[Bills] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "BILLS_FETCH_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // GET BILL DETAIL ENDPOINT
  // ============================================================================
  const billDetailMatch = url.pathname.match(/^(?:\/api\/v1\/pos)?\/bills\/([^\/]+)$/);
  if (req.method === "GET" && billDetailMatch) {
    const saleId = billDetailMatch[1];
    let db;
    try {
      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      // Fetch sale
      const saleResult = await db.query(`
        SELECT id, bill_ref, status, payment_mode, currency, created_at,
               subtotal_minor, discount_minor, total_minor
        FROM sales
        WHERE id = $1 AND store_id = $2
      `, [saleId, device.store_id]);

      if (saleResult.rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "BILL_NOT_FOUND", message: "bill_not_found" } }));
      }

      const sale = saleResult.rows[0];

      // Fetch items
      const itemsResult = await db.query(`
        SELECT variant_id as "variantId", name, barcode, quantity,
               price_minor as "priceMinor", line_total_minor as "lineTotalMinor"
        FROM sale_items
        WHERE sale_id = $1
      `, [saleId]);

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        bill: {
          saleId: sale.id,
          billRef: sale.bill_ref,
          status: sale.status,
          paymentMode: sale.payment_mode,
          currency: sale.currency,
          createdAt: sale.created_at,
          totals: {
            subtotalMinor: sale.subtotal_minor,
            discountMinor: sale.discount_minor,
            totalMinor: sale.total_minor
          },
          items: itemsResult.rows
        }
      }));
    } catch (error) {
      console.error("[Bill Detail] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "BILL_FETCH_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // CREATE SALE ENDPOINT - PATCHED DEV-072
  // ============================================================================
  if (req.method === "POST" && (url.pathname === "/api/v1/pos/sales" || url.pathname === "/sales")) {
    let db;
    try {
      const data = await parseBody(req);
      db = await getDb();

      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      const items = data.items || [];
      if (items.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "ITEMS_REQUIRED", message: "At least one item required" } }));
      }

      // Calculate totals
      let subtotalMinor = 0;
      for (const item of items) {
        subtotalMinor += (item.priceMinor || 0) * (item.quantity || 1);
      }
      const discountMinor = data.discountMinor || 0;
      const totalMinor = subtotalMinor - discountMinor;
      const currency = data.currency || "INR";

      // Generate bill ref
      const billRef = await getNextBillRef(db, device.store_id);

      // Use provided saleId or generate new one
      const saleId = data.saleId || `sale_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;

      // Insert sale
      await db.query(`
        INSERT INTO sales (id, store_id, device_id, bill_ref, subtotal_minor, discount_minor, total_minor, currency, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      `, [saleId, device.store_id, device.id, billRef, subtotalMinor, discountMinor, totalMinor, currency]);

      // Insert items + decrement stock + write ledger
      // PATCH DEV-072: Resolve productId from barcode if not a valid UUID
      for (const item of items) {
        const productId = await resolveProductId(db, device.store_id, item.productId, item.barcode);
        if (!productId) {
          console.log("[Sale] Skipping unresolved item:", item.productId, item.barcode, item.name);
          continue;
        }

        const qty = item.quantity || 1;
        const lineTotalMinor = (item.priceMinor || 0) * qty;

        // Insert sale item
        await db.query(`
          INSERT INTO sale_items (sale_id, product_id, variant_id, name, barcode, quantity, price_minor, line_total_minor)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          saleId,
          productId,
          productId, // variantId same as productId for now
          item.name || '',
          item.barcode || '',
          qty,
          item.priceMinor || 0,
          lineTotalMinor
        ]);

        // Get current stock
        const stockResult = await db.query(`
          SELECT current_stock FROM catalog.store_products
          WHERE store_id = $1 AND product_id = $2
        `, [device.store_id, productId]);

        const stockBefore = stockResult.rows[0]?.current_stock || 0;
        const stockAfter = Math.max(0, stockBefore - qty);

        // Decrement stock in store_products
        await db.query(`
          UPDATE catalog.store_products
          SET current_stock = GREATEST(0, current_stock - $1), updated_at = NOW()
          WHERE store_id = $2 AND product_id = $3
        `, [qty, device.store_id, productId]);

        // Write inventory ledger entry
        await db.query(`
          INSERT INTO inventory.inventory_ledger
          (store_id, product_id, delta_qty, transaction_type, reference_type, reference_id, stock_before, stock_after, unit_cost, notes)
          VALUES ($1, $2, $3, 'sale', 'sale', $4, $5, $6, $7, $8)
        `, [
          device.store_id,
          productId,
          -qty,  // negative for sales
          saleId,
          stockBefore,
          stockAfter,
          item.priceMinor || 0,
          `Sale ${billRef}`
        ]);
      }

      console.log(`[Sale] Created sale ${saleId} with bill ref ${billRef}, total: ${totalMinor}, items: ${items.length}`);

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        saleId,
        billRef,
        totals: { subtotalMinor, discountMinor, totalMinor }
      }));
    } catch (error) {
      console.error("[Sale] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "SALE_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // CANCEL SALE ENDPOINT
  // ============================================================================
  const cancelSaleMatch = url.pathname.match(/^(?:\/api\/v1\/pos)?\/sales\/([^\/]+)\/cancel$/);
  if (req.method === "POST" && cancelSaleMatch) {
    const saleId = cancelSaleMatch[1];
    let db;
    try {
      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      const result = await db.query(`
        UPDATE sales SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND store_id = $2 AND status = 'pending'
        RETURNING id
      `, [saleId, device.store_id]);

      if (result.rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "SALE_NOT_FOUND", message: "Sale not found or already completed" } }));
      }

      console.log(`[Sale] Cancelled sale ${saleId}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "CANCELLED", message: "Sale cancelled" }));
    } catch (error) {
      console.error("[Cancel Sale] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "CANCEL_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // CASH PAYMENT ENDPOINT
  // ============================================================================
  if (req.method === "POST" && (url.pathname === "/api/v1/pos/payments/cash" || url.pathname === "/payments/cash")) {
    let db;
    try {
      const data = await parseBody(req);
      const saleId = data.saleId;

      if (!saleId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "SALE_ID_REQUIRED", message: "saleId is required" } }));
      }

      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      const result = await db.query(`
        UPDATE sales SET status = 'completed', payment_mode = 'CASH', payment_status = 'paid', updated_at = NOW()
        WHERE id = $1 AND store_id = $2
        RETURNING id
      `, [saleId, device.store_id]);

      if (result.rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "SALE_NOT_FOUND", message: "Sale not found" } }));
      }

      console.log(`[Payment] Cash payment recorded for sale ${saleId}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "PAID" }));
    } catch (error) {
      console.error("[Cash Payment] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "PAYMENT_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // DUE PAYMENT ENDPOINT
  // ============================================================================
  if (req.method === "POST" && (url.pathname === "/api/v1/pos/payments/due" || url.pathname === "/payments/due")) {
    let db;
    try {
      const data = await parseBody(req);
      const saleId = data.saleId;

      if (!saleId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "SALE_ID_REQUIRED", message: "saleId is required" } }));
      }

      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      const result = await db.query(`
        UPDATE sales SET status = 'completed', payment_mode = 'DUE', payment_status = 'pending', updated_at = NOW()
        WHERE id = $1 AND store_id = $2
        RETURNING id
      `, [saleId, device.store_id]);

      if (result.rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "SALE_NOT_FOUND", message: "Sale not found" } }));
      }

      console.log(`[Payment] Due payment recorded for sale ${saleId}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "DUE" }));
    } catch (error) {
      console.error("[Due Payment] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "PAYMENT_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // UPI PAYMENT INIT (STUB)
  // ============================================================================
  if (req.method === "POST" && (url.pathname === "/api/v1/pos/payments/upi/init" || url.pathname === "/payments/upi/init")) {
    let db;
    try {
      const data = await parseBody(req);
      const saleId = data.saleId;

      if (!saleId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "SALE_ID_REQUIRED", message: "saleId is required" } }));
      }

      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      // Get sale info
      const saleResult = await db.query(`
        SELECT bill_ref, total_minor FROM sales WHERE id = $1 AND store_id = $2
      `, [saleId, device.store_id]);

      if (saleResult.rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "SALE_NOT_FOUND", message: "Sale not found" } }));
      }

      const sale = saleResult.rows[0];

      // Get store info
      const storeResult = await db.query("SELECT name FROM stores WHERE id = $1", [device.store_id]);
      const storeName = storeResult.rows[0]?.name || null;

      const paymentId = `upi_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;

      // Update sale with payment mode
      await db.query(`
        UPDATE sales SET payment_mode = 'UPI', updated_at = NOW() WHERE id = $1
      `, [saleId]);

      console.log(`[UPI Init] Created payment ${paymentId} for sale ${saleId}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        paymentId,
        billRef: sale.bill_ref,
        amountMinor: sale.total_minor,
        storeName,
        upiVpa: "store@upi" // Placeholder
      }));
    } catch (error) {
      console.error("[UPI Init] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "UPI_INIT_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // UPI PAYMENT CONFIRM (STUB)
  // ============================================================================
  if (req.method === "POST" && (url.pathname === "/api/v1/pos/payments/upi/confirm-manual" || url.pathname === "/payments/upi/confirm-manual")) {
    try {
      const data = await parseBody(req);
      const paymentId = data.paymentId;

      if (!paymentId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "PAYMENT_ID_REQUIRED", message: "paymentId is required" } }));
      }

      // In production, this would verify the payment with UPI gateway
      // For now, just return success
      console.log(`[UPI Confirm] Manual confirmation for payment ${paymentId}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "PAID" }));
    } catch (error) {
      console.error("[UPI Confirm] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "UPI_CONFIRM_FAILED", message: error.message } }));
    }
  }

  // ============================================================================
  // COLLECTION CASH ENDPOINT
  // ============================================================================
  if (req.method === "POST" && (url.pathname === "/api/v1/pos/collections/cash" || url.pathname === "/collections/cash")) {
    let db;
    try {
      const data = await parseBody(req);
      const amountMinor = data.amountMinor;

      if (!amountMinor || amountMinor <= 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "AMOUNT_REQUIRED", message: "Valid amountMinor is required" } }));
      }

      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      const collectionId = `col_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
      await db.query(`
        INSERT INTO collections (id, store_id, device_id, amount_minor, mode, status, reference)
        VALUES ($1, $2, $3, $4, 'CASH', 'paid', $5)
      `, [collectionId, device.store_id, device.id, amountMinor, data.reference || null]);

      console.log(`[Collection] Cash collection ${collectionId} for ${amountMinor}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "PAID", collectionId }));
    } catch (error) {
      console.error("[Collection Cash] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "COLLECTION_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // COLLECTION DUE ENDPOINT
  // ============================================================================
  if (req.method === "POST" && (url.pathname === "/api/v1/pos/collections/due" || url.pathname === "/collections/due")) {
    let db;
    try {
      const data = await parseBody(req);
      const amountMinor = data.amountMinor;

      if (!amountMinor || amountMinor <= 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "AMOUNT_REQUIRED", message: "Valid amountMinor is required" } }));
      }

      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      const collectionId = `col_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
      await db.query(`
        INSERT INTO collections (id, store_id, device_id, amount_minor, mode, status, reference)
        VALUES ($1, $2, $3, $4, 'DUE', 'pending', $5)
      `, [collectionId, device.store_id, device.id, amountMinor, data.reference || null]);

      console.log(`[Collection] Due collection ${collectionId} for ${amountMinor}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "DUE", collectionId }));
    } catch (error) {
      console.error("[Collection Due] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "COLLECTION_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // COLLECTION UPI INIT (STUB)
  // ============================================================================
  if (req.method === "POST" && (url.pathname === "/api/v1/pos/collections/upi/init" || url.pathname === "/collections/upi/init")) {
    let db;
    try {
      const data = await parseBody(req);
      const amountMinor = data.amountMinor;

      if (!amountMinor || amountMinor <= 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "AMOUNT_REQUIRED", message: "Valid amountMinor is required" } }));
      }

      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      const storeResult = await db.query("SELECT name FROM stores WHERE id = $1", [device.store_id]);
      const storeName = storeResult.rows[0]?.name || null;

      const collectionId = `col_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
      await db.query(`
        INSERT INTO collections (id, store_id, device_id, amount_minor, mode, status, reference)
        VALUES ($1, $2, $3, $4, 'UPI', 'pending', $5)
      `, [collectionId, device.store_id, device.id, amountMinor, data.reference || null]);

      console.log(`[Collection] UPI init ${collectionId} for ${amountMinor}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        collectionId,
        amountMinor,
        storeName,
        upiVpa: "store@upi"
      }));
    } catch (error) {
      console.error("[Collection UPI Init] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "COLLECTION_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // COLLECTION UPI CONFIRM (STUB)
  // ============================================================================
  if (req.method === "POST" && (url.pathname === "/api/v1/pos/collections/upi/confirm-manual" || url.pathname === "/collections/upi/confirm-manual")) {
    let db;
    try {
      const data = await parseBody(req);
      const collectionId = data.collectionId;

      if (!collectionId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "COLLECTION_ID_REQUIRED", message: "collectionId is required" } }));
      }

      db = await getDb();
      await db.query(`
        UPDATE collections SET status = 'paid' WHERE id = $1
      `, [collectionId]);

      console.log(`[Collection] UPI confirmed ${collectionId}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "PAID" }));
    } catch (error) {
      console.error("[Collection UPI Confirm] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "COLLECTION_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // ENROLL ENDPOINT (unchanged from v2)
  // ============================================================================
  if (req.method === "POST" && (url.pathname === "/api/v1/pos/enroll" || url.pathname === "/enroll")) {
    let db;
    try {
      const data = await parseBody(req);
      const code = (data.code || data.enrollmentCode || "").trim().toUpperCase();
      const meta = data.deviceMeta || {};
      const label = (meta.label || "").trim();
      const deviceType = (meta.deviceType || "RETAILER_PHONE").toUpperCase();
      const deviceFingerprint = (meta.deviceFingerprint || "").trim();

      console.log("[Enroll] Keys:", Object.keys(data), "Code:", code);

      if (!code) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "CODE_REQUIRED", message: "Enrollment code is required" } }));
      }
      if (!label) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "LABEL_REQUIRED", message: "Device label is required" } }));
      }

      db = await getDb();

      const enrollmentRes = await db.query(`
        SELECT id, code, store_id, expires_at, used_at, used_device_id, revoked_at,
               COALESCE(max_uses, 1) as max_uses,
               COALESCE(uses_count, CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) as uses_count
        FROM pos_device_enrollments WHERE code = $1
      `, [code]);

      if (enrollmentRes.rows.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "ENROLLMENT_CODE_INVALID", message: "Enrollment code not found" } }));
      }

      const enrollment = enrollmentRes.rows[0];

      if (enrollment.revoked_at) {
        res.writeHead(409, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "ENROLLMENT_CODE_REVOKED", message: "Code revoked" } }));
      }

      const storeRes = await db.query("SELECT id, name, code, status FROM stores WHERE id = $1", [enrollment.store_id]);
      const store = storeRes.rows[0];
      if (!store) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "STORE_NOT_FOUND", message: "Store not found" } }));
      }

      const storeCode = store.code || "";
      const isDemo = isDemoStoreCode(storeCode) || isDemoCode(code);

      const isExpired = new Date(enrollment.expires_at) <= new Date();
      const maxUses = enrollment.max_uses;
      const usesCount = enrollment.uses_count;
      const isMultiUse = maxUses > 1;
      const usesExhausted = isMultiUse ? usesCount >= maxUses : (enrollment.used_device_id != null || usesCount >= 1);

      if (!isDemo) {
        if (usesExhausted) {
          console.log(`[Enroll] REJECT 409: Production code ${code} already used`);
          res.writeHead(409, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: { code: "ENROLLMENT_CODE_USED", message: "This enrollment code has already been used." } }));
        }
        if (isExpired) {
          console.log(`[Enroll] REJECT 409: Production code ${code} expired`);
          res.writeHead(409, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: { code: "ENROLLMENT_CODE_EXPIRED", message: "This enrollment code has expired." } }));
        }
      }

      if (isDemo && (usesExhausted || isExpired)) {
        console.log(`[Enroll] Demo bypass: code=${code} store=${storeCode} uses=${usesCount}/${maxUses} expired=${isExpired}`);
      }

      let existingByFingerprint = null;
      if (deviceFingerprint) {
        const fpRes = await db.query(
          "SELECT id, device_token, label, enrollment_id FROM pos_devices WHERE store_id = $1 AND device_fingerprint = $2",
          [enrollment.store_id, deviceFingerprint]
        );
        existingByFingerprint = fpRes.rows[0] || null;
      }

      const labelRes = await db.query(
        "SELECT id, device_token, device_fingerprint, enrollment_id FROM pos_devices WHERE store_id = $1 AND LOWER(label) = LOWER($2)",
        [enrollment.store_id, label]
      );
      const existingByLabel = labelRes.rows[0] || null;

      if (existingByFingerprint && existingByFingerprint.enrollment_id === enrollment.id) {
        console.log(`[Enroll] Idempotent: device ${existingByFingerprint.id} already enrolled with code ${code}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          deviceId: existingByFingerprint.id,
          storeId: store.id,
          storeName: store.name,
          storeCode: store.code,
          deviceToken: existingByFingerprint.device_token,
          storeActive: store.status === "active",
          reEnrolled: true
        }));
      }

      const existingDevice = existingByLabel || existingByFingerprint;
      let deviceId, deviceToken;
      let isReEnroll = false;

      if (existingDevice) {
        deviceId = existingDevice.id;
        deviceToken = "tok_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
        isReEnroll = true;

        await db.query(`
          UPDATE pos_devices
          SET device_token = $1, device_type = $2, device_fingerprint = COALESCE($3, device_fingerprint), enrollment_id = $4, updated_at = NOW()
          WHERE id = $5
        `, [deviceToken, deviceType, deviceFingerprint || null, enrollment.id, deviceId]);

        console.log(`[Enroll] Re-enrolled device ${deviceId} with code ${code}`);
      } else {
        deviceId = "dev_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
        deviceToken = "tok_" + Math.random().toString(36).substring(2) + Date.now().toString(36);

        await db.query(`
          INSERT INTO pos_devices (id, store_id, device_token, label, device_type, device_fingerprint, enrollment_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [deviceId, enrollment.store_id, deviceToken, label, deviceType, deviceFingerprint || null, enrollment.id]);

        await db.query(`
          UPDATE pos_device_enrollments
          SET used_at = COALESCE(used_at, NOW()), used_device_id = COALESCE(used_device_id, $2), uses_count = COALESCE(uses_count, 0) + 1
          WHERE code = $1
        `, [code, deviceId]);

        console.log(`[Enroll] New device ${deviceId} enrolled with code ${code}`);
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        deviceId,
        storeId: store.id,
        storeName: store.name,
        storeCode: store.code,
        deviceToken,
        storeActive: store.status === "active",
        reEnrolled: isReEnroll
      }));

    } catch (error) {
      console.error("[Enroll] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "ENROLLMENT_FAILED", message: "Enrollment failed" } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // DEMO SEED ENDPOINT (unchanged from v2)
  // ============================================================================
  if (req.method === "POST" && (url.pathname === "/api/v1/demo/seed" || url.pathname === "/demo/seed")) {
    let db;
    try {
      const data = await parseBody(req);
      const storeId = data.storeId;

      if (!storeId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "STORE_ID_REQUIRED", message: "storeId is required" } }));
      }

      db = await getDb();
      const storeRes = await db.query("SELECT id, name, code, status FROM stores WHERE id = $1", [storeId]);
      if (storeRes.rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "STORE_NOT_FOUND", message: "Store not found" } }));
      }

      const store = storeRes.rows[0];
      const storeCode = store.code || "";
      const isDemo = isDemoStoreCode(storeCode);

      if (!isDemo) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "NOT_DEMO_STORE", message: "Seed only allowed for demo stores" } }));
      }

      console.log(`[Demo Seed] Starting seed for store ${storeId} (${storeCode})`);
      const seeded = { products: 0, store_products: 0, orders: 0, bills: 0 };

      // 50+ products across multiple categories
      const products = [
        // Groceries (12 items)
        { name: "Tata Salt 1kg", category: "Groceries", unit: "pcs", mrp: 2800, sell_price: 2600, gst_rate: 5, barcode: "8901030001001" },
        { name: "Aashirvaad Atta 5kg", category: "Groceries", unit: "pcs", mrp: 28500, sell_price: 27500, gst_rate: 5, barcode: "8901030001002" },
        { name: "Fortune Sunflower Oil 1L", category: "Groceries", unit: "pcs", mrp: 19500, sell_price: 18500, gst_rate: 5, barcode: "8901030001003" },
        { name: "Tata Tea Gold 500g", category: "Groceries", unit: "pcs", mrp: 29500, sell_price: 28000, gst_rate: 5, barcode: "8901030001004" },
        { name: "Sugar 1kg", category: "Groceries", unit: "pcs", mrp: 5500, sell_price: 5200, gst_rate: 5, barcode: "8901030001005" },
        { name: "Rice Basmati 1kg", category: "Groceries", unit: "pcs", mrp: 18000, sell_price: 17000, gst_rate: 5, barcode: "8901030001006" },
        { name: "Moong Dal 1kg", category: "Groceries", unit: "pcs", mrp: 16000, sell_price: 15500, gst_rate: 5, barcode: "8901030001007" },
        { name: "Chana Dal 1kg", category: "Groceries", unit: "pcs", mrp: 14000, sell_price: 13500, gst_rate: 5, barcode: "8901030001008" },
        { name: "Turmeric Powder 200g", category: "Groceries", unit: "pcs", mrp: 6500, sell_price: 6000, gst_rate: 5, barcode: "8901030001009" },
        { name: "Red Chilli Powder 200g", category: "Groceries", unit: "pcs", mrp: 8500, sell_price: 8000, gst_rate: 5, barcode: "8901030001010" },
        { name: "Garam Masala 100g", category: "Groceries", unit: "pcs", mrp: 9500, sell_price: 9000, gst_rate: 5, barcode: "8901030001011" },
        { name: "Coriander Powder 200g", category: "Groceries", unit: "pcs", mrp: 5500, sell_price: 5000, gst_rate: 5, barcode: "8901030001012" },

        // Dairy (8 items)
        { name: "Amul Butter 500g", category: "Dairy", unit: "pcs", mrp: 28000, sell_price: 27500, gst_rate: 12, barcode: "8901030002001" },
        { name: "Amul Milk 1L", category: "Dairy", unit: "pcs", mrp: 6800, sell_price: 6600, gst_rate: 5, barcode: "8901030002002" },
        { name: "Amul Cheese 200g", category: "Dairy", unit: "pcs", mrp: 12000, sell_price: 11500, gst_rate: 12, barcode: "8901030002003" },
        { name: "Amul Paneer 200g", category: "Dairy", unit: "pcs", mrp: 9000, sell_price: 8500, gst_rate: 5, barcode: "8901030002004" },
        { name: "Amul Curd 400g", category: "Dairy", unit: "pcs", mrp: 4500, sell_price: 4200, gst_rate: 5, barcode: "8901030002005" },
        { name: "Mother Dairy Dahi 400g", category: "Dairy", unit: "pcs", mrp: 4200, sell_price: 4000, gst_rate: 5, barcode: "8901030002006" },
        { name: "Nestle Milk 1L", category: "Dairy", unit: "pcs", mrp: 7200, sell_price: 7000, gst_rate: 5, barcode: "8901030002007" },
        { name: "Amul Ghee 500ml", category: "Dairy", unit: "pcs", mrp: 35000, sell_price: 34000, gst_rate: 12, barcode: "8901030002008" },

        // Beverages (8 items)
        { name: "Coca-Cola 2L", category: "Beverages", unit: "pcs", mrp: 9500, sell_price: 9000, gst_rate: 18, barcode: "8901030003001" },
        { name: "Pepsi 2L", category: "Beverages", unit: "pcs", mrp: 9500, sell_price: 9000, gst_rate: 18, barcode: "8901030003002" },
        { name: "Sprite 1.5L", category: "Beverages", unit: "pcs", mrp: 7500, sell_price: 7200, gst_rate: 18, barcode: "8901030003003" },
        { name: "Frooti Mango 1L", category: "Beverages", unit: "pcs", mrp: 6000, sell_price: 5800, gst_rate: 18, barcode: "8901030003004" },
        { name: "Maaza 1.2L", category: "Beverages", unit: "pcs", mrp: 7000, sell_price: 6800, gst_rate: 18, barcode: "8901030003005" },
        { name: "Bisleri Water 1L", category: "Beverages", unit: "pcs", mrp: 2000, sell_price: 2000, gst_rate: 18, barcode: "8901030003006" },
        { name: "Red Bull 250ml", category: "Beverages", unit: "pcs", mrp: 12500, sell_price: 12000, gst_rate: 18, barcode: "8901030003007" },
        { name: "Monster Energy 500ml", category: "Beverages", unit: "pcs", mrp: 15500, sell_price: 15000, gst_rate: 18, barcode: "8901030003008" },

        // Snacks (10 items)
        { name: "Maggi Noodles 70g", category: "Snacks", unit: "pcs", mrp: 1400, sell_price: 1400, gst_rate: 5, barcode: "8901030004001" },
        { name: "Lays Classic 52g", category: "Snacks", unit: "pcs", mrp: 2000, sell_price: 2000, gst_rate: 12, barcode: "8901030004002" },
        { name: "Kurkure Masala 100g", category: "Snacks", unit: "pcs", mrp: 2000, sell_price: 2000, gst_rate: 12, barcode: "8901030004003" },
        { name: "Haldiram Namkeen 200g", category: "Snacks", unit: "pcs", mrp: 5000, sell_price: 4800, gst_rate: 12, barcode: "8901030004004" },
        { name: "Bikaji Bhujia 200g", category: "Snacks", unit: "pcs", mrp: 7000, sell_price: 6800, gst_rate: 12, barcode: "8901030004005" },
        { name: "Parle-G Biscuit 800g", category: "Snacks", unit: "pcs", mrp: 7500, sell_price: 7200, gst_rate: 18, barcode: "8901030004006" },
        { name: "Oreo Cream 150g", category: "Snacks", unit: "pcs", mrp: 4000, sell_price: 3800, gst_rate: 18, barcode: "8901030004007" },
        { name: "Hide & Seek 200g", category: "Snacks", unit: "pcs", mrp: 5500, sell_price: 5200, gst_rate: 18, barcode: "8901030004008" },
        { name: "Top Ramen 70g", category: "Snacks", unit: "pcs", mrp: 1500, sell_price: 1500, gst_rate: 5, barcode: "8901030004009" },
        { name: "Yippee Noodles 70g", category: "Snacks", unit: "pcs", mrp: 1500, sell_price: 1500, gst_rate: 5, barcode: "8901030004010" },

        // Personal Care (8 items)
        { name: "Colgate 100g", category: "Personal Care", unit: "pcs", mrp: 5500, sell_price: 5200, gst_rate: 18, barcode: "8901030005001" },
        { name: "Pepsodent 150g", category: "Personal Care", unit: "pcs", mrp: 8000, sell_price: 7500, gst_rate: 18, barcode: "8901030005002" },
        { name: "Dove Soap 100g", category: "Personal Care", unit: "pcs", mrp: 5500, sell_price: 5200, gst_rate: 18, barcode: "8901030005003" },
        { name: "Lux Soap 100g", category: "Personal Care", unit: "pcs", mrp: 4500, sell_price: 4200, gst_rate: 18, barcode: "8901030005004" },
        { name: "Head & Shoulders 200ml", category: "Personal Care", unit: "pcs", mrp: 22000, sell_price: 21000, gst_rate: 18, barcode: "8901030005005" },
        { name: "Clinic Plus 200ml", category: "Personal Care", unit: "pcs", mrp: 16500, sell_price: 16000, gst_rate: 18, barcode: "8901030005006" },
        { name: "Dettol 125ml", category: "Personal Care", unit: "pcs", mrp: 7500, sell_price: 7200, gst_rate: 18, barcode: "8901030005007" },
        { name: "Nivea Cream 60ml", category: "Personal Care", unit: "pcs", mrp: 17000, sell_price: 16500, gst_rate: 18, barcode: "8901030005008" },

        // Household (6 items)
        { name: "Vim Dish Bar 250g", category: "Household", unit: "pcs", mrp: 3500, sell_price: 3200, gst_rate: 18, barcode: "8901030006001" },
        { name: "Surf Excel 1kg", category: "Household", unit: "pcs", mrp: 22000, sell_price: 21500, gst_rate: 18, barcode: "8901030006002" },
        { name: "Rin Detergent Bar 250g", category: "Household", unit: "pcs", mrp: 2500, sell_price: 2400, gst_rate: 18, barcode: "8901030006003" },
        { name: "Colin Glass Cleaner 500ml", category: "Household", unit: "pcs", mrp: 11000, sell_price: 10500, gst_rate: 18, barcode: "8901030006004" },
        { name: "Harpic 500ml", category: "Household", unit: "pcs", mrp: 12000, sell_price: 11500, gst_rate: 18, barcode: "8901030006005" },
        { name: "Lizol 500ml", category: "Household", unit: "pcs", mrp: 15000, sell_price: 14500, gst_rate: 18, barcode: "8901030006006" }
      ];

      // Seed products
      let productIndex = 0;
      const productIds = [];
      for (const p of products) {
        productIndex++;
        const hexIndex = productIndex.toString(16).padStart(12, '0');
        const productId = `de000000-0000-4000-8000-${hexIndex}`;
        productIds.push({ id: productId, ...p });

        await db.query(`
          INSERT INTO catalog.products (id, name, category, unit, primary_barcode, default_gst_rate, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, updated_at = NOW()
        `, [productId, p.name, p.category, p.unit, p.barcode, p.gst_rate]);
        seeded.products++;

        const stockQty = 20 + Math.floor(Math.random() * 80);
        await db.query(`
          INSERT INTO catalog.store_products (store_id, product_id, sell_price, mrp, current_stock, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
          ON CONFLICT (store_id, product_id) DO UPDATE SET sell_price = EXCLUDED.sell_price, mrp = EXCLUDED.mrp, current_stock = EXCLUDED.current_stock, updated_at = NOW()
        `, [storeId, productId, p.sell_price, p.mrp, stockQty]);
        seeded.store_products++;
      }

      // Get or create device ID for demo store
      const deviceRes = await db.query("SELECT id FROM public.pos_devices WHERE store_id = $1::text LIMIT 1", [storeId]);
      const deviceId = deviceRes.rows.length > 0 ? deviceRes.rows[0].id : null;

      // Seed sample bills (20 bills over last 7 days)
      const now = Date.now();
      const DAY = 24 * 60 * 60 * 1000;
      const paymentModes = ["CASH", "CASH", "CASH", "UPI", "DUE"]; // Weighted towards CASH

      for (let i = 0; i < 20; i++) {
        const daysAgo = Math.floor(Math.random() * 7);
        const hoursAgo = Math.floor(Math.random() * 12);
        const createdAt = new Date(now - daysAgo * DAY - hoursAgo * 60 * 60 * 1000);
        const billNumber = 100 + i;
        const saleId = `demo_sale_${storeId.substring(0, 8)}_${billNumber}`;
        const billRef = `B${billNumber.toString().padStart(6, '0')}`;
        const paymentMode = paymentModes[Math.floor(Math.random() * paymentModes.length)];

        // Pick 1-5 random products for this bill
        const numItems = 1 + Math.floor(Math.random() * 5);
        const billItems = [];
        let subtotalMinor = 0;

        for (let j = 0; j < numItems; j++) {
          const prod = productIds[Math.floor(Math.random() * productIds.length)];
          const qty = 1 + Math.floor(Math.random() * 3);
          const lineTotalMinor = prod.sell_price * qty;
          subtotalMinor += lineTotalMinor;
          billItems.push({ prod, qty, lineTotalMinor });
        }

        const discountMinor = Math.random() > 0.8 ? Math.floor(subtotalMinor * 0.05) : 0;
        const totalMinor = subtotalMinor - discountMinor;

        // Insert sale
        await db.query(`
          INSERT INTO public.sales (id, store_id, device_id, bill_ref, subtotal_minor, discount_minor, total_minor, currency, status, payment_mode, payment_status, created_at, updated_at)
          VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, 'INR', 'completed', $8, 'paid', $9, $9)
          ON CONFLICT (id) DO NOTHING
        `, [saleId, storeId, deviceId, billRef, subtotalMinor, discountMinor, totalMinor, paymentMode, createdAt]);

        // Insert sale items
        for (const item of billItems) {
          await db.query(`
            INSERT INTO public.sale_items (sale_id, product_id, variant_id, name, barcode, quantity, price_minor, line_total_minor)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT DO NOTHING
          `, [saleId, item.prod.id, item.prod.id, item.prod.name, item.prod.barcode, item.qty, item.prod.sell_price, item.lineTotalMinor]);
        }
        seeded.bills++;
      }

      console.log(`[Demo Seed] Completed for store ${storeId}:`, seeded);

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: true,
        storeId,
        storeCode,
        seeded
      }));
    } catch (error) {
      console.error("[Demo Seed] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "SEED_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // SCAN BARCODE ENDPOINT
  // ============================================================================
  if (req.method === "POST" && (url.pathname === "/api/v1/pos/scan" || url.pathname === "/scan")) {
    let db;
    try {
      const data = await parseBody(req);
      const barcode = (data.barcode || "").trim();

      if (!barcode) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "BARCODE_REQUIRED", message: "Barcode is required" } }));
      }

      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      // Look up product by barcode
      const result = await db.query(`
        SELECT p.id, p.name, p.category, p.unit, p.primary_barcode as barcode,
               sp.sell_price as "priceMinor", sp.mrp as "mrpMinor", sp.current_stock as stock
        FROM catalog.products p
        JOIN catalog.store_products sp ON sp.product_id = p.id
        WHERE p.primary_barcode = $1 AND sp.store_id = $2 AND sp.is_active = true
        LIMIT 1
      `, [barcode, device.store_id]);

      if (result.rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "PRODUCT_NOT_FOUND", message: "Product not found" } }));
      }

      const product = result.rows[0];
      console.log(`[Scan] Found product ${product.id} for barcode ${barcode}`);

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        productId: product.id,
        name: product.name,
        category: product.category,
        unit: product.unit,
        barcode: product.barcode,
        priceMinor: product.priceMinor,
        mrpMinor: product.mrpMinor,
        stock: product.stock
      }));
    } catch (error) {
      console.error("[Scan] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "SCAN_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // SD-ONBOARD-001B: SCAN/RESOLVE FOR DIGITISATION
  // ============================================================================
  if (req.method === "POST" && (url.pathname === "/api/v1/pos/scan/resolve" || url.pathname === "/scan/resolve")) {
    let db;
    try {
      const data = await parseBody(req);
      const rawBarcode = (data.barcode || "").trim();

      if (!rawBarcode) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status: "NOT_FOUND", barcode: "" }));
      }

      const { normalized, variants } = buildBarcodeVariants(rawBarcode);
      if (!normalized) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status: "NOT_FOUND", barcode: "" }));
      }
      const barcode = normalized;
      const barcodeVariants = variants.length > 0 ? variants : [normalized];

      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      const storeId = device.store_id;

      // Step 1: Check store_product_barcodes (store-scoped mapping) with variants
      const placeholders = barcodeVariants.map((_, i) => `$${i + 2}`).join(", ");
      const barcodeResult = await db.query(`
        SELECT sp.id AS store_product_id, COALESCE(sp.display_name, p.name) AS name,
               spb.barcode, sp.sell_price, sp.mrp, sp.current_stock,
               p.unit, p.brand, p.description
        FROM catalog.store_product_barcodes spb
        JOIN catalog.store_products sp ON sp.id = spb.store_product_id AND sp.store_id = spb.store_id
        JOIN catalog.products p ON p.id = sp.product_id
        WHERE spb.store_id = $1 AND spb.barcode IN (${placeholders}) AND sp.is_active = true
        LIMIT 1
      `, [storeId, ...barcodeVariants]);

      if (barcodeResult.rows.length > 0) {
        const row = barcodeResult.rows[0];
        console.log(`[scan/resolve] FOUND via store_product_barcodes: ${barcode}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          status: "FOUND",
          storeProduct: {
            storeProductId: row.store_product_id,
            name: row.name || "",
            barcode: row.barcode,
            sellPrice: row.sell_price,
            mrp: row.mrp,
            stock: { isKnown: row.current_stock !== null && row.current_stock >= 0, qty: row.current_stock || 0 },
            unit: row.unit || "pcs",
            brand: row.brand || "",
            description: row.description || "",
            imageUrl: ""
          }
        }));
      }

      // Step 2: Check catalog.products with primary_barcode (using variants)
      const primaryResult = await db.query(`
        SELECT sp.id AS store_product_id, COALESCE(sp.display_name, p.name) AS name,
               p.primary_barcode AS barcode, sp.sell_price, sp.mrp, sp.current_stock,
               p.unit, p.brand, p.description
        FROM catalog.products p
        JOIN catalog.store_products sp ON sp.product_id = p.id AND sp.store_id = $1
        WHERE p.primary_barcode IN (${placeholders}) AND sp.is_active = true
        LIMIT 1
      `, [storeId, ...barcodeVariants]);

      if (primaryResult.rows.length > 0) {
        const row = primaryResult.rows[0];
        console.log(`[scan/resolve] FOUND via primary_barcode: ${barcode}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          status: "FOUND",
          storeProduct: {
            storeProductId: row.store_product_id,
            name: row.name || "",
            barcode: row.barcode,
            sellPrice: row.sell_price,
            mrp: row.mrp,
            stock: { isKnown: row.current_stock !== null && row.current_stock >= 0, qty: row.current_stock || 0 },
            unit: row.unit || "pcs",
            brand: row.brand || "",
            description: row.description || "",
            imageUrl: ""
          }
        }));
      }

      // Step 3: Check platform catalog for prefill (SD-ONBOARD-002) using variants
      const platformPlaceholders = barcodeVariants.map((_, i) => `$${i + 1}`).join(", ");
      const platformResult = await db.query(`
        SELECT p.id AS product_id, p.name, p.description, p.unit, p.brand, p.variant, p.pack_size, pb.barcode
        FROM catalog.product_barcodes pb
        JOIN catalog.products p ON p.id = pb.product_id
        WHERE pb.barcode IN (${platformPlaceholders}) AND p.is_active = true
        LIMIT 1
      `, barcodeVariants);

      if (platformResult.rows.length > 0) {
        const row = platformResult.rows[0];
        console.log(`[scan/resolve] NEEDS_CREATE with prefill from platform catalog: ${barcode}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          status: "NEEDS_CREATE",
          barcode: barcode,
          prefill: {
            barcode: row.barcode,
            name: row.name || "",
            description: row.description || "",
            unit: row.unit || "pcs",
            imageUrl: "",
            brand: row.brand || "",
            variant: row.variant || "",
            packSize: row.pack_size || "",
            source: "platform_catalog",
            confidence: "high",
            productId: row.product_id
          }
        }));
      }

      // Step 4: Also check primary_barcode in catalog.products using variants
      const primaryCatalogResult = await db.query(`
        SELECT id AS product_id, name, description, unit, brand, variant, pack_size, primary_barcode AS barcode
        FROM catalog.products
        WHERE primary_barcode IN (${platformPlaceholders}) AND is_active = true
        LIMIT 1
      `, barcodeVariants);

      if (primaryCatalogResult.rows.length > 0) {
        const row = primaryCatalogResult.rows[0];
        console.log(`[scan/resolve] NEEDS_CREATE with prefill from primary_barcode: ${barcode}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          status: "NEEDS_CREATE",
          barcode: barcode,
          prefill: {
            barcode: row.barcode,
            name: row.name || "",
            description: row.description || "",
            unit: row.unit || "pcs",
            imageUrl: "",
            brand: row.brand || "",
            variant: row.variant || "",
            packSize: row.pack_size || "",
            source: "platform_catalog",
            confidence: "high",
            productId: row.product_id
          }
        }));
      }

      // Step 5: Cross-store prefill (SD-ONBOARD-002C) using variants
      // Search other stores' digitised inventory for metadata (no prices/stock)
      const crossStorePlaceholders = barcodeVariants.map((_, i) => `$${i + 1}`).join(", ");
      const crossStoreResult = await db.query(`
        SELECT DISTINCT ON (spb.barcode)
          p.id AS product_id,
          COALESCE(sp.display_name, p.name) AS name,
          p.description,
          p.unit,
          p.brand,
          p.variant,
          p.pack_size,
          spb.barcode
        FROM catalog.store_product_barcodes spb
        JOIN catalog.store_products sp ON sp.id = spb.store_product_id
        JOIN catalog.products p ON p.id = sp.product_id
        WHERE spb.barcode IN (${crossStorePlaceholders})
          AND spb.store_id != $${barcodeVariants.length + 1}
          AND sp.is_active = true
        ORDER BY spb.barcode, sp.updated_at DESC
        LIMIT 1
      `, [...barcodeVariants, storeId]);

      if (crossStoreResult.rows.length > 0) {
        const row = crossStoreResult.rows[0];
        console.log(`[scan/resolve] NEEDS_CREATE with prefill from other_store: ${barcode}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          status: "NEEDS_CREATE",
          barcode: barcode,
          prefill: {
            barcode: row.barcode,
            name: row.name || "",
            description: row.description || "",
            unit: row.unit || "pcs",
            imageUrl: "",
            brand: row.brand || "",
            variant: row.variant || "",
            packSize: row.pack_size || "",
            source: "other_store",
            confidence: "medium",
            productId: row.product_id
          }
        }));
      }

      // Step 6: Not found anywhere - return NEEDS_CREATE without prefill
      console.log(`[scan/resolve] NEEDS_CREATE (no prefill): ${barcode}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "NEEDS_CREATE", barcode: barcode }));

    } catch (error) {
      console.error("[scan/resolve] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "SCAN_RESOLVE_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // SD-ONBOARD-002C: LIST STORE PRODUCTS (TAP-AND-ADD)
  // Returns store products for initial SELL screen grid without requiring search
  // ============================================================================
  if (req.method === "GET" && (url.pathname === "/api/v1/pos/store-products/list" || url.pathname === "/store-products/list")) {
    let db;
    try {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);

      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      const storeId = device.store_id;

      // Fetch store products with barcode, ordered by recent activity
      const result = await db.query(`
        SELECT
          sp.id as store_product_id,
          sp.product_id,
          COALESCE(sp.display_name, p.name) as name,
          sp.sell_price,
          sp.current_stock,
          spb.barcode,
          p.brand,
          p.unit
        FROM catalog.store_products sp
        JOIN catalog.products p ON p.id = sp.product_id
        LEFT JOIN catalog.store_product_barcodes spb
          ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id
        WHERE sp.store_id = $1
        ORDER BY sp.updated_at DESC NULLS LAST, sp.created_at DESC
        LIMIT $2 OFFSET $3
      `, [storeId, limit, offset]);

      // Count total for pagination
      const countResult = await db.query(`
        SELECT COUNT(*) as total FROM catalog.store_products WHERE store_id = $1
      `, [storeId]);

      const products = result.rows.map(row => ({
        storeProductId: row.store_product_id,
        productId: row.product_id,
        name: row.name,
        barcode: row.barcode || null,
        sellPrice: row.sell_price,
        currentStock: row.current_stock || 0,
        brand: row.brand || null,
        unit: row.unit || "pcs",
      }));

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: true,
        data: products,
        total: parseInt(countResult.rows[0].total, 10),
        limit,
        offset,
        context: "SELL"
      }));
    } catch (error) {
      console.error("[store-products/list] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "LIST_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // SD-ONBOARD-002C: SEARCH STORE PRODUCTS (POS endpoint)
  // Returns grouped search results matching catalog service format
  // ============================================================================
  if (req.method === "GET" && (url.pathname === "/api/v1/pos/store-products/search" || url.pathname === "/store-products/search")) {
    let db;
    try {
      const query = (url.searchParams.get("q") || "").trim();
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "30", 10), 100);
      const includeZeroStock = url.searchParams.get("includeZeroStock") !== "false";

      if (query.length < 2) {
        res.writeHead(422, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "Search query (q) is required and must be at least 2 characters" } }));
      }

      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      const storeId = device.store_id;
      const likePattern = `%${query.toLowerCase()}%`;

      // Search store products by name, brand, or barcode
      const stockFilter = includeZeroStock ? "" : "AND sp.current_stock > 0";
      const result = await db.query(`
        SELECT
          sp.id as store_product_id,
          sp.product_id,
          COALESCE(sp.display_name, p.name) as name,
          sp.sell_price,
          sp.current_stock,
          spb.barcode,
          p.brand,
          p.unit,
          p.category
        FROM catalog.store_products sp
        JOIN catalog.products p ON p.id = sp.product_id
        LEFT JOIN catalog.store_product_barcodes spb
          ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id
        WHERE sp.store_id = $1
          AND (
            LOWER(COALESCE(sp.display_name, p.name)) LIKE $2
            OR LOWER(p.brand) LIKE $2
            OR spb.barcode LIKE $2
          )
          ${stockFilter}
        ORDER BY sp.updated_at DESC NULLS LAST
        LIMIT $3
      `, [storeId, likePattern, limit]);

      // Group by product name + brand for 2-step UX
      const groups = new Map();
      for (const row of result.rows) {
        const groupKey = `${row.name.toLowerCase()}::${(row.brand || "").toLowerCase()}`;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            groupId: groupKey,
            displayName: row.name,
            brand: row.brand || undefined,
            category: row.category || undefined,
            matches: []
          });
        }
        groups.get(groupKey).matches.push({
          productId: row.product_id,
          storeProductId: row.store_product_id,
          barcode: row.barcode || undefined,
          sellPrice: row.sell_price,
          currentStock: row.current_stock || 0,
          displayName: row.name
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: true,
        data: Array.from(groups.values()),
        total: groups.size,
        context: "SELL"
      }));
    } catch (error) {
      console.error("[store-products/search] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "SEARCH_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // SD-ONBOARD-002C: LOOKUP STORE PRODUCT BY BARCODE (POS endpoint)
  // Returns single product for direct cart add
  // ============================================================================
  if (req.method === "GET" && (url.pathname === "/api/v1/pos/store-products/lookup" || url.pathname === "/store-products/lookup")) {
    let db;
    try {
      const rawBarcode = (url.searchParams.get("barcode") || "").trim();

      if (!rawBarcode) {
        res.writeHead(422, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "Barcode is required" } }));
      }

      const { normalized, variants } = buildBarcodeVariants(rawBarcode);
      if (!normalized) {
        res.writeHead(422, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "Barcode is required" } }));
      }
      const barcode = normalized;
      const barcodeVariants = variants.length > 0 ? variants : [normalized];

      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      const storeId = device.store_id;

      // Look up by barcode variants in store_product_barcodes
      const placeholders = barcodeVariants.map((_, i) => `$${i + 2}`).join(", ");
      const result = await db.query(`
        SELECT
          sp.id as store_product_id,
          sp.product_id,
          COALESCE(sp.display_name, p.name) as name,
          sp.sell_price,
          sp.current_stock,
          spb.barcode,
          p.brand
        FROM catalog.store_product_barcodes spb
        JOIN catalog.store_products sp ON sp.id = spb.store_product_id AND sp.store_id = spb.store_id
        JOIN catalog.products p ON p.id = sp.product_id
        WHERE spb.store_id = $1 AND spb.barcode IN (${placeholders})
        LIMIT 1
      `, [storeId, ...barcodeVariants]);

      if (result.rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          error: "PRODUCT_NOT_IN_STORE_CATALOG",
          message: "Product not found in store catalog",
          barcode
        }));
      }

      const row = result.rows[0];
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: true,
        data: {
          productId: row.product_id,
          storeProductId: row.store_product_id,
          name: row.name,
          brand: row.brand || undefined,
          barcode: row.barcode,
          sellPrice: row.sell_price,
          currentStock: row.current_stock || 0
        },
        context: "SELL"
      }));
    } catch (error) {
      console.error("[store-products/lookup] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "LOOKUP_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // SD-ONBOARD-001B: CREATE STORE PRODUCT (DIGITISATION)
  // ============================================================================
  if (req.method === "POST" && (url.pathname === "/api/v1/pos/store-products" || url.pathname === "/store-products")) {
    let db;
    try {
      const data = await parseBody(req);
      const barcode = (data.barcode || "").trim();
      const name = (data.name || "").trim() || `Item ${barcode.slice(-4)}`;
      const sellPrice = data.sellPrice;
      const mrp = data.mrp || sellPrice;
      const initialStockQty = data.initialStockQty;
      const unit = data.unit || "pcs";
      const description = data.description || "";
      const brand = data.brand || "";

      // Validation
      if (!barcode) {
        res.writeHead(422, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "VALIDATION_ERROR", message: "Barcode is required" }));
      }
      if (typeof sellPrice !== "number" || !Number.isFinite(sellPrice) || sellPrice <= 0) {
        res.writeHead(422, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "VALIDATION_ERROR", message: "Sell price must be a positive number" }));
      }
      if (typeof initialStockQty !== "number" || !Number.isFinite(initialStockQty) || initialStockQty < 0) {
        res.writeHead(422, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "VALIDATION_ERROR", message: "Initial stock quantity must be >= 0" }));
      }

      db = await getDb();
      const device = await getDeviceFromToken(db, token);
      if (!device || !device.store_id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid device token" } }));
      }

      const storeId = device.store_id;
      const sellPriceMinor = Math.round(sellPrice);
      const mrpMinor = Math.round(mrp);

      // Check if barcode already exists for this store
      const existingCheck = await db.query(`
        SELECT sp.id FROM catalog.store_product_barcodes spb
        JOIN catalog.store_products sp ON sp.id = spb.store_product_id
        WHERE spb.store_id = $1 AND spb.barcode = $2
        LIMIT 1
      `, [storeId, barcode]);

      if (existingCheck.rows.length > 0) {
        // Fetch existing product details for conflict response
        const existingResult = await db.query(`
          SELECT sp.id AS store_product_id, COALESCE(sp.display_name, p.name) AS name,
                 spb.barcode, sp.sell_price, sp.mrp, sp.current_stock,
                 p.unit, p.brand, p.description
          FROM catalog.store_product_barcodes spb
          JOIN catalog.store_products sp ON sp.id = spb.store_product_id
          JOIN catalog.products p ON p.id = sp.product_id
          WHERE spb.store_id = $1 AND spb.barcode = $2
          LIMIT 1
        `, [storeId, barcode]);

        const row = existingResult.rows[0];
        res.writeHead(409, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          error: "BARCODE_ALREADY_MAPPED",
          message: "Barcode already exists for this store",
          storeProduct: {
            storeProductId: row.store_product_id,
            name: row.name || "",
            barcode: row.barcode,
            sellPrice: row.sell_price,
            mrp: row.mrp,
            stock: { isKnown: row.current_stock !== null, qty: row.current_stock || 0 },
            unit: row.unit || "pcs",
            brand: row.brand || "",
            description: row.description || "",
            imageUrl: ""
          }
        }));
      }

      // Begin transaction
      await db.query("BEGIN");

      // Step 1: Find or create catalog.products
      let productId;
      const existingProduct = await db.query(`
        SELECT id FROM catalog.products WHERE primary_barcode = $1 LIMIT 1
      `, [barcode]);

      if (existingProduct.rows.length > 0) {
        productId = existingProduct.rows[0].id;
        console.log(`[store-products] Using existing catalog product: ${productId}`);
      } else {
        const { randomUUID } = require("crypto");
        productId = randomUUID();
        await db.query(`
          INSERT INTO catalog.products (id, name, brand, description, unit, primary_barcode, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, true)
        `, [productId, name, brand || null, description || null, unit, barcode]);
        console.log(`[store-products] Created new catalog product: ${productId}`);
      }

      // Step 2: Create or update store_products
      const { randomUUID } = require("crypto");
      const storeProductId = randomUUID();
      await db.query(`
        INSERT INTO catalog.store_products (id, store_id, product_id, sell_price, mrp, display_name, is_active, current_stock)
        VALUES ($1, $2, $3, $4, $5, $6, true, $7)
        ON CONFLICT (store_id, product_id) DO UPDATE SET
          sell_price = EXCLUDED.sell_price,
          mrp = EXCLUDED.mrp,
          display_name = EXCLUDED.display_name,
          current_stock = EXCLUDED.current_stock,
          is_active = true,
          updated_at = NOW()
      `, [storeProductId, storeId, productId, sellPriceMinor, mrpMinor, name, initialStockQty]);

      // Get actual store_product_id
      const spResult = await db.query(`
        SELECT id FROM catalog.store_products WHERE store_id = $1 AND product_id = $2
      `, [storeId, productId]);
      const actualStoreProductId = spResult.rows[0]?.id || storeProductId;

      // Step 3: Create store-scoped barcode binding
      await db.query(`
        INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
        VALUES ($1, $2, $3, 'retailer_digitisation')
        ON CONFLICT (store_id, barcode) DO NOTHING
      `, [storeId, actualStoreProductId, barcode]);

      // Step 4: Create INWARD ledger entry
      if (initialStockQty > 0) {
        const ledgerId = randomUUID();
        await db.query(`
          INSERT INTO inventory.inventory_ledger (
            id, store_id, product_id, delta_qty, transaction_type,
            reference_type, reference_id, stock_before, stock_after, notes
          )
          VALUES ($1, $2, $3, $4, 'adjustment', 'manual', $5, 0, $4, 'Initial stock from digitisation')
        `, [ledgerId, storeId, productId, initialStockQty, `digitisation:${actualStoreProductId}`]);

        // Step 5: Create/update stock balance
        await db.query(`
          INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (store_id, product_id) DO UPDATE SET
            current_qty = EXCLUDED.current_qty,
            last_ledger_id = EXCLUDED.last_ledger_id,
            updated_at = NOW()
        `, [storeId, productId, initialStockQty, ledgerId]);
      }

      await db.query("COMMIT");

      console.log(`[store-products] Created store product ${actualStoreProductId} for store ${storeId}`);

      res.writeHead(201, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        storeProduct: {
          storeProductId: actualStoreProductId,
          name: name,
          barcode: barcode,
          sellPrice: sellPriceMinor,
          mrp: mrpMinor,
          stock: { isKnown: true, qty: initialStockQty },
          unit: unit,
          brand: brand,
          description: description,
          imageUrl: ""
        }
      }));

    } catch (error) {
      if (db) await db.query("ROLLBACK").catch(() => {});
      console.error("[store-products] Error:", error);

      // Check for unique constraint violation (race condition)
      if (error.code === "23505") {
        res.writeHead(409, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          error: "BARCODE_ALREADY_MAPPED",
          message: "Barcode was just mapped by another request"
        }));
      }

      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "CREATE_FAILED", message: error.message } }));
    } finally {
      if (db) await db.end();
    }
  }

  // ============================================================================
  // DEFAULT: 404
  // ============================================================================
  res.writeHead(404, { "Content-Type": "application/json" });
  return res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Endpoint not found" } }));
});

server.listen(PORT, () => {
  console.log(`Enroll service v6 (SD-ONBOARD-002C) running on port ${PORT}`);
});
