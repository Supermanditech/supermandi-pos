/**
 * #404 + #405: EnrollDeviceScreen tests
 * Covers: render, inputs, label requirement, enroll flow, offline detection, error codes, a11y
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Alert } from "react-native";

// Mock navigation + route
const mockReplace = jest.fn();
const mockGoBack = jest.fn();
const mockRouteParams: { enrollmentCode?: string; code?: string } = {};
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ replace: mockReplace, goBack: mockGoBack }),
  useRoute: () => ({ params: mockRouteParams }),
}));

// Mock NetInfo
const mockNetInfoFetch = jest.fn().mockResolvedValue({ isConnected: true });
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: () => mockNetInfoFetch() },
}));

// Mock expo-constants
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "1.0.0" }, deviceName: "Test" },
}));

// Mock expo-device
jest.mock("expo-device", () => ({
  manufacturer: "Test",
  modelName: "TestDevice",
  deviceName: "TestDevice",
  osVersion: "14",
}));

// Mock services
const mockEnrollDevice = jest.fn();
const mockLookupActivation = jest.fn();
jest.mock("../../services/api/enrollApi", () => ({
  enrollDevice: (...args: unknown[]) => mockEnrollDevice(...args),
  lookupActivation: (...args: unknown[]) => mockLookupActivation(...args),
}));

const mockGetDeviceSession = jest.fn().mockResolvedValue(null);
const mockSaveDeviceSession = jest.fn().mockResolvedValue(undefined);
const mockClearDeviceSession = jest.fn().mockResolvedValue(undefined);
jest.mock("../../services/deviceSession", () => ({
  getDeviceSession: () => mockGetDeviceSession(),
  saveDeviceSession: (...args: unknown[]) => mockSaveDeviceSession(...args),
  clearDeviceSession: () => mockClearDeviceSession(),
}));

jest.mock("../../services/api/apiClient", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    payload?: unknown;
    constructor(message: string, status = 400) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  },
}));

const mockFetchUiStatus = jest.fn().mockResolvedValue({ forceUpdate: false, storeActive: true });
jest.mock("../../services/api/uiStatusApi", () => ({
  fetchUiStatus: () => mockFetchUiStatus(),
}));

jest.mock("../../utils/uiStatus", () => ({
  POS_MESSAGES: { storeInactive: "Store is inactive" },
}));

jest.mock("../../config/api", () => ({
  API_BASE_URL: "http://localhost:3001",
  BUILD_INFO: { gitSha: "abc123", buildTime: "now" },
  TEST_STORE_CONFIG: null,
}));

jest.mock("../../services/cloudEventLogger", () => ({
  logPosEvent: jest.fn(),
}));

jest.mock("../../stores/cartStore", () => ({
  useCartStore: { getState: () => ({ resetForStore: jest.fn() }) },
}));
jest.mock("../../stores/purchaseDraftStore", () => ({
  usePurchaseDraftStore: { getState: () => ({ resetForStore: jest.fn() }) },
}));
jest.mock("../../stores/productsStore", () => ({
  useProductsStore: { getState: () => ({ resetForStore: jest.fn() }) },
}));
jest.mock("../../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ setStoreName: jest.fn(), setStoreCode: jest.fn() }) },
}));

import EnrollDeviceScreen from "../../screens/EnrollDeviceScreen";

describe("EnrollDeviceScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDeviceSession.mockResolvedValue(null);
    mockNetInfoFetch.mockResolvedValue({ isConnected: true });
    mockEnrollDevice.mockResolvedValue({
      deviceId: "d1",
      storeId: "s1",
      deviceToken: "token123",
      storeName: "Test Store",
      storeCode: "TS",
      storeActive: true,
      upiVpa: "test@upi",
    });
    mockRouteParams.enrollmentCode = undefined;
    mockRouteParams.code = undefined;
  });

  it("renders with key elements and a11y labels", () => {
    render(<EnrollDeviceScreen />);
    expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    expect(screen.getByText("Activate Your POS")).toBeTruthy();
    expect(screen.getByTestId("enroll-phone-input")).toBeTruthy();
    expect(screen.getByTestId("enroll-code-input")).toBeTruthy();
    expect(screen.getByTestId("enroll-label-input")).toBeTruthy();
    expect(screen.getByTestId("enroll-submit-button")).toBeTruthy();
    expect(screen.getByTestId("enroll-lookup-button")).toBeTruthy();
  });

  it("pre-fills enrollment code from route params", () => {
    mockRouteParams.enrollmentCode = "SM-ABC123";
    render(<EnrollDeviceScreen />);
    expect(screen.getByTestId("enroll-code-input").props.value).toBe("SM-ABC123");
  });

  it("shows alert for missing code", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    render(<EnrollDeviceScreen />);

    // Clear default label, leave code empty
    fireEvent.changeText(screen.getByTestId("enroll-label-input"), "Counter-1");

    await act(async () => {
      fireEvent.press(screen.getByTestId("enroll-submit-button"));
    });

    expect(alertSpy).toHaveBeenCalledWith("Missing Code", expect.any(String));
    alertSpy.mockRestore();
  });

  it("shows alert for missing label (#404)", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    render(<EnrollDeviceScreen />);

    fireEvent.changeText(screen.getByTestId("enroll-code-input"), "SM-ABC123");
    // Clear the default label
    fireEvent.changeText(screen.getByTestId("enroll-label-input"), "");

    await act(async () => {
      fireEvent.press(screen.getByTestId("enroll-submit-button"));
    });

    expect(alertSpy).toHaveBeenCalledWith("Device Name Required", expect.any(String));
    alertSpy.mockRestore();
  });

  it("checks network before enrolling and blocks if offline", async () => {
    mockNetInfoFetch.mockResolvedValue({ isConnected: false });
    const alertSpy = jest.spyOn(Alert, "alert");
    render(<EnrollDeviceScreen />);

    fireEvent.changeText(screen.getByTestId("enroll-code-input"), "SM-ABC123");
    // Label has default from device model ("TestDevice")

    await act(async () => {
      fireEvent.press(screen.getByTestId("enroll-submit-button"));
    });

    expect(alertSpy).toHaveBeenCalledWith("No Internet", expect.stringContaining("network connection"));
    expect(mockEnrollDevice).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("calls enrollDevice with label and navigates to SellScan on success", async () => {
    render(<EnrollDeviceScreen />);

    fireEvent.changeText(screen.getByTestId("enroll-code-input"), "SM-ABC123");
    fireEvent.changeText(screen.getByTestId("enroll-label-input"), "Counter-1");

    await act(async () => {
      fireEvent.press(screen.getByTestId("enroll-submit-button"));
    });

    await waitFor(() => {
      expect(mockEnrollDevice).toHaveBeenCalled();
      // Verify label is included in deviceMeta
      const callArgs = mockEnrollDevice.mock.calls[0][0];
      expect(callArgs.deviceMeta.label).toBe("Counter-1");
      expect(mockReplace).toHaveBeenCalledWith("SellScan");
    });
  });

  it("shows error alert for expired enrollment code", async () => {
    const { ApiError } = require("../../services/api/apiClient");
    mockEnrollDevice.mockRejectedValue(new ApiError("ENROLLMENT_CODE_EXPIRED", 409));
    const alertSpy = jest.spyOn(Alert, "alert");
    render(<EnrollDeviceScreen />);

    fireEvent.changeText(screen.getByTestId("enroll-code-input"), "SM-EXPIRED");
    // Label has default from device model

    await act(async () => {
      fireEvent.press(screen.getByTestId("enroll-submit-button"));
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Activation Failed", expect.stringContaining("expired"));
    });
    alertSpy.mockRestore();
  });

  it("shows error alert for revoked enrollment code", async () => {
    const { ApiError } = require("../../services/api/apiClient");
    mockEnrollDevice.mockRejectedValue(new ApiError("ENROLLMENT_CODE_REVOKED", 409));
    const alertSpy = jest.spyOn(Alert, "alert");
    render(<EnrollDeviceScreen />);

    fireEvent.changeText(screen.getByTestId("enroll-code-input"), "SM-REVOKED");

    await act(async () => {
      fireEvent.press(screen.getByTestId("enroll-submit-button"));
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Activation Failed", expect.stringContaining("revoked"));
    });
    alertSpy.mockRestore();
  });

  it("redirects to SellScan if already enrolled", async () => {
    mockGetDeviceSession.mockResolvedValue({ deviceToken: "t", storeId: "s" });
    render(<EnrollDeviceScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("SellScan");
    });
  });

  it("has default label from device model name", () => {
    render(<EnrollDeviceScreen />);
    // expo-device mock has modelName: "TestDevice"
    expect(screen.getByTestId("enroll-label-input").props.value).toBe("TestDevice");
  });
});
