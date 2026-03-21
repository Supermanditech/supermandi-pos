// GCP-STG-0027: Voice input — "✓ Add" / Retry buttons + price display
import * as fs from "fs";
import * as path from "path";

const voicePath = path.resolve(__dirname, "../../components/v3/VoiceOverlayV3.tsx");
const voiceCode = fs.readFileSync(voicePath, "utf-8");

describe("GCP-STG-0027: Voice overlay result + action buttons", () => {
  test("matched state shows green checkmark + product name × qty", () => {
    expect(voiceCode).toContain("✓ {matchedProduct} × {matchedQty}");
  });

  test("matched state shows estimated price from product lookup", () => {
    expect(voiceCode).toContain("matchedPrice");
    expect(voiceCode).toContain("matchPrice");
  });

  test("Add button text includes ✓ prefix per prototype", () => {
    expect(voiceCode).toContain("✓ Add");
  });

  test("Retry button exists on matched state", () => {
    const matchedSection = voiceCode.slice(
      voiceCode.indexOf('state === "matched"'),
      voiceCode.indexOf('state === "error"')
    );
    expect(matchedSection).toContain("Retry");
    expect(matchedSection).toContain("handleRetry");
  });

  test("Retry button also exists on error state", () => {
    expect(voiceCode).toContain('state === "error"');
    const errorSection = voiceCode.slice(voiceCode.lastIndexOf('state === "error"'));
    expect(errorSection).toContain("handleRetry");
  });

  test("handleRetry resets all state including matchedPrice", () => {
    expect(voiceCode).toContain("setMatchedPrice(0)");
  });

  test("price is looked up from productsStore on match", () => {
    expect(voiceCode).toContain("useProductsStore.getState().products");
    expect(voiceCode).toContain("priceMatch?.priceMinor");
  });
});
