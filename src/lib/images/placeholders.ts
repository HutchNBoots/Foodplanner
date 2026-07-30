const CATEGORY_KEYWORDS: [category: string, keywords: string[]][] = [
  ["salad", ["salad", "slaw"]],
  ["soup", ["soup", "stew", "broth", "chowder", "chilli", "chili", "curry"]],
  ["traybake", ["tray bake", "traybake", "roast", "sheet pan"]],
  ["bowl", ["bowl", "poke", "rice bowl", "grain bowl"]],
  ["stirfry", ["stir-fry", "stir fry", "stirfry", "noodle", "wok"]],
  ["wrap", ["wrap", "taco", "burrito", "pitta", "pita", "flatbread"]],
  ["grill", ["grill", "bbq", "barbecue", "skewer", "kebab"]],
];

const CATEGORIES = [...CATEGORY_KEYWORDS.map(([c]) => c), "default"] as const;
export type PlaceholderCategory = (typeof CATEGORIES)[number];

/** Keyword-matches a recipe title/photo query to one of a small set of
 * locally-illustrated category cards (PROJECT.md §5 fallback), rather than a
 * real (and licensable) stock photo - see DECISIONS.md. */
export function placeholderCategoryFor(text: string): PlaceholderCategory {
  const lower = text.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return "default";
}

export function placeholderImagePath(text: string): string {
  return `/images/categories/${placeholderCategoryFor(text)}.svg`;
}
