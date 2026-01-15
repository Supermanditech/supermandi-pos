import { apiClient } from "./apiClient";

// Demo Store Data Seeding API
// Only works for stores with demo code patterns (DM*, QA*, TS*, ST*, or containing demo/test/qa-/staging)

export type DemoSeedResponse = {
  success: boolean;
  storeId: string;
  storeName: string;
  storeCode: string;
  seeded: {
    products: number;
    store_products: number;
    barcodes: number;
    suppliers: number;
    supplier_products: number;
    purchase_orders: number;
    grn_headers: number;
    bills: number;
    reorder_policies: number;
  };
};

export type DemoSeedError = {
  error: {
    code: "STORE_ID_REQUIRED" | "STORE_NOT_FOUND" | "NOT_DEMO_STORE" | "SEED_FAILED";
    message: string;
  };
};

/**
 * Seeds demo data for a demo store.
 * Creates products, suppliers, orders, bills, and reorder policies.
 * Idempotent - safe to call multiple times.
 *
 * @param storeId - UUID of the demo store to seed
 * @returns Seed result with counts of created records
 * @throws Error if store is not a demo store or doesn't exist
 */
export async function seedDemoStore(storeId: string): Promise<DemoSeedResponse> {
  console.log("[demoApi] Seeding demo data for store:", storeId);

  const response = await apiClient.post<DemoSeedResponse>("/api/v1/demo/seed", {
    storeId,
  });

  console.log("[demoApi] Seed complete:", response.seeded);
  return response;
}
