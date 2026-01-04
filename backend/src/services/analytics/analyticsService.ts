import { getPool } from "../../db/client";

export type DateRange = {
  from: Date;
  to: Date;
  fromIso: string;
  toIso: string;
};

export type ProfitSummary = {
  gross_profit_minor: number;
  margin_percent: number | null;
  profit_confidence: "HIGH" | "MED" | "LOW";
  missing_cost_items_count: number;
  missing_fields: string[];
};

export type OverviewResult = {
  storeId?: string;
  range: { from: string; to: string };
  sales_total: { pos_minor: number; consumer_minor: number; total_minor: number };
  collections_total_minor: number;
  payment_split_minor: { cash: number; upi: number; due: number };
  due_outstanding: {
    total_minor: number;
    buckets: Array<{ label: string; total_minor: number; count: number }>;
  };
  new_products_created_count: number;
  devices: { online: number; offline: number; pending_outbox_total: number };
  profit: ProfitSummary | null;
  profit_missing_fields: string[];
};

export type DeviceAnalyticsRow = {
  device_id: string;
  store_id: string;
  label: string | null;
  device_type: string | null;
  active: boolean;
  last_seen_online: string | null;
  last_sync_at: string | null;
  pending_outbox_count: number;
  sales_count: number;
  sales_total_minor: number;
  collections_count: number;
  collections_total_minor: number;
  offline_sales_count: number;
};

export type DevicesResult = {
  storeId?: string;
  range: { from: string; to: string };
  devices: DeviceAnalyticsRow[];
  total: number;
};

export type ProductAnalyticsRow = {
  product_id: string;
  name: string;
  barcode: string;
  category: string | null;
  source: "retailer_created" | "supermandi_catalog";
  quantity: number;
  total_minor: number;
};

export type ProductsResult = {
  storeId?: string;
  range: { from: string; to: string };
  top_products: ProductAnalyticsRow[];
  new_products_created_count: number;
  new_products_created: Array<{ id: string; name: string; barcode: string; created_at: string }>;
  sales_by_group: Array<{ group: string; total_minor: number; quantity: number }>;
  group_by: "category" | "hour" | "day";
  missing_fields: string[];
};

export type PurchasesResult = {
  storeId?: string;
  range: { from: string; to: string };
  total_minor: number;
  vendor_breakdown: Array<{ supplier: string; total_minor: number }>;
  sku_cost_summary: Array<{
    product_id: string | null;
    sku: string | null;
    quantity: number;
    avg_cost_minor: number;
    last_cost_minor: number | null;
  }>;
};

export type ConsumerSalesResult = {
  storeId?: string;
  range: { from: string; to: string };
  total_minor: number;
  payment_split_minor: { cash: number; upi: number; due: number };
  status_counts: Array<{ status: string; count: number }>;
};

export type PaymentsAnalyticsResult = {
  storeId?: string;
  range: { from: string; to: string };
  totals: { cash_minor: number; upi_minor: number; due_minor: number };
  counts: { cash: number; upi: number; due: number };
  byHour: Array<{
    hour: string;
    totals: { cash_minor: number; upi_minor: number; due_minor: number };
    counts: { cash: number; upi: number; due: number };
  }>;
};

export type DueRow = {
  sale_id: string;
  bill_ref: string;
  total_minor: number;
  created_at: string;
  age_days: number;
};

export type DuesAnalyticsResult = {
  storeId?: string;
  range: { from: string; to: string };
  outstanding_total_minor: number;
  aging: { d0_1: number; d2_7: number; d8_30: number; d30_plus: number };
  dues: DueRow[];
  total: number;
};

export type ActivityBucket = {
  bucket: string;
  scans: number;
  sales: number;
  collections: number;
  new_products_created: number;
  offline_events_synced: number;
};

export type ActivityResult = {
  storeId?: string;
  range: { from: string; to: string };
  groupBy: "minute" | "hour" | "day";
  buckets: ActivityBucket[];
};

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function parseRange(from?: string, to?: string): DateRange {
  const now = new Date();
  const parsedFrom = parseDate(from);
  const parsedTo = parseDate(to);

  const toDate = parsedTo ?? now;
  const fromDate = parsedFrom ?? new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    from: fromDate,
    to: toDate,
    fromIso: fromDate.toISOString(),
    toIso: toDate.toISOString()
  };
}

function buildStoreFilter(storeId?: string, column = "store_id") {
  if (!storeId) return { clause: "", params: [] as Array<string> };
  return { clause: `AND ${column} = $3`, params: [storeId] };
}


function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatBucketLabel(range: string): string {
  return range;
}

function profitConfidence(totalItems: number, missingCount: number): "HIGH" | "MED" | "LOW" {
  if (totalItems === 0) return "LOW";
  if (missingCount === 0) return "HIGH";
  const ratio = missingCount / totalItems;
  return ratio <= 0.2 ? "MED" : "LOW";
}

async function getPurchaseCostMap(storeId: string | undefined, toIso: string) {
  const pool = getPool();
  if (!pool) return { avgCostByProduct: new Map<string, number>(), missingFields: ["database_unavailable"] };

  const params: Array<string> = [toIso];
  let clause = "";
  if (storeId) {
    params.push(storeId);
    clause = "AND p.store_id = $2";
  }

  const purchaseItems = await pool.query(
    `
    SELECT pi.product_id,
           pi.sku,
           SUM(pi.quantity) AS qty,
           SUM(pi.unit_cost_minor * pi.quantity) AS total_cost
    FROM purchase_items pi
    JOIN purchases p ON p.id = pi.purchase_id
    WHERE p.created_at <= $1
    ${clause}
    GROUP BY pi.product_id, pi.sku
    `,
    params
  );

  const avgCostByProduct = new Map<string, number>();
  for (const row of purchaseItems.rows) {
    const qty = toNumber(row.qty);
    const total = toNumber(row.total_cost);
    if (!qty || qty <= 0) continue;
    const key = row.product_id ? String(row.product_id) : row.sku ? String(row.sku) : "";
    if (!key) continue;
    avgCostByProduct.set(key, Math.round(total / qty));
  }

  const missingFields: string[] = [];
  if (purchaseItems.rows.length === 0) {
    missingFields.push("purchase_items");
  }

  return { avgCostByProduct, missingFields };
}

export async function fetchOverview(params: { storeId?: string; from?: string; to?: string }): Promise<OverviewResult> {
  const pool = getPool();
  if (!pool) {
    throw new Error("database unavailable");
  }

  const range = parseRange(params.from, params.to);
  const storeId = params.storeId?.trim() || undefined;

  const storeFilter = buildStoreFilter(storeId, "store_id");

  const posSalesRes = await pool.query(
    `
    SELECT COALESCE(SUM(total_minor), 0) AS total
    FROM sales
    WHERE created_at >= $1 AND created_at <= $2
    ${storeFilter.clause}
    `,
    storeId ? [range.fromIso, range.toIso, ...storeFilter.params] : [range.fromIso, range.toIso, ...storeFilter.params]
  );
  const posSalesTotal = toNumber(posSalesRes.rows[0]?.total);

  const consumerSalesRes = await pool.query(
    `
    SELECT COALESCE(SUM(total_minor), 0) AS total
    FROM consumer_orders
    WHERE created_at >= $1 AND created_at <= $2
    ${storeFilter.clause}
    `,
    storeId ? [range.fromIso, range.toIso, ...storeFilter.params] : [range.fromIso, range.toIso, ...storeFilter.params]
  );
  const consumerSalesTotal = toNumber(consumerSalesRes.rows[0]?.total);

  const collectionsRes = await pool.query(
    `
    SELECT COALESCE(SUM(amount_minor), 0) AS total
    FROM collections
    WHERE created_at >= $1 AND created_at <= $2
    ${storeFilter.clause}
    `,
    storeId ? [range.fromIso, range.toIso, ...storeFilter.params] : [range.fromIso, range.toIso, ...storeFilter.params]
  );
  const collectionsTotal = toNumber(collectionsRes.rows[0]?.total);

  const paymentSplitRes = await pool.query(
    `
    SELECT p.mode, COALESCE(SUM(p.amount_minor), 0) AS total
    FROM payments p
    JOIN sales s ON s.id = p.sale_id
    WHERE p.created_at >= $1 AND p.created_at <= $2
    ${storeId ? "AND s.store_id = $3" : ""}
    GROUP BY p.mode
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );

  const paymentSplit = { cash: 0, upi: 0, due: 0 };
  for (const row of paymentSplitRes.rows) {
    const mode = String(row.mode || "").toUpperCase();
    const total = toNumber(row.total);
    if (mode === "CASH") paymentSplit.cash += total;
    if (mode === "UPI") paymentSplit.upi += total;
    if (mode === "DUE") paymentSplit.due += total;
  }

  const consumerSplitRes = await pool.query(
    `
    SELECT payment_mode, COALESCE(SUM(total_minor), 0) AS total
    FROM consumer_orders
    WHERE created_at >= $1 AND created_at <= $2
    ${storeFilter.clause}
    GROUP BY payment_mode
    `,
    storeId ? [range.fromIso, range.toIso, ...storeFilter.params] : [range.fromIso, range.toIso, ...storeFilter.params]
  );
  for (const row of consumerSplitRes.rows) {
    const mode = String(row.payment_mode || "").toUpperCase();
    const total = toNumber(row.total);
    if (mode === "CASH") paymentSplit.cash += total;
    if (mode === "UPI") paymentSplit.upi += total;
    if (mode === "DUE") paymentSplit.due += total;
  }

  const dueRes = await pool.query(
    `
    SELECT total_minor, created_at
    FROM sales
    WHERE status = 'DUE'
      AND created_at >= $1
      AND created_at <= $2
      ${storeFilter.clause}
    `,
    storeId ? [range.fromIso, range.toIso, ...storeFilter.params] : [range.fromIso, range.toIso, ...storeFilter.params]
  );

  const buckets = [
    { label: "0-7d", maxDays: 7, total_minor: 0, count: 0 },
    { label: "8-30d", maxDays: 30, total_minor: 0, count: 0 },
    { label: "31-90d", maxDays: 90, total_minor: 0, count: 0 },
    { label: "90d+", maxDays: Infinity, total_minor: 0, count: 0 }
  ];

  let dueOutstanding = 0;
  const now = range.to.getTime();
  for (const row of dueRes.rows) {
    const createdAt = new Date(row.created_at).getTime();
    const ageDays = Math.max(0, Math.floor((now - createdAt) / (24 * 60 * 60 * 1000)));
    const amount = toNumber(row.total_minor);
    dueOutstanding += amount;
    if (ageDays <= 7) {
      buckets[0].total_minor += amount;
      buckets[0].count += 1;
    } else if (ageDays <= 30) {
      buckets[1].total_minor += amount;
      buckets[1].count += 1;
    } else if (ageDays <= 90) {
      buckets[2].total_minor += amount;
      buckets[2].count += 1;
    } else {
      buckets[3].total_minor += amount;
      buckets[3].count += 1;
    }
  }

  const newProductsRes = await pool.query(
    `
    SELECT COUNT(DISTINCT se.variant_id)::int AS count
    FROM scan_events se
    JOIN variants v ON v.id = se.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE se.created_at >= $1 AND se.created_at <= $2
      AND se.action IN ('DIGITISED', 'PROMPT_PRICE')
      AND p.retailer_status = 'retailer_created'
      ${storeId ? "AND se.store_id = $3" : ""}
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );
  const newProducts = Number(newProductsRes.rows[0]?.count ?? 0);

  const devicesRes = await pool.query(
    `
    SELECT last_seen_online, pending_outbox_count
    FROM pos_devices
    ${storeId ? "WHERE store_id = $1" : ""}
    `,
    storeId ? [storeId] : []
  );

  let online = 0;
  let offline = 0;
  let pendingOutbox = 0;
  for (const row of devicesRes.rows) {
    const lastSeen = row.last_seen_online ? new Date(row.last_seen_online).getTime() : 0;
    const isOnline = lastSeen && now - lastSeen <= ONLINE_WINDOW_MS;
    if (isOnline) online += 1;
    else offline += 1;
    pendingOutbox += toNumber(row.pending_outbox_count);
  }

  const profit = await computeProfit({
    storeId,
    fromIso: range.fromIso,
    toIso: range.toIso
  });

  return {
    storeId,
    range: { from: range.fromIso, to: range.toIso },
    sales_total: {
      pos_minor: posSalesTotal,
      consumer_minor: consumerSalesTotal,
      total_minor: posSalesTotal + consumerSalesTotal
    },
    collections_total_minor: collectionsTotal,
    payment_split_minor: paymentSplit,
    due_outstanding: {
      total_minor: dueOutstanding,
      buckets: buckets.map((b) => ({
        label: formatBucketLabel(b.label),
        total_minor: b.total_minor,
        count: b.count
      }))
    },
    new_products_created_count: newProducts,
    devices: {
      online,
      offline,
      pending_outbox_total: pendingOutbox
    },
    profit: profit.summary,
    profit_missing_fields: profit.missingFields
  };
}

async function computeProfit(params: { storeId?: string; fromIso: string; toIso: string }) {
  const pool = getPool();
  if (!pool) return { summary: null, missingFields: ["database_unavailable"] };

  const storeId = params.storeId;

  const { avgCostByProduct, missingFields } = await getPurchaseCostMap(storeId, params.toIso);
  if (missingFields.includes("purchase_items")) {
    return { summary: null, missingFields };
  }

  const salesItemsRes = await pool.query(
    `
    SELECT v.product_id, SUM(si.quantity) AS qty
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN variants v ON v.id = si.variant_id
    WHERE s.created_at >= $1 AND s.created_at <= $2
    ${storeId ? "AND s.store_id = $3" : ""}
    GROUP BY v.product_id
    `,
    storeId ? [params.fromIso, params.toIso, storeId] : [params.fromIso, params.toIso]
  );

  const consumerItemsRes = await pool.query(
    `
    SELECT v.product_id, coi.sku, SUM(coi.quantity) AS qty
    FROM consumer_order_items coi
    JOIN consumer_orders co ON co.id = coi.order_id
    LEFT JOIN variants v ON v.id = coi.variant_id
    WHERE co.created_at >= $1 AND co.created_at <= $2
    ${storeId ? "AND co.store_id = $3" : ""}
    GROUP BY v.product_id, coi.sku
    `,
    storeId ? [params.fromIso, params.toIso, storeId] : [params.fromIso, params.toIso]
  );

  let totalItems = 0;
  let missingCostItems = 0;
  let cogs = 0;

  const applyCost = (productId: string | null, sku: string | null, qty: number) => {
    if (!qty || qty <= 0) return;
    totalItems += qty;
    const key = productId ?? sku ?? "";
    const cost = key ? avgCostByProduct.get(key) : undefined;
    if (cost === undefined) {
      missingCostItems += qty;
      return;
    }
    cogs += cost * qty;
  };

  for (const row of salesItemsRes.rows) {
    applyCost(row.product_id ? String(row.product_id) : null, null, toNumber(row.qty));
  }
  for (const row of consumerItemsRes.rows) {
    applyCost(row.product_id ? String(row.product_id) : null, row.sku ? String(row.sku) : null, toNumber(row.qty));
  }

  const revenueRes = await pool.query(
    `
    SELECT
      (SELECT COALESCE(SUM(total_minor), 0) FROM sales WHERE created_at >= $1 AND created_at <= $2 ${storeId ? "AND store_id = $3" : ""}) AS pos_total,
      (SELECT COALESCE(SUM(total_minor), 0) FROM consumer_orders WHERE created_at >= $1 AND created_at <= $2 ${storeId ? "AND store_id = $3" : ""}) AS consumer_total
    `,
    storeId ? [params.fromIso, params.toIso, storeId] : [params.fromIso, params.toIso]
  );

  const posTotal = toNumber(revenueRes.rows[0]?.pos_total);
  const consumerTotal = toNumber(revenueRes.rows[0]?.consumer_total);
  const revenue = posTotal + consumerTotal;
  const grossProfit = revenue - cogs;
  const margin = revenue > 0 ? Number(((grossProfit / revenue) * 100).toFixed(2)) : null;

  const confidence = profitConfidence(totalItems, missingCostItems);

  return {
    summary: {
      gross_profit_minor: grossProfit,
      margin_percent: margin,
      profit_confidence: confidence,
      missing_cost_items_count: missingCostItems,
      missing_fields: missingFields
    },
    missingFields
  };
}

export async function fetchDevicesAnalytics(params: {
  storeId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<DevicesResult> {
  const pool = getPool();
  if (!pool) {
    throw new Error("database unavailable");
  }

  const range = parseRange(params.from, params.to);
  const storeId = params.storeId?.trim() || undefined;
  const limit = Math.max(1, Math.min(200, params.limit ?? 50));
  const offset = Math.max(0, params.offset ?? 0);

  const devicesRes = await pool.query(
    `
    SELECT id,
           store_id,
           active,
           label,
           device_type,
           last_seen_online,
           last_sync_at,
           pending_outbox_count
    FROM pos_devices
    ${storeId ? "WHERE store_id = $1" : ""}
    ORDER BY last_seen_online DESC NULLS LAST
    LIMIT $${storeId ? 2 : 1} OFFSET $${storeId ? 3 : 2}
    `,
    storeId ? [storeId, limit, offset] : [limit, offset]
  );

  const totalsRes = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM pos_devices
    ${storeId ? "WHERE store_id = $1" : ""}
    `,
    storeId ? [storeId] : []
  );
  const total = Number(totalsRes.rows[0]?.count ?? 0);

  const salesRes = await pool.query(
    `
    SELECT device_id, COUNT(*)::int AS count, COALESCE(SUM(total_minor), 0) AS total
    FROM sales
    WHERE created_at >= $1 AND created_at <= $2
      AND device_id IS NOT NULL
      ${storeId ? "AND store_id = $3" : ""}
    GROUP BY device_id
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );

  const collectionsRes = await pool.query(
    `
    SELECT device_id, COUNT(*)::int AS count, COALESCE(SUM(amount_minor), 0) AS total
    FROM collections
    WHERE created_at >= $1 AND created_at <= $2
      AND device_id IS NOT NULL
      ${storeId ? "AND store_id = $3" : ""}
    GROUP BY device_id
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );

  const offlineRes = await pool.query(
    `
    SELECT device_id, COUNT(*)::int AS count
    FROM sales
    WHERE created_at >= $1 AND created_at <= $2
      AND offline_receipt_ref IS NOT NULL
      AND device_id IS NOT NULL
      ${storeId ? "AND store_id = $3" : ""}
    GROUP BY device_id
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );

  const salesMap = new Map<string, { count: number; total: number }>();
  for (const row of salesRes.rows) {
    salesMap.set(String(row.device_id), {
      count: Number(row.count ?? 0),
      total: toNumber(row.total)
    });
  }
  const collectionMap = new Map<string, { count: number; total: number }>();
  for (const row of collectionsRes.rows) {
    collectionMap.set(String(row.device_id), {
      count: Number(row.count ?? 0),
      total: toNumber(row.total)
    });
  }
  const offlineMap = new Map<string, number>();
  for (const row of offlineRes.rows) {
    offlineMap.set(String(row.device_id), Number(row.count ?? 0));
  }

  const devices: DeviceAnalyticsRow[] = devicesRes.rows.map((row) => {
    const id = String(row.id);
    const sales = salesMap.get(id) ?? { count: 0, total: 0 };
    const collections = collectionMap.get(id) ?? { count: 0, total: 0 };
    return {
      device_id: id,
      store_id: row.store_id,
      label: row.label ?? null,
      device_type: row.device_type ?? null,
      active: Boolean(row.active),
      last_seen_online: row.last_seen_online ? new Date(row.last_seen_online).toISOString() : null,
      last_sync_at: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
      pending_outbox_count: Number(row.pending_outbox_count ?? 0),
      sales_count: sales.count,
      sales_total_minor: sales.total,
      collections_count: collections.count,
      collections_total_minor: collections.total,
      offline_sales_count: offlineMap.get(id) ?? 0
    };
  });

  return {
    storeId,
    range: { from: range.fromIso, to: range.toIso },
    devices,
    total
  };
}

export async function fetchProductsAnalytics(params: {
  storeId?: string;
  from?: string;
  to?: string;
  groupBy?: string;
  limit?: number;
  offset?: number;
}): Promise<ProductsResult> {
  const pool = getPool();
  if (!pool) throw new Error("database unavailable");

  const range = parseRange(params.from, params.to);
  const storeId = params.storeId?.trim() || undefined;
  const limit = Math.max(1, Math.min(200, params.limit ?? 20));
  const offset = Math.max(0, params.offset ?? 0);
  const groupBy = params.groupBy === "hour" || params.groupBy === "day" || params.groupBy === "category"
    ? params.groupBy
    : "day";

  const topProductsRes = await pool.query(
    `
    SELECT v.id,
           v.name,
           b.barcode,
           v.category,
           v.retailer_status,
           SUM(si.quantity) AS qty,
           SUM(si.line_total_minor) AS total
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN variants v ON v.id = si.variant_id
    LEFT JOIN barcodes b ON b.variant_id = v.id AND b.barcode_type = 'supermandi'
    WHERE s.created_at >= $1 AND s.created_at <= $2
      ${storeId ? "AND s.store_id = $3" : ""}
    GROUP BY v.id, v.name, b.barcode, v.category, v.retailer_status
    ORDER BY total DESC
    LIMIT $${storeId ? 4 : 3} OFFSET $${storeId ? 5 : 4}
    `,
    storeId ? [range.fromIso, range.toIso, storeId, limit, offset] : [range.fromIso, range.toIso, limit, offset]
  );

  const topProducts: ProductAnalyticsRow[] = topProductsRes.rows.map((row) => ({
    product_id: row.id,
    name: row.name,
    barcode: row.barcode ?? "",
    category: row.category ?? null,
    source: row.retailer_status === "retailer_created" ? "retailer_created" : "supermandi_catalog",
    quantity: toNumber(row.qty),
    total_minor: toNumber(row.total)
  }));

  const newProductsCountRes = await pool.query(
    `
    SELECT COUNT(DISTINCT se.variant_id)::int AS count
    FROM scan_events se
    JOIN variants v ON v.id = se.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE se.created_at >= $1 AND se.created_at <= $2
      AND se.action IN ('DIGITISED', 'PROMPT_PRICE')
      AND p.retailer_status = 'retailer_created'
      ${storeId ? "AND se.store_id = $3" : ""}
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );
  const newProductsCount = Number(newProductsCountRes.rows[0]?.count ?? 0);

  const newProductsRes = await pool.query(
    `
    SELECT v.id,
           v.name,
           b.barcode,
           MIN(se.created_at) AS created_at
    FROM scan_events se
    JOIN variants v ON v.id = se.variant_id
    JOIN products p ON p.id = v.product_id
    LEFT JOIN barcodes b ON b.variant_id = v.id AND b.barcode_type = 'supermandi'
    WHERE se.created_at >= $1 AND se.created_at <= $2
      AND se.action IN ('DIGITISED', 'PROMPT_PRICE')
      AND p.retailer_status = 'retailer_created'
      ${storeId ? "AND se.store_id = $3" : ""}
    GROUP BY v.id, v.name, b.barcode
    ORDER BY created_at DESC
    LIMIT 20
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );
  const newProducts = newProductsRes.rows.map((row) => ({
    id: row.id,
    name: row.name,
    barcode: row.barcode ?? "",
    created_at: row.created_at ? new Date(row.created_at).toISOString() : ""
  }));

  let salesByGroup: Array<{ group: string; total_minor: number; quantity: number }> = [];
  const missingFields: string[] = [];

  if (groupBy === "category") {
    const categoryRes = await pool.query(
      `
      SELECT COALESCE(p.category, 'Uncategorized') AS group_label,
             SUM(si.quantity) AS qty,
             SUM(si.line_total_minor) AS total
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN variants p ON p.id = si.variant_id
      WHERE s.created_at >= $1 AND s.created_at <= $2
        ${storeId ? "AND s.store_id = $3" : ""}
      GROUP BY COALESCE(p.category, 'Uncategorized')
      ORDER BY total DESC
      `,
      storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
    );

    const hasCategory = categoryRes.rows.some((row) => row.group_label && row.group_label !== "Uncategorized");
    if (!hasCategory) {
      missingFields.push("variants.category");
    }

    salesByGroup = categoryRes.rows.map((row) => ({
      group: row.group_label,
      total_minor: toNumber(row.total),
      quantity: toNumber(row.qty)
    }));
  } else {
    const trunc = groupBy === "hour" ? "hour" : "day";
    const timeRes = await pool.query(
      `
      SELECT date_trunc('${trunc}', s.created_at) AS bucket,
             SUM(si.quantity) AS qty,
             SUM(si.line_total_minor) AS total
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.created_at >= $1 AND s.created_at <= $2
        ${storeId ? "AND s.store_id = $3" : ""}
      GROUP BY bucket
      ORDER BY bucket
      `,
      storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
    );

    salesByGroup = timeRes.rows.map((row) => ({
      group: row.bucket ? new Date(row.bucket).toISOString() : "",
      total_minor: toNumber(row.total),
      quantity: toNumber(row.qty)
    }));
  }

  return {
    storeId,
    range: { from: range.fromIso, to: range.toIso },
    top_products: topProducts,
    new_products_created_count: newProductsCount,
    new_products_created: newProducts,
    sales_by_group: salesByGroup,
    group_by: groupBy,
    missing_fields: missingFields
  };
}

export async function fetchPurchasesAnalytics(params: {
  storeId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<PurchasesResult> {
  const pool = getPool();
  if (!pool) throw new Error("database unavailable");

  const range = parseRange(params.from, params.to);
  const storeId = params.storeId?.trim() || undefined;
  const limit = Math.max(1, Math.min(200, params.limit ?? 50));
  const offset = Math.max(0, params.offset ?? 0);

  const storeFilter = buildStoreFilter(storeId, "store_id");

  const totalRes = await pool.query(
    `
    SELECT COALESCE(SUM(total_minor), 0) AS total
    FROM purchases
    WHERE created_at >= $1 AND created_at <= $2
    ${storeFilter.clause}
    `,
    storeId ? [range.fromIso, range.toIso, ...storeFilter.params] : [range.fromIso, range.toIso, ...storeFilter.params]
  );

  const vendorRes = await pool.query(
    `
    SELECT COALESCE(supplier_name, 'Unknown') AS supplier,
           COALESCE(SUM(total_minor), 0) AS total
    FROM purchases
    WHERE created_at >= $1 AND created_at <= $2
    ${storeFilter.clause}
    GROUP BY COALESCE(supplier_name, 'Unknown')
    ORDER BY total DESC
    `,
    storeId ? [range.fromIso, range.toIso, ...storeFilter.params] : [range.fromIso, range.toIso, ...storeFilter.params]
  );

  const summaryRes = await pool.query(
    `
    SELECT pi.product_id,
           pi.sku,
           SUM(pi.quantity) AS qty,
           SUM(pi.unit_cost_minor * pi.quantity) AS total_cost,
           MAX(p.created_at) AS last_seen
    FROM purchase_items pi
    JOIN purchases p ON p.id = pi.purchase_id
    WHERE p.created_at >= $1 AND p.created_at <= $2
    ${storeId ? "AND p.store_id = $3" : ""}
    GROUP BY pi.product_id, pi.sku
    ORDER BY total_cost DESC
    LIMIT $${storeId ? 4 : 3} OFFSET $${storeId ? 5 : 4}
    `,
    storeId ? [range.fromIso, range.toIso, storeId, limit, offset] : [range.fromIso, range.toIso, limit, offset]
  );

  const latestRes = await pool.query(
    `
    SELECT DISTINCT ON (pi.product_id, pi.sku)
           pi.product_id,
           pi.sku,
           pi.unit_cost_minor,
           p.created_at
    FROM purchase_items pi
    JOIN purchases p ON p.id = pi.purchase_id
    WHERE p.created_at >= $1 AND p.created_at <= $2
    ${storeId ? "AND p.store_id = $3" : ""}
    ORDER BY pi.product_id, pi.sku, p.created_at DESC
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );

  const lastCostMap = new Map<string, number>();
  for (const row of latestRes.rows) {
    const key = `${row.product_id ?? ""}::${row.sku ?? ""}`;
    lastCostMap.set(key, toNumber(row.unit_cost_minor));
  }

  const skuSummary = summaryRes.rows.map((row) => {
    const qty = toNumber(row.qty);
    const avgCost = qty > 0 ? Math.round(toNumber(row.total_cost) / qty) : 0;
    const key = `${row.product_id ?? ""}::${row.sku ?? ""}`;
    return {
      product_id: row.product_id ? String(row.product_id) : null,
      sku: row.sku ? String(row.sku) : null,
      quantity: qty,
      avg_cost_minor: avgCost,
      last_cost_minor: lastCostMap.get(key) ?? null
    };
  });

  return {
    storeId,
    range: { from: range.fromIso, to: range.toIso },
    total_minor: toNumber(totalRes.rows[0]?.total),
    vendor_breakdown: vendorRes.rows.map((row) => ({
      supplier: row.supplier,
      total_minor: toNumber(row.total)
    })),
    sku_cost_summary: skuSummary
  };
}

export async function fetchConsumerSalesAnalytics(params: {
  storeId?: string;
  from?: string;
  to?: string;
}): Promise<ConsumerSalesResult> {
  const pool = getPool();
  if (!pool) throw new Error("database unavailable");

  const range = parseRange(params.from, params.to);
  const storeId = params.storeId?.trim() || undefined;
  const storeFilter = buildStoreFilter(storeId, "store_id");

  const totalsRes = await pool.query(
    `
    SELECT COALESCE(SUM(total_minor), 0) AS total
    FROM consumer_orders
    WHERE created_at >= $1 AND created_at <= $2
    ${storeFilter.clause}
    `,
    storeId ? [range.fromIso, range.toIso, ...storeFilter.params] : [range.fromIso, range.toIso, ...storeFilter.params]
  );

  const splitRes = await pool.query(
    `
    SELECT payment_mode, COALESCE(SUM(total_minor), 0) AS total
    FROM consumer_orders
    WHERE created_at >= $1 AND created_at <= $2
    ${storeFilter.clause}
    GROUP BY payment_mode
    `,
    storeId ? [range.fromIso, range.toIso, ...storeFilter.params] : [range.fromIso, range.toIso, ...storeFilter.params]
  );

  const statusRes = await pool.query(
    `
    SELECT status, COUNT(*)::int AS count
    FROM consumer_orders
    WHERE created_at >= $1 AND created_at <= $2
    ${storeFilter.clause}
    GROUP BY status
    `,
    storeId ? [range.fromIso, range.toIso, ...storeFilter.params] : [range.fromIso, range.toIso, ...storeFilter.params]
  );

  const split = { cash: 0, upi: 0, due: 0 };
  for (const row of splitRes.rows) {
    const mode = String(row.payment_mode || "").toUpperCase();
    const total = toNumber(row.total);
    if (mode === "CASH") split.cash += total;
    if (mode === "UPI") split.upi += total;
    if (mode === "DUE") split.due += total;
  }

  return {
    storeId,
    range: { from: range.fromIso, to: range.toIso },
    total_minor: toNumber(totalsRes.rows[0]?.total),
    payment_split_minor: split,
    status_counts: statusRes.rows.map((row) => ({
      status: row.status,
      count: Number(row.count ?? 0)
    }))
  };
}

export async function fetchPaymentsAnalytics(params: {
  storeId?: string;
  from?: string;
  to?: string;
}): Promise<PaymentsAnalyticsResult> {
  const pool = getPool();
  if (!pool) throw new Error("database unavailable");

  const range = parseRange(params.from, params.to);
  const storeId = params.storeId?.trim() || undefined;

  const totals = { cash_minor: 0, upi_minor: 0, due_minor: 0 };
  const counts = { cash: 0, upi: 0, due: 0 };

  const paymentsRes = await pool.query(
    `
    SELECT p.mode AS mode,
           COUNT(*)::int AS count,
           COALESCE(SUM(p.amount_minor), 0) AS total
    FROM payments p
    JOIN sales s ON s.id = p.sale_id
    WHERE p.created_at >= $1 AND p.created_at <= $2
      ${storeId ? "AND s.store_id = $3" : ""}
    GROUP BY p.mode
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );

  for (const row of paymentsRes.rows) {
    const mode = String(row.mode || "").toUpperCase();
    const total = toNumber(row.total);
    const count = Number(row.count ?? 0);
    if (mode === "CASH") {
      totals.cash_minor += total;
      counts.cash += count;
    }
    if (mode === "UPI") {
      totals.upi_minor += total;
      counts.upi += count;
    }
    if (mode === "DUE") {
      totals.due_minor += total;
      counts.due += count;
    }
  }

  const consumerRes = await pool.query(
    `
    SELECT payment_mode AS mode,
           COUNT(*)::int AS count,
           COALESCE(SUM(total_minor), 0) AS total
    FROM consumer_orders
    WHERE created_at >= $1 AND created_at <= $2
      ${storeId ? "AND store_id = $3" : ""}
    GROUP BY payment_mode
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );

  for (const row of consumerRes.rows) {
    const mode = String(row.mode || "").toUpperCase();
    const total = toNumber(row.total);
    const count = Number(row.count ?? 0);
    if (mode === "CASH") {
      totals.cash_minor += total;
      counts.cash += count;
    }
    if (mode === "UPI") {
      totals.upi_minor += total;
      counts.upi += count;
    }
    if (mode === "DUE") {
      totals.due_minor += total;
      counts.due += count;
    }
  }

  const byHourMap = new Map<string, { totals: typeof totals; counts: typeof counts }>();
  const ensureBucket = (bucket: string) => {
    const key = new Date(bucket).toISOString();
    if (!byHourMap.has(key)) {
      byHourMap.set(key, {
        totals: { cash_minor: 0, upi_minor: 0, due_minor: 0 },
        counts: { cash: 0, upi: 0, due: 0 }
      });
    }
    return byHourMap.get(key)!;
  };

  const paymentBuckets = await pool.query(
    `
    SELECT date_trunc('hour', p.created_at) AS bucket,
           p.mode AS mode,
           COUNT(*)::int AS count,
           COALESCE(SUM(p.amount_minor), 0) AS total
    FROM payments p
    JOIN sales s ON s.id = p.sale_id
    WHERE p.created_at >= $1 AND p.created_at <= $2
      ${storeId ? "AND s.store_id = $3" : ""}
    GROUP BY bucket, p.mode
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );

  for (const row of paymentBuckets.rows) {
    const bucket = row.bucket ? new Date(row.bucket).toISOString() : "";
    if (!bucket) continue;
    const entry = ensureBucket(bucket);
    const mode = String(row.mode || "").toUpperCase();
    const total = toNumber(row.total);
    const count = Number(row.count ?? 0);
    if (mode === "CASH") {
      entry.totals.cash_minor += total;
      entry.counts.cash += count;
    }
    if (mode === "UPI") {
      entry.totals.upi_minor += total;
      entry.counts.upi += count;
    }
    if (mode === "DUE") {
      entry.totals.due_minor += total;
      entry.counts.due += count;
    }
  }

  const consumerBuckets = await pool.query(
    `
    SELECT date_trunc('hour', created_at) AS bucket,
           payment_mode AS mode,
           COUNT(*)::int AS count,
           COALESCE(SUM(total_minor), 0) AS total
    FROM consumer_orders
    WHERE created_at >= $1 AND created_at <= $2
      ${storeId ? "AND store_id = $3" : ""}
    GROUP BY bucket, payment_mode
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );

  for (const row of consumerBuckets.rows) {
    const bucket = row.bucket ? new Date(row.bucket).toISOString() : "";
    if (!bucket) continue;
    const entry = ensureBucket(bucket);
    const mode = String(row.mode || "").toUpperCase();
    const total = toNumber(row.total);
    const count = Number(row.count ?? 0);
    if (mode === "CASH") {
      entry.totals.cash_minor += total;
      entry.counts.cash += count;
    }
    if (mode === "UPI") {
      entry.totals.upi_minor += total;
      entry.counts.upi += count;
    }
    if (mode === "DUE") {
      entry.totals.due_minor += total;
      entry.counts.due += count;
    }
  }

  const byHour = Array.from(byHourMap.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([hour, payload]) => ({ hour, totals: payload.totals, counts: payload.counts }));

  return {
    storeId,
    range: { from: range.fromIso, to: range.toIso },
    totals,
    counts,
    byHour
  };
}

export async function fetchDuesAnalytics(params: {
  storeId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<DuesAnalyticsResult> {
  const pool = getPool();
  if (!pool) throw new Error("database unavailable");

  const range = parseRange(params.from, params.to);
  const storeId = params.storeId?.trim() || undefined;
  const limit = Math.max(1, Math.min(200, params.limit ?? 50));
  const offset = Math.max(0, params.offset ?? 0);

  const duesRes = await pool.query(
    `
    SELECT id, bill_ref, total_minor, created_at
    FROM sales
    WHERE status = 'DUE'
      AND created_at >= $1
      AND created_at <= $2
      ${storeId ? "AND store_id = $3" : ""}
    ORDER BY created_at DESC
    LIMIT $${storeId ? 4 : 3} OFFSET $${storeId ? 5 : 4}
    `,
    storeId ? [range.fromIso, range.toIso, storeId, limit, offset] : [range.fromIso, range.toIso, limit, offset]
  );

  const totalRes = await pool.query(
    `
    SELECT COUNT(*)::int AS count, COALESCE(SUM(total_minor), 0) AS total
    FROM sales
    WHERE status = 'DUE'
      AND created_at >= $1
      AND created_at <= $2
      ${storeId ? "AND store_id = $3" : ""}
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );
  const total = Number(totalRes.rows[0]?.count ?? 0);
  const outstandingTotal = toNumber(totalRes.rows[0]?.total);

  const aging = { d0_1: 0, d2_7: 0, d8_30: 0, d30_plus: 0 };
  const now = range.to.getTime();

  const dues: DueRow[] = duesRes.rows.map((row) => {
    const createdAt = new Date(row.created_at);
    const ageDays = Math.max(0, Math.floor((now - createdAt.getTime()) / (24 * 60 * 60 * 1000)));
    const amount = toNumber(row.total_minor);

    if (ageDays <= 1) aging.d0_1 += amount;
    else if (ageDays <= 7) aging.d2_7 += amount;
    else if (ageDays <= 30) aging.d8_30 += amount;
    else aging.d30_plus += amount;

    return {
      sale_id: row.id,
      bill_ref: row.bill_ref,
      total_minor: amount,
      created_at: createdAt.toISOString(),
      age_days: ageDays
    };
  });

  return {
    storeId,
    range: { from: range.fromIso, to: range.toIso },
    outstanding_total_minor: outstandingTotal,
    aging,
    dues,
    total
  };
}

export async function fetchActivityAnalytics(params: {
  storeId?: string;
  from?: string;
  to?: string;
  groupBy?: string;
}): Promise<ActivityResult> {
  const pool = getPool();
  if (!pool) throw new Error("database unavailable");

  const range = parseRange(params.from, params.to);
  const storeId = params.storeId?.trim() || undefined;
  const groupBy = params.groupBy === "minute" || params.groupBy === "hour" || params.groupBy === "day"
    ? params.groupBy
    : "hour";

  const bucketMap = new Map<string, ActivityBucket>();
  const ensureBucket = (bucket: string) => {
    const key = new Date(bucket).toISOString();
    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        bucket: key,
        scans: 0,
        sales: 0,
        collections: 0,
        new_products_created: 0,
        offline_events_synced: 0
      });
    }
    return bucketMap.get(key)!;
  };

  const scansRes = await pool.query(
    `
    SELECT date_trunc('${groupBy}', created_at) AS bucket, COUNT(*)::int AS count
    FROM scan_events
    WHERE created_at >= $1 AND created_at <= $2
      ${storeId ? "AND store_id = $3" : ""}
    GROUP BY bucket
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );
  for (const row of scansRes.rows) {
    if (!row.bucket) continue;
    ensureBucket(row.bucket).scans = Number(row.count ?? 0);
  }

  const salesRes = await pool.query(
    `
    SELECT date_trunc('${groupBy}', created_at) AS bucket, COUNT(*)::int AS count
    FROM sales
    WHERE created_at >= $1 AND created_at <= $2
      ${storeId ? "AND store_id = $3" : ""}
    GROUP BY bucket
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );
  for (const row of salesRes.rows) {
    if (!row.bucket) continue;
    ensureBucket(row.bucket).sales = Number(row.count ?? 0);
  }

  const collectionsRes = await pool.query(
    `
    SELECT date_trunc('${groupBy}', created_at) AS bucket, COUNT(*)::int AS count
    FROM collections
    WHERE created_at >= $1 AND created_at <= $2
      ${storeId ? "AND store_id = $3" : ""}
    GROUP BY bucket
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );
  for (const row of collectionsRes.rows) {
    if (!row.bucket) continue;
    ensureBucket(row.bucket).collections = Number(row.count ?? 0);
  }

  const newProductsRes = await pool.query(
    `
    SELECT date_trunc('${groupBy}', se.created_at) AS bucket, COUNT(DISTINCT se.variant_id)::int AS count
    FROM scan_events se
    JOIN variants v ON v.id = se.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE se.created_at >= $1 AND se.created_at <= $2
      AND se.action IN ('DIGITISED', 'PROMPT_PRICE')
      AND p.retailer_status = 'retailer_created'
      ${storeId ? "AND se.store_id = $3" : ""}
    GROUP BY bucket
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );
  for (const row of newProductsRes.rows) {
    if (!row.bucket) continue;
    ensureBucket(row.bucket).new_products_created = Number(row.count ?? 0);
  }

  const offlineRes = await pool.query(
    `
    SELECT date_trunc('${groupBy}', received_at) AS bucket, COUNT(*)::int AS count
    FROM processed_events
    WHERE received_at >= $1 AND received_at <= $2
      ${storeId ? "AND store_id = $3" : ""}
    GROUP BY bucket
    `,
    storeId ? [range.fromIso, range.toIso, storeId] : [range.fromIso, range.toIso]
  );
  for (const row of offlineRes.rows) {
    if (!row.bucket) continue;
    ensureBucket(row.bucket).offline_events_synced = Number(row.count ?? 0);
  }

  const buckets = Array.from(bucketMap.values()).sort((a, b) => (a.bucket < b.bucket ? -1 : 1));

  return {
    storeId,
    range: { from: range.fromIso, to: range.toIso },
    groupBy,
    buckets
  };
}
