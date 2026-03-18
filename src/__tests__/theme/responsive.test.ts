/**
 * V3-FIX-107 / V3-HARDEN-114: Responsive primitives regression tests
 * Proves device class detection and layout token derivation.
 */
import {
  getDeviceClass, getGridColumns, getScreenPadding,
  getChipPadding, getChipFontSize, getModalMaxWidth,
  getNavIconSize, getHeaderSpacing,
} from "../../theme/responsive";

describe("V3-FIX-107: Device class detection", () => {
  it.each([
    [320, "compact-phone"], [340, "compact-phone"],
    [360, "phone"], [375, "phone"], [393, "phone"],
    [400, "large-phone"], [412, "large-phone"], [430, "large-phone"],
    [480, "handheld-pos"], [540, "handheld-pos"],
    [600, "wide-pos"], [768, "wide-pos"], [800, "wide-pos"],
  ])("width %d → %s", (width, expected) => {
    expect(getDeviceClass(width)).toBe(expected);
  });
});

describe("V3-FIX-108: Grid columns by device", () => {
  it("compact-phone gets 2 columns", () => expect(getGridColumns(320)).toBe(2));
  it("phone gets 3 columns", () => expect(getGridColumns(375)).toBe(3));
  it("large-phone gets 3 columns", () => expect(getGridColumns(412)).toBe(3));
  it("handheld-pos gets 4 columns", () => expect(getGridColumns(480)).toBe(4));
  it("wide-pos gets 5 columns", () => expect(getGridColumns(600)).toBe(5));
});

describe("V3-DELETE-113: No fixed 3-column assumption", () => {
  it("getGridColumns never returns fixed 3 for all widths", () => {
    const results = [320, 375, 480, 600].map(getGridColumns);
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1); // Proves adaptive, not fixed
  });
});

describe("V3-HARDEN-111: Layout tokens scale by device", () => {
  it("screen padding grows with device class", () => {
    expect(getScreenPadding(320)).toBeLessThan(getScreenPadding(600));
  });
  it("chip padding grows with device class", () => {
    expect(getChipPadding(320)).toBeLessThanOrEqual(getChipPadding(600));
  });
  it("chip font size is at least 11 on compact", () => {
    expect(getChipFontSize(320)).toBeGreaterThanOrEqual(11);
  });
  it("modal max width caps at 500", () => {
    expect(getModalMaxWidth(800)).toBe(500);
    expect(getModalMaxWidth(400)).toBeLessThanOrEqual(400);
  });
  it("nav icon size scales", () => {
    expect(getNavIconSize(320)).toBeLessThan(getNavIconSize(600));
  });
  it("header spacing scales", () => {
    expect(getHeaderSpacing(320)).toBeLessThan(getHeaderSpacing(600));
  });
});

describe("V3-HARDEN-114: All device classes produce valid layout values", () => {
  const widths = [320, 360, 400, 480, 600, 800];
  for (const w of widths) {
    it(`width ${w} produces valid grid/padding/chip values`, () => {
      const cols = getGridColumns(w);
      const pad = getScreenPadding(w);
      const chipPad = getChipPadding(w);
      const chipFont = getChipFontSize(w);
      const modal = getModalMaxWidth(w);
      const nav = getNavIconSize(w);
      const header = getHeaderSpacing(w);
      expect(cols).toBeGreaterThanOrEqual(2);
      expect(cols).toBeLessThanOrEqual(5);
      expect(pad).toBeGreaterThan(0);
      expect(chipPad).toBeGreaterThan(0);
      expect(chipFont).toBeGreaterThanOrEqual(11);
      expect(modal).toBeGreaterThan(0);
      expect(modal).toBeLessThanOrEqual(500);
      expect(nav).toBeGreaterThanOrEqual(20);
      expect(header).toBeGreaterThan(0);
    });
  }
});
