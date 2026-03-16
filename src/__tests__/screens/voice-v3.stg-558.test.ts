/**
 * STG-558: Voice input v3 — always-accessible mic button + overlay
 */
import * as fs from "fs";
import * as path from "path";

describe("STG-558: VoiceOverlayV3", () => {
  test("VoiceOverlayV3 has listening, processing, matched states", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/VoiceOverlayV3.tsx"), "utf8");
    expect(src).toContain('"listening"');
    expect(src).toContain('"processing"');
    expect(src).toContain('"matched"');
    expect(src).toContain("transcript");
    expect(src).toContain("matchedProduct");
  });

  test("has confirm and retry buttons", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/VoiceOverlayV3.tsx"), "utf8");
    expect(src).toContain("Add to Cart");
    expect(src).toContain("Try Again");
    expect(src).toContain("handleConfirm");
    expect(src).toContain("handleRetry");
  });

  test("shows Hindi + English language hint", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/VoiceOverlayV3.tsx"), "utf8");
    expect(src).toContain("Hindi + English");
    expect(src).toContain("Maggi teen");
    expect(src).toContain("bill karo");
  });

  test("has animated pulse on mic icon", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/VoiceOverlayV3.tsx"), "utf8");
    expect(src).toContain("pulseAnim");
    expect(src).toContain("Animated.loop");
  });

  test("SellScreenV3 has voice state and mic button connected", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/SellScreenV3.tsx"), "utf8");
    expect(src).toContain("VoiceOverlayV3");
    expect(src).toContain("voiceVisible");
    expect(src).toContain("setVoiceVisible(true)");
    expect(src).toContain("onProductMatched");
  });
});
