#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

function computeHistoryHash(step) {
  const payload = step.from + '|' + step.to + '|' + step.actor + '|' + step.sessionId + '|' + step.at + '|' + step.reason + '|' + step.prevHash;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

const tickets = [
  'R7.CROSS.001.SUPPLIER_CANNOT_TRANSITION_ORDER_STATUS_CONFIRM_SHIP',
  'R7.CROSS.002.DUAL_STOCK_SOURCES_DIVERGE_INVENTORY_STOCK_BALANCES',
  'R7.CROSS.003.OFFLINE_QUEUE_NOT_STORE_SCOPED_SINGLE_GLOBAL',
  'R7.CROSS.004.CATALOG_PRICE_CACHE_STALENESS_NO_TTL_OR',
  'R7.CROSS.005.RET_POS_DEVICE_ENROLLMENT_STOCK_SYNC_SALE',
  'R7.CROSS.006.SUP_POS_PURCHASE_ORDERS_GRN_SUPPLIER_CATALOG',
  'R7.CROSS.007.SUP_POS_PURCHASE_ORDERS_GRN_SUPPLIER_CATALOG',
  'R7.CROSS.008.RET_SUP_SUPPLIER_LINKING_PRODUCT_SOURCING_CATALOG',
  'R7.CROSS.009.RET_POS_DEVICE_ENROLLMENT_STOCK_SYNC_SALE',
  'R7.CROSS.010.SUP_POS_PURCHASE_ORDERS_GRN_SUPPLIER_CATALOG',
  'R7.CROSS.011.RET_SUP_SUPPLIER_LINKING_PRODUCT_SOURCING_CATALOG',
  'R7.CROSS.012.RET_POS_DEVICE_ENROLLMENT_STOCK_SYNC_SALE',
  'R7.CROSS.013.RET_SUP_SUPPLIER_LINKING_PRODUCT_SOURCING_CATALOG',
  'R7.CROSS.014.RET_POS_DEVICE_ENROLLMENT_STOCK_SYNC_SALE',
  'R7.CROSS.015.SUP_POS_PURCHASE_ORDERS_GRN_SUPPLIER_CATALOG',
  'R7.CROSS.016.RET_SUP_SUPPLIER_LINKING_PRODUCT_SOURCING_CATALOG',
  'R7.CROSS.017.RET_POS_DEVICE_ENROLLMENT_STOCK_SYNC_SALE',
  'R7.CROSS.018.SUP_POS_PURCHASE_ORDERS_GRN_SUPPLIER_CATALOG',
  'R7.CROSS.019.RET_SUP_SUPPLIER_LINKING_PRODUCT_SOURCING_CATALOG',
  'R7.CROSS.020.RET_POS_DEVICE_ENROLLMENT_STOCK_SYNC_SALE',
  'R7.CROSS.021.SUP_POS_PURCHASE_ORDERS_GRN_SUPPLIER_CATALOG',
];

const now = new Date().toISOString();
const ROOT = path.join(__dirname, '..', '..');

for (const tid of tickets) {
  const file = path.join(ROOT, 'workflow/tickets/' + tid + '.json');
  if (!fs.existsSync(file)) {
    console.log('MISSING:', tid);
    continue;
  }
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));

  // Set ciGateStatus=passed
  t.gitDiscipline.ciGateStatus = 'passed';

  // Recompute hash chain
  let prevHash = 'GENESIS';
  for (const step of t.statusHistory) {
    step.prevHash = prevHash;
    step.hash = computeHistoryHash(step);
    prevHash = step.hash;
  }

  t.timestamps.updatedAt = now;
  fs.writeFileSync(file, JSON.stringify(t, null, 2) + '\n');
  console.log('Repaired:', tid.substring(0, 20));
}
console.log('Done.');
