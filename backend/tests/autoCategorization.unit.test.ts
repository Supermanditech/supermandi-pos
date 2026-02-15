// Unit tests for backend/src/utils/autoCategorization.ts
import {
  suggestCategory,
  suggestCategoriesBatch,
  getAvailableCategories,
} from "../src/utils/autoCategorization";

describe("suggestCategory", () => {
  // Staples & Grains
  it("categorizes rice products", () => {
    expect(suggestCategory("Basmati Rice 5kg")).toBe("Staples & Grains");
    expect(suggestCategory("Tata Atta Whole Wheat")).toBe("Staples & Grains");
  });

  // Pulses & Lentils
  it("categorizes dal/lentils", () => {
    expect(suggestCategory("Toor Dal 1kg")).toBe("Pulses & Lentils");
    expect(suggestCategory("Moong Dal Yellow")).toBe("Pulses & Lentils");
  });

  // Cooking Oil & Ghee
  it("categorizes oils and ghee", () => {
    expect(suggestCategory("Fortune Sunflower Oil 1L")).toBe("Cooking Oil & Ghee");
    expect(suggestCategory("Pure Ghee 500ml")).toBe("Cooking Oil & Ghee");
  });

  // Spices & Masala
  it("categorizes spices", () => {
    expect(suggestCategory("MDH Garam Masala")).toBe("Spices & Masala");
    expect(suggestCategory("Haldi Powder")).toBe("Spices & Masala");
    expect(suggestCategory("Red Chilli Powder")).toBe("Spices & Masala");
  });

  // Salt & Sugar
  it("categorizes salt and sugar", () => {
    expect(suggestCategory("Tata Salt 1kg")).toBe("Salt & Sugar");
    expect(suggestCategory("Sugar 2kg")).toBe("Salt & Sugar");
  });

  // Tea & Coffee
  it("categorizes tea and coffee", () => {
    expect(suggestCategory("Tata Tea Premium")).toBe("Tea & Coffee");
    expect(suggestCategory("Nescafe Classic Coffee")).toBe("Tea & Coffee");
  });

  // Biscuits & Snacks
  it("categorizes biscuits and snacks", () => {
    expect(suggestCategory("Parle-G Biscuit")).toBe("Biscuits & Snacks");
    expect(suggestCategory("Lays Classic Chips")).toBe("Biscuits & Snacks");
  });

  // Beverages
  it("categorizes beverages", () => {
    expect(suggestCategory("Frooti Mango Juice")).toBe("Beverages");
    expect(suggestCategory("Mineral Water 1L")).toBe("Beverages");
  });

  // Dairy
  it("categorizes dairy products", () => {
    expect(suggestCategory("Amul Butter 500g")).toBe("Dairy");
    expect(suggestCategory("Fresh Paneer")).toBe("Dairy");
  });

  // Instant & Ready-to-Eat
  it("categorizes instant foods", () => {
    expect(suggestCategory("Maggi 2-Minute Noodle")).toBe("Instant & Ready-to-Eat");
    expect(suggestCategory("Yippee Noodles")).toBe("Instant & Ready-to-Eat");
  });

  // Personal Care
  it("categorizes personal care", () => {
    expect(suggestCategory("Dove Soap 75g")).toBe("Personal Care");
    expect(suggestCategory("Colgate Toothpaste")).toBe("Personal Care");
  });

  // Cleaning & Household
  it("categorizes cleaning products", () => {
    expect(suggestCategory("Surf Excel Detergent")).toBe("Cleaning & Household");
    expect(suggestCategory("Vim Dish Wash Liquid")).toBe("Cleaning & Household");
  });

  // Dry Fruits & Nuts
  it("categorizes dry fruits", () => {
    expect(suggestCategory("Premium Cashew Kaju")).toBe("Dry Fruits & Nuts");
    expect(suggestCategory("Badam Almond")).toBe("Dry Fruits & Nuts");
  });

  // Fruits & Vegetables
  it("categorizes fruits and vegetables", () => {
    expect(suggestCategory("Fresh Potato Aloo")).toBe("Fruits & Vegetables");
    expect(suggestCategory("Onion 1kg")).toBe("Fruits & Vegetables");
  });

  // Edge cases
  it("returns null for empty input", () => {
    expect(suggestCategory("")).toBeNull();
    expect(suggestCategory("   ")).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(suggestCategory(null as any)).toBeNull();
    expect(suggestCategory(undefined as any)).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(suggestCategory(123 as any)).toBeNull();
  });

  it("returns null for unrecognized products", () => {
    expect(suggestCategory("XYZ12345 Unknown Item")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(suggestCategory("BASMATI RICE")).toBe("Staples & Grains");
    expect(suggestCategory("toor dal")).toBe("Pulses & Lentils");
  });

  it("handles multi-word keyword matches", () => {
    // "garam masala" is a multi-word keyword
    expect(suggestCategory("MDH Garam Masala 100g")).toBe("Spices & Masala");
  });

  it("picks best scoring category when multiple match", () => {
    // "coconut oil" matches both Cooking Oil & Ghee and possibly Puja
    // but "oil" is a direct keyword in Cooking Oil & Ghee
    const result = suggestCategory("Coconut Oil 1L");
    expect(result).toBeTruthy();
  });
});

describe("suggestCategoriesBatch", () => {
  it("returns a Map with categories for each product", () => {
    const products = ["Tata Salt", "Rice 5kg", "Unknown XYZ"];
    const result = suggestCategoriesBatch(products);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(3);
    expect(result.get("Tata Salt")).toBe("Salt & Sugar");
    expect(result.get("Rice 5kg")).toBe("Staples & Grains");
    expect(result.get("Unknown XYZ")).toBeNull();
  });

  it("handles empty array", () => {
    const result = suggestCategoriesBatch([]);
    expect(result.size).toBe(0);
  });
});

describe("getAvailableCategories", () => {
  it("returns array of category strings", () => {
    const categories = getAvailableCategories();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(10);
  });

  it("includes expected categories", () => {
    const categories = getAvailableCategories();
    expect(categories).toContain("Staples & Grains");
    expect(categories).toContain("Pulses & Lentils");
    expect(categories).toContain("Spices & Masala");
    expect(categories).toContain("Dairy");
    expect(categories).toContain("Beverages");
  });

  it("all entries are non-empty strings", () => {
    const categories = getAvailableCategories();
    for (const cat of categories) {
      expect(typeof cat).toBe("string");
      expect(cat.length).toBeGreaterThan(0);
    }
  });
});
