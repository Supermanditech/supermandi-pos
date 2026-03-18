/**
 * V3-FIX-107: Shared responsive layout primitives for V3
 *
 * Device classes:
 *   compact-phone: 320-359dp (low-end Indian Android)
 *   phone:         360-399dp (mainstream Android)
 *   large-phone:   400-479dp (larger Android)
 *   handheld-pos:  480-599dp (Indian POS handhelds)
 *   wide-pos:      600-800dp (wider POS / compact tablet)
 */
import { Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export type DeviceClass = "compact-phone" | "phone" | "large-phone" | "handheld-pos" | "wide-pos";

export function getDeviceClass(width?: number): DeviceClass {
  const w = width ?? SCREEN_WIDTH;
  if (w < 360) return "compact-phone";
  if (w < 400) return "phone";
  if (w < 480) return "large-phone";
  if (w < 600) return "handheld-pos";
  return "wide-pos";
}

/** Grid columns by device class */
export function getGridColumns(width?: number): number {
  const dc = getDeviceClass(width);
  switch (dc) {
    case "compact-phone": return 2;
    case "phone": return 3;
    case "large-phone": return 3;
    case "handheld-pos": return 4;
    case "wide-pos": return 5;
  }
}

/** Horizontal screen padding by device class */
export function getScreenPadding(width?: number): number {
  const dc = getDeviceClass(width);
  switch (dc) {
    case "compact-phone": return 8;
    case "phone": return 12;
    case "large-phone": return 14;
    case "handheld-pos": return 16;
    case "wide-pos": return 20;
  }
}

/** Chip horizontal padding */
export function getChipPadding(width?: number): number {
  const dc = getDeviceClass(width);
  return dc === "compact-phone" ? 10 : dc === "phone" ? 14 : 16;
}

/** Chip font size */
export function getChipFontSize(width?: number): number {
  const dc = getDeviceClass(width);
  return dc === "compact-phone" ? 11 : 12;
}

/** Modal max width (prevents modals from stretching on tablets) */
export function getModalMaxWidth(width?: number): number {
  const w = width ?? SCREEN_WIDTH;
  return Math.min(w - 32, 500);
}

/** Bottom nav icon size */
export function getNavIconSize(width?: number): number {
  const dc = getDeviceClass(width);
  return dc === "compact-phone" ? 20 : dc === "wide-pos" ? 28 : 24;
}

/** Header action spacing */
export function getHeaderSpacing(width?: number): number {
  const dc = getDeviceClass(width);
  return dc === "compact-phone" ? 6 : dc === "wide-pos" ? 14 : 10;
}

/** Current screen width (cached at import time, use for initial render) */
export const SCREEN_W = SCREEN_WIDTH;
