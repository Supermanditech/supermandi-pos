// T-197: Auto-Categorization of Products
// Keyword-based category suggestion for Indian FMCG / Kirana products
// Used as application-level fallback when DB function catalog.assign_taxonomy_by_name doesn't exist

// =============================================================================
// CATEGORY KEYWORD MAP (50+ keywords for Indian FMCG)
// =============================================================================

interface CategoryMapping {
  category: string;
  keywords: string[];
}

const CATEGORY_MAP: CategoryMapping[] = [
  // Staples & Grains
  {
    category: "Staples & Grains",
    keywords: [
      "rice", "chawal", "atta", "flour", "maida", "wheat", "besan", "gram flour",
      "suji", "semolina", "rava", "rawa", "poha", "daliya", "oats", "millet",
      "ragi", "bajra", "jowar", "nachni", "corn flour", "makka",
    ],
  },
  // Pulses & Lentils
  {
    category: "Pulses & Lentils",
    keywords: [
      "dal", "daal", "toor", "arhar", "moong", "masoor", "chana", "urad",
      "rajma", "chole", "lobia", "kabuli", "lentil", "pulse",
    ],
  },
  // Cooking Oil & Ghee
  {
    category: "Cooking Oil & Ghee",
    keywords: [
      "oil", "tel", "ghee", "mustard oil", "sarson", "sunflower", "groundnut",
      "coconut oil", "olive oil", "soybean oil", "refined oil", "vanaspati",
      "dalda", "fortune", "saffola",
    ],
  },
  // Spices & Masala
  {
    category: "Spices & Masala",
    keywords: [
      "masala", "spice", "haldi", "turmeric", "mirch", "chilli", "jeera",
      "cumin", "dhania", "coriander", "garam masala", "biryani masala",
      "kitchen king", "sabji masala", "sambhar", "rasam", "pepper", "kali mirch",
      "hing", "asafoetida", "methi", "fenugreek", "ajwain", "saunf", "fennel",
      "elaichi", "cardamom", "laung", "clove", "dalchini", "cinnamon",
      "jaiphal", "nutmeg", "curry powder", "chaat masala", "pav bhaji masala",
    ],
  },
  // Salt & Sugar
  {
    category: "Salt & Sugar",
    keywords: [
      "salt", "namak", "sugar", "cheeni", "shakkar", "jaggery", "gur",
      "mishri", "rock salt", "sendha namak", "black salt", "kala namak",
    ],
  },
  // Tea & Coffee
  {
    category: "Tea & Coffee",
    keywords: [
      "tea", "chai", "coffee", "nescafe", "bru", "tata tea", "brooke bond",
      "wagh bakri", "tajmahal", "red label", "green tea", "filter coffee",
    ],
  },
  // Biscuits & Snacks
  {
    category: "Biscuits & Snacks",
    keywords: [
      "biscuit", "cookie", "rusk", "toast", "parle", "britannia", "oreo",
      "bourbon", "marie", "digestive", "cream biscuit", "namkeen", "bhujia",
      "mixture", "chips", "kurkure", "lays", "pringles", "nachos",
      "papad", "fryums", "snack", "mathri", "shakarpara",
    ],
  },
  // Beverages
  {
    category: "Beverages",
    keywords: [
      "juice", "drink", "soda", "cola", "pepsi", "coca cola", "thums up",
      "sprite", "fanta", "limca", "maaza", "frooti", "appy", "real juice",
      "tropicana", "tang", "rooh afza", "nimbu pani", "lassi", "buttermilk",
      "chaas", "sharbat", "jaljeera", "energy drink", "water", "mineral water",
    ],
  },
  // Dairy
  {
    category: "Dairy",
    keywords: [
      "milk", "doodh", "paneer", "curd", "dahi", "yogurt", "butter", "makhan",
      "cream", "malai", "cheese", "khoya", "mawa", "rabri", "shrikhand",
      "amul", "mother dairy", "verka",
    ],
  },
  // Instant & Ready-to-Eat
  {
    category: "Instant & Ready-to-Eat",
    keywords: [
      "noodle", "maggi", "yippee", "pasta", "macaroni", "instant", "ready to eat",
      "soup", "cup noodle", "top ramen", "vermicelli", "sevai", "upma mix",
      "poha mix", "idli mix", "dosa mix", "gulab jamun mix", "rava dosa",
    ],
  },
  // Personal Care
  {
    category: "Personal Care",
    keywords: [
      "soap", "shampoo", "toothpaste", "toothbrush", "hair oil", "cream",
      "lotion", "face wash", "body wash", "deodorant", "deo", "talcum",
      "powder", "razor", "blade", "sanitary", "pad", "diaper", "tissue",
      "cotton", "comb", "kajal", "sindoor", "bindi", "mehendi",
    ],
  },
  // Cleaning & Household
  {
    category: "Cleaning & Household",
    keywords: [
      "detergent", "surf", "tide", "ariel", "rin", "nirma", "vim", "dish wash",
      "floor cleaner", "toilet cleaner", "harpic", "lizol", "phenyl",
      "broom", "jhadu", "mop", "wiper", "dustbin", "garbage bag",
      "naphthalene", "camphor", "kapur", "match", "agarbatti", "incense",
      "diya", "candle",
    ],
  },
  // Dry Fruits & Nuts
  {
    category: "Dry Fruits & Nuts",
    keywords: [
      "almond", "badam", "cashew", "kaju", "walnut", "akhrot", "pistachio",
      "pista", "raisin", "kishmish", "dates", "khajoor", "fig", "anjeer",
      "dry fruit", "makhana", "fox nut", "peanut", "moongfali",
    ],
  },
  // Eggs & Poultry
  {
    category: "Eggs & Poultry",
    keywords: [
      "egg", "anda", "chicken", "murgi", "mutton", "fish", "machli",
      "prawn", "shrimp", "meat",
    ],
  },
  // Fruits & Vegetables
  {
    category: "Fruits & Vegetables",
    keywords: [
      "apple", "banana", "kela", "mango", "aam", "orange", "santra",
      "grapes", "angoor", "papaya", "pomegranate", "anar", "guava", "amrood",
      "potato", "aloo", "onion", "pyaaz", "tomato", "tamatar",
      "cauliflower", "gobi", "cabbage", "patta gobi", "ladyfinger", "bhindi",
      "brinjal", "baingan", "green peas", "matar", "capsicum", "shimla mirch",
      "carrot", "gajar", "radish", "mooli", "spinach", "palak",
      "ginger", "adrak", "garlic", "lehsun", "lemon", "nimbu",
      "coriander leaves", "hara dhania", "curry leaves", "kadhi patta",
      "green chilli", "hari mirch", "fresh", "sabzi", "vegetable", "fruit",
    ],
  },
  // Sweets & Confectionery
  {
    category: "Sweets & Confectionery",
    keywords: [
      "chocolate", "toffee", "candy", "mithai", "sweet", "laddu", "laddoo",
      "barfi", "halwa", "rasgulla", "gulab jamun", "jalebi", "peda",
      "soan papdi", "chikki", "gajak",
    ],
  },
  // Pickles & Chutneys
  {
    category: "Pickles & Chutneys",
    keywords: [
      "pickle", "achar", "chutney", "sauce", "ketchup", "vinegar",
      "soy sauce", "mayonnaise", "jam", "honey", "shahad",
    ],
  },
  // Baby Products
  {
    category: "Baby Products",
    keywords: [
      "baby", "cerelac", "lactogen", "nan", "formula", "baby food",
      "baby oil", "baby powder", "baby soap", "baby wipe",
    ],
  },
  // Puja & Worship
  {
    category: "Puja & Worship",
    keywords: [
      "puja", "pooja", "dhoop", "agarbatti", "incense", "kumkum",
      "roli", "moli", "kalawa", "camphor", "kapur", "ghee lamp",
      "diya", "supari", "coconut", "nariyal", "prasad",
    ],
  },
];

// =============================================================================
// SUGGESTION FUNCTION
// =============================================================================

/**
 * T-197: Suggest a category for a product based on its name
 * Uses keyword matching against the Indian FMCG category map
 *
 * @param productName The product name to categorize
 * @returns Suggested category name, or null if no match
 */
export function suggestCategory(productName: string): string | null {
  if (!productName || typeof productName !== 'string') return null;

  const nameLower = productName.toLowerCase().trim();
  if (!nameLower) return null;

  // Split name into words for word-boundary matching
  const nameWords = nameLower.split(/[\s,\-_/()]+/).filter(Boolean);

  let bestMatch: { category: string; score: number } | null = null;

  for (const mapping of CATEGORY_MAP) {
    let score = 0;

    for (const keyword of mapping.keywords) {
      const kwLower = keyword.toLowerCase();

      // Multi-word keyword: check if contained in full name
      if (kwLower.includes(' ')) {
        if (nameLower.includes(kwLower)) {
          // Multi-word matches are stronger
          score += kwLower.split(' ').length * 2;
        }
      } else {
        // Single-word keyword: check if any word matches exactly or starts with keyword
        for (const word of nameWords) {
          if (word === kwLower) {
            score += 3; // Exact word match is strongest
          } else if (word.startsWith(kwLower) && kwLower.length >= 3) {
            score += 1; // Prefix match (at least 3 chars)
          }
        }
      }
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { category: mapping.category, score };
    }
  }

  return bestMatch?.category || null;
}

/**
 * T-197: Suggest categories for multiple products at once
 * Useful for batch operations like CSV import
 *
 * @param productNames Array of product names
 * @returns Map of product name to suggested category (null if no match)
 */
export function suggestCategoriesBatch(productNames: string[]): Map<string, string | null> {
  const results = new Map<string, string | null>();
  for (const name of productNames) {
    results.set(name, suggestCategory(name));
  }
  return results;
}

/**
 * T-197: Get all available categories from the keyword map
 */
export function getAvailableCategories(): string[] {
  return CATEGORY_MAP.map(m => m.category);
}
