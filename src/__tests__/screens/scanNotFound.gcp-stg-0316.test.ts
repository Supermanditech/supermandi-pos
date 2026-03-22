// GCP-STG-0316: Scan not-found "Search by Name" fallback button
import * as fs from "fs";
import * as path from "path";

const scanPath = path.resolve(__dirname, "../../screens/v3/ScanScreenV3.tsx");
const scanCode = fs.readFileSync(scanPath, "utf-8");

const wrappersPath = path.resolve(__dirname, "../../screens/v3/V3ScreenWrappers.tsx");
const wrappersCode = fs.readFileSync(wrappersPath, "utf-8");

const sellPath = path.resolve(__dirname, "../../screens/v3/SellScreenV3.tsx");
const sellCode = fs.readFileSync(sellPath, "utf-8");

const buyPath = path.resolve(__dirname, "../../screens/v3/BuyScreenV3.tsx");
const buyCode = fs.readFileSync(buyPath, "utf-8");

const triggerStorePath = path.resolve(__dirname, "../../stores/searchTriggerStore.ts");
const triggerStoreCode = fs.readFileSync(triggerStorePath, "utf-8");

describe("GCP-STG-0316: Scan not-found Search by Name fallback", () => {
  describe("ScanScreenV3 — Search by Name button", () => {
    test("onSearchByName prop exists in ScanScreenV3Props type", () => {
      expect(scanCode).toContain("onSearchByName?:");
    });

    test("Search by Name button has testID", () => {
      expect(scanCode).toContain('testID="scan-search-by-name-btn"');
    });

    test("Search by Name button has accessible label", () => {
      expect(scanCode).toContain('accessibilityLabel="Search by name"');
    });

    test("Search by Name calls onSearchByName with barcode then onClose", () => {
      expect(scanCode).toContain("onSearchByName(lastResult.barcode)");
      expect(scanCode).toContain("onClose()");
    });

    test("searchByNameBtn style exists", () => {
      expect(scanCode).toContain("searchByNameBtn:");
      expect(scanCode).toContain("searchByNameBtnText:");
    });

    test("Search by Name button only renders when onSearchByName is provided", () => {
      expect(scanCode).toContain("onSearchByName ?");
    });

    test("existing Continue and New Product buttons still present", () => {
      expect(scanCode).toContain('testID="scan-continue-btn"');
      expect(scanCode).toContain('testID="scan-new-product-btn"');
    });
  });

  describe("searchTriggerStore — reactive search handoff", () => {
    test("store exports useSearchTriggerStore", () => {
      expect(triggerStoreCode).toContain("export const useSearchTriggerStore");
    });

    test("store has triggerSearch and clearTrigger actions", () => {
      expect(triggerStoreCode).toContain("triggerSearch:");
      expect(triggerStoreCode).toContain("clearTrigger:");
    });

    test("store tracks missedBarcode and timestamp", () => {
      expect(triggerStoreCode).toContain("missedBarcode:");
      expect(triggerStoreCode).toContain("timestamp:");
    });
  });

  describe("V3ScanWrapper — passes onSearchByName", () => {
    test("wrapper passes onSearchByName prop to ScanScreenV3", () => {
      expect(wrappersCode).toContain("onSearchByName=");
    });

    test("wrapper triggers searchTriggerStore on search-by-name", () => {
      expect(wrappersCode).toContain("useSearchTriggerStore");
      expect(wrappersCode).toContain("triggerSearch(barcode)");
    });

    test("wrapper navigates back after triggering search", () => {
      // The onSearchByName handler should call nav.goBack()
      const searchByNameBlock = wrappersCode.split("onSearchByName=")[1]?.split("/>")[0] ?? "";
      expect(searchByNameBlock).toContain("nav.goBack()");
    });
  });

  describe("SellScreenV3 — reacts to search trigger", () => {
    test("imports useSearchTriggerStore", () => {
      expect(sellCode).toContain("useSearchTriggerStore");
    });

    test("subscribes to searchTriggerBarcode and timestamp", () => {
      expect(sellCode).toContain("searchTriggerBarcode");
      expect(sellCode).toContain("searchTriggerTimestamp");
    });

    test("opens search overlay (setSearchVisible) on trigger", () => {
      expect(sellCode).toContain("setSearchVisible(true)");
    });

    test("clears trigger after consuming", () => {
      expect(sellCode).toContain("clearTrigger()");
    });
  });

  describe("BuyScreenV3 — scan miss shows Alert with Search by Name", () => {
    test("imports Alert from react-native", () => {
      expect(buyCode).toMatch(/import\s*\{[^}]*Alert[^}]*\}\s*from\s*["']react-native["']/);
    });

    test("shows Alert.alert on scan-not-found instead of toast-only", () => {
      expect(buyCode).toContain('Alert.alert(');
      expect(buyCode).toContain('"Product Not Found"');
    });

    test("Alert offers Search by Name option", () => {
      expect(buyCode).toContain('"Search by Name"');
    });

    test("Alert offers Dismiss option", () => {
      expect(buyCode).toContain('"Dismiss"');
    });

    test("search input has ref for programmatic focus", () => {
      expect(buyCode).toContain("searchInputRef");
      expect(buyCode).toContain("useRef<TextInput>");
    });

    test("Search by Name focuses search input", () => {
      expect(buyCode).toContain("searchInputRef.current?.focus()");
    });

    test("BuyScreenV3 also subscribes to searchTriggerStore", () => {
      expect(buyCode).toContain("useSearchTriggerStore");
      expect(buyCode).toContain("searchTriggerBarcode");
      expect(buyCode).toContain("clearTrigger()");
    });

    test("search TextInput has ref attached", () => {
      expect(buyCode).toContain("ref={searchInputRef}");
    });
  });
});
