/** Pure, DB-free matching logic for the canonical ingredients table (MVP 1.1,
 * see DECISIONS.md - "auto-built and grown, not seeded upfront"). Kept
 * separate from `resolve.ts` (which does the DB reads/writes) so the
 * matching behaviour itself is directly unit-testable. */

export type CanonicalCandidate = { id: string; name: string; aisle: string };

/** Lowercase, trim, collapse whitespace - the baseline normalisation before
 * any fuzzier comparison. */
export function normaliseIngredientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Crude English pluralisation stripping, good enough for ingredient nouns
 * ("tomatoes" -> "tomato", "berries" -> "berry", "onions" -> "onion") - not a
 * full stemmer, just enough to make plural/singular variants of the same
 * ingredient compare equal. */
function singularise(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("oes") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("ses") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

function tokenKey(name: string): string {
  return normaliseIngredientName(name)
    .split(" ")
    .filter(Boolean)
    .map(singularise)
    .sort()
    .join(" ");
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist: number[][] = Array.from({ length: rows }, (_, i) => [
    i,
    ...Array.from({ length: cols - 1 }, () => 0),
  ]);
  for (let j = 1; j < cols; j++) dist[0]![j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i]![j] = Math.min(
        dist[i - 1]![j]! + 1,
        dist[i]![j - 1]! + 1,
        dist[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dist[rows - 1]![cols - 1]!;
}

/** 1 = identical, 0 = completely different. Exact-normalised and
 * token-sorted-and-singularised matches short-circuit to a near-1 score;
 * otherwise falls back to a Levenshtein-distance ratio so typos/near-misses
 * still match without letting genuinely different ingredients (e.g.
 * "chicken breast" vs "chicken thigh") collapse together. */
export function ingredientSimilarity(a: string, b: string): number {
  const normA = normaliseIngredientName(a);
  const normB = normaliseIngredientName(b);
  if (normA === normB) return 1;
  if (tokenKey(normA) === tokenKey(normB)) return 0.99;

  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(normA, normB) / maxLen;
}

export const MATCH_THRESHOLD = 0.85;

/** Best-scoring candidate at or above `MATCH_THRESHOLD`, or null if nothing
 * is close enough - callers should create a new canonical row on null. */
export function findBestMatch(
  name: string,
  candidates: CanonicalCandidate[],
  threshold = MATCH_THRESHOLD,
): CanonicalCandidate | null {
  let best: { candidate: CanonicalCandidate; score: number } | null = null;
  for (const candidate of candidates) {
    const score = ingredientSimilarity(name, candidate.name);
    if (!best || score > best.score) {
      best = { candidate, score };
    }
  }
  return best && best.score >= threshold ? best.candidate : null;
}
