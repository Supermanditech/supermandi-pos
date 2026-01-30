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

/**
 * GO-LIVE-170: Maximum page number to prevent infinite pagination loops
 * Even with hasMore=true bug, pagination will stop at this limit
 * 100 pages * 40 items = 4000 items max, which is reasonable for any store
 */
export const MAX_PAGINATION_PAGE = 100;

/**
 * GO-LIVE-170: Helper to check if we've hit the pagination limit
 */
export function shouldStopPagination(currentPage: number, hasMore: boolean): boolean {
  if (!hasMore) return true;
  if (currentPage >= MAX_PAGINATION_PAGE) {
    console.warn(`[GO-LIVE-170] Hit max pagination limit (${MAX_PAGINATION_PAGE}), stopping`);
    return true;
  }
  return false;
}
