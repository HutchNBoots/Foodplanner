/** Simple month-based check (no weather API needed, see PROJECT.md §4) used to
 * de-emphasise heavy/hot dishes like soups and stews in warm months. */
export function isWarmMonth(date: Date = new Date()): boolean {
  const month = date.getMonth(); // 0 = January
  // Northern-hemisphere late spring through early autumn (May-September).
  return month >= 4 && month <= 8;
}

export const DISH_STYLES = [
  "salads",
  "soups",
  "tray bakes",
  "bowls",
  "stir-fries",
  "no preference",
] as const;

export type DishStyle = (typeof DISH_STYLES)[number];

/** Dish styles to visually de-emphasise (not remove) in the intake form during warm months. */
export function deemphasisedStyles(date: Date = new Date()): DishStyle[] {
  return isWarmMonth(date) ? ["soups"] : [];
}
