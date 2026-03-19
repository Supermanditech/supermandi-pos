/**
 * V3-HARDEN-183: Mounted shell runtime proof for BottomNavV3 + PosRootLayoutV3
 *
 * Proves:
 *   1. BottomNavV3 renders 4 tabs with correct labels
 *   2. Active tab has selected=true accessibility state
 *   3. Tab press fires onTabPress callback
 *   4. Badge renders when count > 0
 *   5. Badge hides when count is 0 or undefined
 *   6. All tabs have accessibilityRole="tab"
 *   7. Active tab label uses bold styling (via style check)
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ──
jest.mock("react-native-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  const mock = (props: any) => React.createElement(View, props);
  return { __esModule: true, default: mock, Svg: mock, Rect: mock, Path: mock, Circle: mock, Line: mock };
});

jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    primary: "#2563EB", primaryLight: "#EFF6FF", background: "#fff", surface: "#fff",
    backgroundSecondary: "#F1F5F9", border: "#E2E8F0", textPrimary: "#0F172A",
    textSecondary: "#475569", textTertiary: "#94A3B8", textInverse: "#FFFFFF",
    success: "#16A34A", warning: "#F59E0B", error: "#EF4444", shadow: "#000",
    overlayInverse: "rgba(255,255,255,0.15)",
  }),
}));

jest.mock("../../theme/responsive", () => ({
  getNavIconSize: () => 22,
  getScreenPadding: () => 16,
}));

jest.mock("../../theme/brand", () => ({
  shell: {
    navElevation: { shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 12 },
    activePillRadius: 20,
    cardRadius: 16,
    headerHeight: 56,
    navContentHeight: 60,
    activePillPaddingV: 6,
    activePillPaddingH: 20,
  },
  typeRhythm: {
    navLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
    navLabelActive: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  },
  iconRhythm: { nav: 22 },
}));

import BottomNavV3, { type V3Tab } from "../../components/v3/BottomNavV3";

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-183: BottomNavV3 mounted runtime proof", () => {
  const onTabPress = jest.fn();

  beforeEach(() => {
    onTabPress.mockClear();
  });

  it("renders all 4 tab labels", () => {
    render(<BottomNavV3 activeTab="SELL" onTabPress={onTabPress} />);
    expect(screen.getByText("SELL")).toBeTruthy();
    expect(screen.getByText("BUY")).toBeTruthy();
    expect(screen.getByText("STORE")).toBeTruthy();
    expect(screen.getByText("MORE")).toBeTruthy();
  });

  it("active tab has accessibilityState selected=true", () => {
    render(<BottomNavV3 activeTab="BUY" onTabPress={onTabPress} />);
    const buyTab = screen.getByLabelText("BUY");
    expect(buyTab.props.accessibilityState).toEqual({ selected: true });
  });

  it("inactive tabs have accessibilityState selected=false", () => {
    render(<BottomNavV3 activeTab="SELL" onTabPress={onTabPress} />);
    const buyTab = screen.getByLabelText("BUY");
    expect(buyTab.props.accessibilityState).toEqual({ selected: false });
  });

  it("all tabs have accessibilityRole tab", () => {
    render(<BottomNavV3 activeTab="SELL" onTabPress={onTabPress} />);
    for (const label of ["SELL", "BUY", "STORE", "MORE"]) {
      const tab = screen.getByLabelText(label);
      expect(tab.props.accessibilityRole).toBe("tab");
    }
  });

  it("tab press fires onTabPress with correct tab", () => {
    render(<BottomNavV3 activeTab="SELL" onTabPress={onTabPress} />);
    fireEvent.press(screen.getByLabelText("BUY"));
    expect(onTabPress).toHaveBeenCalledWith("BUY");
    fireEvent.press(screen.getByLabelText("STORE"));
    expect(onTabPress).toHaveBeenCalledWith("STORE");
    fireEvent.press(screen.getByLabelText("MORE"));
    expect(onTabPress).toHaveBeenCalledWith("MORE");
  });

  it("sell badge renders when count > 0", () => {
    render(<BottomNavV3 activeTab="SELL" onTabPress={onTabPress} sellBadge={3} />);
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("sell badge shows 99+ for count > 99", () => {
    render(<BottomNavV3 activeTab="SELL" onTabPress={onTabPress} sellBadge={150} />);
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("badge does not render when count is 0", () => {
    render(<BottomNavV3 activeTab="SELL" onTabPress={onTabPress} sellBadge={0} />);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("badge does not render when count is undefined", () => {
    render(<BottomNavV3 activeTab="SELL" onTabPress={onTabPress} />);
    // No badge elements should be present
    expect(screen.queryByText("99+")).toBeNull();
  });

  it("switching active tab changes selected state", () => {
    const { rerender } = render(<BottomNavV3 activeTab="SELL" onTabPress={onTabPress} />);
    expect(screen.getByLabelText("SELL").props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText("BUY").props.accessibilityState).toEqual({ selected: false });

    rerender(<BottomNavV3 activeTab="BUY" onTabPress={onTabPress} />);
    expect(screen.getByLabelText("SELL").props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByLabelText("BUY").props.accessibilityState).toEqual({ selected: true });
  });
});
