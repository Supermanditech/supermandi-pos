// GCP-STG-0087: Auto-generate invoices on purchase order submission
// Handles both billing models:
//   SUPERMANDI_PRINCIPAL: Purchase invoice (supplier→SM) + Sale invoice (SM→retailer)
//   DIRECT_SUPPLIER: Direct-sale invoice (supplier→retailer) + Commission invoice (SM→supplier)

import type { Pool, PoolClient } from "pg";
import { createInvoice, issueInvoice, deriveInterState, type CreateInvoiceInput, type InvoiceItemInput } from "./invoiceService";
import { log } from "../lib/logger";

type BillingModel = "SUPERMANDI_PRINCIPAL" | "DIRECT_SUPPLIER";

const SUPERMANDI_ENTITY = {
  name: process.env.SUPERMANDI_ENTITY_NAME || "SUPERMANDI TECH PRIVATE LIMITED",
  gstin: process.env.SUPERMANDI_GSTIN || "08ABRCS8282R1ZY",
  address: process.env.SUPERMANDI_ADDRESS || "166/1, Bhandu Khurd, Jodhpur, Rajasthan - 342014",
  state: process.env.SUPERMANDI_STATE || "Rajasthan",
};

const DEFAULT_PLATFORM_FEE_PERCENT = 10; // 10% default commission for DIRECT_SUPPLIER

interface OrderForInvoice {
  orderId: string;
  storeId: string;
  supplierId: string;
  billingModel: BillingModel;
  totalAmount: number;
  items: Array<{
    supplierProductId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    hsnCode?: string;
    gstRate?: number;
    unit?: string;
  }>;
}

/**
 * Generate invoice pair for a submitted purchase order.
 * Called non-blocking after order creation succeeds.
 */
export async function generateOrderInvoices(
  pool: Pool,
  order: OrderForInvoice
): Promise<void> {
  try {
    // Fetch supplier details
    const supplierResult = await pool.query(
      `SELECT id, business_name, gstin, city, state,
              COALESCE(address_line1, '') || ' ' || COALESCE(city, '') || ' ' || COALESCE(state, '') as full_address
       FROM supplier.suppliers WHERE id = $1::uuid`,
      [order.supplierId]
    );
    if (supplierResult.rows.length === 0) {
      log.warn(`[order-invoice] Supplier ${order.supplierId} not found — skipping invoice`);
      return;
    }
    const supplier = supplierResult.rows[0];

    // Fetch store details
    const storeResult = await pool.query(
      `SELECT id, name, gstin, state,
              COALESCE(address, '') || ' ' || COALESCE(city, '') || ' ' || COALESCE(state, '') as full_address
       FROM platform.stores WHERE id = $1::uuid`,
      [order.storeId]
    );
    if (storeResult.rows.length === 0) {
      log.warn(`[order-invoice] Store ${order.storeId} not found — skipping invoice`);
      return;
    }
    const store = storeResult.rows[0];

    // Build invoice items
    const invoiceItems: InvoiceItemInput[] = order.items.map((item) => ({
      supplierProductId: item.supplierProductId,
      productName: item.productName,
      quantity: item.quantity,
      unitPriceMinor: item.unitPrice,
      hsnCode: item.hsnCode,
      gstRate: item.gstRate || 0,
      unit: item.unit || "PCS",
    }));

    if (order.billingModel === "SUPERMANDI_PRINCIPAL") {
      await generatePrincipalInvoices(pool, order, supplier, store, invoiceItems);
    } else if (order.billingModel === "DIRECT_SUPPLIER") {
      await generateDirectSupplierInvoices(pool, order, supplier, store, invoiceItems);
    }
  } catch (err: any) {
    log.error(`[order-invoice] Failed to generate invoices for order ${order.orderId}:`, err?.message);
  }
}

/**
 * SUPERMANDI_PRINCIPAL model:
 * 1. Purchase invoice: Supplier → SuperMandi (supplier sells to SM)
 * 2. Sale invoice: SuperMandi → Retailer (SM resells to retailer with margin)
 */
async function generatePrincipalInvoices(
  pool: Pool,
  order: OrderForInvoice,
  supplier: any,
  store: any,
  items: InvoiceItemInput[]
): Promise<void> {
  // 1. Purchase invoice (Supplier → SuperMandi)
  // GCP-STG-0353: Derive inter-state from GSTIN state codes
  const purchaseIsInterState = deriveInterState(supplier.gstin, SUPERMANDI_ENTITY.gstin);
  const purchaseInput: CreateInvoiceInput = {
    invoiceModel: "buy_resell",
    invoiceType: "purchase",
    seller: {
      type: "supplier",
      id: supplier.id,
      name: supplier.business_name,
      gstin: supplier.gstin,
      address: supplier.full_address,
    },
    buyer: {
      type: "supermandi",
      name: SUPERMANDI_ENTITY.name,
      gstin: SUPERMANDI_ENTITY.gstin,
      address: SUPERMANDI_ENTITY.address,
      state: SUPERMANDI_ENTITY.state,
    },
    items,
    orderId: order.orderId,
    referenceNote: `Auto-generated from PO for store ${store.name}`,
    isInterState: purchaseIsInterState,
  };

  const purchaseInvoice = await createInvoice(pool, purchaseInput);
  await issueInvoice(pool, purchaseInvoice.id);

  // 2. Sale invoice (SuperMandi → Retailer) — retail price with margin applied
  // GCP-STG-0349: Build saleItems with margin-applied retail prices
  const saleItems = await buildSaleItems(pool, items);

  // GCP-STG-0353: Derive inter-state from GSTIN state codes
  const saleIsInterState = deriveInterState(SUPERMANDI_ENTITY.gstin, store.gstin);
  const saleInput: CreateInvoiceInput = {
    invoiceModel: "buy_resell",
    invoiceType: "sale",
    seller: {
      type: "supermandi",
      name: SUPERMANDI_ENTITY.name,
      gstin: SUPERMANDI_ENTITY.gstin,
      address: SUPERMANDI_ENTITY.address,
      state: SUPERMANDI_ENTITY.state,
    },
    buyer: {
      type: "store",
      id: store.id,
      name: store.name,
      gstin: store.gstin,
      address: store.full_address,
    },
    items: saleItems,
    orderId: order.orderId,
    referenceNote: `Auto-generated from PO (principal model)`,
    isInterState: saleIsInterState,
  };

  const saleInvoice = await createInvoice(pool, saleInput);
  await issueInvoice(pool, saleInvoice.id);

  // Link invoices to the order
  await pool.query(
    `UPDATE orders.purchase_orders SET invoice_pair_id = $1 WHERE id = $2::uuid`,
    [purchaseInvoice.id, order.orderId]
  ).catch(() => {}); // Best-effort

  // GCP-STG-0106: Create settlement record
  try {
    const { createSettlement } = await import("./settlementService");
    const orderSubtotal = order.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    // For principal model, commission = SuperMandi margin (already baked into retail price)
    // The purchase invoice is at supplier price, sale invoice is at retail price
    // Settlement to supplier = purchase invoice amount (what SM owes supplier)
    await createSettlement(pool, {
      supplierId: order.supplierId,
      storeId: order.storeId,
      orderId: order.orderId,
      purchaseInvoiceId: purchaseInvoice.id,
      saleInvoiceId: saleInvoice.id,
      billingModel: "SUPERMANDI_PRINCIPAL",
      grossAmountMinor: orderSubtotal,
      commissionMinor: 0, // Principal model: margin is in pricing, not explicit commission
      commissionPercent: 0,
      notes: `Principal model — supplier payout = purchase invoice total`,
    });
  } catch (err: any) {
    log.error(`[order-invoice] Settlement creation failed:`, err?.message);
  }

  log.info(`[order-invoice] Principal invoices generated for order ${order.orderId}: purchase=${purchaseInvoice.invoiceNumber}, sale=${saleInvoice.invoiceNumber}`);
}

/**
 * DIRECT_SUPPLIER model:
 * 1. Direct-sale invoice: Supplier → Retailer (supplier bills retailer directly)
 * 2. Commission invoice: SuperMandi → Supplier (SM charges platform fee)
 * 3. Platform fee record for settlement tracking
 */
async function generateDirectSupplierInvoices(
  pool: Pool,
  order: OrderForInvoice,
  supplier: any,
  store: any,
  items: InvoiceItemInput[]
): Promise<void> {
  // 1. Direct-sale invoice (Supplier → Retailer)
  // GCP-STG-0353: Derive inter-state from GSTIN state codes
  const directSaleIsInterState = deriveInterState(supplier.gstin, store.gstin);
  const directSaleInput: CreateInvoiceInput = {
    invoiceModel: "platform_fee",
    invoiceType: "sale",
    seller: {
      type: "supplier",
      id: supplier.id,
      name: supplier.business_name,
      gstin: supplier.gstin,
      address: supplier.full_address,
    },
    buyer: {
      type: "store",
      id: store.id,
      name: store.name,
      gstin: store.gstin,
      address: store.full_address,
    },
    items,
    orderId: order.orderId,
    referenceNote: `Direct supplier sale via SuperMandi platform`,
    isInterState: directSaleIsInterState,
  };

  const directSaleInvoice = await createInvoice(pool, directSaleInput);
  await issueInvoice(pool, directSaleInvoice.id);

  // 2. Commission invoice (SuperMandi → Supplier)
  // GCP-STG-0353: Derive inter-state from GSTIN state codes
  const commissionIsInterState = deriveInterState(SUPERMANDI_ENTITY.gstin, supplier.gstin);
  const platformFeePercent = DEFAULT_PLATFORM_FEE_PERCENT;
  const commissionInput: CreateInvoiceInput = {
    invoiceModel: "platform_fee",
    invoiceType: "commission",
    seller: {
      type: "supermandi",
      name: SUPERMANDI_ENTITY.name,
      gstin: SUPERMANDI_ENTITY.gstin,
      address: SUPERMANDI_ENTITY.address,
      state: SUPERMANDI_ENTITY.state,
    },
    buyer: {
      type: "supplier",
      id: supplier.id,
      name: supplier.business_name,
      gstin: supplier.gstin,
      address: supplier.full_address,
    },
    items,
    platformFeePercent,
    orderId: order.orderId,
    referenceNote: `Platform commission on sales to ${store.name}`,
    isInterState: commissionIsInterState,
  };

  const commissionInvoice = await createInvoice(pool, commissionInput);
  await issueInvoice(pool, commissionInvoice.id);

  // 3. Record platform fee for settlement tracking
  const orderSubtotal = order.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const platformFeeMinor = Math.round(orderSubtotal * platformFeePercent / 100);
  const gstOnFee = Math.round(platformFeeMinor * 18 / 100); // 18% GST on platform services
  const netPayout = orderSubtotal - platformFeeMinor - gstOnFee;

  await pool.query(
    `INSERT INTO invoicing.platform_fees (
      order_id, invoice_id, commission_invoice_id,
      supplier_id, store_id, billing_model,
      order_subtotal_minor, platform_fee_percent, platform_fee_minor,
      gst_on_fee_minor, net_supplier_payout_minor, status
    ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9, $10, $11, 'invoiced')`,
    [
      order.orderId, directSaleInvoice.id, commissionInvoice.id,
      order.supplierId, order.storeId, "DIRECT_SUPPLIER",
      orderSubtotal, platformFeePercent, platformFeeMinor,
      gstOnFee, netPayout,
    ]
  ).catch((err: any) => {
    log.error(`[order-invoice] Platform fee record failed:`, err?.message);
  });

  // GCP-STG-0106: Create settlement record for direct supplier model
  try {
    const { createSettlement } = await import("./settlementService");
    await createSettlement(pool, {
      supplierId: order.supplierId,
      storeId: order.storeId,
      orderId: order.orderId,
      saleInvoiceId: directSaleInvoice.id,
      billingModel: "DIRECT_SUPPLIER",
      grossAmountMinor: orderSubtotal,
      commissionMinor: platformFeeMinor,
      commissionPercent: platformFeePercent,
      notes: `Direct supplier — ${platformFeePercent}% commission deducted`,
    });
  } catch (err: any) {
    log.error(`[order-invoice] Settlement creation failed:`, err?.message);
  }

  log.info(`[order-invoice] Direct supplier invoices generated for order ${order.orderId}: sale=${directSaleInvoice.invoiceNumber}, commission=${commissionInvoice.invoiceNumber}`);
}

/**
 * GCP-STG-0349: Build sale-invoice items with margin-applied retail prices.
 * For SUPERMANDI_PRINCIPAL, the sale invoice (SM→Retailer) must use
 * admin_retail_price_minor (or computed from margin) instead of supplier's purchase_price.
 *
 * Priority: admin_retail_price_minor > purchase_price + admin_margin_fixed_minor
 *           > purchase_price * (1 + admin_margin_pct/100) > purchase_price (fallback)
 */
export async function buildSaleItems(
  pool: Pool,
  items: InvoiceItemInput[]
): Promise<InvoiceItemInput[]> {
  const supplierProductIds = items
    .map((i) => i.supplierProductId)
    .filter((id): id is string => !!id);

  if (supplierProductIds.length === 0) {
    return items; // No supplier product IDs — cannot look up margin, return as-is
  }

  // Fetch margin data for all items in one query
  const marginResult = await pool.query(
    `SELECT id::text,
            purchase_price,
            admin_retail_price_minor,
            admin_margin_fixed_minor,
            admin_margin_pct
     FROM catalog.supplier_products
     WHERE id = ANY($1::uuid[])`,
    [supplierProductIds]
  );

  const marginMap = new Map<string, {
    purchasePrice: number;
    retailPrice: number | null;
    fixedMargin: number | null;
    pctMargin: number | null;
  }>();
  for (const row of marginResult.rows) {
    marginMap.set(row.id, {
      purchasePrice: row.purchase_price,
      retailPrice: row.admin_retail_price_minor,
      fixedMargin: row.admin_margin_fixed_minor,
      pctMargin: row.admin_margin_pct ? parseFloat(row.admin_margin_pct) : null,
    });
  }

  return items.map((item) => {
    if (!item.supplierProductId) return item;

    const margin = marginMap.get(item.supplierProductId);
    if (!margin) return item; // Product not found — keep supplier price

    let retailUnitPrice: number;

    if (margin.retailPrice != null && margin.retailPrice > 0) {
      // Explicit admin-set retail price takes priority
      retailUnitPrice = margin.retailPrice;
    } else if (margin.fixedMargin != null && margin.fixedMargin > 0) {
      // Fixed margin in paise added to supplier price
      retailUnitPrice = item.unitPriceMinor + margin.fixedMargin;
    } else if (margin.pctMargin != null && margin.pctMargin > 0) {
      // Percentage margin on supplier price
      retailUnitPrice = Math.round(item.unitPriceMinor * (1 + margin.pctMargin / 100));
    } else {
      // No margin configured — keep supplier price (shouldn't happen in production)
      return item;
    }

    return { ...item, unitPriceMinor: retailUnitPrice };
  });
}

/**
 * Split cart items by billing model + supplier.
 * Returns groups that should each become a separate purchase order.
 */
export function splitCartByBillingModel(
  items: Array<{
    supplierProductId: string;
    supplierId: string;
    billingModel: BillingModel;
    [key: string]: any;
  }>
): Map<string, typeof items> {
  const groups = new Map<string, typeof items>();

  for (const item of items) {
    const key = `${item.supplierId}::${item.billingModel}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }

  return groups;
}
