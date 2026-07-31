import { describe, expect, it } from "vitest";
import { trackForMeal } from "@/lib/meals/track";

describe("trackForMeal", () => {
  it("returns the stored track for a normal MVP1.2 row", () => {
    expect(trackForMeal({ slot: "dinner", track: "adult" })).toBe("adult");
    expect(trackForMeal({ slot: "breakfast", track: "kids" })).toBe("kids");
    expect(trackForMeal({ slot: "lunch", track: "family" })).toBe("family");
  });

  // Regression: pre-MVP1.2 rows (`slot: "sunday_special"`) predate the
  // `track` column and default to "adult" at the DB level, but were
  // actually the one family occasion that existed then - see DECISIONS.md's
  // "Data model" entry. They must still show up under the Family tab and be
  // excluded from the adult-only bits of the UI that rely on track==="adult"
  // meaning "not a family occasion".
  it("classifies a legacy sunday_special row as family regardless of its stored track", () => {
    expect(trackForMeal({ slot: "sunday_special", track: "adult" })).toBe("family");
  });
});
