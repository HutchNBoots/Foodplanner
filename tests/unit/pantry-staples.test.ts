import { describe, expect, it } from "vitest";
import { isPantryStaple } from "@/lib/shopping/pantryStaples";

// Pantry-staple detection for the Claude-in-Chrome shopping handoff (see
// DECISIONS.md's "Pantry-staple-aware Claude-in-Chrome shopping handoff"
// entry) - a static keyword list matched against productName at export
// time, not a Claude-assigned field, specifically so it works retroactively
// on any historical week's stored shopping items.
describe("isPantryStaple", () => {
  it("flags common pantry staples", () => {
    expect(isPantryStaple("honey")).toBe(true);
    expect(isPantryStaple("olive oil")).toBe(true);
    expect(isPantryStaple("plain flour")).toBe(true);
    expect(isPantryStaple("soy sauce")).toBe(true);
    expect(isPantryStaple("chicken stock cube")).toBe(true);
    expect(isPantryStaple("ground cumin")).toBe(true);
    expect(isPantryStaple("dried oregano")).toBe(true);
  });

  it("does not flag ordinary weekly-shop items", () => {
    expect(isPantryStaple("chicken breast fillets")).toBe(false);
    expect(isPantryStaple("milk")).toBe(false);
    expect(isPantryStaple("mixed vegetables")).toBe(false);
    expect(isPantryStaple("salmon fillet")).toBe(false);
    expect(isPantryStaple("greek yoghurt")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isPantryStaple("HONEY")).toBe(true);
    expect(isPantryStaple("Olive Oil")).toBe(true);
  });

  it("does not false-positive on words that merely contain a staple as a substring", () => {
    // "oil" inside "boiled", "sugar" inside "sugar snap peas" - word-boundary
    // matching should reject the former; "sugar snap peas" is a real
    // product name that happens to contain a word not on the staple list,
    // included here to guard against an over-broad future addition.
    expect(isPantryStaple("boiled potatoes")).toBe(false);
    expect(isPantryStaple("sugar snap peas")).toBe(false);
  });
});
