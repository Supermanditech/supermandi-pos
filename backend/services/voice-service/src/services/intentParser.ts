// Intent Parser Service - VOICE-003, VOICE-004
// Parses transcribed text into structured intents

// =============================================================================
// TYPES
// =============================================================================

export type IntentAction = 'add_to_cart' | 'search' | 'check_stock' | 'info' | 'unknown';

export interface ParsedIntent {
  action: IntentAction;
  productName?: string;
  quantity?: number;
  unit?: string;
  rawQuery: string;
  confidence: number;
}

// =============================================================================
// PATTERNS (Hindi/English mixed - Hinglish common in kirana stores)
// =============================================================================

// Quantity patterns: "2", "do", "ek", "teen", etc.
const HINDI_NUMBERS: Record<string, number> = {
  'ek': 1, 'एक': 1,
  'do': 2, 'दो': 2,
  'teen': 3, 'तीन': 3,
  'char': 4, 'चार': 4,
  'paanch': 5, 'पांच': 5, 'panch': 5,
  'chhe': 6, 'छह': 6,
  'saat': 7, 'सात': 7,
  'aath': 8, 'आठ': 8,
  'nau': 9, 'नौ': 9,
  'das': 10, 'दस': 10,
  'baara': 12, 'बारह': 12,
  'pandrah': 15, 'पंद्रह': 15,
  'bees': 20, 'बीस': 20,
  'pachaas': 50, 'पचास': 50,
  'sau': 100, 'सौ': 100,
};

// Unit patterns (normalized to standard units)
const UNIT_PATTERNS: Record<string, string> = {
  'kg': 'kg', 'kilo': 'kg', 'kilogram': 'kg', 'किलो': 'kg',
  'g': 'g', 'gram': 'g', 'grams': 'g', 'ग्राम': 'g',
  'l': 'l', 'litre': 'l', 'liter': 'l', 'लीटर': 'l',
  'ml': 'ml', 'मिली': 'ml',
  'pcs': 'pcs', 'piece': 'pcs', 'pieces': 'pcs', 'packet': 'pcs', 'pack': 'pcs',
  'dozen': 'dozen', 'darjan': 'dozen', 'दर्जन': 'dozen',
};

// Action keywords
const ADD_KEYWORDS = [
  'add', 'chahiye', 'dedo', 'de do', 'dena', 'dijiye',
  'lagao', 'laga do', 'rakh do', 'rakho',
  'डालो', 'चाहिए', 'दे दो', 'दीजिए',
];

const SEARCH_KEYWORDS = [
  'search', 'find', 'show', 'dikhao', 'dikha do', 'batao',
  'kahan', 'hai', 'milega',
  'खोजो', 'दिखाओ', 'बताओ',
];

const STOCK_KEYWORDS = [
  'stock', 'kitna', 'kितना', 'available', 'hai kya',
  'check', 'quantity', 'inventory',
  'स्टॉक', 'कितना',
];

// =============================================================================
// PARSER FUNCTIONS
// =============================================================================

/**
 * Parse transcribed text into a structured intent.
 *
 * @param text - Raw transcribed text
 * @returns Parsed intent with action, product, quantity, etc.
 */
export function parseIntent(text: string): ParsedIntent {
  const normalizedText = normalizeText(text);
  const words = normalizedText.split(/\s+/);

  // Try to extract quantity and unit first
  const { quantity, unit, remainingText } = extractQuantityAndUnit(normalizedText);

  // Determine action based on keywords
  const action = determineAction(normalizedText);

  // Extract product name (what's left after removing quantity, unit, and action keywords)
  const productName = extractProductName(remainingText, action);

  // Calculate confidence based on how much we understood
  const confidence = calculateConfidence(action, productName, quantity);

  return {
    action,
    productName: productName || undefined,
    quantity: quantity || undefined,
    unit: unit || undefined,
    rawQuery: text,
    confidence,
  };
}

/**
 * Normalize text for parsing.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Normalize common variations
    .replace(/kgs?/g, 'kg')
    .replace(/litres?/g, 'litre')
    .replace(/grams?/g, 'gram');
}

/**
 * Extract quantity and unit from text.
 */
function extractQuantityAndUnit(text: string): {
  quantity: number | null;
  unit: string | null;
  remainingText: string;
} {
  let quantity: number | null = null;
  let unit: string | null = null;
  let remainingText = text;

  // Pattern: <number> <unit>? <product>
  // Examples: "2 kg rice", "do kilo chawal", "1 packet maggi"

  // Try numeric quantity first
  const numericMatch = remainingText.match(/(\d+(?:\.\d+)?)\s*(kg|kilo|gram|g|litre|l|ml|pcs|piece|packet|pack|dozen)?/i);
  if (numericMatch) {
    quantity = parseFloat(numericMatch[1]!);
    if (numericMatch[2]) {
      unit = UNIT_PATTERNS[numericMatch[2].toLowerCase()] || numericMatch[2].toLowerCase();
    }
    remainingText = remainingText.replace(numericMatch[0], '').trim();
  }

  // Try Hindi number words
  if (!quantity) {
    for (const [word, num] of Object.entries(HINDI_NUMBERS)) {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      if (regex.test(remainingText)) {
        quantity = num;
        remainingText = remainingText.replace(regex, '').trim();
        break;
      }
    }
  }

  // Try to find unit if not already found
  if (!unit) {
    for (const [pattern, normalizedUnit] of Object.entries(UNIT_PATTERNS)) {
      const regex = new RegExp(`\\b${pattern}\\b`, 'i');
      if (regex.test(remainingText)) {
        unit = normalizedUnit;
        remainingText = remainingText.replace(regex, '').trim();
        break;
      }
    }
  }

  // Default to 1 if no quantity but unit found
  if (!quantity && unit) {
    quantity = 1;
  }

  return { quantity, unit, remainingText };
}

/**
 * Determine the action/intent from text.
 */
function determineAction(text: string): IntentAction {
  const lowerText = text.toLowerCase();

  // Check for stock check keywords first (more specific)
  if (STOCK_KEYWORDS.some(kw => lowerText.includes(kw))) {
    return 'check_stock';
  }

  // Check for search keywords
  if (SEARCH_KEYWORDS.some(kw => lowerText.includes(kw))) {
    return 'search';
  }

  // Check for add keywords
  if (ADD_KEYWORDS.some(kw => lowerText.includes(kw))) {
    return 'add_to_cart';
  }

  // Default: if there's a quantity, assume add_to_cart
  const hasQuantity = /\d+|ek|do|teen|char|paanch/.test(lowerText);
  if (hasQuantity) {
    return 'add_to_cart';
  }

  // Otherwise, treat as search
  return 'search';
}

/**
 * Extract product name from remaining text.
 */
function extractProductName(text: string, action: IntentAction): string | null {
  let cleanText = text;

  // Remove action keywords
  const allKeywords = [...ADD_KEYWORDS, ...SEARCH_KEYWORDS, ...STOCK_KEYWORDS];
  for (const keyword of allKeywords) {
    cleanText = cleanText.replace(new RegExp(`\\b${keyword}\\b`, 'gi'), '');
  }

  // Remove common filler words
  const fillerWords = ['ka', 'ki', 'ke', 'का', 'की', 'के', 'mein', 'me', 'ko', 'se', 'the', 'a', 'an'];
  for (const filler of fillerWords) {
    cleanText = cleanText.replace(new RegExp(`\\b${filler}\\b`, 'gi'), '');
  }

  // Clean up whitespace
  cleanText = cleanText.replace(/\s+/g, ' ').trim();

  return cleanText || null;
}

/**
 * Calculate confidence score based on parsing results.
 */
function calculateConfidence(
  action: IntentAction,
  productName: string | null,
  quantity: number | null
): number {
  let confidence = 0.5; // Base confidence

  // Action recognized (not unknown)
  if (action !== 'unknown') {
    confidence += 0.2;
  }

  // Product name extracted
  if (productName && productName.length > 1) {
    confidence += 0.2;
  }

  // Quantity extracted (for add_to_cart)
  if (action === 'add_to_cart' && quantity) {
    confidence += 0.1;
  }

  return Math.min(confidence, 1.0);
}

export default {
  parseIntent,
};
