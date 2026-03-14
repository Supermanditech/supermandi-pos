// STG-393: Device type detection utility
// STG-394: Touch target minimum sizing for small phones
// Returns "POS" | "PHONE" | "TABLET" based on screen dimensions

import { Dimensions, Platform, PixelRatio } from "react-native";

export type DeviceType = "POS" | "PHONE" | "TABLET";

// Thresholds in dp (density-independent pixels)
const TABLET_MIN_WIDTH_DP = 600;
const TABLET_MIN_HEIGHT_DP = 600;
// POS terminals typically have small screens with high density
const POS_MAX_WIDTH_DP = 360;
const POS_MAX_HEIGHT_DP = 640;

/**
 * STG-393: Detect device type based on screen dimensions.
 * - TABLET: both width and height >= 600dp
 * - POS: small-screen Android device (< 360dp width and < 640dp height)
 * - PHONE: everything else
 */
export function getDeviceType(): DeviceType {
  const { width, height } = Dimensions.get("window");
  const minDim = Math.min(width, height);
  const maxDim = Math.max(width, height);

  // Tablets have smallest dimension >= 600dp
  if (minDim >= TABLET_MIN_WIDTH_DP && maxDim >= TABLET_MIN_HEIGHT_DP) {
    return "TABLET";
  }

  // POS terminals: small Android screens
  if (Platform.OS === "android" && minDim <= POS_MAX_WIDTH_DP && maxDim <= POS_MAX_HEIGHT_DP) {
    return "POS";
  }

  return "PHONE";
}

/**
 * STG-393: Get device type from explicit dimensions (for reactive use in components).
 */
export function getDeviceTypeFromDimensions(width: number, height: number): DeviceType {
  const minDim = Math.min(width, height);
  const maxDim = Math.max(width, height);

  if (minDim >= TABLET_MIN_WIDTH_DP && maxDim >= TABLET_MIN_HEIGHT_DP) {
    return "TABLET";
  }

  if (Platform.OS === "android" && minDim <= POS_MAX_WIDTH_DP && maxDim <= POS_MAX_HEIGHT_DP) {
    return "POS";
  }

  return "PHONE";
}

/**
 * STG-394: Minimum touch target size for accessibility.
 * Returns 48dp on phones (above the 44dp minimum), standard on tablets/POS.
 */
export function minTouchSize(deviceType?: DeviceType): number {
  const dt = deviceType ?? getDeviceType();
  // PHONE gets 48dp (above WCAG 44dp minimum), TABLET/POS use 44dp
  return dt === "PHONE" ? 48 : 44;
}

/**
 * STG-394: Get minimum touch target style (width + height).
 * Use with spread: style={[yourStyle, minTouchStyle(deviceType)]}
 */
export function minTouchStyle(deviceType?: DeviceType): { minWidth: number; minHeight: number } {
  const size = minTouchSize(deviceType);
  return { minWidth: size, minHeight: size };
}

/**
 * STG-393: Check if device is a tablet.
 */
export function isTablet(deviceType?: DeviceType): boolean {
  return (deviceType ?? getDeviceType()) === "TABLET";
}

/**
 * STG-393: Check if device is a phone.
 */
export function isPhone(deviceType?: DeviceType): boolean {
  return (deviceType ?? getDeviceType()) === "PHONE";
}
