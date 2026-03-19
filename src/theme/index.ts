import { colors, lightColors, darkColors, type ColorPalette } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';
import { useSettingsStore } from '../stores/settingsStore';

export const theme = {
  colors,
  typography,
  spacing,
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 8,
    },
  },
} as const;

export type Theme = typeof theme;

// LIVE.POS.THEME.RUNTIME_TOGGLE_PARITY.001: Runtime-reactive color hook
// Returns the current palette based on persisted theme preference.
export function useThemeColors(): ColorPalette {
  const mode = useSettingsStore((s) => s.themeMode);
  return mode === 'dark' ? darkColors : lightColors;
}

// LIVE.POS.THEME.RUNTIME_TOGGLE_PARITY.001: Non-hook palette resolver
// For use outside React components (e.g., StyleSheet factories called at module scope).
export function getThemeColors(): ColorPalette {
  const mode = useSettingsStore.getState().themeMode;
  return mode === 'dark' ? darkColors : lightColors;
}

export { colors, lightColors, darkColors, typography, spacing };
export type { ColorPalette };
// V3-HARDEN-182: Brand token system
export { shell, tabAccents, cardElevation, chipColors, motion, typeRhythm, iconRhythm } from './brand';
