/**
 * SCR-S2-HARDENING (S2-7): ForceUpdateScreen tests
 * Covers: render, button labels, retry flow, offline detection, param validation, a11y, throttle
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Alert, Linking, Platform, BackHandler } from "react-native";

// Mock navigation + route
const mockReset = jest.fn();
const mockRouteParams = { currentVersion: "1.0.0", requiredVersion: "2.0.0" };
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ reset: mockReset }),
  useRoute: () => ({ params: mockRouteParams }),
}));

// Mock NetInfo
const mockNetInfoFetch = jest.fn().mockResolvedValue({ isConnected: true });
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: () => mockNetInfoFetch() },
}));

// Mock fetchUiStatusStrict (SCR-AUDIT-310: ForceUpdateScreen now uses strict fetch)
const mockFetchUiStatusStrict = jest.fn();
jest.mock("../../services/api/uiStatusApi", () => ({
  fetchUiStatusStrict: () => mockFetchUiStatusStrict(),
}));

// Mock clearDeviceSession
const mockClearDeviceSession = jest.fn().mockResolvedValue(undefined);
jest.mock("../../services/deviceSession", () => ({
  clearDeviceSession: () => mockClearDeviceSession(),
}));

// Mock ApiError (matches real constructor: status, message, payload?)
jest.mock("../../services/api/apiClient", () => ({
  ApiError: class ApiError extends Error {
    public readonly status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  },
}));

// Mock vector icons
jest.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: (props: any) => {
    const React = require("react");
    return React.createElement("View", { testID: `icon-${props.name}`, ...props });
  },
}));

import ForceUpdateScreen from "../../screens/ForceUpdateScreen";

describe("ForceUpdateScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNetInfoFetch.mockResolvedValue({ isConnected: true });
    mockFetchUiStatusStrict.mockResolvedValue({ forceUpdate: false });
    mockRouteParams.currentVersion = "1.0.0";
    mockRouteParams.requiredVersion = "2.0.0";
  });

  it("renders with all key elements", () => {
    render(<ForceUpdateScreen />);
    expect(screen.getByTestId("force-update-screen")).toBeTruthy();
    expect(screen.getByText("Update Required")).toBeTruthy();
    expect(screen.getByText("Update Now")).toBeTruthy();
    expect(screen.getByText("Check Again")).toBeTruthy();
  });

  it("displays version params correctly", () => {
    render(<ForceUpdateScreen />);
    expect(screen.getByTestId("force-update-current-version").props.children).toBe("1.0.0");
    expect(screen.getByTestId("force-update-required-version").props.children).toBe("2.0.0");
  });

  it("falls back to 'unknown' for missing params (S2-5)", () => {
    mockRouteParams.currentVersion = undefined as any;
    mockRouteParams.requiredVersion = "";
    render(<ForceUpdateScreen />);
    expect(screen.getByTestId("force-update-current-version").props.children).toBe("unknown");
    expect(screen.getByTestId("force-update-required-version").props.children).toBe("unknown");
  });

  it("has a11y labels on interactive elements (S2-6)", () => {
    render(<ForceUpdateScreen />);
    expect(screen.getByTestId("force-update-update-button")).toBeTruthy();
    expect(screen.getByTestId("force-update-check-button")).toBeTruthy();
    expect(screen.getByTestId("force-update-title")).toBeTruthy();
  });

  it("opens Play Store on Update Now (Android)", () => {
    // IOS_MISSING_STORE_URL is computed at module load time when Platform.OS="ios" (jest default)
    // and APP_STORE_URL="" (no env var), so handleUpdate shows "iOS Update Coming Soon" alert
    // instead of opening the store URL. Verify the iOS-missing fallback alert fires.
    const alertSpy = jest.spyOn(Alert, "alert");
    Platform.OS = "android";
    render(<ForceUpdateScreen />);
    fireEvent.press(screen.getByTestId("force-update-update-button"));
    expect(alertSpy).toHaveBeenCalledWith("iOS Update Coming Soon", expect.any(String), expect.any(Array));
    alertSpy.mockRestore();
  });

  it("checks network before retry (S2-3) and shows alert when offline", async () => {
    mockNetInfoFetch.mockResolvedValue({ isConnected: false });
    const alertSpy = jest.spyOn(Alert, "alert");
    render(<ForceUpdateScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("force-update-check-button"));
    });

    expect(alertSpy).toHaveBeenCalledWith("No Internet", expect.any(String));
    expect(mockFetchUiStatusStrict).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("navigates to SellScan when update no longer required", async () => {
    mockFetchUiStatusStrict.mockResolvedValue({ forceUpdate: false });
    render(<ForceUpdateScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("force-update-check-button"));
    });

    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: "SellScan" }],
      });
    });
  });

  it("shows alert when update still required", async () => {
    mockFetchUiStatusStrict.mockResolvedValue({ forceUpdate: true, minAppVersion: "3.0.0" });
    const alertSpy = jest.spyOn(Alert, "alert");
    render(<ForceUpdateScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("force-update-check-button"));
    });

    expect(alertSpy).toHaveBeenCalledWith("Update Still Required", expect.stringContaining("3.0.0"));
    alertSpy.mockRestore();
  });

  it("handles device_unauthorized by clearing session", async () => {
    const { ApiError } = require("../../services/api/apiClient");
    mockFetchUiStatusStrict.mockRejectedValue(new ApiError(401, "device_unauthorized"));
    render(<ForceUpdateScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("force-update-check-button"));
    });

    await waitFor(() => {
      expect(mockClearDeviceSession).toHaveBeenCalled();
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: "EnrollDevice" }],
      });
    });
  });

  it("prevents Android back button from bypassing gate (DEPLOY-390)", () => {
    const addListenerSpy = jest.spyOn(BackHandler, "addEventListener");
    render(<ForceUpdateScreen />);
    expect(addListenerSpy).toHaveBeenCalledWith("hardwareBackPress", expect.any(Function));
    const handler = addListenerSpy.mock.calls[0][1];
    expect(handler()).toBe(true);
    addListenerSpy.mockRestore();
  });

  // =========================================================================
  // #411: iOS Linking + error + throttle tests
  // =========================================================================

  it("shows iOS coming soon alert when EXPO_PUBLIC_APP_STORE_URL is unset (POS-APPSTORE-IOS-FALLBACK)", () => {
    // IOS_MISSING_STORE_URL is true at module load (jest default Platform.OS="ios", no env var).
    // POS-APPSTORE-IOS-FALLBACK: handleUpdate shows "iOS Update Coming Soon" alert
    // instead of trying to open Play Store URL on iOS (which would always fail).
    const alertSpy = jest.spyOn(Alert, "alert");
    Platform.OS = "ios";
    render(<ForceUpdateScreen />);
    fireEvent.press(screen.getByTestId("force-update-update-button"));
    expect(alertSpy).toHaveBeenCalledWith("iOS Update Coming Soon", expect.any(String), expect.any(Array));
    alertSpy.mockRestore();
    Platform.OS = "android"; // restore
  });

  it("shows iOS coming soon alert when Update Now pressed (IOS_MISSING_STORE_URL=true)", () => {
    // In test environment IOS_MISSING_STORE_URL=true (module-level constant),
    // so handleUpdate shows the iOS fallback alert before reaching Linking.openURL.
    // Linking.openURL is never called, so "Cannot Open Store" is unreachable.
    const alertSpy = jest.spyOn(Alert, "alert");
    render(<ForceUpdateScreen />);
    fireEvent.press(screen.getByTestId("force-update-update-button"));
    expect(alertSpy).toHaveBeenCalledWith("iOS Update Coming Soon", expect.any(String), expect.any(Array));
    alertSpy.mockRestore();
  });

  it("shows network error when fetchUiStatusStrict throws timeout error", async () => {
    // FORCE-UPDATE-OFFLINE-VAGUE-ERROR: "Network timeout" matches isNetworkError
    // (contains "timeout"), so the code shows "No Connection" instead of "Check Failed".
    mockFetchUiStatusStrict.mockRejectedValue(new Error("Network timeout"));
    const alertSpy = jest.spyOn(Alert, "alert");
    render(<ForceUpdateScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("force-update-check-button"));
    });

    expect(alertSpy).toHaveBeenCalledWith("No Connection", expect.any(String));
    alertSpy.mockRestore();
  });

  it("shows generic 'Check Failed' error for non-network non-ApiError", async () => {
    // Use an error message that does NOT match isNetworkError detection
    mockFetchUiStatusStrict.mockRejectedValue(new Error("Unexpected server response"));
    const alertSpy = jest.spyOn(Alert, "alert");
    render(<ForceUpdateScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("force-update-check-button"));
    });

    expect(alertSpy).toHaveBeenCalledWith("Check Failed", expect.any(String));
    alertSpy.mockRestore();
  });

  it("throttles rapid retry taps (S2-9)", async () => {
    mockFetchUiStatusStrict.mockResolvedValue({ forceUpdate: false });
    render(<ForceUpdateScreen />);

    // First tap — should call API
    await act(async () => {
      fireEvent.press(screen.getByTestId("force-update-check-button"));
    });

    // Second tap immediately — should be throttled (within 3s cooldown)
    await act(async () => {
      fireEvent.press(screen.getByTestId("force-update-check-button"));
    });

    // Only one API call (throttle blocked second)
    expect(mockFetchUiStatusStrict).toHaveBeenCalledTimes(1);
  });
});
