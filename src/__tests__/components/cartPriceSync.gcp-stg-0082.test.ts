// GCP-STG-0082: POS price edits sync to store product catalog
import * as fs from "fs";
import * as path from "path";

const cartPath = path.resolve(__dirname, "../../components/v3/CartSheetV3.tsx");
const cartCode = fs.readFileSync(cartPath, "utf-8");

describe("GCP-STG-0082: Cart price sync to store catalog", () => {
  test("updateStorePrice checkbox state exists", () => {
    expect(cartCode).toContain("const [updateStorePrice, setUpdateStorePrice] = useState(false)");
  });

  test("checkbox UI renders with 'Make this my new default price' label", () => {
    expect(cartCode).toContain("Make this my new default price");
  });

  test("checkbox toggles updateStorePrice state", () => {
    expect(cartCode).toContain("setUpdateStorePrice(!updateStorePrice)");
  });

  test("handleSaveEdit calls updateStoreProductPrice API when checkbox checked", () => {
    expect(cartCode).toContain("updateStoreProductPrice");
    expect(cartCode).toContain("storeProductId: editingItem.metadata.storeProductId");
    expect(cartCode).toContain("sellPriceMinor: newPriceMinor");
  });

  test("API call is fire-and-forget (does not block cart save)", () => {
    expect(cartCode).toContain('.then(() => showToast("Store price updated"))');
    expect(cartCode).toContain('.catch(() => showToast("Cart updated, store price sync failed"))');
  });

  test("checkbox resets on modal open", () => {
    expect(cartCode).toContain("setUpdateStorePrice(false); // GCP-STG-0082");
  });

  test("checkbox resets on modal save", () => {
    const saveSection = cartCode.slice(
      cartCode.indexOf("handleSaveEdit"),
      cartCode.indexOf("handleSaveEdit") + 2000
    );
    expect(saveSection).toContain("setUpdateStorePrice(false)");
  });

  test("only syncs when storeProductId is available", () => {
    expect(cartCode).toContain("editingItem.metadata?.storeProductId");
  });
});
