// fix_financial_idempotency.js
// P1-7: FINANCIAL-IDEMPOTENCY-NOT-ENFORCED
// 1. POST /payments/upi/generate: add Idempotency-Key header support
// 2. POST /payments/split: add FOR UPDATE lock + Idempotency-Key header support
//    to prevent duplicate payment records from concurrent retries

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../backend/src/routes/v1/pos/payments.ts');
let content = fs.readFileSync(filePath, 'utf8');

const wasCRLF = content.includes('\r\n');
if (wasCRLF) content = content.replace(/\r\n/g, '\n');

let errorCount = 0;

function replace(label, oldStr, newStr) {
  if (!content.includes(oldStr)) {
    console.error(`  ✗ MISSED: ${label}`);
    errorCount++;
    return;
  }
  const count = content.split(oldStr).length - 1;
  if (count > 1) {
    console.error(`  ✗ AMBIGUOUS (${count} matches): ${label}`);
    errorCount++;
    return;
  }
  content = content.replace(oldStr, newStr);
  console.log(`  ✓ ${label}`);
}

// =============================================================================
// 1. POST /payments/upi/generate — Idempotency-Key header support
//    Insert check AFTER pool unavailability guard
// =============================================================================
replace(
  'Add Idempotency-Key header check to POST /payments/upi/generate',
  '    const client = await pool.connect();\n' +
  '    try {\n' +
  '      await client.query("BEGIN");\n' +
  '\n' +
  '      // 1. Verify sale exists and belongs to this store\n' +
  '      // Note: sales.id is varchar, not uuid\n' +
  '      const saleResult = await client.query(',

  '    // P1-7: Idempotency-Key header — return cached response for duplicate requests\n' +
  '    const clientIdemKey = req.headers[\'idempotency-key\'] as string | undefined;\n' +
  '    if (clientIdemKey) {\n' +
  '      try {\n' +
  '        const idemCheck = await pool.query(\n' +
  '          `SELECT id, upi_order_id, upi_qr_data, upi_vpa, created_at\n' +
  '           FROM payments.sell_payments\n' +
  '           WHERE idempotency_key = $1 AND store_id = $2::uuid AND mode = \'UPI\'`,\n' +
  '          [clientIdemKey, storeId]\n' +
  '        );\n' +
  '        if (idemCheck.rowCount && idemCheck.rows[0]) {\n' +
  '          const idem = idemCheck.rows[0];\n' +
  '          const expiresAt = new Date(new Date(idem.created_at).getTime() + QR_EXPIRY_MS);\n' +
  '          log.info(`[P1-7] Idempotency hit upi/generate key=${clientIdemKey} paymentId=${idem.id}`);\n' +
  '          return res.json({\n' +
  '            paymentId: idem.id,\n' +
  '            orderId: idem.upi_order_id,\n' +
  '            qrData: idem.upi_qr_data,\n' +
  '            upiVpa: idem.upi_vpa,\n' +
  '            expiresAt: expiresAt.toISOString()\n' +
  '          } as UpiInitResponse);\n' +
  '        }\n' +
  '      } catch (_idemErr) { /* non-fatal: proceed to normal flow */ }\n' +
  '    }\n' +
  '\n' +
  '    const client = await pool.connect();\n' +
  '    try {\n' +
  '      await client.query("BEGIN");\n' +
  '\n' +
  '      // 1. Verify sale exists and belongs to this store\n' +
  '      // Note: sales.id is varchar, not uuid\n' +
  '      const saleResult = await client.query('
);

// 2. Use client-provided key when available
replace(
  'Use client Idempotency-Key in upi/generate payment record',
  "      const idempotencyKey = `upi_${saleId}_${Date.now()}`;",
  "      const idempotencyKey = clientIdemKey || `upi_${saleId}_${Date.now()}`;"
);

// =============================================================================
// 2. POST /payments/split — FOR UPDATE lock + Idempotency-Key header support
// =============================================================================

// 2a. Read Idempotency-Key before the pool check (insert after saleId/payments destructure)
replace(
  'Add Idempotency-Key header read to POST /payments/split',
  '    const { storeId } = (req as unknown as PosRequest).posDevice;\n' +
  '    const { saleId, payments } = req.body as SplitPaymentRequest;\n' +
  '\n' +
  '    // Validate request\n' +
  '    if (!saleId) {\n' +
  '      return res.status(400).json({ error: "saleId is required" });',

  '    const { storeId } = (req as unknown as PosRequest).posDevice;\n' +
  '    const { saleId, payments } = req.body as SplitPaymentRequest;\n' +
  '    // P1-7: Idempotency-Key header — read early for use after pool init\n' +
  '    const splitIdemKey = req.headers[\'idempotency-key\'] as string | undefined;\n' +
  '\n' +
  '    // Validate request\n' +
  '    if (!saleId) {\n' +
  '      return res.status(400).json({ error: "saleId is required" });'
);

// 2b. After pool init in split, add idempotency check before allowed_payment_methods check
replace(
  'Add Idempotency-Key lookup after pool init in POST /payments/split',
  '    // SA-P1-006: Validate each split payment mode against store settings\n' +
  '    const apmRes = await pool.query(',

  '    // P1-7: Idempotency-Key — if same key seen before, return cached payment IDs\n' +
  '    if (splitIdemKey) {\n' +
  '      try {\n' +
  '        const idemSplit = await pool.query(\n' +
  '          `SELECT id, mode, amount_minor, upi_order_id, upi_qr_data, upi_vpa, created_at, status\n' +
  '           FROM payments.sell_payments\n' +
  '           WHERE idempotency_key = $1 AND store_id = $2::uuid AND is_split = true`,\n' +
  '          [splitIdemKey, storeId]\n' +
  '        );\n' +
  '        if (idemSplit.rowCount && idemSplit.rows.length > 0) {\n' +
  '          log.info(`[P1-7] Idempotency hit split key=${splitIdemKey} saleId=${saleId}`);\n' +
  '          return res.status(409).json({\n' +
  '            error: "payment_already_initiated",\n' +
  '            message: "Split payment already initiated for this idempotency key",\n' +
  '            paymentIds: idemSplit.rows.map((r: any) => r.id)\n' +
  '          });\n' +
  '        }\n' +
  '      } catch (_idemErr) { /* non-fatal: proceed to normal flow */ }\n' +
  '    }\n' +
  '\n' +
  '    // SA-P1-006: Validate each split payment mode against store settings\n' +
  '    const apmRes = await pool.query('
);

// 2c. Add FOR UPDATE to sale SELECT in split payment
replace(
  'Add FOR UPDATE to sale SELECT in POST /payments/split (prevents concurrent duplicate inserts)',
  '      const saleResult = await client.query(\n' +
  '        `SELECT id, store_id, total_minor, status, payment_mode, customer_name, customer_phone\n' +
  '         FROM public.sales\n' +
  '         WHERE id = $1 AND store_id = $2::uuid`,\n' +
  '        [saleId, storeId]\n' +
  '      );',

  '      const saleResult = await client.query(\n' +
  '        // P1-7: FOR UPDATE serializes concurrent split payment requests for same saleId\n' +
  '        `SELECT id, store_id, total_minor, status, payment_mode, customer_name, customer_phone\n' +
  '         FROM public.sales\n' +
  '         WHERE id = $1 AND store_id = $2::uuid\n' +
  '         FOR UPDATE`,\n' +
  '        [saleId, storeId]\n' +
  '      );'
);

// 2d. Improve the already-paid/already-initiated error response
replace(
  'Improve split payment duplicate guard: separate 409 for payment_mode already set',
  '      // Check if sale is already paid\n' +
  '      if (sale.status === \'PAID\' || sale.status === \'completed\' || sale.payment_mode) {\n' +
  '        await client.query("ROLLBACK");\n' +
  '        return res.status(400).json({ error: "Sale is already paid" });\n' +
  '      }',

  '      // Check if sale is already paid or payment already initiated\n' +
  '      if (sale.status === \'PAID\' || sale.status === \'completed\') {\n' +
  '        await client.query("ROLLBACK");\n' +
  '        return res.status(409).json({ error: "sale_already_paid", message: "Sale is already paid" });\n' +
  '      }\n' +
  '      // P1-7: payment_mode already set means a split was committed — reject duplicate\n' +
  '      if (sale.payment_mode) {\n' +
  '        await client.query("ROLLBACK");\n' +
  '        return res.status(409).json({\n' +
  '          error: "payment_already_initiated",\n' +
  '          message: "A split payment was already initiated for this sale"\n' +
  '        });\n' +
  '      }'
);

// 2e. Use splitIdemKey for UPI portion in split (was Date.now()-based)
replace(
  'Use client Idempotency-Key as prefix for split UPI idempotency_key',
  "          const idempotencyKey = `split_upi_${saleId}_${Date.now()}`;",
  "          const idempotencyKey = splitIdemKey ? `${splitIdemKey}_upi` : `split_upi_${saleId}_${Date.now()}`;"
);

// =============================================================================
// Write result
// =============================================================================
if (wasCRLF) content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, content, 'utf8');

console.log('');
if (errorCount === 0) {
  console.log('SUCCESS');
} else {
  console.error(`FAILED — ${errorCount} miss(es)`);
  process.exit(1);
}
