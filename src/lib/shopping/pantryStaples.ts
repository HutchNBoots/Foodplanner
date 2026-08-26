/** Pantry-staple detection for the Claude-in-Chrome shopping handoff (see
 * DECISIONS.md's "Pantry-staple-aware Claude-in-Chrome shopping handoff"
 * entry). Deliberately a static keyword list matched against
 * `shoppingItems.productName` at export time, not a Claude-assigned field
 * set at generation time - that's what makes this work for ANY week's
 * shopping list, including ones generated long before this feature existed,
 * with no schema change and no dependency on the model having tagged
 * anything.
 *
 * Word-boundary matching (not a plain substring check) - a bare substring
 * check on e.g. "oil" would false-positive inside "boiled", and "sugar"
 * would false-positive inside "sugar snap peas"; multi-word phrases like
 * "vegetable oil" are used instead of the bare "vegetable"/"oil" alone
 * specifically to avoid flagging "mixed vegetables" or any other real
 * weekly-shop item that happens to share a word with a staple. Favours
 * precision over recall - a missed staple is a minor inconvenience, a
 * wrongly-flagged real ingredient risks it getting skipped in the basket. */
const PANTRY_STAPLE_KEYWORDS = [
  // Oils
  "olive oil",
  "vegetable oil",
  "sunflower oil",
  "sesame oil",
  "rapeseed oil",
  "coconut oil",
  "chilli oil",
  "cooking oil",
  // Vinegars
  "balsamic vinegar",
  "wine vinegar",
  "malt vinegar",
  "rice vinegar",
  "cider vinegar",
  // Sauces & condiments used a little at a time
  "soy sauce",
  "fish sauce",
  "worcestershire sauce",
  "oyster sauce",
  "hoisin sauce",
  "hot sauce",
  "tomato puree",
  "tomato paste",
  "mustard",
  "honey",
  "maple syrup",
  "mayonnaise",
  // Baking staples
  "plain flour",
  "self-raising flour",
  "self raising flour",
  "caster sugar",
  "granulated sugar",
  "brown sugar",
  "icing sugar",
  "baking powder",
  "bicarbonate of soda",
  "cornflour",
  "cornstarch",
  "dried yeast",
  "vanilla extract",
  // Stock
  "stock cube",
  "stock pot",
  "stock paste",
  "vegetable stock",
  "chicken stock",
  "beef stock",
  "fish stock",
  // Spices & dried herbs
  "cumin",
  "paprika",
  "chilli flakes",
  "chili flakes",
  "dried oregano",
  "dried basil",
  "dried thyme",
  "dried rosemary",
  "mixed herbs",
  "cinnamon",
  "nutmeg",
  "turmeric",
  "garam masala",
  "curry powder",
  "cayenne pepper",
  "bay leaves",
  "black pepper",
  "ground pepper",
  "peppercorns",
  "garlic powder",
  "onion powder",
  "ground ginger",
  "smoked paprika",
  "coriander seeds",
  "cumin seeds",
  "mustard seeds",
  "fennel seeds",
  "five spice",
] as const;

const STAPLE_PATTERN = new RegExp(
  `\\b(${PANTRY_STAPLE_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i",
);

export function isPantryStaple(productName: string): boolean {
  return STAPLE_PATTERN.test(productName);
}
