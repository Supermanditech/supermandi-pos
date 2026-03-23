/**
 * GCP-STG-0393: NewProductScreenV3 — Constrain Unit Input to Valid Picker
 *
 * Verifies the free-text unit TextInput has been replaced with a constrained
 * picker that only allows canonical units from VALID_UNITS.
 */
import * as fs from "fs";
import * as path from "path";

const SRC_PATH = path.resolve(__dirname, "../../screens/v3/NewProductScreenV3.tsx");

describe("GCP-STG-0393: Unit picker constraint", () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(SRC_PATH, "utf8");
  });

  test("exports VALID_UNITS array with all 12 canonical units", () => {
    expect(src).toContain("export const VALID_UNITS");
    const units = ["PCS", "KG", "GM", "LTR", "ML", "DOZEN", "BOTTLE", "PACK", "BOX", "CARTON", "CASE", "BAG"];
    for (const u of units) {
      expect(src).toContain(`"${u}"`);
    }
  });

  test("exports ValidUnit type", () => {
    expect(src).toContain("export type ValidUnit");
  });

  test("unit state defaults to PCS (uppercase canonical)", () => {
    expect(src).toContain('useState<ValidUnit>("PCS")');
  });

  test("does NOT have a free-text TextInput for unit field", () => {
    // The old pattern: <TextInput ... value={unit} onChangeText={setUnit} placeholder="pcs"
    // Must NOT exist anymore
    const hasFreetextUnit = /TextInput[^>]*value=\{unit\}[^>]*onChangeText=\{setUnit\}/.test(src);
    expect(hasFreetextUnit).toBe(false);
  });

  test("has a Pressable trigger for unit picker with testID", () => {
    expect(src).toContain('testID="unit-picker-trigger"');
  });

  test("has a Modal for unit selection", () => {
    expect(src).toContain("unitPickerVisible");
    expect(src).toContain("<Modal");
    expect(src).toContain("Select Unit");
  });

  test("renders unit options via FlatList with testIDs", () => {
    expect(src).toContain("FlatList");
    expect(src).toContain("unit-option-");
  });

  test("product mode PACKAGED sets unit to PCS (canonical)", () => {
    expect(src).toContain('setUnit("PCS"); setBaseStockUnit("PCS")');
  });

  test("product mode LOOSE_BULK sets unit to KG (canonical)", () => {
    expect(src).toContain('setUnit("KG"); setBaseStockUnit("KG")');
  });

  test("picker styles exist", () => {
    expect(src).toContain("pickerOverlay");
    expect(src).toContain("pickerContainer");
    expect(src).toContain("pickerItem");
    expect(src).toContain("pickerItemSelected");
  });
});
