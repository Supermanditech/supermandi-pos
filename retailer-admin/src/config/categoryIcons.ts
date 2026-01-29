// GL-CRIT-0066: Centralized category icons configuration
// This file provides a default mapping that can be overridden by backend configuration

// Default category icon mapping (fallback when backend config is unavailable)
export const DEFAULT_CATEGORY_ICONS: Record<string, string> = {
  'barley': '🌾',          // Atta-Dal
  'rice': '🍚',            // Chawal
  'shaker': '🌶️',          // Masala
  'oil': '🫒',             // Tel-Ghee
  'peanut': '🥜',          // Namkeen
  'cookie': '🍪',          // Biscuit
  'coffee': '☕',          // Chai-Coffee
  'bottle-soda-classic': '🥤', // Cold Drink
  'cow': '🥛',             // Doodh
  'hand-wash': '🧴',       // Sabun
  'spray-bottle': '🧹',    // Safai
  'baby-face': '👶',       // Baby
  'leaf': '🌿',            // Paan-Supari
  'dots-horizontal': '📦', // Baaki (Others)
  'view-grid': '📋',       // Default
};

// Default icon for unknown categories
export const DEFAULT_ICON = '📦';

/**
 * GL-CRIT-0066: Get category icon with fallback
 * This function can be extended to use backend-provided icons
 *
 * @param iconKey - The icon key from the category
 * @param customIcons - Optional custom icon mapping from backend
 * @returns The emoji icon for the category
 */
export function getCategoryIcon(
  iconKey: string,
  customIcons?: Record<string, string>
): string {
  // First check custom icons from backend
  if (customIcons && iconKey in customIcons) {
    return customIcons[iconKey];
  }

  // Fall back to default icons
  return DEFAULT_CATEGORY_ICONS[iconKey] || DEFAULT_ICON;
}

/**
 * GL-CRIT-0066: Create a getCategoryIcon function with merged icons
 * Use this to create a memoized getter with backend icons
 */
export function createCategoryIconGetter(
  backendIcons?: Record<string, string>
): (iconKey: string) => string {
  const mergedIcons = { ...DEFAULT_CATEGORY_ICONS, ...backendIcons };
  return (iconKey: string) => mergedIcons[iconKey] || DEFAULT_ICON;
}
