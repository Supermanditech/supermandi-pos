/**
 * GCP-STG-0409: Delivery Address + Order Notes in BUY Checkout
 *
 * Verifies:
 * 1. deliveryNotes state exists and is bounded to 200 chars
 * 2. storeName/storeCode from settingsStore used for delivery address
 * 3. createOrder receives storeNotes and deliveryAddress params
 * 4. Delivery address display and notes input present in checkout modal
 */

import * as fs from "fs";
import * as path from "path";

const BUY_SCREEN_PATH = path.resolve(__dirname, "../../screens/v3/BuyScreenV3.tsx");
const ORDER_API_PATH = path.resolve(__dirname, "../../services/api/orderApi.ts");

describe("GCP-STG-0409: BUY checkout delivery address + notes", () => {
  let buyScreenSrc: string;
  let orderApiSrc: string;

  beforeAll(() => {
    buyScreenSrc = fs.readFileSync(BUY_SCREEN_PATH, "utf-8");
    orderApiSrc = fs.readFileSync(ORDER_API_PATH, "utf-8");
  });

  // --- UI State ---
  test("deliveryNotes state declared with empty default", () => {
    expect(buyScreenSrc).toContain('const [deliveryNotes, setDeliveryNotes] = useState("")');
  });

  test("deliveryNotes bounded to 200 characters via slice", () => {
    expect(buyScreenSrc).toContain("text.slice(0, 200)");
  });

  test("maxLength={200} set on TextInput", () => {
    expect(buyScreenSrc).toContain("maxLength={200}");
  });

  test("character counter displayed (deliveryNotes.length/200)", () => {
    expect(buyScreenSrc).toContain("{deliveryNotes.length}/200");
  });

  // --- Store identity ---
  test("useSettingsStore imported for store name", () => {
    expect(buyScreenSrc).toContain('import { useSettingsStore } from "../../stores/settingsStore"');
  });

  test("storeName read from settingsStore", () => {
    expect(buyScreenSrc).toContain("useSettingsStore((s) => s.storeName)");
  });

  test("storeCode read from settingsStore", () => {
    expect(buyScreenSrc).toContain("useSettingsStore((s) => s.storeCode)");
  });

  // --- Delivery address display ---
  test("delivery address displayed as read-only with testID", () => {
    expect(buyScreenSrc).toContain('testID="delivery-address-display"');
  });

  test("delivery address shows store name with code fallback", () => {
    expect(buyScreenSrc).toContain("storeName ?? 'Store'");
    expect(buyScreenSrc).toContain("storeCode ? ` (${storeCode})` : ''");
  });

  // --- Notes input ---
  test("delivery notes TextInput with testID present", () => {
    expect(buyScreenSrc).toContain('testID="delivery-notes-input"');
  });

  test("placeholder text set to Special instructions", () => {
    expect(buyScreenSrc).toContain('placeholder="Special instructions..."');
  });

  // --- createOrder integration ---
  test("createOrder called with storeNotes from deliveryNotes", () => {
    expect(buyScreenSrc).toContain("storeNotes: deliveryNotes.trim() || undefined");
  });

  test("createOrder called with deliveryAddress from store identity", () => {
    expect(buyScreenSrc).toContain("deliveryAddress: `${storeName ?? 'Store'}${storeCode ? ` (${storeCode})` : ''}`");
  });

  // --- Backend contract ---
  test("CreateOrderParams has storeNotes field", () => {
    expect(orderApiSrc).toContain("storeNotes?: string");
  });

  test("CreateOrderParams has deliveryAddress field", () => {
    expect(orderApiSrc).toContain("deliveryAddress?: string");
  });
});
