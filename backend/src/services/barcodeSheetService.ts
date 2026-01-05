import PDFDocument from "pdfkit";
import bwipjs from "bwip-js";

export type BarcodeSheetTier = "tier1" | "tier2";

type Queryable = { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> };

type BarcodeSheetItem = {
  variantId: string;
  productName: string;
  variantName: string;
  barcode: string;
};

type BarcodeSheetLayout = {
  columns: number;
  rows: number;
  margin: number;
  gap: number;
  padding: number;
  barcodeScale: number;
  barcodeHeightMm: number;
  labelFontSize: number;
  barcodeFontSize: number;
};

const BARCODE_SHEET_LAYOUTS: Record<BarcodeSheetTier, BarcodeSheetLayout> = {
  tier1: {
    columns: 2,
    rows: 5,
    margin: 36,
    gap: 12,
    padding: 8,
    barcodeScale: 3,
    barcodeHeightMm: 14,
    labelFontSize: 10,
    barcodeFontSize: 9
  },
  tier2: {
    columns: 3,
    rows: 8,
    margin: 24,
    gap: 8,
    padding: 6,
    barcodeScale: 2,
    barcodeHeightMm: 10,
    labelFontSize: 8,
    barcodeFontSize: 8
  }
};

export function resolveBarcodeSheetTier(input: string | undefined): BarcodeSheetTier | null {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "1" || raw === "tier1" || raw === "tier-1" || raw === "tier_1") return "tier1";
  if (raw === "2" || raw === "tier2" || raw === "tier-2" || raw === "tier_2") return "tier2";
  return null;
}

function buildLabel(productName: string, variantName: string): string {
  const product = productName.trim();
  const variant = variantName.trim();
  if (!product && !variant) return "Unnamed item";
  if (!product) return variant;
  if (!variant) return product;
  const productLower = product.toLowerCase();
  if (variant.toLowerCase().includes(productLower)) {
    return variant;
  }
  return `${product} ${variant}`.trim();
}

export async function listBarcodeSheetItems(params: {
  client: Queryable;
  storeId?: string;
  variantIds?: string[];
}): Promise<BarcodeSheetItem[]> {
  const { client, storeId } = params;
  const variantIds = params.variantIds?.filter(Boolean) ?? [];

  const args: any[] = [];
  const joins: string[] = [];
  const conditions: string[] = [];

  if (storeId) {
    args.push(storeId);
    joins.push(`JOIN retailer_variants rv ON rv.variant_id = v.id AND rv.store_id = $${args.length}`);
  }

  if (variantIds.length) {
    args.push(variantIds);
    conditions.push(`v.id = ANY($${args.length}::text[])`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const joinClause = joins.join("\n");

  const res = await client.query(
    `
    SELECT v.id AS variant_id,
           v.name AS variant_name,
           p.name AS product_name,
           b.barcode AS barcode
    FROM variants v
    JOIN products p ON p.id = v.product_id
    JOIN barcodes b ON b.variant_id = v.id AND b.barcode_type = 'supermandi'
    ${joinClause}
    ${whereClause}
    ORDER BY p.name ASC, v.name ASC
    `,
    args
  );

  return res.rows.map((row) => ({
    variantId: String(row.variant_id),
    productName: String(row.product_name ?? ""),
    variantName: String(row.variant_name ?? ""),
    barcode: String(row.barcode ?? "")
  }));
}

async function buildBarcodeBuffer(
  barcode: string,
  layout: BarcodeSheetLayout,
  cache: Map<string, Buffer>
): Promise<Buffer> {
  const trimmed = barcode.trim();
  if (!trimmed) {
    throw new Error("barcode_missing");
  }
  const cached = cache.get(trimmed);
  if (cached) return cached;

  const buffer = await bwipjs.toBuffer({
    bcid: "code128",
    text: trimmed,
    scale: layout.barcodeScale,
    height: layout.barcodeHeightMm,
    includetext: false
  });

  cache.set(trimmed, buffer);
  return buffer;
}

export async function buildBarcodeSheetPdf(params: {
  items: BarcodeSheetItem[];
  tier: BarcodeSheetTier;
  title?: string;
}): Promise<Buffer> {
  const { items, tier, title } = params;
  const layout = BARCODE_SHEET_LAYOUTS[tier];

  const doc = new PDFDocument({
    size: "A4",
    margin: layout.margin,
    info: {
      Title: title ?? `SuperMandi Barcode Sheet (${tier})`
    }
  });

  const buffers: Buffer[] = [];
  const cache = new Map<string, Buffer>();
  doc.on("data", (chunk) => buffers.push(chunk as Buffer));

  const contentWidth = doc.page.width - layout.margin * 2;
  const contentHeight = doc.page.height - layout.margin * 2;
  const labelWidth = (contentWidth - layout.gap * (layout.columns - 1)) / layout.columns;
  const labelHeight = (contentHeight - layout.gap * (layout.rows - 1)) / layout.rows;
  const perPage = layout.columns * layout.rows;

  for (let index = 0; index < items.length; index += 1) {
    if (index > 0 && index % perPage === 0) {
      doc.addPage();
    }

    const item = items[index];
    const pageIndex = index % perPage;
    const row = Math.floor(pageIndex / layout.columns);
    const col = pageIndex % layout.columns;

    const x = layout.margin + col * (labelWidth + layout.gap);
    const y = layout.margin + row * (labelHeight + layout.gap);
    const label = buildLabel(item.productName, item.variantName);
    const barcodeBuffer = await buildBarcodeBuffer(item.barcode, layout, cache);

    const innerWidth = labelWidth - layout.padding * 2;
    const maxBarcodeHeight = Math.max(12, labelHeight * 0.55);
    const barcodeHeight = Math.min(maxBarcodeHeight, labelHeight - layout.padding * 3 - layout.labelFontSize * 2);
    const barcodeY = y + layout.padding;
    const textY = barcodeY + barcodeHeight + 6;

    doc.image(barcodeBuffer, x + layout.padding, barcodeY, {
      width: innerWidth,
      height: barcodeHeight
    });

    doc.fontSize(layout.labelFontSize).fillColor("#111111");
    doc.text(label, x + layout.padding, textY, {
      width: innerWidth,
      align: "center"
    });

    doc.fontSize(layout.barcodeFontSize).fillColor("#555555");
    doc.text(item.barcode, x + layout.padding, textY + layout.labelFontSize + 4, {
      width: innerWidth,
      align: "center"
    });

    doc.fillColor("#000000");
  }

  const done = new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });

  doc.end();
  await done;

  return Buffer.concat(buffers);
}
