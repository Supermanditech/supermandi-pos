import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { offlineDb } from "./offline/localDb";
import * as productsApi from "./api/productsApi";

export type BarcodeSheetTier = "TIER_1" | "TIER_2";

function log(message: string, ...args: unknown[]): void {
  console.log(`[BarcodeSheet] ${message}`, ...args);
}

// T-171: Enriched barcode sheet item with price, unit, and category
export type BarcodeSheetItem = {
  barcode: string;
  name: string;
  /** Sell price in minor units (paise). null = not set */
  sellPrice?: number | null;
  /** e.g. "kg", "piece", "pack", "litre" */
  unit?: string | null;
  /** FMCG category */
  category?: string | null;
};

// T-170: Item with copies count for batch printing
export type BarcodeSheetItemWithCopies = BarcodeSheetItem & {
  copies: number;
};

// T-166: Static FMCG category list
export const BARCODE_CATEGORIES = [
  "All",
  "Staples",
  "Cooking Oil",
  "Dairy",
  "Beverages",
  "Snacks",
  "Personal Care",
  "Cleaning",
  "Spices",
  "Pulses",
] as const;
export type BarcodeCategory = (typeof BARCODE_CATEGORIES)[number];

// T-169: Print settings types
export type PaperSize = "A4" | "Letter" | "Custom";
export type LabelSize = "Small" | "Medium" | "Large";

export type PrintSettings = {
  paperSize: PaperSize;
  labelSize: LabelSize;
  labelsPerRow: number; // auto-calculated or user override
};

const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paperSize: "A4",
  labelSize: "Medium",
  labelsPerRow: 3,
};

// T-169: AsyncStorage key for print settings
const PRINT_SETTINGS_KEY = "supermandi.barcode.printSettings";

export async function loadPrintSettings(): Promise<PrintSettings> {
  try {
    const raw = await AsyncStorage.getItem(PRINT_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PRINT_SETTINGS, ...parsed };
    }
  } catch (e) {
    log("Failed to load print settings:", e);
  }
  return { ...DEFAULT_PRINT_SETTINGS };
}

export async function savePrintSettings(settings: PrintSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(PRINT_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    log("Failed to save print settings:", e);
  }
}

// T-169: Label dimensions in mm
const LABEL_DIMENSIONS: Record<LabelSize, { width: number; height: number }> = {
  Small: { width: 25, height: 15 },
  Medium: { width: 38, height: 25 },
  Large: { width: 50, height: 30 },
};

// T-169: Paper dimensions in mm (printable area after margins)
const PAPER_DIMENSIONS: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 190, height: 277 },      // 210-20mm margins
  Letter: { width: 196, height: 254 },   // 216-20mm margins
  Custom: { width: 190, height: 277 },   // defaults to A4
};

// T-169: Calculate labels per row based on paper and label size
export function calculateLabelsPerRow(paperSize: PaperSize, labelSize: LabelSize): number {
  const paper = PAPER_DIMENSIONS[paperSize];
  const label = LABEL_DIMENSIONS[labelSize];
  const gap = 2; // 2mm gap between labels
  return Math.max(1, Math.floor((paper.width + gap) / (label.width + gap)));
}

// T-169: Calculate labels per page
export function calculateLabelsPerPage(settings: PrintSettings): number {
  const paper = PAPER_DIMENSIONS[settings.paperSize];
  const label = LABEL_DIMENSIONS[settings.labelSize];
  const gap = 2;
  const rows = Math.max(1, Math.floor((paper.height + gap) / (label.height + gap)));
  return settings.labelsPerRow * rows;
}

const CODE128_PATTERNS = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
];

const SHEET_LAYOUTS = {
  TIER_1: {
    columns: 3,
    rows: 8,
    labelHeight: 110,
    barcodeHeight: 46,
    moduleWidth: 2,
  },
  TIER_2: {
    columns: 4,
    rows: 10,
    labelHeight: 90,
    barcodeHeight: 38,
    moduleWidth: 1.6,
  },
} as const;

const DEFAULT_MAX_ITEMS = 200;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function encodeCode128B(value: string): number[] | null {
  const codes: number[] = [];
  for (const char of value) {
    const code = char.charCodeAt(0) - 32;
    if (code < 0 || code > 95) {
      return null;
    }
    codes.push(code);
  }

  const startCode = 104;
  let checksum = startCode;
  codes.forEach((code, index) => {
    checksum += code * (index + 1);
  });
  checksum %= 103;

  return [startCode, ...codes, checksum, 106];
}

function renderCode128Svg(value: string, height: number, moduleWidth: number): string | null {
  const encoded = encodeCode128B(value);
  if (!encoded) return null;

  let x = 0;
  const bars: string[] = [];
  for (const code of encoded) {
    const pattern = CODE128_PATTERNS[code];
    let isBar = true;
    for (const widthChar of pattern) {
      const width = Number(widthChar) * moduleWidth;
      if (isBar) {
        bars.push(`<rect x="${x}" y="0" width="${width}" height="${height}" />`);
      }
      x += width;
      isBar = !isBar;
    }
  }

  const totalWidth = Math.max(1, x);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" shape-rendering="crispEdges">
      <rect width="${totalWidth}" height="${height}" fill="#ffffff" />
      <g fill="#111111">${bars.join("")}</g>
    </svg>
  `;
}

// T-171: Format price from minor units (paise) to INR string
function formatPriceINR(priceMinor: number | null | undefined): string {
  if (priceMinor == null || priceMinor <= 0) return "";
  const rupees = priceMinor / 100;
  return `\u20B9${rupees.toFixed(2)}`;
}

// T-171: Format unit display string
function formatUnitLabel(unit: string | null | undefined): string {
  if (!unit) return "";
  const lower = unit.toLowerCase().trim();
  if (lower === "kg" || lower === "kilogram") return "per kg";
  if (lower === "g" || lower === "gram") return "per g";
  if (lower === "l" || lower === "litre" || lower === "liter") return "per litre";
  if (lower === "ml" || lower === "millilitre") return "per ml";
  if (lower === "piece" || lower === "pcs" || lower === "pc") return "per piece";
  if (lower === "pack" || lower === "packet") return "per pack";
  if (lower === "dozen") return "per dozen";
  if (lower === "box") return "per box";
  return `per ${lower}`;
}

// T-170/T-171: Build enriched sheet HTML with print settings and copies support
function buildSheetHtml(
  items: BarcodeSheetItemWithCopies[],
  tier: BarcodeSheetTier,
  settings?: PrintSettings,
): string {
  const layout = SHEET_LAYOUTS[tier];

  // T-169: Determine columns from print settings or tier layout
  const columns = settings?.labelsPerRow ?? layout.columns;

  // T-169: Determine label height from print settings
  let labelHeight: number = layout.labelHeight;
  let barcodeHeight: number = layout.barcodeHeight;
  let moduleWidth: number = layout.moduleWidth;
  if (settings) {
    const label = LABEL_DIMENSIONS[settings.labelSize];
    // Scale label height to px (roughly 3.78 px/mm for screen)
    labelHeight = Math.round(label.height * 3.78);
    barcodeHeight = Math.round(labelHeight * 0.35);
    moduleWidth = settings.labelSize === "Small" ? 1.2 : settings.labelSize === "Medium" ? 1.6 : 2;
  }

  // T-169: Determine paper size for @page
  const paperSizeCss = settings?.paperSize === "Letter" ? "letter" : "A4";

  // T-170: Expand items with copies
  const expandedItems: BarcodeSheetItem[] = [];
  for (const item of items) {
    const copies = Math.max(1, Math.min(item.copies, 50));
    for (let i = 0; i < copies; i++) {
      expandedItems.push(item);
    }
  }

  const rows = Math.max(1, Math.floor(280 / (labelHeight + 8)));
  const labelsPerPage = columns * rows;
  const pages: BarcodeSheetItem[][] = [];

  for (let i = 0; i < expandedItems.length; i += labelsPerPage) {
    pages.push(expandedItems.slice(i, i + labelsPerPage));
  }
  if (pages.length === 0) {
    pages.push([]);
  }

  const pageMarkup = pages
    .map((pageItems) => {
      const filled = [...pageItems];
      while (filled.length < labelsPerPage) {
        filled.push({ barcode: "", name: "" });
      }

      const labels = filled
        .map((item) => {
          if (!item.barcode) {
            return `<div class="label empty"></div>`;
          }
          const barcodeSvg = renderCode128Svg(item.barcode, barcodeHeight, moduleWidth);
          const barcodeMarkup = barcodeSvg
            ? `<div class="barcode">${barcodeSvg}</div>`
            : `<div class="barcode-fallback">${escapeHtml(item.barcode)}</div>`;

          // T-171: Enriched label with category, price, unit
          const categoryHtml = item.category
            ? `<div class="label-category">${escapeHtml(item.category)}</div>`
            : "";
          const priceStr = formatPriceINR(item.sellPrice);
          const unitStr = formatUnitLabel(item.unit);
          const priceUnitHtml =
            priceStr || unitStr
              ? `<div class="label-price">${priceStr ? `<span class="price">${escapeHtml(priceStr)}</span>` : ""}${unitStr ? `<span class="unit">${escapeHtml(unitStr)}</span>` : ""}</div>`
              : "";

          return `
            <div class="label">
              ${categoryHtml}
              <div class="label-name">${escapeHtml(item.name || "Unnamed")}</div>
              ${barcodeMarkup}
              <div class="label-code">${escapeHtml(item.barcode)}</div>
              ${priceUnitHtml}
            </div>
          `;
        })
        .join("");

      return `
        <div class="sheet">
          ${labels}
        </div>
      `;
    })
    .join('<div class="page-break"></div>');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: ${paperSizeCss}; margin: 10mm; }
          body {
            font-family: "Helvetica", "Arial", sans-serif;
            margin: 0;
            padding: 0;
            color: #111111;
          }
          .sheet {
            display: grid;
            grid-template-columns: repeat(${columns}, 1fr);
            gap: 8px;
          }
          .label {
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 6px;
            height: ${labelHeight}px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
          }
          .label.empty {
            border-style: dashed;
            background-color: #f8fafc;
          }
          .label-category {
            font-size: 7px;
            font-weight: 600;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            line-height: 1;
          }
          .label-name {
            font-size: 9px;
            font-weight: 700;
            line-height: 1.2;
            max-height: 22px;
            overflow: hidden;
          }
          .barcode {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .barcode svg {
            width: 100%;
            height: ${barcodeHeight}px;
          }
          .barcode-fallback {
            font-size: 9px;
            text-align: center;
            padding: 4px 0;
          }
          .label-code {
            font-size: 8px;
            text-align: center;
            letter-spacing: 0.5px;
          }
          .label-price {
            display: flex;
            align-items: baseline;
            justify-content: center;
            gap: 4px;
            margin-top: 1px;
          }
          .label-price .price {
            font-size: 10px;
            font-weight: 800;
            color: #111111;
          }
          .label-price .unit {
            font-size: 7px;
            color: #64748b;
          }
          .page-break {
            page-break-after: always;
            height: 12px;
          }
        </style>
      </head>
      <body>
        ${pageMarkup}
      </body>
    </html>
  `;
}

export function getBarcodeSheetCapacity(tier: BarcodeSheetTier): number {
  const layout = SHEET_LAYOUTS[tier];
  return layout.columns * layout.rows;
}

/**
 * GL-BARCODE-001: Fetch products with barcodes from API first, fall back to offline cache.
 * T-171: Now returns enriched items with sellPrice, unit, and category.
 * Returns only products that have valid barcodes for sheet generation.
 */
export async function fetchBarcodeSheetItems(
  tier: BarcodeSheetTier,
  limit = DEFAULT_MAX_ITEMS
): Promise<BarcodeSheetItem[]> {
  const safeLimit = Math.max(getBarcodeSheetCapacity(tier), Math.min(limit, 500));

  // 1) Try API first (real source-of-truth)
  try {
    log("Fetching products from API...");
    const apiProducts = await productsApi.listProducts();
    const withBarcodes = apiProducts
      .filter((p) => p.barcode && p.barcode.trim().length > 0)
      .map((p) => ({
        barcode: p.barcode!,
        name: p.name,
        // T-171: Include price from inventory or variant resolution
        sellPrice: productsApi.resolveProductPriceMinor(p) || null,
        unit: null as string | null,
        category: null as string | null,
      }))
      .slice(0, safeLimit);

    if (withBarcodes.length > 0) {
      log(`API returned ${withBarcodes.length} products with barcodes`);
      return withBarcodes;
    }
    log("API returned no products with barcodes, trying offline cache...");
  } catch (error) {
    log("API fetch failed, falling back to offline cache:", error);
  }

  // 2) Fallback to offline_products cache
  const sql = `
    SELECT barcode as barcode, name as name
    FROM offline_products
    ORDER BY COALESCE(updated_at, created_at) DESC, name ASC
    LIMIT ?
  `;
  const rows = await offlineDb.all<BarcodeSheetItem>(sql, [safeLimit]);
  const filtered = rows.filter((item) => item.barcode && item.barcode.trim().length > 0);
  log(`Offline cache returned ${filtered.length} products with barcodes`);
  return filtered;
}

// T-170: Generate PDF with copies and enriched labels
export async function generateBarcodeSheetPdf(
  items: BarcodeSheetItemWithCopies[],
  tier: BarcodeSheetTier,
  settings?: PrintSettings,
): Promise<string> {
  const html = buildSheetHtml(items, tier, settings);
  const result = await Print.printToFileAsync({ html, base64: false });
  return result.uri;
}

// T-170: Share PDF with copies and enriched labels
export async function shareBarcodeSheetPdf(
  items: BarcodeSheetItemWithCopies[],
  tier: BarcodeSheetTier,
  dialogTitle: string,
  settings?: PrintSettings,
): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("sharing_unavailable");
  }

  const uri = await generateBarcodeSheetPdf(items, tier, settings);
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle,
  });
}

// T-170: Calculate total label count from items with copies
export function getTotalLabelCount(items: BarcodeSheetItemWithCopies[]): number {
  return items.reduce((sum, item) => sum + Math.max(1, Math.min(item.copies, 50)), 0);
}

// T-166: Simple keyword-based category inference for products
// Maps common FMCG product keywords to categories
const CATEGORY_KEYWORDS: Record<string, BarcodeCategory> = {
  // Staples
  atta: "Staples", flour: "Staples", wheat: "Staples", rice: "Staples", sugar: "Staples",
  salt: "Staples", maida: "Staples", sooji: "Staples", rava: "Staples", suji: "Staples",
  besan: "Staples", poha: "Staples",
  // Cooking Oil
  oil: "Cooking Oil", ghee: "Cooking Oil", butter: "Cooking Oil", vanaspati: "Cooking Oil",
  // Dairy
  milk: "Dairy", curd: "Dairy", paneer: "Dairy", cheese: "Dairy", cream: "Dairy",
  yogurt: "Dairy", dahi: "Dairy", lassi: "Dairy", chaas: "Dairy",
  // Beverages
  tea: "Beverages", coffee: "Beverages", juice: "Beverages", cola: "Beverages",
  soda: "Beverages", water: "Beverages", drink: "Beverages", chai: "Beverages",
  // Snacks
  chips: "Snacks", biscuit: "Snacks", cookie: "Snacks", namkeen: "Snacks",
  noodle: "Snacks", maggi: "Snacks", rusk: "Snacks", wafer: "Snacks",
  // Personal Care
  soap: "Personal Care", shampoo: "Personal Care", toothpaste: "Personal Care",
  facewash: "Personal Care", lotion: "Personal Care", deo: "Personal Care",
  // Cleaning
  detergent: "Cleaning", surf: "Cleaning", cleaner: "Cleaning", phenyl: "Cleaning",
  bleach: "Cleaning", dishwash: "Cleaning", vim: "Cleaning",
  // Spices
  masala: "Spices", turmeric: "Spices", chilli: "Spices", cumin: "Spices",
  coriander: "Spices", pepper: "Spices", haldi: "Spices", jeera: "Spices",
  mirch: "Spices", garam: "Spices",
  // Pulses
  dal: "Pulses", lentil: "Pulses", chana: "Pulses", moong: "Pulses",
  toor: "Pulses", urad: "Pulses", rajma: "Pulses", masoor: "Pulses",
};

export function inferCategory(name: string): BarcodeCategory {
  const lower = name.toLowerCase();
  for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return category;
    }
  }
  return "All";
}
