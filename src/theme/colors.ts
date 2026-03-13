// LIVE.POS.THEME: Light palette (default)
export const lightColors = {
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
  successDark: "#166534",
  error: "#DC2626",
  warning: "#F59E0B",
  warningDark: "#92400E",
  errorDark: "#991B1B",
  info: "#0EA5E9",
  successSoft: "#ECFDF5",
  warningSoft: "#FFF7ED",
  errorSoft: "#FEF2F2",
  accentSoft: "#ECFEFF",
  primarySoft: "#EFF6FF", // SM-022: Soft blue for credit screens

  // Status borders (semantic tokens for alert/info boxes)
  errorBorder: "#FECACA",
  warningBorder: "#FDE68A",
  successBorder: "#BBF7D0",

  // Disabled states — STG-232: semantic tokens for disabled UI elements
  disabled: "#94A3B8",
  disabledText: "#94A3B8",
  disabledBg: "#F1F5F9",

  // Brand colors — third-party services (STG-233)
  whatsapp: "#25D366",

  // Borders
  border: "#E2E8F0",
  borderDark: "#CBD5E1",

  // Shadows
  shadow: "#000000",

  // Overlays
  overlay: "rgba(15, 23, 42, 0.45)",
  overlayLight: "rgba(15, 23, 42, 0.2)",
  overlayInverse: "rgba(255, 255, 255, 0.15)",
  ink: "#0B1220",
} as const;

// LIVE.POS.THEME: Dark palette — mirrors light structure for runtime parity
export const darkColors: Record<keyof typeof lightColors, string> = {
  // Brand palette — unchanged for brand recognition
  primary: "#3B82F6",
  primaryDark: "#2563EB",
  primaryLight: "#1E3A5F",
  accent: "#2DD4BF",
  accentDark: "#14B8A6",
  accentLight: "#134E4A",
  secondary: "#2DD4BF",
  secondaryDark: "#14B8A6",
  secondaryLight: "#134E4A",

  // Surfaces — Slate dark scale (matches web portal dark mode)
  bg: "#0F172A",
  background: "#0F172A",
  backgroundSecondary: "#1E293B",
  backgroundTertiary: "#334155",
  surface: "#1E293B",
  surfaceAlt: "#162033",

  // Text — inverted for dark surfaces
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textTertiary: "#64748B",
  textInverse: "#0F172A",

  // Status — slightly brightened for dark bg readability
  success: "#22C55E",
  successDark: "#16A34A",
  error: "#EF4444",
  warning: "#FBBF24",
  warningDark: "#D97706",
  errorDark: "#DC2626",
  info: "#38BDF8",
  successSoft: "#052E16",
  warningSoft: "#422006",
  errorSoft: "#450A0A",
  accentSoft: "#042F2E",
  primarySoft: "#172554",

  // Status borders — muted for dark surfaces
  errorBorder: "#7F1D1D",
  warningBorder: "#78350F",
  successBorder: "#14532D",

  // Disabled states — STG-232: semantic tokens for disabled UI elements (dark mode)
  disabled: "#475569",
  disabledText: "#64748B",
  disabledBg: "#1E293B",

  // Brand colors — slightly brightened for dark bg
  whatsapp: "#34E875",

  // Borders — slate dark scale
  border: "#334155",
  borderDark: "#475569",

  // Shadows — lighter on dark surfaces for subtle depth
  shadow: "#000000",

  // Overlays — adjusted for dark context
  overlay: "rgba(0, 0, 0, 0.6)",
  overlayLight: "rgba(0, 0, 0, 0.3)",
  overlayInverse: "rgba(255, 255, 255, 0.1)",
  ink: "#F8FAFC",
};

// Backward-compatible export — static light palette for StyleSheet.create() usage
export const colors = lightColors;

export type ColorKey = keyof typeof lightColors;
export type ColorPalette = { readonly [K in ColorKey]: string };
