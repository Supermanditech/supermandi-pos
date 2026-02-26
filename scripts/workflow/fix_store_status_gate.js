// fix_store_status_gate.js
// P1-4: STORE-STATUS-GATE-INCOMPLETE
// Adds requireActiveStore / requireEnrolledStore to POS mutation routes
// that were missing the status gate.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
let errorCount = 0;

function applyFix(filePath, fixes) {
  const fullPath = path.join(root, filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  const wasCRLF = content.includes('\r\n');
  if (wasCRLF) content = content.replace(/\r\n/g, '\n');

  let changed = false;
  for (const [label, oldStr, newStr] of fixes) {
    const before = content;
    content = content.split(oldStr).join(newStr);
    if (content !== before) {
      console.log(`  ✓ ${label}`);
      changed = true;
    } else {
      console.error(`  ✗ MISSED: ${label}`);
      errorCount++;
    }
  }

  if (wasCRLF) content = content.replace(/\n/g, '\r\n');
  if (changed) fs.writeFileSync(fullPath, content, 'utf8');
  return changed;
}

// ---------------------------------------------------------------------------
// 1. inventory.ts — 9 POST mutation routes need requireActiveStore
// ---------------------------------------------------------------------------
console.log('\n[1] backend/src/routes/v1/pos/inventory.ts');
applyFix('backend/src/routes/v1/pos/inventory.ts', [
  // Add import
  [
    'add requireActiveStore import',
    'import { requireDeviceToken } from "../../../middleware/deviceToken";\n',
    'import { requireDeviceToken } from "../../../middleware/deviceToken";\n' +
    'import { requireActiveStore } from "../../../middleware/storeStatusGate";\n',
  ],
  // All 9 POST routes — replace `requireDeviceToken, async` with gate included
  // Each is unique by URL path
  [
    '/inventory/transactions',
    'posInventoryRouter.post("/inventory/transactions", requireDeviceToken, async',
    'posInventoryRouter.post("/inventory/transactions", requireDeviceToken, requireActiveStore, async',
  ],
  [
    '/inventory/stock/batch',
    'posInventoryRouter.post("/inventory/stock/batch", requireDeviceToken, async',
    'posInventoryRouter.post("/inventory/stock/batch", requireDeviceToken, requireActiveStore, async',
  ],
  [
    '/inventory/stock/refresh',
    'posInventoryRouter.post("/inventory/stock/refresh", requireDeviceToken, async',
    'posInventoryRouter.post("/inventory/stock/refresh", requireDeviceToken, requireActiveStore, async',
  ],
  [
    '/inventory/stock/recompute (single)',
    'posInventoryRouter.post("/inventory/stock/recompute", requireDeviceToken, async',
    'posInventoryRouter.post("/inventory/stock/recompute", requireDeviceToken, requireActiveStore, async',
  ],
  [
    '/inventory/stock/recompute-all',
    'posInventoryRouter.post("/inventory/stock/recompute-all", requireDeviceToken, async',
    'posInventoryRouter.post("/inventory/stock/recompute-all", requireDeviceToken, requireActiveStore, async',
  ],
  [
    '/inventory/stock/adjust',
    'posInventoryRouter.post("/inventory/stock/adjust", requireDeviceToken, async',
    'posInventoryRouter.post("/inventory/stock/adjust", requireDeviceToken, requireActiveStore, async',
  ],
  [
    '/inventory/physical-count/start',
    'posInventoryRouter.post("/inventory/physical-count/start", requireDeviceToken, async',
    'posInventoryRouter.post("/inventory/physical-count/start", requireDeviceToken, requireActiveStore, async',
  ],
  [
    '/inventory/physical-count/:countId/record',
    'posInventoryRouter.post("/inventory/physical-count/:countId/record", requireDeviceToken, async',
    'posInventoryRouter.post("/inventory/physical-count/:countId/record", requireDeviceToken, requireActiveStore, async',
  ],
  [
    '/inventory/physical-count/:countId/complete',
    'posInventoryRouter.post("/inventory/physical-count/:countId/complete", requireDeviceToken, async',
    'posInventoryRouter.post("/inventory/physical-count/:countId/complete", requireDeviceToken, requireActiveStore, async',
  ],
]);

// ---------------------------------------------------------------------------
// 2. refundRequests.ts — 2 POST routes need requireActiveStore
//    Note: router.use(requireDeviceToken) applies to all routes already
// ---------------------------------------------------------------------------
console.log('\n[2] backend/src/routes/v1/pos/refundRequests.ts');
applyFix('backend/src/routes/v1/pos/refundRequests.ts', [
  // Add import
  [
    'add requireActiveStore import',
    "import { requireDeviceToken } from '../../../middleware/deviceToken';\n",
    "import { requireDeviceToken } from '../../../middleware/deviceToken';\n" +
    "import { requireActiveStore } from '../../../middleware/storeStatusGate';\n",
  ],
  // POST /refund-requests — inject requireActiveStore into router.post call
  // Note: route uses router.use(requireDeviceToken) globally, so POST signature is:
  //   posRefundRequestsRouter.post('/refund-requests', async
  [
    'POST /refund-requests',
    "posRefundRequestsRouter.post('/refund-requests', async",
    "posRefundRequestsRouter.post('/refund-requests', requireActiveStore, async",
  ],
  [
    'POST /refund-requests/:id/cancel',
    "posRefundRequestsRouter.post('/refund-requests/:id/cancel', async",
    "posRefundRequestsRouter.post('/refund-requests/:id/cancel', requireActiveStore, async",
  ],
]);

// ---------------------------------------------------------------------------
// 3. suppliers.ts — POST /suppliers/:supplierId/request-link
// ---------------------------------------------------------------------------
console.log('\n[3] backend/src/routes/v1/pos/suppliers.ts');
applyFix('backend/src/routes/v1/pos/suppliers.ts', [
  [
    'add requireActiveStore import',
    'import { requireDeviceToken } from "../../../middleware/deviceToken";\n',
    'import { requireDeviceToken } from "../../../middleware/deviceToken";\n' +
    'import { requireActiveStore } from "../../../middleware/storeStatusGate";\n',
  ],
  [
    'POST /suppliers/:supplierId/request-link',
    'posSuppliersRouter.post("/suppliers/:supplierId/request-link", requireDeviceToken, async',
    'posSuppliersRouter.post("/suppliers/:supplierId/request-link", requireDeviceToken, requireActiveStore, async',
  ],
]);

// ---------------------------------------------------------------------------
// 4. compliance.ts — POST /compliance/upload (needs requireEnrolledStore —
//    stores upload KYC docs before reaching ACTIVE status)
// ---------------------------------------------------------------------------
console.log('\n[4] backend/src/routes/v1/pos/compliance.ts');
applyFix('backend/src/routes/v1/pos/compliance.ts', [
  [
    'add requireEnrolledStore import',
    'import { requireDeviceToken } from "../../../middleware/deviceToken";\n',
    'import { requireDeviceToken } from "../../../middleware/deviceToken";\n' +
    'import { requireEnrolledStore } from "../../../middleware/storeStatusGate";\n',
  ],
  [
    'POST /compliance/upload',
    'posComplianceRouter.post("/compliance/upload", requireDeviceToken,',
    'posComplianceRouter.post("/compliance/upload", requireDeviceToken, requireEnrolledStore,',
  ],
]);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('');
if (errorCount === 0) {
  console.log('SUCCESS — all status gates applied');
} else {
  console.error(`FAILED — ${errorCount} fix(es) did not match`);
  process.exit(1);
}
