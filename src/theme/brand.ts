/**
 * V3-HARDEN-182: SuperMandi Brand Token System
 *
 * One canonical source for shell-level brand decisions.
 * All v3 screens consume these tokens instead of screen-local color guesses.
 *
 * Token categories:
 *   Shell:  nav elevation, tab chrome, shell background
 *   Tabs:   per-tab accent tints for mode identity
 *   Cards:  elevation, stroke, radius hierarchy
 *   Motion: restrained timing/easing for shell transitions
 *   Badge:  chip semantics for status/metadata display
 */

import type { ColorPalette } from './colors';

// ── Shell tokens ──
export const shell = {
  /** Nav bar elevation shadow */
  navElevation: {
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  /** Nav bar height (content area, excluding safe area) */
  navContentHeight: 60,
  /** Active tab pill border radius */
  activePillRadius: 20,
  /** Active tab pill vertical padding */
  activePillPaddingV: 6,
  /** Active tab pill horizontal padding */
  activePillPaddingH: 20,
  /** Shell border radius for top-level cards */
  cardRadius: 16,
  /** Header height */
  headerHeight: 56,
} as const;

// ── Tab accent tints ──
// Each tab gets a subtle tint for mode identity. The primary color stays
// consistent; these tints are used for hero sections and first-screen chrome.
export function tabAccents(colors: ColorPalette) {
  return {
    SELL: {
      hero: colors.primary,
      heroSoft: colors.primaryLight,
      accent: colors.primary,
      icon: '💰',
      label: 'SELL',
      subtitle: 'Billing & Counter',
    },
    BUY: {
      hero: colors.accent,
      heroSoft: colors.accentLight,
      accent: colors.accent,
      icon: '🛒',
      label: 'BUY',
      subtitle: 'Procurement',
    },
    STORE: {
      hero: '#7C3AED', // Purple for operations/inventory
      heroSoft: '#F5F3FF',
      accent: '#7C3AED',
      icon: '📦',
      label: 'STORE',
      subtitle: 'Stock & Ops',
    },
    MORE: {
      hero: colors.textSecondary,
      heroSoft: colors.backgroundSecondary,
      accent: colors.textSecondary,
      icon: '⚙️',
      label: 'MORE',
      subtitle: 'Settings & Reports',
    },
  } as const;
}

// ── Card elevation hierarchy ──
export const cardElevation = {
  /** Flat card — border only, no shadow */
  flat: {
    shadowOpacity: 0,
    elevation: 0,
  },
  /** Subtle lift — for secondary cards */
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  /** Standard card — primary action surfaces */
  standard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 4,
  },
  /** Prominent — hero/CTA cards */
  prominent: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

// ── Badge/chip semantics ──
export function chipColors(colors: ColorPalette) {
  return {
    status: { bg: colors.successSoft, text: colors.success, border: colors.successBorder },
    warning: { bg: colors.warningSoft, text: colors.warningDark, border: colors.warningBorder },
    error: { bg: colors.errorSoft, text: colors.error, border: colors.errorBorder },
    info: { bg: colors.primaryLight, text: colors.primary, border: colors.primary },
    neutral: { bg: colors.backgroundSecondary, text: colors.textSecondary, border: colors.border },
    accent: { bg: colors.accentLight, text: colors.accentDark, border: colors.accent },
  } as const;
}

// ── Motion tokens ──
// Restrained: purposeful transitions only, no decorative animation
export const motion = {
  /** Tab switch — fast, no overshoot */
  tabSwitch: { duration: 150, easing: 'ease-out' },
  /** Sheet reveal — smooth slide */
  sheetReveal: { duration: 250, easing: 'ease-out' },
  /** Badge pulse — subtle attention */
  badgePulse: { duration: 200, easing: 'ease-in-out' },
  /** Card press feedback */
  cardPress: { scale: 0.98, duration: 100 },
} as const;

// ── Typography rhythm ──
export const typeRhythm = {
  /** Section title — tab area headings */
  sectionTitle: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.8 },
  /** Hero stat — large number display */
  heroStat: { fontSize: 28, fontWeight: '900' as const, letterSpacing: -0.5 },
  /** Hero label — stat description */
  heroLabel: { fontSize: 12, fontWeight: '600' as const },
  /** Card title — primary card text */
  cardTitle: { fontSize: 14, fontWeight: '700' as const, letterSpacing: -0.2 },
  /** Card meta — secondary card text */
  cardMeta: { fontSize: 11, fontWeight: '500' as const },
  /** Nav label — bottom nav text */
  navLabel: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.3 },
  /** Nav label active — bold emphasis */
  navLabelActive: { fontSize: 10, fontWeight: '800' as const, letterSpacing: 0.3 },
} as const;

// ── Icon rhythm ──
export const iconRhythm = {
  /** Nav bar icon size */
  nav: 22,
  /** Header icon size */
  header: 20,
  /** Card inline icon size */
  card: 16,
  /** Chip/badge icon size */
  chip: 12,
  /** Hero/stat icon size */
  hero: 32,
} as const;
