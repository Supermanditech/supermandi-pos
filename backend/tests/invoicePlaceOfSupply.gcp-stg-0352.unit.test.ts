// GCP-STG-0352: Invoice PDF "Place of Supply" field — GST compliance Rule 46
// Tests: derivePlaceOfSupply helper + InvoicePdfData.placeOfSupply field

import { derivePlaceOfSupply } from "../src/services/invoicePdfService";

describe("GCP-STG-0352: derivePlaceOfSupply", () => {
  it("returns explicit placeOfSupply when provided", () => {
    const result = derivePlaceOfSupply("Karnataka (29)", "27AABCU9603R1ZM", "29AABCU9603R1ZM");
    expect(result).toBe("Karnataka (29)");
  });

  it("derives state from buyerGstin first 2 digits (Maharashtra = 27)", () => {
    const result = derivePlaceOfSupply(undefined, "27AABCU9603R1ZM");
    expect(result).toBe("Maharashtra (27)");
  });

  it("derives state from buyerGstin (Karnataka = 29)", () => {
    const result = derivePlaceOfSupply(undefined, "29AABCU9603R1ZM");
    expect(result).toBe("Karnataka (29)");
  });

  it("derives state from buyerGstin (Delhi = 07)", () => {
    const result = derivePlaceOfSupply(undefined, "07AABCU9603R1ZM");
    expect(result).toBe("Delhi (07)");
  });

  it("derives state from buyerGstin (Tamil Nadu = 33)", () => {
    const result = derivePlaceOfSupply(undefined, "33AABCU9603R1ZM");
    expect(result).toBe("Tamil Nadu (33)");
  });

  it("falls back to sellerGstin when buyerGstin is absent", () => {
    const result = derivePlaceOfSupply(undefined, undefined, "24AABCU9603R1ZM");
    expect(result).toBe("Gujarat (24)");
  });

  it("prefers buyerGstin over sellerGstin", () => {
    const result = derivePlaceOfSupply(undefined, "27AABCU9603R1ZM", "29AABCU9603R1ZM");
    expect(result).toBe("Maharashtra (27)");
  });

  it("returns null when no GSTIN and no explicit value", () => {
    const result = derivePlaceOfSupply(undefined, undefined, undefined);
    expect(result).toBeNull();
  });

  it("returns null for empty GSTIN strings", () => {
    const result = derivePlaceOfSupply(undefined, "", "");
    expect(result).toBeNull();
  });

  it("returns null for unrecognized state code (e.g. 99)", () => {
    const result = derivePlaceOfSupply(undefined, "99AABCU9603R1ZM");
    expect(result).toBeNull();
  });

  it("handles short GSTIN (less than 2 chars) gracefully", () => {
    const result = derivePlaceOfSupply(undefined, "2");
    expect(result).toBeNull();
  });

  it("returns explicit placeOfSupply even when GSTINs are absent", () => {
    const result = derivePlaceOfSupply("West Bengal (19)");
    expect(result).toBe("West Bengal (19)");
  });

  it("covers all 37 valid state codes", () => {
    const expectedStates: Record<string, string> = {
      "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
      "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
      "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
      "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
      "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
      "16": "Tripura", "17": "Meghalaya", "18": "Assam",
      "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
      "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
      "25": "Daman and Diu", "26": "Dadra and Nagar Haveli", "27": "Maharashtra",
      "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
      "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
      "35": "Andaman and Nicobar", "36": "Telangana", "37": "Andhra Pradesh",
      "38": "Ladakh",
    };

    for (const [code, name] of Object.entries(expectedStates)) {
      const gstin = `${code}AABCU9603R1ZM`;
      const result = derivePlaceOfSupply(undefined, gstin);
      expect(result).toBe(`${name} (${code})`);
    }
  });
});
