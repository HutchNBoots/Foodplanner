import { db } from "@/lib/db/client";
import { ingredientsCanonical } from "@/lib/db/schema";
import { findBestMatch, type CanonicalCandidate } from "./match";

export type ResolvedIngredient = { name: string; aisle: string; canonicalIngredientId: string };

/** Resolves a batch of raw (name, aisle) pairs from one generation against
 * the canonical ingredients table (MVP 1.1, see DECISIONS.md), matching or
 * creating as needed. Batched per-week rather than per-ingredient so (a) it's
 * one table read for the whole week instead of one per ingredient, and (b)
 * two new ingredients that are near-duplicates of *each other* within the
 * same week (but not yet in the table) still collapse to a single new
 * canonical row instead of creating two near-identical ones. */
export async function resolveCanonicalIngredients(
  raw: { name: string; aisle: string }[],
): Promise<Map<string, ResolvedIngredient>> {
  const existing = await db.select().from(ingredientsCanonical);
  const known: CanonicalCandidate[] = existing.map((row) => ({ id: row.id, name: row.name, aisle: row.aisle }));

  const result = new Map<string, ResolvedIngredient>();
  const toInsert: { name: string; aisle: string }[] = [];

  for (const ingredient of raw) {
    if (result.has(ingredient.name)) continue; // already resolved an identical name earlier in this batch

    const match = findBestMatch(ingredient.name, known);
    if (match) {
      result.set(ingredient.name, { name: match.name, aisle: match.aisle, canonicalIngredientId: match.id });
      continue;
    }

    // Not in the table yet, and not a near-duplicate of anything already
    // queued in this same batch either - queue it as a new canonical row and
    // treat it as "known" for the rest of this batch so later near-duplicates
    // in the same week match it instead of each spawning their own row.
    const pending: CanonicalCandidate = { id: `pending:${toInsert.length}`, name: ingredient.name, aisle: ingredient.aisle };
    known.push(pending);
    toInsert.push({ name: ingredient.name, aisle: ingredient.aisle });
    result.set(ingredient.name, { name: ingredient.name, aisle: ingredient.aisle, canonicalIngredientId: pending.id });
  }

  if (toInsert.length) {
    const inserted = await db.insert(ingredientsCanonical).values(toInsert).returning();
    // Swap the `pending:N` placeholder ids for the real inserted row ids, in
    // insertion order (insert preserves array order, same pattern used for
    // meal rows in the generate route).
    const byPendingId = new Map(toInsert.map((row, i) => [`pending:${i}`, inserted[i]]));
    for (const resolved of result.values()) {
      const real = byPendingId.get(resolved.canonicalIngredientId);
      if (real) resolved.canonicalIngredientId = real.id;
    }
  }

  return result;
}
