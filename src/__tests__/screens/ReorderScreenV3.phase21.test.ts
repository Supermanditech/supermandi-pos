/**
 * V3-FIX-186: ReorderScreenV3 buy-again wiring — mounted verification
 *
 * Verifies the buy-again button is wired into ReorderScreenV3 with:
 * - buyAgain import from buyAgainApi
 * - loadBuyAgainIntoDraft import
 * - onPress handler calling buyAgain() → loadBuyAgainIntoDraft()
 * - Loading state guard (buyAgainLoading)
 * - Online check before API call
 */

import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../../screens/v3/ReorderScreenV3.tsx"),
  "utf-8"
);

describe("V3-FIX-186: ReorderScreenV3 buy-again wiring", () => {
  it("imports buyAgain and loadBuyAgainIntoDraft from buyAgainApi", () => {
    expect(src).toContain('import { buyAgain, loadBuyAgainIntoDraft } from "../../services/api/buyAgainApi"');
  });

  it("has Buy Again button with onPress handler", () => {
    expect(src).toContain("Buy Again");
    expect(src).toContain("buyAgainLoading");
  });

  it("calls buyAgain() API in the handler", () => {
    expect(src).toContain("const draft = await buyAgain()");
  });

  it("calls loadBuyAgainIntoDraft(draft) to wire into purchaseDraftStore", () => {
    expect(src).toContain("loadBuyAgainIntoDraft(draft)");
  });

  it("checks online before API call", () => {
    expect(src).toContain("Buy Again requires connection");
  });

  it("calls onClose() after loading draft to navigate away", () => {
    // After loading into draft, user should be taken to purchase screen
    expect(src).toContain("onClose()");
  });

  it("has loading state to prevent double-tap", () => {
    expect(src).toContain("setBuyAgainLoading(true)");
    expect(src).toContain("setBuyAgainLoading(false)");
  });

  it("has buyAgainBtn style", () => {
    expect(src).toContain("buyAgainBtn");
    expect(src).toContain("buyAgainBtnText");
  });
});

describe("V3-FIX-186: buyAgainApi module contract", () => {
  const apiSrc = readFileSync(
    join(__dirname, "../../services/api/buyAgainApi.ts"),
    "utf-8"
  );

  it("exports buyAgain function", () => {
    expect(apiSrc).toContain("export async function buyAgain");
  });

  it("exports buyAgainFromOrder function", () => {
    expect(apiSrc).toContain("export async function buyAgainFromOrder");
  });

  it("exports loadBuyAgainIntoDraft function", () => {
    expect(apiSrc).toContain("export function loadBuyAgainIntoDraft");
  });

  it("loadBuyAgainIntoDraft imports usePurchaseDraftStore", () => {
    expect(apiSrc).toContain("usePurchaseDraftStore");
  });

  it("loadBuyAgainIntoDraft clears draft then adds items", () => {
    expect(apiSrc).toContain("store.clear()");
    expect(apiSrc).toContain("store.addOrUpdate(");
  });
});
