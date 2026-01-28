// GL-CRIT-0089: Centralized pagination constants
// Previously PAGE_SIZE was hardcoded differently across screens (20, 40, etc.)

/**
 * Default page size for product listing screens (SellScan, Buy)
 * Higher value for product grids where users browse
 */
export const PRODUCTS_PAGE_SIZE = 40;

/**
 * Default page size for list screens (orders, history, etc.)
 * Lower value for simpler list views
 */
export const LIST_PAGE_SIZE = 20;

/**
 * Page size for search results
 */
export const SEARCH_PAGE_SIZE = 30;
