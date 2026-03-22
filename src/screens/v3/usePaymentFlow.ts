/**
 * V3-FIX-071: Shared payment flow hook — extracted from PaymentScreenV3
 * Used by CashScreenV3, UpiScreenV3, UdharScreenV3 to share:
 *   - sale creation (createSale API)
 *   - cart locking
 *   - idempotency guard (createSaleInFlight)
 *   - cart total/items reading
 */
import { useState, useCallback, useRef } from "react";
import { useCartStore, type SellMode } from "../../stores/cartStore";
import { createSale, type SaleItemInput } from "../../services/api/posApi";
import { isOnline } from "../../services/networkStatus";
import { showToast } from "../../utils/showToast";
import { logger } from "../../services/logger";

export type PaymentMethod = "CASH" | "UPI" | "DUE";

export function usePaymentFlow() {
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.total);
  const sellMode = useCartStore((s) => s.sellMode);
  const isBulk = sellMode === "bulk";
  // GCP-STG-0313: Per-item GST calculation matching CartSheetV3 (not flat 18%)
  const gst = isBulk ? items.reduce((sum, item) => {
    const gstPct = (item as any).metadata?.gstPct ?? 18;
    return sum + Math.round(item.priceMinor * item.quantity * gstPct / 100);
  }, 0) : 0;
  const grandTotal = total + gst;
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const totalDisplay = `₹${Math.round(grandTotal / 100).toLocaleString("en-IN")}`;

  const [processing, setProcessing] = useState(false);
  const [saleId, setSaleId] = useState<string | null>(null);
  const createSaleInFlight = useRef(false);

  const createSaleStep = useCallback(async (method: PaymentMethod): Promise<string | null> => {
    if (items.length === 0) { showToast("Cart is empty"); return null; }
    // STG-503: Block zero-amount checkout — prevents spurious zero-revenue sales
    if (grandTotal <= 0) { showToast("Cannot complete sale with ₹0 total"); return null; }
    const online = await isOnline();
    if (!online && method === "UPI") {
      showToast("UPI requires internet connection");
      return null;
    }
    if (!online) {
      showToast("Offline — sale will be queued and synced when online");
    }
    // V3-FIX-167: Pass canonical store/variant identity through checkout
    const saleItems: SaleItemInput[] = items.map((item) => ({
      productId: item.barcode ?? item.id,
      barcode: item.barcode,
      name: item.name,
      quantity: item.quantity,
      priceMinor: item.priceMinor,
      itemDiscount: item.itemDiscount ?? null,
      batchNumber: item.batchNumber ?? null,
      // Canonical identity: storeProductId and retailVariantId from cart
      store_product_id: item.metadata?.storeProductId ?? undefined,
      retail_variant_id: (item.metadata as any)?.retailVariantId ?? undefined,
    }));
    const discount = useCartStore.getState().discount;
    const result = await createSale({
      items: saleItems,
      discountMinor: discount ? (discount.type === "fixed" ? discount.value : 0) : 0,
      cartDiscount: discount ?? undefined,
      currency: "INR",
    });
    logger.debug("V3Payment", `sale_created:${result.saleId},billRef:${result.billRef}`);
    setSaleId(result.saleId);
    return result.saleId;
  }, [items, grandTotal]);

  /** Wrap a payment recording step with sale creation + cart lock + idempotency */
  const executePayment = useCallback(async (
    method: PaymentMethod,
    recordPayment: (saleId: string) => Promise<void>,
    onComplete: (method: PaymentMethod, saleId: string, totalMinor: number, itemCount: number) => void,
  ) => {
    if (createSaleInFlight.current) return;
    useCartStore.getState().lockCart();
    createSaleInFlight.current = true;
    setProcessing(true);
    try {
      const id = saleId ?? await createSaleStep(method);
      if (!id) throw new Error("Failed to create sale");
      await recordPayment(id);
      onComplete(method, id, grandTotal, itemCount);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? "Payment failed";
      showToast(msg);
      logger.debug("V3Payment", `payment_failed:${String(err)}`);
    } finally {
      useCartStore.getState().unlockCart();
      createSaleInFlight.current = false;
      setProcessing(false);
    }
  }, [saleId, createSaleStep, grandTotal, itemCount]);

  return {
    items, total, grandTotal, itemCount, totalDisplay, isBulk, gst,
    processing, saleId, executePayment, createSaleStep,
  };
}
