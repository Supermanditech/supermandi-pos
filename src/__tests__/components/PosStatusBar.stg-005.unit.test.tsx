/**
 * STG-005: PosStatusBar — Declutter status icons, staff indicator (STG-017)
 *
 * Tests: icon rendering, network/printer/scanner/camera states,
 *        staff name/role display, store name, time display
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";

// Mock NetInfo
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn((cb: any) => {
    cb({ isConnected: true, isInternetReachable: true });
    return jest.fn();
  }),
}));

// Mock vector icons — return simple View with testID
jest.mock("@expo/vector-icons", () => {
  const { View } = require("react-native");
  return {
    MaterialCommunityIcons: ({ name, ...rest }: any) => {
      const React = require("react");
      return React.createElement(View, { testID: `icon-${name}` });
    },
  };
});

// Mock uiStatus
jest.mock("../../utils/uiStatus", () => ({
  composePosMessage: jest.fn(() => "Ready"),
  getPrimaryTone: jest.fn(() => "success"),
}));

// Mock storeName
jest.mock("../../utils/storeName", () => ({
  formatStoreName: jest.fn((name: string) => name || "Store"),
}));

import PosStatusBar from "../../components/PosStatusBar";

describe("STG-005: PosStatusBar declutter + STG-017 staff indicator", () => {
  describe("Core rendering", () => {
    it("renders status bar container", () => {
      render(<PosStatusBar />);
      // Should render without crashing
      expect(screen.getByTestId("status-bar-store-name")).toBeTruthy();
    });

    it("renders store name when provided", () => {
      render(<PosStatusBar storeName="Test Kirana" />);
      expect(screen.getByTestId("status-bar-store-name")).toBeTruthy();
    });

    it("renders time display", () => {
      render(<PosStatusBar />);
      expect(screen.getByTestId("status-bar-time")).toBeTruthy();
    });

    it("renders icon labels (Net, Print, Scan, Cam)", () => {
      render(<PosStatusBar />);
      expect(screen.getByText("Net")).toBeTruthy();
      expect(screen.getByText("Print")).toBeTruthy();
      expect(screen.getByText("Scan")).toBeTruthy();
      expect(screen.getByText("Cam")).toBeTruthy();
    });
  });

  describe("Printer icon states", () => {
    it("shows printer icon when connected", () => {
      render(<PosStatusBar printerOk={true} />);
      expect(screen.getByTestId("icon-printer")).toBeTruthy();
    });

    it("shows printer-off icon when disconnected", () => {
      render(<PosStatusBar printerOk={false} />);
      expect(screen.getByTestId("icon-printer-off")).toBeTruthy();
    });
  });

  describe("Scanner icon states", () => {
    it("shows barcode-scan icon when detected", () => {
      render(<PosStatusBar scannerOk={true} />);
      expect(screen.getByTestId("icon-barcode-scan")).toBeTruthy();
    });

    it("shows barcode-off icon when not detected", () => {
      render(<PosStatusBar scannerOk={false} />);
      expect(screen.getByTestId("icon-barcode-off")).toBeTruthy();
    });
  });

  describe("Camera icon states", () => {
    it("shows camera icon when available", () => {
      render(<PosStatusBar cameraAvailable={true} />);
      expect(screen.getByTestId("icon-camera")).toBeTruthy();
    });

    it("shows camera-off icon when unavailable", () => {
      render(<PosStatusBar cameraAvailable={false} />);
      expect(screen.getByTestId("icon-camera-off")).toBeTruthy();
    });
  });

  describe("STG-017: Staff indicator", () => {
    it("shows staff name when provided", () => {
      render(<PosStatusBar staffName="Raju" />);
      const staffEl = screen.getByTestId("status-bar-staff");
      expect(staffEl).toBeTruthy();
    });

    it("hides staff display when no staffName", () => {
      render(<PosStatusBar staffName={null} />);
      expect(screen.queryByTestId("status-bar-staff")).toBeNull();
    });

    it("shows staff name with role when both provided", () => {
      render(<PosStatusBar staffName="Raju" staffRole="MANAGER" />);
      const staffEl = screen.getByTestId("status-bar-staff");
      expect(staffEl).toBeTruthy();
    });
  });

  describe("Store code display", () => {
    it("shows store code when provided", () => {
      render(<PosStatusBar storeCode="SU260305-003" />);
      expect(screen.getByText("SU260305-003")).toBeTruthy();
    });

    it("shows truncated storeId when no storeCode", () => {
      render(<PosStatusBar storeId="aedbd94c-1d60-4290-bfbd-6ad099439d91" />);
      // Last 8 chars of UUID
      expect(screen.getByText("99439d91")).toBeTruthy();
    });
  });
});
