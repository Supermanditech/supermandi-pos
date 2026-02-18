/**
 * SCR-S1-HARDENING (S1-9): Comprehensive SplashScreen tests
 * Covers: render, navigation branches, error state, retry, timeout, a11y
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";

// Mock navigation
const mockReplace = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ replace: mockReplace }),
}));

// Mock services
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

const mockGetDeviceSession = jest.fn();
jest.mock("../../services/deviceSession", () => ({
  getDeviceSession: (...args: unknown[]) => mockGetDeviceSession(...args),
}));

jest.mock("react-native-svg", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props: any) => React.createElement("View", props),
    Path: (props: any) => React.createElement("View", props),
  };
});

import SplashScreen from "../../screens/SplashScreen";

describe("SplashScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetDeviceSession.mockResolvedValue({ deviceToken: "test-token", storeId: "store-1" });
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

  it("navigates to SellScan when session exists", async () => {
    mockGetDeviceSession.mockResolvedValue({ deviceToken: "t", storeId: "s" });
    render(<SplashScreen />);

    // Advance past splash duration
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
    // First call fails, second succeeds
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
    // Session never resolves (simulate hang)
    mockGetDeviceSession.mockImplementation(() => new Promise(() => {}));
    render(<SplashScreen />);

    // Advance past splash + session timeout (1s + 5s)
    act(() => { jest.advanceTimersByTime(6200); });

    await waitFor(() => {
      expect(screen.getByTestId("splash-error-card")).toBeTruthy();
    });
    expect(screen.getByText("Session check timed out")).toBeTruthy();
  });
});
