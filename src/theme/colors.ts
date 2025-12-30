export const colors = {
  // Brand palette
  primary: "#1D4ED8",
  primaryDark: "#1E3A8A",
  primaryLight: "#3B82F6",
  accent: "#14B8A6",
  accentDark: "#0F766E",
  accentLight: "#5EEAD4",
  secondary: "#14B8A6",
  secondaryDark: "#0F766E",
  secondaryLight: "#5EEAD4",

  // Surfaces
  bg: "#F4F6FB",
  background: "#F4F6FB",
  backgroundSecondary: "#EEF2F6",
  backgroundTertiary: "#E2E8F0",
  surface: "#FFFFFF",
  surfaceAlt: "#F8FAFC",

  // Text
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#64748B",
  textInverse: "#FFFFFF",

  // Status
  success: "#16A34A",
  error: "#DC2626",
  warning: "#F59E0B",
  info: "#0EA5E9",
  successSoft: "#ECFDF5",
  warningSoft: "#FFF7ED",
  errorSoft: "#FEF2F2",
  accentSoft: "#ECFEFF",

  // Borders
  border: "#E2E8F0",
  borderDark: "#CBD5E1",

  // Overlays
  overlay: "rgba(15, 23, 42, 0.45)",
  overlayLight: "rgba(15, 23, 42, 0.2)",
  ink: "#0B1220",
} as const;

export type ColorKey = keyof typeof colors;
