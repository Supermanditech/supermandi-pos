import { mergePurchaseDraftItems, type PurchaseDraftItem } from "./purchaseDraftLogic";

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

export function runPurchaseDraftLogicTests(): void {
  // Same barcode repeated should increment quantity.
  let items: PurchaseDraftItem[] = [];
  items = mergePurchaseDraftItems(items, { barcode: "1111", name: "Apples" });
  items = mergePurchaseDraftItems(items, { barcode: "1111", name: "Apples" });
  assert(items.length === 1, "Expected one line item for repeated barcode");
  assert(items[0].quantity === 2, "Expected quantity to increment for repeated barcode");

  // Alternating two different barcodes should keep two lines and increment independently.
  items = [];
  items = mergePurchaseDraftItems(items, { barcode: "1111", name: "Apples" });
  items = mergePurchaseDraftItems(items, { barcode: "2222", name: "Bananas" });
  items = mergePurchaseDraftItems(items, { barcode: "1111", name: "Apples" });
  items = mergePurchaseDraftItems(items, { barcode: "2222", name: "Bananas" });
  assert(items.length === 2, "Expected two line items for alternating barcodes");
  const apples = items.find((item) => item.barcode === "1111");
  const bananas = items.find((item) => item.barcode === "2222");
  assert(apples?.quantity === 2, "Expected Apples quantity to increment on repeat");
  assert(bananas?.quantity === 2, "Expected Bananas quantity to increment on repeat");

  // Product ID match should win, but fallback to barcode if not found.
  items = [];
  items = mergePurchaseDraftItems(items, { barcode: "1111", name: "Apples", globalProductId: "p1" });
  items = mergePurchaseDraftItems(items, { barcode: "2222", name: "Apples", globalProductId: "p1" });
  assert(items.length === 1, "Expected same productId to merge into one line");
  assert(items[0].quantity === 2, "Expected quantity to increment via productId match");

  items = [];
  items = mergePurchaseDraftItems(items, { barcode: "3333", name: "Chips" });
  items = mergePurchaseDraftItems(items, { barcode: "3333", name: "Chips", globalProductId: "p2" });
  assert(items.length === 1, "Expected barcode fallback to merge when productId is new");
  assert(items[0].quantity === 2, "Expected quantity to increment via barcode fallback");
}
