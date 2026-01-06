import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { offlineDb } from "./offline/localDb";

export type BarcodeSheetTier = "TIER_1" | "TIER_2";

export type BarcodeSheetItem = {
  barcode: string;
  name: string;
};

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

function buildSheetHtml(items: BarcodeSheetItem[], tier: BarcodeSheetTier): string {
  const layout = SHEET_LAYOUTS[tier];
  const labelsPerPage = layout.columns * layout.rows;
  const pages: BarcodeSheetItem[][] = [];

  for (let i = 0; i < items.length; i += labelsPerPage) {
    pages.push(items.slice(i, i + labelsPerPage));
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
          const barcodeSvg = renderCode128Svg(item.barcode, layout.barcodeHeight, layout.moduleWidth);
          const barcodeMarkup = barcodeSvg
            ? `<div class="barcode">${barcodeSvg}</div>`
            : `<div class="barcode-fallback">${escapeHtml(item.barcode)}</div>`;
          return `
            <div class="label">
              <div class="label-name">${escapeHtml(item.name || "Unnamed")}</div>
              ${barcodeMarkup}
              <div class="label-code">${escapeHtml(item.barcode)}</div>
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
          @page { size: A4; margin: 10mm; }
          body {
            font-family: "Helvetica", "Arial", sans-serif;
            margin: 0;
            padding: 0;
            color: #111111;
          }
          .sheet {
            display: grid;
            grid-template-columns: repeat(${layout.columns}, 1fr);
            gap: 8px;
          }
          .label {
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 8px;
            height: ${layout.labelHeight}px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .label.empty {
            border-style: dashed;
            background-color: #f8fafc;
          }
          .label-name {
            font-size: 10px;
            font-weight: 700;
            line-height: 1.2;
            max-height: 24px;
            overflow: hidden;
          }
          .barcode {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .barcode svg {
            width: 100%;
            height: ${layout.barcodeHeight}px;
          }
          .barcode-fallback {
            font-size: 10px;
            text-align: center;
            padding: 6px 0;
          }
          .label-code {
            font-size: 9px;
            text-align: center;
            letter-spacing: 0.6px;
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

export async function fetchBarcodeSheetItems(
  tier: BarcodeSheetTier,
  limit = DEFAULT_MAX_ITEMS
): Promise<BarcodeSheetItem[]> {
  const safeLimit = Math.max(getBarcodeSheetCapacity(tier), Math.min(limit, 500));
  const sql = `
    SELECT barcode as barcode, name as name
    FROM offline_products
    ORDER BY COALESCE(updated_at, created_at) DESC, name ASC
    LIMIT ?
  `;
  const rows = await offlineDb.all<BarcodeSheetItem>(sql, [safeLimit]);
  return rows.filter((item) => item.barcode);
}

export async function generateBarcodeSheetPdf(
  items: BarcodeSheetItem[],
  tier: BarcodeSheetTier
): Promise<string> {
  const html = buildSheetHtml(items, tier);
  const result = await Print.printToFileAsync({ html, base64: false });
  return result.uri;
}

export async function shareBarcodeSheetPdf(
  items: BarcodeSheetItem[],
  tier: BarcodeSheetTier,
  dialogTitle: string
): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("sharing_unavailable");
  }

  const uri = await generateBarcodeSheetPdf(items, tier);
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle,
  });
}
