/**
 * V3-FIX-132: Multilingual multi-key search support
 *
 * Maps Hindi kirana product terms to English equivalents so that a retailer
 * searching "doodh" finds "Milk", "chai" finds "Tea", etc.
 *
 * Also normalizes quantity/unit cues:
 * - "1kg" → tokenize as "1" + "kg"
 * - "500gm" → tokenize as "500" + "gm"
 * - "packet" / "peti" → recognized as unit terms
 *
 * Search key priority (V3-FIX-132):
 * 1. Exact barcode match (highest priority)
 * 2. SKU match
 * 3. Product name (English + Hindi alias)
 * 4. Brand name
 * 5. Supplier name (for BUY context)
 * 6. Display name (store override)
 */

/**
 * Hindi → English product name mapping for common kirana items.
 * Keys are lowercase Hindi romanized terms.
 * Values are English search terms to OR with the original query.
 */
export const HINDI_PRODUCT_ALIASES: Record<string, string[]> = {
  // Dairy
  "doodh": ["milk"],
  "dudh": ["milk"],
  "dahi": ["curd", "yogurt"],
  "paneer": ["paneer", "cottage cheese"],
  "ghee": ["ghee"],
  "makhan": ["butter"],
  "lassi": ["lassi"],
  "chaach": ["buttermilk"],

  // Beverages
  "chai": ["tea"],
  "pani": ["water"],
  "nimbu": ["lemon", "lime"],
  "sharbat": ["syrup", "squash"],
  "aam": ["mango"],

  // Staples
  "chawal": ["rice"],
  "atta": ["flour", "wheat flour"],
  "maida": ["refined flour", "maida"],
  "besan": ["gram flour", "besan"],
  "suji": ["semolina", "sooji", "rava"],
  "dal": ["lentil", "dal"],
  "chana": ["chickpea", "gram"],
  "rajma": ["kidney bean"],
  "moong": ["moong", "green gram"],
  "toor": ["toor", "pigeon pea"],

  // Oils
  "tel": ["oil"],
  "sarson": ["mustard"],
  "til": ["sesame"],

  // Spices
  "namak": ["salt"],
  "mirch": ["chilli", "pepper"],
  "haldi": ["turmeric"],
  "jeera": ["cumin"],
  "dhania": ["coriander"],
  "garam masala": ["garam masala"],

  // Snacks
  "biscuit": ["biscuit", "cookie"],
  "namkeen": ["snack", "namkeen", "mixture"],
  "chips": ["chips"],
  "maggi": ["maggi", "noodle"],

  // Household
  "sabun": ["soap"],
  "shampoo": ["shampoo"],
  "toothpaste": ["toothpaste"],
  "detergent": ["detergent", "washing powder"],
  "phenyl": ["phenyl", "floor cleaner"],

  // Bread
  "roti": ["bread", "roti"],
  "bread": ["bread"],
  "pav": ["pav", "bun"],

  // Eggs
  "anda": ["egg"],
  "ande": ["egg"],

  // Vegetables / produce
  "aloo": ["potato"],
  "pyaaz": ["onion"],
  "tamatar": ["tomato"],
  "adrak": ["ginger"],
  "lahsun": ["garlic"],

  // Units (recognized but not translated — helps tokenization)
  "packet": ["packet", "pack"],
  "peti": ["case", "box"],
  "dabba": ["box", "can"],
  "bottle": ["bottle"],
  "kilo": ["kg"],
};

/**
 * Expand a search query with Hindi aliases.
 * Returns the original tokens plus any Hindi-mapped English equivalents.
 */
export function expandHindiSearchTokens(tokens: string[]): string[] {
  const expanded: string[] = [...tokens];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    const aliases = HINDI_PRODUCT_ALIASES[lower];
    if (aliases) {
      for (const alias of aliases) {
        if (!expanded.includes(alias)) {
          expanded.push(alias);
        }
      }
    }
  }

  return expanded;
}

/**
 * Normalize quantity/unit patterns in search terms.
 * "1kg" → ["1", "kg"], "500gm" → ["500", "gm"], "2ltr" → ["2", "ltr"]
 */
export function normalizeQuantityTokens(query: string): string[] {
  // Split "1kg" into "1" and "kg" style patterns
  return query
    .replace(/(\d+)\s*(kg|gm|g|ml|ltr|l|pcs|pc|pack|btl)\b/gi, "$1 $2")
    .split(/\s+/)
    .filter((t) => t.length >= 1);
}
