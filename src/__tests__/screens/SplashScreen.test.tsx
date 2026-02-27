/**
 * SCR-AUDIT-310 + #407: Comprehensive SplashScreen tests
 * Covers: render, navigation branches (SellScan, EnrollDevice, ForceUpdate, DeviceBlocked),
 *         error state, retry, timeout, BackHandler, a11y
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import { BackHandler } from "react-native";

// Mock navigation
const mockReplace = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ replace: mockReplace }),
}));

// Mock services — boot infra (non-blocking)
jest.mock("../../services/cloudEventLogger", () => ({
  startCloudEventLogger: jest.fn(),
}));
jest.mock("../../services/printerService", () => ({
  printerService: {
    initialize: jest.fn().mockResolvedValue(true),
  },
}));
jest.mock("../../services/syncService", () => ({
  startAutoSync: jest.fn(),
}));
jest.mock("../../services/offline/localDb", () => ({
  initOfflineDb: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/offline/sync", () => ({
  syncOutbox: jest.fn().mockResolvedValue(undefined),
}));

// Mock deviceSession
const mockGetDeviceSession = jest.fn();
jest.mock("../../services/deviceSession", () => ({
  getDeviceSession: (...args: unknown[]) => mockGetDeviceSession(...args),
}));

// Mock uiStatusApi — fetchUiStatus called after session check
const mockFetchUiStatus = jest.fn().mockResolvedValue({ forceUpdate: false, storeActive: true });
jest.mock("../../services/api/uiStatusApi", () => ({
  fetchUiStatus: () => mockFetchUiStatus(),
}));

// Mock deviceInfo — getDeviceMeta called for appVersion
jest.mock("../../services/deviceInfo", () => ({
  getDeviceMeta: () => ({ appVersion: "1.0.0" }),
}));

// Mock react-native-svg (BrandShortmark uses Svg, Rect, Circle)
jest.mock("react-native-svg", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props: any) => React.createElement("View", props),
    Path: (props: any) => React.createElement("View", props),
    Rect: (props: any) => React.createElement("View", props),
    Circle: (props: any) => React.createElement("View", props),
  };
});

import SplashScreen from "../../screens/SplashScreen";

describe("SplashScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetDeviceSession.mockResolvedValue({ deviceToken: "test-token", storeId: "store-1" });
    mockFetchUiStatus.mockResolvedValue({ forceUpdate: false, storeActive: true, deviceActive: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders brand name and loading indicator", () => {
    render(<SplashScreen />);
    expect(screen.getByText("SuperMandi")).toBeTruthy();
    expect(screen.getByText("POS")).toBeTruthy();
    expect(screen.getByTestId("splash-loader")).toBeTruthy();
  });

  it("has correct a11y labels on loading state", () => {
    render(<SplashScreen />);
    expect(screen.getByTestId("splash-screen")).toBeTruthy();
    expect(screen.getByTestId("splash-brand-name")).toBeTruthy();
  });

  it("navigates to SellScan when session exists and no force update", async () => {
    mockGetDeviceSession.mockResolvedValue({ deviceToken: "t", storeId: "s" });
    mockFetchUiStatus.mockResolvedValue({ forceUpdate: false, deviceActive: true });
    render(<SplashScreen />);

    act(() => { jest.advanceTimersByTime(1100); });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("SellScan");
    });
  });

  it("navigates to EnrollDevice when no session", async () => {
    mockGetDeviceSession.mockResolvedValue(null);
    render(<SplashScreen />);

    act(() => { jest.advanceTimersByTime(1100); });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("EnrollDevice");
    });
  });

  it("navigates to ForceUpdate when forceUpdate is true", async () => {
    mockGetDeviceSession.mockResolvedValue({ deviceToken: "t", storeId: "s" });
    mockFetchUiStatus.mockResolvedValue({ forceUpdate: true, minAppVersion: "2.0.0" });
    render(<SplashScreen />);

    act(() => { jest.advanceTimersByTime(1100); });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("ForceUpdate", expect.objectContaining({
        currentVersion: "1.0.0",
      }));
    });
  });

  it("navigates to DeviceBlocked when deviceActive is false", async () => {
    mockGetDeviceSession.mockResolvedValue({ deviceToken: "t", storeId: "s" });
    mockFetchUiStatus.mockResolvedValue({ forceUpdate: false, deviceActive: false });
    render(<SplashScreen />);

    act(() => { jest.advanceTimersByTime(1100); });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("DeviceBlocked");
    });
  });

  it("proceeds to SellScan when fetchUiStatus throws (offline-first)", async () => {
    mockGetDeviceSession.mockResolvedValue({ deviceToken: "t", storeId: "s" });
    mockFetchUiStatus.mockRejectedValue(new Error("Network error"));
    render(<SplashScreen />);

    act(() => { jest.advanceTimersByTime(1100); });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("SellScan");
    });
  });

  it("shows error state when getDeviceSession rejects", async () => {
    mockGetDeviceSession.mockRejectedValue(new Error("SecureStore locked"));
    render(<SplashScreen />);

    act(() => { jest.advanceTimersByTime(1100); });

    await waitFor(() => {
      expect(screen.getByTestId("splash-error-card")).toBeTruthy();
    });
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("SecureStore locked")).toBeTruthy();
  });

  it("retry button resets error and re-checks session", async () => {
    mockGetDeviceSession
      .mockRejectedValueOnce(new Error("Fail"))
      .mockResolvedValueOnce({ deviceToken: "t", storeId: "s" });

    render(<SplashScreen />);
    act(() => { jest.advanceTimersByTime(1100); });

    await waitFor(() => {
      expect(screen.getByTestId("splash-retry-button")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("splash-retry-button"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("SellScan");
    });
  });

  it("skip button navigates to EnrollDevice", async () => {
    mockGetDeviceSession.mockRejectedValue(new Error("Fail"));
    render(<SplashScreen />);

    act(() => { jest.advanceTimersByTime(1100); });

    await waitFor(() => {
      expect(screen.getByTestId("splash-skip-button")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("splash-skip-button"));
    expect(mockReplace).toHaveBeenCalledWith("EnrollDevice");
  });

  it("shows error on session timeout", async () => {
    mockGetDeviceSession.mockImplementation(() => new Promise(() => {}));
    render(<SplashScreen />);

    // Advance past splash + session timeout (1s + 5s)
    act(() => { jest.advanceTimersByTime(6200); });

    await waitFor(() => {
      expect(screen.getByTestId("splash-error-card")).toBeTruthy();
    });
    expect(screen.getByText("Session check timed out")).toBeTruthy();
  });

  it("prevents Android back button during splash (#405)", () => {
    const addListenerSpy = jest.spyOn(BackHandler, "addEventListener");
    render(<SplashScreen />);
    expect(addListenerSpy).toHaveBeenCalledWith("hardwareBackPress", expect.any(Function));
    // Verify the handler returns true (blocks back)
    const handler = addListenerSpy.mock.calls[0][1];
    expect(handler()).toBe(true);
    addListenerSpy.mockRestore();
  });
});
