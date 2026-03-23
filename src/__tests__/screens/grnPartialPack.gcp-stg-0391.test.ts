// GCP-STG-0391: Broken Carton / Partial Pack Handling in GRN
// Verifies damagedQty field, landed qty calculation, preview text, and short-count adjustment
import * as fs from "fs";
import * as path from "path";

const grnPath = path.resolve(__dirname, "../../screens/v3/GRNScreenV3.tsx");
const grnCode = fs.readFileSync(grnPath, "utf-8");

describe("GCP-STG-0391: GRNItem type has damagedQty field", () => {
  test("GRNItem type includes damagedQty: number", () => {
    expect(grnCode).toContain("damagedQty: number;");
  });

  test("damagedQty defaults to 0 when loading items", () => {
    expect(grnCode).toContain("damagedQty: 0,");
  });
});

describe("GCP-STG-0391: Damaged/missing TextInput per line item", () => {
  test("TextInput for damaged qty exists with numeric keyboardType", () => {
    expect(grnCode).toContain('keyboardType="numeric"');
    expect(grnCode).toContain("damagedInput");
  });

  test("Damaged input has testID for testing", () => {
    expect(grnCode).toContain("testID={`damaged-qty-${idx}`}");
  });

  test("Damaged input only shown when item is checked and received > 0", () => {
    expect(grnCode).toContain("item.checked && item.received > 0");
  });

  test("changeDamaged callback parses int and clamps to >= 0", () => {
    expect(grnCode).toContain("parseInt(text, 10)");
    expect(grnCode).toContain("parsed < 0 ? 0 : parsed");
  });

  test("Damaged label text present", () => {
    expect(grnCode).toContain("Damaged/missing:");
  });
});

describe("GCP-STG-0391: Landed qty calculation", () => {
  test("PROCUREMENT unit: grossLanded = received * procurementPackQty", () => {
    expect(grnCode).toContain("item.received * (item.procurementPackQty ?? 1)");
  });

  test("BASE unit: grossLanded = received (no multiplication)", () => {
    expect(grnCode).toContain("alreadyBase ? item.received : item.received * (item.procurementPackQty ?? 1)");
  });

  test("netLanded = grossLanded - damagedQty, clamped to 0", () => {
    expect(grnCode).toContain("Math.max(0, grossLanded - item.damagedQty)");
  });

  test("Submit handler subtracts damagedQty from landedQty", () => {
    expect(grnCode).toContain("const landedQty = Math.max(0, grossLanded - item.damagedQty)");
  });
});

describe("GCP-STG-0391: Landed qty preview text", () => {
  test("Bulk item preview shows multiplication and damage", () => {
    // e.g., "5 x 24 = 120, minus 1 damaged = 119 landed"
    expect(grnCode).toContain("minus ${item.damagedQty} damaged = ${netLanded}");
  });

  test("Base item preview shows subtraction", () => {
    expect(grnCode).toContain("${item.received} minus ${item.damagedQty} damaged = ${netLanded} landed");
  });
});

describe("GCP-STG-0391: Short count adjustment on submit", () => {
  test("Filters damaged items from received items", () => {
    expect(grnCode).toContain("receivedItems.filter(item => item.damagedQty > 0)");
  });

  test("Creates adjustment entries with negative quantity", () => {
    expect(grnCode).toContain("quantity: -item.damagedQty");
  });

  test("Uses transactionType 'adjustment'", () => {
    expect(grnCode).toContain('transactionType: "adjustment"');
  });

  test("Uses grn_short_count in notes", () => {
    expect(grnCode).toContain("grn_short_count:");
  });

  test("GRN-SHORT reference ID prefix", () => {
    expect(grnCode).toContain("`GRN-SHORT-${Date.now()}`");
  });

  test("Adjustment failure is non-fatal (catch with console.warn)", () => {
    expect(grnCode).toContain("Short count ledger entry failed (non-fatal)");
  });

  test("GRN notes include damaged count when > 0", () => {
    expect(grnCode).toContain("damaged/missing`");
  });
});

describe("GCP-STG-0391: Footer short count summary", () => {
  test("Footer shows total damaged count", () => {
    expect(grnCode).toContain("Short count:");
    expect(grnCode).toContain("damaged/missing across");
  });

  test("Match All resets damagedQty to 0", () => {
    expect(grnCode).toContain("damagedQty: 0 }))");
  });
});

describe("GCP-STG-0391: Styles exist", () => {
  test("damagedRow style defined", () => {
    expect(grnCode).toContain("damagedRow:");
  });

  test("damagedLabel style defined", () => {
    expect(grnCode).toContain("damagedLabel:");
  });

  test("damagedInput style defined", () => {
    expect(grnCode).toContain("damagedInput:");
  });

  test("landedPreview style defined", () => {
    expect(grnCode).toContain("landedPreview:");
  });
});
