/**
 * GCP-STG-0519: HidKeyboardCapture component tests
 * Verifies:
 * - Component renders a hidden TextInput on Android
 * - onChangeText calls feedHidText from hidScannerService
 * - Component returns null on iOS
 */
import React from "react";
import { Platform } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";

// Mock the hidScannerService
jest.mock("../../services/hidScannerService", () => ({
  feedHidText: jest.fn(),
  isHidScanInProgress: jest.fn(() => false),
}));

import { feedHidText, isHidScanInProgress } from "../../services/hidScannerService";
import { HidKeyboardCapture } from "../../components/HidKeyboardCapture";

describe("GCP-STG-0519: HidKeyboardCapture", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders hidden TextInput on Android", () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });

    const { getByTestId } = render(<HidKeyboardCapture />);
    const input = getByTestId("hid-keyboard-capture");
    expect(input).toBeTruthy();
    expect(input.props.showSoftInputOnFocus).toBe(false);

    Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
  });

  it("calls feedHidText on text change", () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });

    const { getByTestId } = render(<HidKeyboardCapture />);
    const input = getByTestId("hid-keyboard-capture");

    fireEvent.changeText(input, "8901234567890");
    expect(feedHidText).toHaveBeenCalledWith("8901234567890");

    Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
  });

  it("returns null on iOS", () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });

    const { toJSON } = render(<HidKeyboardCapture />);
    expect(toJSON()).toBeNull();

    Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
  });
});
