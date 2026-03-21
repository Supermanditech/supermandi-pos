// GCP-STG-0087: Auto-generate invoices on purchase order submission
// Handles both billing models:
//   SUPERMANDI_PRINCIPAL: Purchase invoice (supplier→SM) + Sale invoice (SM→retailer)
//   DIRECT_SUPPLIER: Direct-sale invoice (supplier→retailer) + Commission invoice (SM→supplier)

import type { Pool, PoolClient } from "pg";
import { createInvoice, issueInvoice, type CreateInvoiceInput, type InvoiceItemInput } from "./invoiceService";
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
      `SELECT id, name, gstin,
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
  };

  const purchaseInvoice = await createInvoice(pool, purchaseInput);
  await issueInvoice(pool, purchaseInvoice.id);

  // 2. Sale invoice (SuperMandi → Retailer) — same items but at retail price
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
    items,
    orderId: order.orderId,
    referenceNote: `Auto-generated from PO (principal model)`,
  };

  const saleInvoice = await createInvoice(pool, saleInput);
  await issueInvoice(pool, saleInvoice.id);

  // Link invoices to the order
  await pool.query(
    `UPDATE orders.purchase_orders SET invoice_pair_id = $1 WHERE id = $2::uuid`,
    [purchaseInvoice.id, order.orderId]
  ).catch(() => {}); // Best-effort

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
  };

  const directSaleInvoice = await createInvoice(pool, directSaleInput);
  await issueInvoice(pool, directSaleInvoice.id);

  // 2. Commission invoice (SuperMandi → Supplier)
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

  log.info(`[order-invoice] Direct supplier invoices generated for order ${order.orderId}: sale=${directSaleInvoice.invoiceNumber}, commission=${commissionInvoice.invoiceNumber}`);
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
