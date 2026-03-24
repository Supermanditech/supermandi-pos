/**
 * GCP-STG-0536: ESC/POS command builder for thermal barcode label printing.
 *
 * Builds raw ESC/POS byte arrays that can be sent to any thermal printer
 * supporting the ESC/POS command set (Epson, Star, Bixolon, etc.).
 *
 * Supports EAN-13, EAN-8, UPC-A, and Code128 barcode symbologies with
 * three label sizes: small (barcode + price only), medium (name + price + barcode),
 * and large (name + price + store + barcode).
 */

// ESC/POS command constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// Commands
const INIT = [ESC, 0x40]; // ESC @ — initialize printer
const CENTER = [ESC, 0x61, 0x01]; // ESC a 1 — center align
const BOLD_ON = [ESC, 0x45, 0x01]; // ESC E 1
const BOLD_OFF = [ESC, 0x45, 0x00]; // ESC E 0
const DOUBLE_HEIGHT = [ESC, 0x21, 0x10]; // ESC ! 0x10
const NORMAL_SIZE = [ESC, 0x21, 0x00]; // ESC ! 0x00
const BARCODE_HEIGHT = [GS, 0x68, 60]; // GS h 60 — 60 dots
const BARCODE_WIDTH = [GS, 0x77, 2]; // GS w 2 — medium
const HRI_BELOW = [GS, 0x48, 0x02]; // GS H 2 — print human-readable below
const PARTIAL_CUT = [GS, 0x56, 66, 3]; // GS V 66 3

export interface LabelProduct {
  name: string;
  barcode: string;
  price?: number;
  storeName?: string;
}

export type LabelSize = "small" | "medium" | "large";
export type BarcodeType = "EAN13" | "EAN8" | "UPCA" | "CODE128";

/**
 * Detect barcode symbology from the barcode string.
 * - 13 digits → EAN-13
 * - 8 digits → EAN-8
 * - 12 digits → UPC-A
 * - Anything else → Code128
 */
export function detectBarcodeType(barcode: string): BarcodeType {
  if (/^\d{13}$/.test(barcode)) return "EAN13";
  if (/^\d{8}$/.test(barcode)) return "EAN8";
  if (/^\d{12}$/.test(barcode)) return "UPCA";
  return "CODE128";
}

// GS k command type codes (function B format)
const BARCODE_TYPE_MAP: Record<BarcodeType, number> = {
  EAN13: 67, // type 67
  EAN8: 68, // type 68
  UPCA: 65, // type 65
  CODE128: 73, // type 73
};

/**
 * Build a complete ESC/POS byte sequence for a barcode label.
 *
 * @param product - Product data (name, barcode, price, storeName)
 * @param size - Label size: 'small' (barcode + price), 'medium' (+ name), 'large' (+ store)
 * @returns Uint8Array ready to send to the printer
 */
export function buildBarcodeLabel(
  product: LabelProduct,
  size: LabelSize = "medium",
): Uint8Array {
  const bytes: number[] = [];

  // Initialize printer
  bytes.push(...INIT);

  // Center align
  bytes.push(...CENTER);

  if (size !== "small") {
    // Product name (double height for medium/large)
    bytes.push(...DOUBLE_HEIGHT);
    bytes.push(...BOLD_ON);
    const nameBytes = encodeText(
      truncate(product.name, size === "large" ? 32 : 24),
    );
    bytes.push(...nameBytes);
    bytes.push(LF);
    bytes.push(...BOLD_OFF);
    bytes.push(...NORMAL_SIZE);
  }

  // Price line
  if (product.price != null && product.price > 0) {
    const priceText = `MRP: Rs.${product.price.toFixed(2)}`;
    bytes.push(...encodeText(priceText));
    bytes.push(LF);
  }

  // Large: add store name
  if (size === "large" && product.storeName) {
    bytes.push(...encodeText(truncate(product.storeName, 32)));
    bytes.push(LF);
  }

  bytes.push(LF); // spacing before barcode

  // Barcode section — only if barcode is long enough for a valid symbology
  if (product.barcode && product.barcode.length >= 4) {
    const barcodeType = detectBarcodeType(product.barcode);
    bytes.push(...BARCODE_HEIGHT);
    bytes.push(...BARCODE_WIDTH);
    bytes.push(...HRI_BELOW);

    // GS k m n d1...dn (function B format)
    const typeCode = BARCODE_TYPE_MAP[barcodeType];
    const barcodeData = encodeText(product.barcode);
    bytes.push(GS, 0x6b, typeCode, barcodeData.length, ...barcodeData);
  }

  bytes.push(LF, LF, LF); // feed lines
  bytes.push(...PARTIAL_CUT);

  return new Uint8Array(bytes);
}

/**
 * Encode text as ASCII bytes. Non-ASCII characters are replaced with '?'.
 * Most thermal printers only support the ASCII subset.
 */
function encodeText(text: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) {
      result.push(code);
    } else {
      result.push(0x3f); // '?' for non-ASCII
    }
  }
  return result;
}

/** Truncate text with ellipsis if it exceeds maxLen. */
function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.substring(0, maxLen - 1) + "..." : text;
}
