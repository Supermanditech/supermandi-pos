export const colors = {
  // Brand palette — T-076: aligned to DESIGN_TOKENS.md
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
  primaryLight: "#EFF6FF",
  accent: "#14B8A6",
  accentDark: "#0D9488",
  accentLight: "#F0FDFA",
  secondary: "#14B8A6",
  secondaryDark: "#0D9488",
  secondaryLight: "#F0FDFA",

  // Surfaces — T-076: aligned to DESIGN_TOKENS.md
  bg: "#F7F9FC",
  background: "#F7F9FC",
  backgroundSecondary: "#F1F5F9",
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
  primarySoft: "#EFF6FF", // SM-022: Soft blue for credit screens

  // Borders
  border: "#E2E8F0",
  borderDark: "#CBD5E1",

  // Overlays
  overlay: "rgba(15, 23, 42, 0.45)",
  overlayLight: "rgba(15, 23, 42, 0.2)",
  overlayInverse: "rgba(255, 255, 255, 0.15)",
  ink: "#0B1220",
} as const;

export type ColorKey = keyof typeof colors;
