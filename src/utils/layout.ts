// STG-395: Responsive column count for grids
// STG-396: Cart sheet snap points for tablets vs phones
// STG-397: Safe area utilities
// STG-398: Modal max-width on tablets

import { getDeviceTypeFromDimensions, type DeviceType } from "./deviceType";

/**
 * STG-395: Responsive number of columns for product grids.
 * - Phones: 3 columns (or 2 if very narrow < 360dp)
 * - Tablets: 4-5 columns based on width
 * - POS: 2 columns (small screen)
 */
export function getResponsiveColumns(screenWidth: number, deviceType?: DeviceType): number {
  const dt = deviceType ?? getDeviceTypeFromDimensions(screenWidth, screenWidth);

  if (dt === "TABLET") {
    // 4 columns up to 800dp, 5 columns above
    return screenWidth >= 800 ? 5 : 4;
  }

  if (dt === "POS") {
    return 2;
  }

  // PHONE: 3 columns if >= 360dp, else 2
  return screenWidth >= 360 ? 3 : 2;
}

/**
 * STG-373 + STG-396: Cart sheet snap points based on device and screen width.
 * Returns [collapsed, mid, expanded] ratios.
 *
 * - Small phones (< 400dp): [0.55, 0.75, 0.95] (covers more screen)
 * - Regular phones: [0.42, 0.65, 0.95]
 * - Tablets: [0.30, 0.50, 0.75] (don't need full screen)
 */
export function getCartSheetSnapPoints(
  screenWidth: number,
  screenHeight: number,
  deviceType?: DeviceType
): { collapsed: number; mid: number; expanded: number } {
  const dt = deviceType ?? getDeviceTypeFromDimensions(screenWidth, screenHeight);
  const SMALL_SCREEN_WIDTH = 400;

  if (dt === "TABLET") {
    return { collapsed: 0.30, mid: 0.50, expanded: 0.75 };
  }

  if (screenWidth < SMALL_SCREEN_WIDTH) {
    // STG-373: Small devices get 55-75% coverage
    return { collapsed: 0.55, mid: 0.75, expanded: 0.95 };
  }

  // Regular phones
  return { collapsed: 0.42, mid: 0.65, expanded: 0.95 };
}

/**
 * STG-398: Modal max-width on tablets.
 * Returns the maximum width a modal should use.
 * - Tablets: 600dp max
 * - Phones/POS: full width (returns screenWidth)
 */
export function getModalMaxWidth(screenWidth: number, deviceType?: DeviceType): number {
  const dt = deviceType ?? getDeviceTypeFromDimensions(screenWidth, screenWidth);

  if (dt === "TABLET") {
    return Math.min(600, screenWidth - 32); // 600dp max with 16dp margin each side
  }

  return screenWidth;
}

/**
 * STG-398: Get modal container style for tablets.
 * Centers modal with max-width constraint.
 */
export function getModalContainerStyle(screenWidth: number, deviceType?: DeviceType): {
  maxWidth?: number;
  alignSelf?: "center";
  width?: "100%";
} {
  const dt = deviceType ?? getDeviceTypeFromDimensions(screenWidth, screenWidth);

  if (dt === "TABLET") {
    return {
      maxWidth: 600,
      alignSelf: "center",
      width: "100%",
    };
  }

  return {};
}

/**
 * STG-403: Detect if device is low-end based on pixel ratio.
 * Low-end devices typically have lower pixel ratios and smaller screens.
 */
export function isLowEndDevice(screenWidth: number, screenHeight: number): boolean {
  // Heuristic: small screen + low pixel density suggests low-end device
  const totalPixels = screenWidth * screenHeight;
  return totalPixels < 360 * 640; // Smaller than a typical budget phone
}
