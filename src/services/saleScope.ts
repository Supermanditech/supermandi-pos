import type { CartItem } from "../stores/cartStore";

export type SalePartition = {
  saleItems: CartItem[];
  remainingItems: CartItem[];
  isPartial: boolean;
};

export function partitionSaleItems(
  items: CartItem[],
  saleItemIds?: string[] | null
): SalePartition {
  const hasSelection = Boolean(saleItemIds && saleItemIds.length > 0);
  if (!hasSelection) {
    return {
      saleItems: items,
      remainingItems: [],
      isPartial: false
    };
  }

  const idSet = new Set(saleItemIds);
  const saleItems = items.filter((item) => idSet.has(item.id));
  const remainingItems = items.filter((item) => !idSet.has(item.id));

  return {
    saleItems,
    remainingItems,
    isPartial: true
  };
}

export function buildStockDeductionLogs(items: CartItem[], saleId?: string | null): string[] {
  const saleSuffix = saleId ? `:saleId=${saleId}` : "";
  return items.map((item) => {
    const sku = item.sku ?? item.barcode ?? item.id;
    return `stock_deducted:${sku}:${item.quantity}${saleSuffix}`;
  });
}
