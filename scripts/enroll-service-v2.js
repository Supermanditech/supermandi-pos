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

  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok" }));
  }

  // UI Status endpoint
  if (req.method === "GET" && (url.pathname === "/api/v1/pos/ui-status" || url.pathname === "/ui-status")) {
    const token = req.headers["x-device-token"] || req.headers["authorization"]?.replace("Bearer ", "");
    const defaultResponse = {
      storeId: null, storeName: null, storeCode: null, deviceId: null,
      storeActive: true, deviceActive: true, pendingOutboxCount: 0,
      lastSyncAt: null, lastSeenOnline: new Date().toISOString(),
      upiVpa: null, printerOk: null, scannerOk: null,
      features: { reorderEnabled: true, buyEnabled: true, inventoryEnabled: true, suppliersEnabled: true, ordersEnabled: true }
    };

    if (!token) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(defaultResponse));
    }

    let db;
    try {
      db = await getDb();
      const deviceResult = await db.query(
        "SELECT id, store_id, active FROM pos_devices WHERE device_token = $1",
        [token]
      );
      if (deviceResult.rows.length === 0) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(defaultResponse));
      }
      const device = deviceResult.rows[0];
      let storeName = null, storeCode = null, storeActive = true, upiVpa = null;
      if (device.store_id) {
        const storeResult = await db.query("SELECT name, code, status FROM stores WHERE id = $1", [device.store_id]);
        if (storeResult.rows.length > 0) {
          storeName = storeResult.rows[0].name;
          storeCode = storeResult.rows[0].code; // GO-LIVE: Human-readable store code
          storeActive = storeResult.rows[0].status === 'active';
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        ...defaultResponse,
        storeId: device.store_id,
        storeName,
        storeCode, // GO-LIVE: Human-readable store code
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

  // ENROLL endpoint - DEV-071 with demo bypass
  if (req.method === "POST" && (url.pathname === "/api/v1/pos/enroll" || url.pathname === "/enroll")) {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      let db;
      try {
        const data = JSON.parse(body);
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

        // Fetch enrollment with multi-use columns
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

        // Fetch store (using public.stores view - has: id, name, code, status)
        const storeRes = await db.query("SELECT id, name, code, status FROM stores WHERE id = $1", [enrollment.store_id]);
        const store = storeRes.rows[0];
        if (!store) {
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: { code: "STORE_NOT_FOUND", message: "Store not found" } }));
        }

        // 2-layer demo detection (store.code pattern + enrollment code pattern)
        const storeCode = store.code || "";
        const isDemo = isDemoStoreCode(storeCode) || isDemoCode(code);

        // Parse enrollment state
        const isExpired = new Date(enrollment.expires_at) <= new Date();
        const maxUses = enrollment.max_uses;
        const usesCount = enrollment.uses_count;
        const isMultiUse = maxUses > 1;
        const usesExhausted = isMultiUse ? usesCount >= maxUses : (enrollment.used_device_id != null || usesCount >= 1);

        // ENFORCEMENT: Only for production + new devices
        if (!isDemo) {
          if (usesExhausted) {
            console.log(`[Enroll] REJECT 409: Production code ${code} already used (maxUses=${maxUses}, usesCount=${usesCount}, isMultiUse=${isMultiUse})`);
            res.writeHead(409, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: { code: "ENROLLMENT_CODE_USED", message: "This enrollment code has already been used." } }));
          }
          if (isExpired) {
            console.log(`[Enroll] REJECT 409: Production code ${code} expired`);
            res.writeHead(409, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: { code: "ENROLLMENT_CODE_EXPIRED", message: "This enrollment code has expired." } }));
          }
        }

        // Demo bypass logging
        if (isDemo && (usesExhausted || isExpired)) {
          console.log(`[Enroll] Demo bypass: code=${code} store=${storeCode} uses=${usesCount}/${maxUses} expired=${isExpired}`);
        }

        // Check for existing device by fingerprint (idempotent enrollment)
        let existingByFingerprint = null;
        if (deviceFingerprint) {
          const fpRes = await db.query(
            "SELECT id, device_token, label, enrollment_id FROM pos_devices WHERE store_id = $1 AND device_fingerprint = $2",
            [enrollment.store_id, deviceFingerprint]
          );
          existingByFingerprint = fpRes.rows[0] || null;
        }

        // Check for existing device by label (re-enrollment scenario)
        const labelRes = await db.query(
          "SELECT id, device_token, device_fingerprint, enrollment_id FROM pos_devices WHERE store_id = $1 AND LOWER(label) = LOWER($2)",
          [enrollment.store_id, label]
        );
        const existingByLabel = labelRes.rows[0] || null;

        // IDEMPOTENT: Same fingerprint + same enrollment code = return existing device
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

        // Determine if re-enrollment (existing device by label or fingerprint)
        const existingDevice = existingByLabel || existingByFingerprint;
        let deviceId, deviceToken;
        let isReEnroll = false;

        if (existingDevice) {
          // RE-ENROLL: Update existing device with new token
          deviceId = existingDevice.id;
          deviceToken = "tok_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
          isReEnroll = true;

          await db.query(`
            UPDATE pos_devices
            SET device_token = $1,
                device_type = $2,
                device_fingerprint = COALESCE($3, device_fingerprint),
                enrollment_id = $4,
                updated_at = NOW()
            WHERE id = $5
          `, [deviceToken, deviceType, deviceFingerprint || null, enrollment.id, deviceId]);

          console.log(`[Enroll] Re-enrolled device ${deviceId} with code ${code}`);
        } else {
          // NEW DEVICE: Insert
          deviceId = "dev_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
          deviceToken = "tok_" + Math.random().toString(36).substring(2) + Date.now().toString(36);

          await db.query(`
            INSERT INTO pos_devices (id, store_id, device_token, label, device_type, device_fingerprint, enrollment_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [deviceId, enrollment.store_id, deviceToken, label, deviceType, deviceFingerprint || null, enrollment.id]);

          // Update enrollment count only for NEW devices
          await db.query(`
            UPDATE pos_device_enrollments
            SET used_at = COALESCE(used_at, NOW()),
                used_device_id = COALESCE(used_device_id, $2),
                uses_count = COALESCE(uses_count, 0) + 1
            WHERE code = $1
          `, [code, deviceId]);

          console.log(`[Enroll] New device ${deviceId} enrolled with code ${code} (uses: ${usesCount + 1}/${maxUses})`);
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
    });
    return;
  }

  // DEMO SEED endpoint - idempotent seed for demo stores
  if (req.method === "POST" && (url.pathname === "/api/v1/demo/seed" || url.pathname === "/demo/seed")) {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      let db;
      try {
        const data = JSON.parse(body);
        const storeId = data.storeId;

        if (!storeId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: { code: "STORE_ID_REQUIRED", message: "storeId is required" } }));
        }

        db = await getDb();

        // Validate store exists and is demo
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
          return res.end(JSON.stringify({ error: { code: "NOT_DEMO_STORE", message: "Seed only allowed for demo stores. Store code must start with DM, QA, TS, ST or contain demo/test/qa-/staging." } }));
        }

        console.log(`[Demo Seed] Starting seed for store ${storeId} (${storeCode})`);
        const seeded = { products: 0, store_products: 0, barcodes: 0, suppliers: 0, supplier_products: 0, purchase_orders: 0, grn_headers: 0, bills: 0, reorder_policies: 0 };

        // ============ SEED PRODUCTS ============
        // Schema: catalog.products has: id, name, category, unit, primary_barcode, default_gst_rate
        // Schema: catalog.store_products has: store_id, product_id, sell_price (int), mrp (int), current_stock
        const products = [
          { name: "Tata Salt 1kg", category: "Groceries", unit: "pcs", mrp: 2800, sell_price: 2600, gst_rate: 5, barcode: "8901030001001" },
          { name: "Amul Butter 500g", category: "Groceries", unit: "pcs", mrp: 28000, sell_price: 27500, gst_rate: 12, barcode: "8901030001002" },
          { name: "Coca-Cola 2L", category: "Beverages", unit: "pcs", mrp: 9500, sell_price: 9000, gst_rate: 18, barcode: "8901030001003" },
          { name: "Maggi Noodles 70g", category: "Snacks", unit: "pcs", mrp: 1400, sell_price: 1400, gst_rate: 5, barcode: "8901030001004" },
          { name: "Colgate 100g", category: "Personal Care", unit: "pcs", mrp: 5500, sell_price: 5200, gst_rate: 18, barcode: "8901030001005" },
          { name: "Parle-G Biscuits 250g", category: "Snacks", unit: "pcs", mrp: 2500, sell_price: 2400, gst_rate: 5, barcode: "8901030001006" },
          { name: "Surf Excel 1kg", category: "Personal Care", unit: "pcs", mrp: 15000, sell_price: 14500, gst_rate: 18, barcode: "8901030001007" },
          { name: "Thums Up 750ml", category: "Beverages", unit: "pcs", mrp: 4000, sell_price: 3800, gst_rate: 18, barcode: "8901030001008" },
          { name: "Fortune Sunflower Oil 1L", category: "Groceries", unit: "pcs", mrp: 18000, sell_price: 17500, gst_rate: 5, barcode: "8901030001009" },
          { name: "Britannia Bread 400g", category: "Groceries", unit: "pcs", mrp: 4500, sell_price: 4500, gst_rate: 0, barcode: "8901030001010" },
          { name: "Lays Chips 52g", category: "Snacks", unit: "pcs", mrp: 2000, sell_price: 2000, gst_rate: 12, barcode: "8901030001011" },
          { name: "Dettol Soap 75g", category: "Personal Care", unit: "pcs", mrp: 4200, sell_price: 4000, gst_rate: 18, barcode: "8901030001012" },
          { name: "Nescafe Coffee 50g", category: "Beverages", unit: "pcs", mrp: 16000, sell_price: 15500, gst_rate: 5, barcode: "8901030001013" },
          { name: "Aashirvaad Atta 5kg", category: "Groceries", unit: "pcs", mrp: 28000, sell_price: 27500, gst_rate: 0, barcode: "8901030001014" },
          { name: "Dove Shampoo 180ml", category: "Personal Care", unit: "pcs", mrp: 19500, sell_price: 19000, gst_rate: 18, barcode: "8901030001015" },
          { name: "Pepsi 2L", category: "Beverages", unit: "pcs", mrp: 9000, sell_price: 8500, gst_rate: 18, barcode: "8901030001016" },
          { name: "Haldiram Namkeen 200g", category: "Snacks", unit: "pcs", mrp: 6000, sell_price: 5800, gst_rate: 12, barcode: "8901030001017" },
          { name: "Tata Tea Gold 500g", category: "Beverages", unit: "pcs", mrp: 29000, sell_price: 28500, gst_rate: 5, barcode: "8901030001018" },
          { name: "Good Day Cashew 250g", category: "Snacks", unit: "pcs", mrp: 4500, sell_price: 4400, gst_rate: 5, barcode: "8901030001019" },
          { name: "Vim Bar 250g", category: "Personal Care", unit: "pcs", mrp: 2200, sell_price: 2100, gst_rate: 18, barcode: "8901030001020" }
        ];

        const productIds = [];
        let productIndex = 0;
        for (const p of products) {
          // Generate valid UUID v4 format for product (demo namespace with valid hex)
          productIndex++;
          const hexIndex = productIndex.toString(16).padStart(12, '0');
          const productId = `de000000-0000-4000-8000-${hexIndex}`;
          productIds.push({ id: productId, ...p });

          // Upsert product into catalog.products
          await db.query(`
            INSERT INTO catalog.products (id, name, category, unit, primary_barcode, default_gst_rate, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name, category = EXCLUDED.category, primary_barcode = EXCLUDED.primary_barcode, updated_at = NOW()
          `, [productId, p.name, p.category, p.unit, p.barcode, p.gst_rate]);
          seeded.products++;

          // Upsert store_product (prices in paisa, stock qty)
          const stockQty = 20 + Math.floor(Math.random() * 80); // 20-100
          await db.query(`
            INSERT INTO catalog.store_products (store_id, product_id, sell_price, mrp, current_stock, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
            ON CONFLICT (store_id, product_id) DO UPDATE SET
              sell_price = EXCLUDED.sell_price, mrp = EXCLUDED.mrp, current_stock = EXCLUDED.current_stock, updated_at = NOW()
          `, [storeId, productId, p.sell_price, p.mrp, stockQty]);
          seeded.store_products++;

          // Upsert barcode (catalog.product_barcodes)
          try {
            await db.query(`
              INSERT INTO catalog.product_barcodes (product_id, barcode, barcode_type, created_at)
              VALUES ($1, $2, 'EAN13', NOW())
              ON CONFLICT (barcode) DO NOTHING
            `, [productId, p.barcode]);
            seeded.barcodes++;
          } catch (e) {
            console.log(`[Demo Seed] Barcode ${p.barcode} already exists`);
          }
        }

        // ============ SEED SUPPLIERS ============
        // Schema: supplier.suppliers has gstin (unique), business_name, primary_contact_name, primary_phone, etc.
        const suppliers = [
          { id: "5e000000-0001-4000-8000-000000000001", gstin: "27DEMO0001A1Z1", business_name: "Metro Wholesale", contact_name: "Rajesh Kumar", phone: "9876543001" },
          { id: "5e000000-0001-4000-8000-000000000002", gstin: "27DEMO0002A1Z2", business_name: "Local Distributor", contact_name: "Priya Sharma", phone: "9876543002" },
          { id: "5e000000-0001-4000-8000-000000000003", gstin: "27DEMO0003A1Z3", business_name: "Direct Manufacturer", contact_name: "Amit Patel", phone: "9876543003" }
        ];

        for (const s of suppliers) {
          try {
            await db.query(`
              INSERT INTO supplier.suppliers (id, gstin, business_name, primary_contact_name, primary_phone, status, verification_status, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, 'active', 'verified', NOW(), NOW())
              ON CONFLICT (id) DO UPDATE SET business_name = EXCLUDED.business_name, updated_at = NOW()
            `, [s.id, s.gstin, s.business_name, s.contact_name, s.phone]);
            seeded.suppliers++;
          } catch (e) {
            console.log(`[Demo Seed] Supplier insert error: ${e.message}`);
          }
        }

        // ============ SEED PURCHASE ORDERS ============
        // Schema: orders.purchase_orders has order_number (unique), store_id, supplier_id, status, subtotal, total_amount (int)
        // Valid statuses: draft, submitted, confirmed, shipped, partial_received, delivered, cancelled
        const orderStatuses = ["draft", "submitted", "confirmed", "partial_received", "delivered"];
        for (let i = 0; i < 5; i++) {
          const orderId = `00000000-0002-4000-8000-00000000000${i + 1}`;
          const supplierId = suppliers[i % suppliers.length].id;
          const status = orderStatuses[i];
          const orderNumber = `PO-DEMO-${storeId.slice(0, 4)}-${String(i + 1).padStart(3, "0")}`;
          const subtotal = (150000 + (i * 50000)); // in paisa
          const taxAmount = Math.floor(subtotal * 0.12);
          const totalAmount = subtotal + taxAmount;

          try {
            await db.query(`
              INSERT INTO orders.purchase_orders (id, store_id, supplier_id, order_number, status, subtotal, tax_amount, total_amount, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() - INTERVAL '${i} days', NOW())
              ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
            `, [orderId, storeId, supplierId, orderNumber, status, subtotal, taxAmount, totalAmount]);
            seeded.purchase_orders++;
          } catch (e) {
            console.log(`[Demo Seed] Order insert error: ${e.message}`);
          }
        }

        // NOTE: Bills and reorder policies require more complex schema mapping
        // For now, we seed products + suppliers + orders which covers the main flows
        console.log("[Demo Seed] Skipping bills and reorder policies (schema mapping needed)")

        console.log(`[Demo Seed] Completed for store ${storeId}:`, seeded);

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: true,
          storeId: store.id,
          storeName: store.name,
          storeCode: store.code,
          seeded
        }));

      } catch (error) {
        console.error("[Demo Seed] Error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "SEED_FAILED", message: error.message || "Demo seed failed" } }));
      } finally {
        if (db) await db.end();
      }
    });
    return;
  }

  // 404 for other routes
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`Enroll service listening on port ${PORT}`);
});
