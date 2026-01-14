const http = require('http');
const { Client } = require('pg');

const PORT = 3009;
const dbConfig = {
  host: 'postgres',
  port: 5432,
  database: 'supermandi',
  user: 'supermandi',
  password: 'supermandi123'
};

async function getDb() {
  const client = new Client(dbConfig);
  await client.connect();
  return client;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  console.log(req.method, url.pathname);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Health check
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }

  // UI Status endpoint - returns store info and feature flags
  // Handles both /api/v1/pos/ui-status (direct) and /ui-status (via proxy)
  if (req.method === 'GET' && (url.pathname === '/api/v1/pos/ui-status' || url.pathname === '/ui-status')) {
    const token = req.headers['x-device-token'] || req.headers['authorization']?.replace('Bearer ', '');

    // Default response if no token or lookup fails
    const defaultResponse = {
      storeId: null,
      storeName: null,
      deviceId: null,
      storeActive: true,
      deviceActive: true,
      pendingOutboxCount: 0,
      lastSyncAt: null,
      lastSeenOnline: new Date().toISOString(),
      upiVpa: null,
      printerOk: null,
      scannerOk: null,
      features: {
        reorderEnabled: true,
        buyEnabled: true,
        inventoryEnabled: true,
        suppliersEnabled: true,
        ordersEnabled: true
      }
    };

    if (!token) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(defaultResponse));
    }

    let db;
    try {
      db = await getDb();

      // Look up device by token
      const deviceResult = await db.query(
        'SELECT id, store_id, active FROM pos_devices WHERE device_token = $1',
        [token]
      );

      if (deviceResult.rows.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(defaultResponse));
      }

      const device = deviceResult.rows[0];

      // Look up store info
      let storeName = null;
      let storeActive = true;
      let upiVpa = null;

      if (device.store_id) {
        const storeResult = await db.query(
          'SELECT name, status FROM stores WHERE id = $1',
          [device.store_id]
        );
        if (storeResult.rows.length > 0) {
          storeName = storeResult.rows[0].name;
          storeActive = storeResult.rows[0].status === 'active';
        }
      }

      // Update last seen
      await db.query(
        'UPDATE pos_devices SET last_seen_online = NOW() WHERE id = $1',
        [device.id]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        storeId: device.store_id,
        storeName: storeName,
        deviceId: device.id,
        storeActive: storeActive,
        deviceActive: device.active !== false,
        pendingOutboxCount: 0,
        lastSyncAt: null,
        lastSeenOnline: new Date().toISOString(),
        upiVpa: upiVpa,
        printerOk: null,
        scannerOk: null,
        features: {
          reorderEnabled: true,
          buyEnabled: true,
          inventoryEnabled: true,
          suppliersEnabled: true,
          ordersEnabled: true
        }
      }));
    } catch (err) {
      console.error('UI Status error:', err.message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(defaultResponse));
    } finally {
      if (db) await db.end();
    }
  }

  // Device info endpoint
  if (req.method === 'GET' && (url.pathname === '/api/v1/pos/devices/me' || url.pathname === '/devices/me')) {
    const token = req.headers['x-device-token'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'No device token' }));
    }

    let db;
    try {
      db = await getDb();
      const result = await db.query(
        'SELECT id, store_id, device_type FROM pos_devices WHERE device_token = $1',
        [token]
      );
      if (result.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Device not found' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result.rows[0]));
    } catch (err) {
      console.error('Device lookup error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    } finally {
      if (db) await db.end();
    }
  }

  // Events endpoint - just accept and acknowledge
  if (req.method === 'POST' && (url.pathname === '/api/v1/pos/events' || url.pathname === '/events')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true }));
  }

  // Legacy products endpoint - redirect to catalog service
  if (req.method === 'GET' && url.pathname === '/api/v2/products') {
    const storeId = url.searchParams.get('storeId');
    let db;
    try {
      db = await getDb();
      const result = await db.query(`
        SELECT p.id, p.name, p.category, p.unit, p.primary_barcode as barcode,
               sp.sell_price, sp.mrp, sp.current_stock
        FROM catalog.products p
        JOIN catalog.store_products sp ON sp.product_id = p.id
        WHERE sp.store_id = $1 AND sp.is_active = true
        ORDER BY p.name
        LIMIT 100
      `, [storeId || 'a0000000-0000-0000-0000-000000000001']);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ products: result.rows }));
    } catch (err) {
      console.error('Products error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    } finally {
      if (db) await db.end();
    }
  }

  // Enrollment endpoint
  if (req.method === 'POST' && (url.pathname === '/api/v1/pos/enroll' || url.pathname === '/enroll')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      let db;
      try {
        const data = JSON.parse(body);
        const { enrollmentCode, deviceId, deviceType } = data;

        if (!enrollmentCode) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing enrollmentCode' }));
        }

        db = await getDb();

        // Check enrollment code
        const codeResult = await db.query(
          'SELECT store_id, expires_at, used_at FROM pos_device_enrollments WHERE code = $1',
          [enrollmentCode]
        );

        if (codeResult.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Invalid enrollment code' }));
        }

        const enrollment = codeResult.rows[0];

        if (enrollment.used_at) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Enrollment code already used' }));
        }

        if (new Date(enrollment.expires_at) < new Date()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Enrollment code expired' }));
        }

        // Generate token
        const deviceToken = 'tok_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
        const finalDeviceId = deviceId || 'dev_' + Math.random().toString(36).substring(2);

        // Create device record
        await db.query(`
          INSERT INTO pos_devices (id, store_id, device_token, device_type, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (id) DO UPDATE SET device_token = $3, store_id = $2
        `, [finalDeviceId, enrollment.store_id, deviceToken, deviceType || 'android']);

        // Mark code as used
        await db.query(
          'UPDATE pos_device_enrollments SET used_at = NOW() WHERE code = $1',
          [enrollmentCode]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          deviceId: finalDeviceId,
          storeId: enrollment.store_id,
          deviceToken: deviceToken,
          storeActive: true
        }));
      } catch (err) {
        console.error('Enrollment error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      } finally {
        if (db) await db.end();
      }
    });
    return;
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Enrollment service running on port ${PORT}`);
});
