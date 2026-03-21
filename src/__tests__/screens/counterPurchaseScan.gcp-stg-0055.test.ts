// GCP-STG-0055: Counter Purchase scan buttons wired
import * as fs from "fs";
import * as path from "path";

const cpPath = path.resolve(__dirname, "../../screens/v3/CounterPurchaseScreenV3.tsx");
const cpCode = fs.readFileSync(cpPath, "utf-8");

const wrapperPath = path.resolve(__dirname, "../../screens/v3/V3ScreenWrappers.tsx");
const wrapperCode = fs.readFileSync(wrapperPath, "utf-8");

describe("GCP-STG-0055: Counter Purchase scan buttons wired", () => {
  test("Camera Scan button has onPress handler", () => {
    expect(cpCode).toContain('accessibilityLabel="Camera scan" onPress=');
  });

  test("Camera Scan calls onCameraScan prop", () => {
    expect(cpCode).toContain("onCameraScan()");
  });

  test("HID Scanner button has onPress handler", () => {
    expect(cpCode).toContain('accessibilityLabel="HID scanner" onPress=');
  });

  test("HID Scanner focuses barcode input", () => {
    expect(cpCode).toContain("barcodeInputRef.current?.focus()");
  });

  test("barcode TextInput has ref attached", () => {
    expect(cpCode).toContain("ref={barcodeInputRef}");
  });

  test("onCameraScan is optional prop", () => {
    expect(cpCode).toContain("onCameraScan?: () => void");
  });

  test("wrapper passes onCameraScan navigating to V3Scan with counter_purchase context", () => {
    expect(wrapperCode).toContain('onCameraScan={() => nav.navigate("V3Scan", { context: "counter_purchase_scan" })');
  });
});
