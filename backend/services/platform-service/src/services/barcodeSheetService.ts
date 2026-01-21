/**
 * Barcode Sheet Service
 *
 * EPIC: Retailer Dashboard → POS Retailer-Owned Catalog (API-RCAT-004)
 *
 * Server-side barcode label sheet generation for dashboard SKU PDF download.
 * Reuses the same Code128 rendering logic as the POS app (barcodeSheet.ts).
 *
 * Generates actual PDF files (application/pdf) per API-RCAT-004 spec.
 */

import PDFDocument from 'pdfkit';

// =============================================================================
// CODE128 BARCODE ENCODING (same as POS frontend)
// =============================================================================

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];

export interface BarcodeSheetItem {
  barcode: string;
  name: string;
  storeName?: string;
}

export type BarcodeSheetTier = 'TIER_1' | 'TIER_2';

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

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    for (const widthChar of pattern!) {
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
      <g fill="#111111">${bars.join('')}</g>
    </svg>
  `;
}

/**
 * Generate HTML for a single product's barcode label sheet.
 * Returns printable HTML that can be saved as PDF via browser print.
 */
export function generateSingleProductLabelHtml(
  item: BarcodeSheetItem,
  tier: BarcodeSheetTier = 'TIER_1',
  labelCount: number = 24
): string {
  const layout = SHEET_LAYOUTS[tier];
  const labelsPerPage = layout.columns * layout.rows;
  const totalLabels = Math.min(labelCount, labelsPerPage * 4); // Max 4 pages

  // Create array of same item repeated
  const items: BarcodeSheetItem[] = Array(totalLabels).fill(item);

  return buildSheetHtml(items, tier, item.storeName);
}

/**
 * Generate HTML for multiple products' barcode label sheet.
 */
export function generateBarcodeSheetHtml(
  items: BarcodeSheetItem[],
  tier: BarcodeSheetTier = 'TIER_1',
  storeName?: string
): string {
  return buildSheetHtml(items, tier, storeName);
}

function buildSheetHtml(
  items: BarcodeSheetItem[],
  tier: BarcodeSheetTier,
  storeName?: string
): string {
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
        filled.push({ barcode: '', name: '' });
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
              <div class="label-name">${escapeHtml(item.name || 'Unnamed')}</div>
              ${barcodeMarkup}
              <div class="label-code">${escapeHtml(item.barcode)}</div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="sheet">
          ${labels}
        </div>
      `;
    })
    .join('<div class="page-break"></div>');

  const storeHeader = storeName
    ? `<div class="store-header">${escapeHtml(storeName)} - SKU Labels</div>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>SKU Labels${storeName ? ` - ${escapeHtml(storeName)}` : ''}</title>
        <style>
          @page { size: A4; margin: 10mm; }
          @media print {
            .no-print { display: none !important; }
            .page-break { page-break-after: always; }
          }
          * { box-sizing: border-box; }
          body {
            font-family: "Helvetica", "Arial", sans-serif;
            margin: 0;
            padding: 20px;
            color: #111111;
            background: #f5f5f5;
          }
          .store-header {
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 16px;
            text-align: center;
          }
          .sheet {
            display: grid;
            grid-template-columns: repeat(${layout.columns}, 1fr);
            gap: 8px;
            background: white;
            padding: 16px;
            margin-bottom: 16px;
          }
          .label {
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 8px;
            height: ${layout.labelHeight}px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            background: white;
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
            text-overflow: ellipsis;
          }
          .barcode {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .barcode svg {
            width: 100%;
            max-width: 100%;
            height: ${layout.barcodeHeight}px;
          }
          .barcode-fallback {
            font-size: 10px;
            text-align: center;
            color: #64748b;
            font-family: monospace;
          }
          .label-code {
            font-size: 9px;
            text-align: center;
            font-family: monospace;
            color: #475569;
          }
          .page-break {
            height: 20px;
          }
          .print-instructions {
            text-align: center;
            padding: 16px;
            background: #e0f2fe;
            border-radius: 8px;
            margin-bottom: 16px;
            font-size: 14px;
          }
          .print-btn {
            background: #0284c7;
            color: white;
            border: none;
            padding: 12px 24px;
            font-size: 16px;
            border-radius: 8px;
            cursor: pointer;
            margin-top: 8px;
          }
          .print-btn:hover {
            background: #0369a1;
          }
          @media print {
            body { background: white; padding: 0; }
            .sheet { margin: 0; padding: 0; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <div class="print-instructions no-print">
          <strong>Print Instructions:</strong> Click the button below or press Ctrl+P (Cmd+P on Mac) to print.
          <br/>Select "Save as PDF" as the destination to download as PDF.
          <br/><br/>
          <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
        </div>
        ${storeHeader}
        ${pageMarkup}
        <script>
          // Auto-trigger print dialog after a short delay (optional)
          // setTimeout(() => window.print(), 500);
        </script>
      </body>
    </html>
  `;
}

// =============================================================================
// PDF GENERATION (API-RCAT-004 Spec: Must return application/pdf)
// =============================================================================

/**
 * PDF Layout configuration for A4 paper
 */
const PDF_LAYOUTS = {
  TIER_1: {
    columns: 3,
    rows: 8,
    labelWidth: 175,
    labelHeight: 90,
    marginX: 25,
    marginY: 20,
    gapX: 10,
    gapY: 8,
    barcodeHeight: 35,
    moduleWidth: 1.5,
    nameFontSize: 9,
    codeFontSize: 7,
  },
  TIER_2: {
    columns: 4,
    rows: 10,
    labelWidth: 130,
    labelHeight: 72,
    marginX: 20,
    marginY: 15,
    gapX: 8,
    gapY: 6,
    barcodeHeight: 28,
    moduleWidth: 1.2,
    nameFontSize: 8,
    codeFontSize: 6,
  },
} as const;

/**
 * Get Code128 bar widths for PDF rendering
 */
function getCode128BarWidths(value: string, moduleWidth: number): { widths: number[]; isBar: boolean[] } | null {
  const encoded = encodeCode128B(value);
  if (!encoded) return null;

  const widths: number[] = [];
  const isBar: boolean[] = [];

  for (const code of encoded) {
    const pattern = CODE128_PATTERNS[code];
    let bar = true;
    for (const widthChar of pattern!) {
      widths.push(Number(widthChar) * moduleWidth);
      isBar.push(bar);
      bar = !bar;
    }
  }

  return { widths, isBar };
}

/**
 * Draw Code128 barcode directly on PDFKit document
 */
function drawBarcodeToPdf(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  height: number,
  moduleWidth: number
): void {
  const barData = getCode128BarWidths(value, moduleWidth);
  if (!barData) return;

  const totalWidth = barData.widths.reduce((sum, w) => sum + w, 0);
  const scale = totalWidth > maxWidth ? maxWidth / totalWidth : 1;
  const startX = x + (maxWidth - totalWidth * scale) / 2;

  let currentX = startX;
  for (let i = 0; i < barData.widths.length; i++) {
    const width = barData.widths[i]! * scale;
    if (barData.isBar[i]) {
      doc.rect(currentX, y, width, height).fill('#000000');
    }
    currentX += width;
  }
}

/**
 * Generate actual PDF buffer for a single product's barcode label sheet.
 *
 * EPIC: Retailer Dashboard → POS Retailer-Owned Catalog (API-RCAT-004)
 *
 * Returns Buffer containing PDF data with Content-Type: application/pdf
 */
export async function generateSingleProductLabelPdf(
  item: BarcodeSheetItem,
  tier: BarcodeSheetTier = 'TIER_1',
  labelCount: number = 24
): Promise<Buffer> {
  const layout = PDF_LAYOUTS[tier];
  const labelsPerPage = layout.columns * layout.rows;
  const totalLabels = Math.min(labelCount, labelsPerPage * 4); // Max 4 pages

  // Create array of same item repeated
  const items: BarcodeSheetItem[] = Array(totalLabels).fill(item);

  return buildSheetPdf(items, tier, item.storeName);
}

/**
 * Generate actual PDF buffer for multiple products' barcode label sheet.
 */
export async function generateBarcodeSheetPdf(
  items: BarcodeSheetItem[],
  tier: BarcodeSheetTier = 'TIER_1',
  storeName?: string
): Promise<Buffer> {
  return buildSheetPdf(items, tier, storeName);
}

/**
 * Build PDF document with barcode labels
 */
async function buildSheetPdf(
  items: BarcodeSheetItem[],
  tier: BarcodeSheetTier,
  storeName?: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const layout = PDF_LAYOUTS[tier];
    const labelsPerPage = layout.columns * layout.rows;

    // Create PDF document (A4 size)
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      info: {
        Title: `SKU Labels${storeName ? ` - ${storeName}` : ''}`,
        Author: 'SuperMandi',
        Subject: 'Barcode Label Sheet',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Split items into pages
    const pages: BarcodeSheetItem[][] = [];
    for (let i = 0; i < items.length; i += labelsPerPage) {
      pages.push(items.slice(i, i + labelsPerPage));
    }
    if (pages.length === 0) {
      pages.push([]);
    }

    // Render each page
    pages.forEach((pageItems, pageIndex) => {
      if (pageIndex > 0) {
        doc.addPage();
      }

      // Store header
      if (storeName) {
        doc.fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#111111')
          .text(`${storeName} - SKU Labels`, 0, 15, {
            align: 'center',
            width: doc.page.width,
          });
      }

      // Fill empty slots
      const filled = [...pageItems];
      while (filled.length < labelsPerPage) {
        filled.push({ barcode: '', name: '' });
      }

      // Render labels in grid
      filled.forEach((labelItem, index) => {
        const col = index % layout.columns;
        const row = Math.floor(index / layout.columns);

        const x = layout.marginX + col * (layout.labelWidth + layout.gapX);
        const y = layout.marginY + (storeName ? 25 : 0) + row * (layout.labelHeight + layout.gapY);

        // Draw label border
        doc.strokeColor('#cbd5e1')
          .lineWidth(0.5)
          .roundedRect(x, y, layout.labelWidth, layout.labelHeight, 4)
          .stroke();

        if (!labelItem.barcode) {
          // Empty label - dashed border
          doc.strokeColor('#cbd5e1')
            .lineWidth(0.5)
            .dash(3, { space: 2 })
            .roundedRect(x, y, layout.labelWidth, layout.labelHeight, 4)
            .stroke()
            .undash();
          return;
        }

        // Product name (truncated)
        const displayName = (labelItem.name || 'Unnamed').slice(0, 30);
        doc.fontSize(layout.nameFontSize)
          .font('Helvetica-Bold')
          .fillColor('#111111')
          .text(displayName, x + 6, y + 6, {
            width: layout.labelWidth - 12,
            height: 16,
            ellipsis: true,
          });

        // Draw barcode
        const barcodeY = y + 22;
        const barcodeMaxWidth = layout.labelWidth - 16;
        drawBarcodeToPdf(
          doc,
          labelItem.barcode,
          x + 8,
          barcodeY,
          barcodeMaxWidth,
          layout.barcodeHeight,
          layout.moduleWidth
        );

        // Barcode text
        doc.fontSize(layout.codeFontSize)
          .font('Courier')
          .fillColor('#475569')
          .text(labelItem.barcode, x + 6, y + layout.labelHeight - 14, {
            width: layout.labelWidth - 12,
            align: 'center',
          });
      });
    });

    doc.end();
  });
}
