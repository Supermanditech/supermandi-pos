import { apiClient, ApiError } from "./apiClient";
import { isOnline } from "../networkStatus";
import type { BillSnapshot, BillSummary } from "../billing/billTypes";
import { paymentModeFromStatus } from "../billing/billTypes";
import { fetchLocalBillSnapshot, listLocalBills, upsertLocalBillSnapshot } from "../billing/billStorage";

export async function listBills(): Promise<BillSummary[]> {
  const local = await listLocalBills();

  if (!(await isOnline())) {
    return local;
  }

  try {
    const res = await apiClient.get<{
      bills: Array<{
        saleId: string;
        billRef: string;
        totalMinor: number;
        status: string;
        paymentMode?: string;
        createdAt: string;
        currency?: string;
      }>;
    }>("/api/v1/pos/bills");

    const remote = res.bills.map((bill) => ({
      saleId: bill.saleId,
      billRef: bill.billRef,
      totalMinor: bill.totalMinor ?? 0,
      status: bill.status ?? "",
      paymentMode: paymentModeFromStatus(bill.status),
      createdAt: bill.createdAt,
      currency: bill.currency ?? "INR",
      source: "remote" as const
    }));

    const merged = new Map<string, BillSummary>();
    for (const bill of remote) {
      merged.set(bill.saleId, bill);
    }
    for (const bill of local) {
      if (!merged.has(bill.saleId)) {
        merged.set(bill.saleId, bill);
      }
    }

    return Array.from(merged.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return local;
  }
}

export async function fetchBillSnapshot(saleId: string): Promise<BillSnapshot | null> {
  if (!(await isOnline())) {
    return fetchLocalBillSnapshot(saleId);
  }

  try {
    const res = await apiClient.get<{
      bill: {
        saleId: string;
        billRef: string;
        status: string;
        paymentMode?: string;
        currency?: string;
        createdAt: string;
        totals: { subtotalMinor: number; discountMinor: number; totalMinor: number };
        items: Array<{
          variantId: string;
          name: string;
          barcode: string | null;
          quantity: number;
          priceMinor: number;
          lineTotalMinor: number;
        }>;
      };
    }>(`/api/v1/pos/bills/${encodeURIComponent(saleId)}`);

    const bill = res.bill;
    const snapshot: BillSnapshot = {
      saleId: bill.saleId,
      billRef: bill.billRef,
      status: bill.status ?? "",
      paymentMode: paymentModeFromStatus(bill.status),
      currency: bill.currency ?? "INR",
      createdAt: bill.createdAt,
      subtotalMinor: bill.totals?.subtotalMinor ?? 0,
      discountMinor: bill.totals?.discountMinor ?? 0,
      totalMinor: bill.totals?.totalMinor ?? 0,
      items: (bill.items ?? []).map((item) => ({
        variantId: item.variantId,
        name: item.name,
        barcode: item.barcode,
        quantity: item.quantity,
        priceMinor: item.priceMinor,
        lineTotalMinor: item.lineTotalMinor
      }))
    };

    await upsertLocalBillSnapshot(snapshot, { synced: true });
    return snapshot;
  } catch (error) {
    if (error instanceof ApiError && error.message === "bill_not_found") {
      return fetchLocalBillSnapshot(saleId);
    }
    return fetchLocalBillSnapshot(saleId);
  }
}
