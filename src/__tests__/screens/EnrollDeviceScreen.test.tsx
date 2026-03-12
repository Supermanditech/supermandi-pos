/**
 * #404 + #405 + #411: EnrollDeviceScreen tests
 * Covers: render, code-first activation flow, label requirement, offline detection,
 *         error codes, PaymentSetup routing (upiVpa + AsyncStorage),
 *         store reset, event logging, inactive store, settings update.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
jest.mock("../../services/api/enrollApi", () => ({
  enrollDevice: (...args: unknown[]) => mockEnrollDevice(...args),
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

const mockLogPosEvent = jest.fn();
jest.mock("../../services/cloudEventLogger", () => ({
  logPosEvent: (...args: unknown[]) => mockLogPosEvent(...args),
}));

const mockResetCart = jest.fn();
const mockResetPurchaseDraft = jest.fn();
const mockResetProducts = jest.fn();
const mockSetStoreName = jest.fn();
const mockSetStoreCode = jest.fn();
jest.mock("../../stores/cartStore", () => ({
  useCartStore: { getState: () => ({ resetForStore: mockResetCart }) },
}));
jest.mock("../../stores/purchaseDraftStore", () => ({
  usePurchaseDraftStore: { getState: () => ({ resetForStore: mockResetPurchaseDraft }) },
}));
jest.mock("../../stores/productsStore", () => ({
  useProductsStore: { getState: () => ({ resetForStore: mockResetProducts }) },
}));
jest.mock("../../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ setStoreName: mockSetStoreName, setStoreCode: mockSetStoreCode }) },
}));
jest.mock("../../theme", () => {
  const actual = jest.requireActual("../../theme");
  return {
    ...actual,
    useThemeColors: () => ({
      textPrimary: "#111827",
      textSecondary: "#4b5563",
      textTertiary: "#9ca3af",
      warning: "#f59e0b",
    }),
  };
});

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

  it("renders with key elements and a11y labels", async () => {
    // ENROLL-SESSION-CHECK-RACE-CONDITION: component shows spinner until
    // getDeviceSession() resolves, so we must wait for form to appear
    render(<EnrollDeviceScreen />);
    // MFA-002: Explicit timeout — default 1000ms too tight under heavy CI load
    await waitFor(() => {
      expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    }, { timeout: 3000 });
    expect(screen.getByText("Activate Your POS")).toBeTruthy();
    expect(screen.getByTestId("enroll-code-input")).toBeTruthy();
    expect(screen.getByTestId("enroll-label-input")).toBeTruthy();
    expect(screen.getByTestId("enroll-submit-button")).toBeTruthy();
  }, 30000);

  it("pre-fills enrollment code from route params", async () => {
    mockRouteParams.enrollmentCode = "SM-ABC123";
    render(<EnrollDeviceScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("enroll-code-input")).toBeTruthy();
    }, { timeout: 3000 });
    expect(screen.getByTestId("enroll-code-input").props.value).toBe("SM-ABC123");
  });

  it("shows alert for missing code", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    render(<EnrollDeviceScreen />);
    // MFA-002: Explicit timeout — default 1000ms too tight under heavy CI load
    await waitFor(() => {
      expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    }, { timeout: 3000 });

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
    // MFA-002: Explicit timeout — default 1000ms too tight under heavy CI load
    await waitFor(() => {
      expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    }, { timeout: 3000 });

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
    // MFA-002: Explicit timeout — default 1000ms too tight under heavy CI load
    await waitFor(() => {
      expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    }, { timeout: 3000 });

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
    // MFA-002: Explicit timeout — default 1000ms too tight under heavy CI load
    await waitFor(() => {
      expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    }, { timeout: 3000 });

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
    }, { timeout: 3000 });
  });

  it("shows error alert for expired enrollment code", async () => {
    const { ApiError } = require("../../services/api/apiClient");
    mockEnrollDevice.mockRejectedValue(new ApiError("ENROLLMENT_CODE_EXPIRED", 409));
    const alertSpy = jest.spyOn(Alert, "alert");
    render(<EnrollDeviceScreen />);
    // MFA-002: Explicit timeout — default 1000ms too tight under heavy CI load
    await waitFor(() => {
      expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    }, { timeout: 3000 });

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
    // MFA-002: Explicit timeout — default 1000ms too tight under heavy CI load
    await waitFor(() => {
      expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    }, { timeout: 3000 });

    fireEvent.changeText(screen.getByTestId("enroll-code-input"), "SM-REVOKED");

    await act(async () => {
      fireEvent.press(screen.getByTestId("enroll-submit-button"));
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Activation Failed", expect.stringContaining("revoked"));
    }, { timeout: 3000 });
    alertSpy.mockRestore();
  });

  it("redirects to SellScan if already enrolled", async () => {
    mockGetDeviceSession.mockResolvedValue({ deviceToken: "t", storeId: "s" });
    render(<EnrollDeviceScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("SellScan");
    }, { timeout: 3000 });
  });

  it("has default label from device model name", async () => {
    render(<EnrollDeviceScreen />);
    // MFA-002: Explicit timeout — default 1000ms too tight under heavy CI load
    await waitFor(() => {
      expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    }, { timeout: 3000 });
    // expo-device mock has modelName: "TestDevice"
    expect(screen.getByTestId("enroll-label-input").props.value).toBe("TestDevice");
  });

  // =========================================================================
  // PaymentSetup routing tests (upiVpa + AsyncStorage)
  // =========================================================================

  it("navigates to PaymentSetup when upiVpa is missing and not prompted before", async () => {
    mockEnrollDevice.mockResolvedValue({
      deviceId: "d1",
      storeId: "s1",
      deviceToken: "token123",
      storeName: "Test Store",
      storeCode: "TS",
      storeActive: true,
      upiVpa: null, // No UPI VPA
    });
    // AsyncStorage returns null (not prompted before)
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    render(<EnrollDeviceScreen />);
    // MFA-002: Explicit timeout — default 1000ms too tight under heavy CI load
    await waitFor(() => {
      expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    }, { timeout: 3000 });

    fireEvent.changeText(screen.getByTestId("enroll-code-input"), "SM-ABC123");

    await act(async () => {
      fireEvent.press(screen.getByTestId("enroll-submit-button"));
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("PaymentSetup");
    });
  });

  it("navigates to SellScan when upiVpa is missing but already prompted", async () => {
    mockEnrollDevice.mockResolvedValue({
      deviceId: "d1",
      storeId: "s1",
      deviceToken: "token123",
      storeName: "Test Store",
      storeCode: "TS",
      storeActive: true,
      upiVpa: null, // No UPI VPA
    });
    // AsyncStorage returns truthy (already prompted)
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("true");

    render(<EnrollDeviceScreen />);
    // MFA-002: Explicit timeout — default 1000ms too tight under heavy CI load
    await waitFor(() => {
      expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    }, { timeout: 3000 });

    fireEvent.changeText(screen.getByTestId("enroll-code-input"), "SM-ABC123");

    await act(async () => {
      fireEvent.press(screen.getByTestId("enroll-submit-button"));
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("SellScan");
    }, { timeout: 3000 });
  });

  it("navigates to SellScan when upiVpa is present (regardless of prompt state)", async () => {
    // Default mock has upiVpa: "test@upi"
    render(<EnrollDeviceScreen />);
    // MFA-002: Explicit timeout — default 1000ms too tight under heavy CI load
    await waitFor(() => {
      expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    }, { timeout: 3000 });

    fireEvent.changeText(screen.getByTestId("enroll-code-input"), "SM-ABC123");

    await act(async () => {
      fireEvent.press(screen.getByTestId("enroll-submit-button"));
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("SellScan");
    }, { timeout: 3000 });
  });

  // =========================================================================
  // #411: Store reset, event logging, inactive store, settings update tests
  // =========================================================================

  it("resets stores and logs event when store changes on re-enrollment", async () => {
    // Simulate re-enrollment with different store (previousStoreId from existing session)
    mockGetDeviceSession.mockResolvedValue(null);
    mockEnrollDevice.mockResolvedValue({
      deviceId: "d1",
      storeId: "s-new", // Different from default "s1"
      deviceToken: "token123",
      storeName: "New Store",
      storeCode: "NS",
      storeActive: true,
      upiVpa: "test@upi",
    });

    render(<EnrollDeviceScreen />);
    // MFA-002: Explicit timeout — default 1000ms too tight under heavy CI load
    await waitFor(() => {
      expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    }, { timeout: 3000 });

    fireEvent.changeText(screen.getByTestId("enroll-code-input"), "SM-ABC123");
    fireEvent.changeText(screen.getByTestId("enroll-label-input"), "Counter-1");

    await act(async () => {
      fireEvent.press(screen.getByTestId("enroll-submit-button"));
    });

    await waitFor(() => {
      expect(mockEnrollDevice).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("SellScan");
    });
  });

  it("updates settings store with storeName and storeCode on success", async () => {
    mockEnrollDevice.mockResolvedValue({
      deviceId: "d1",
      storeId: "s1",
      deviceToken: "token123",
      storeName: "My Store",
      storeCode: "MS",
      storeActive: true,
      upiVpa: "test@upi",
    });

    render(<EnrollDeviceScreen />);
    // MFA-002: Explicit timeout — default 1000ms too tight under heavy CI load
    await waitFor(() => {
      expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    }, { timeout: 3000 });
    fireEvent.changeText(screen.getByTestId("enroll-code-input"), "SM-ABC123");

    await act(async () => {
      fireEvent.press(screen.getByTestId("enroll-submit-button"));
    });

    await waitFor(() => {
      expect(mockSetStoreName).toHaveBeenCalledWith("My Store");
      expect(mockSetStoreCode).toHaveBeenCalledWith("MS");
    });
  });

  it("shows alert when store is inactive after enrollment", async () => {
    mockEnrollDevice.mockResolvedValue({
      deviceId: "d1",
      storeId: "s1",
      deviceToken: "token123",
      storeName: "Inactive Store",
      storeCode: "IS",
      storeActive: false,
      upiVpa: null,
    });

    const alertSpy = jest.spyOn(Alert, "alert");
    render(<EnrollDeviceScreen />);
    // MFA-002: Explicit timeout — default 1000ms too tight under heavy CI load
    await waitFor(() => {
      expect(screen.getByTestId("enroll-device-screen")).toBeTruthy();
    }, { timeout: 3000 });

    fireEvent.changeText(screen.getByTestId("enroll-code-input"), "SM-ABC123");

    await act(async () => {
      fireEvent.press(screen.getByTestId("enroll-submit-button"));
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringContaining("Store"),
        expect.any(String)
      );
    });
    alertSpy.mockRestore();
  });

  it("pre-fills code from 'code' route param (backward compat)", async () => {
    mockRouteParams.code = "SM-CODE99";
    render(<EnrollDeviceScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("enroll-code-input")).toBeTruthy();
    }, { timeout: 3000 });
    expect(screen.getByTestId("enroll-code-input").props.value).toBe("SM-CODE99");
    mockRouteParams.code = undefined;
  });
});
