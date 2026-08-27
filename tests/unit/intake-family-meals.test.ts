import { describe, expect, it } from "vitest";
import { weekIntakeSchema } from "@/lib/intake";

function baseBody(familyMeals: Record<string, string>) {
  return {
    weekStartDate: "2026-08-03",
    numDays: 7,
    deliveryTime: "",
    familyMeals,
    dishStyles: [],
    proteins: [],
    avoidRepeating: [],
    budget: "",
    effort: "mixed",
    notes: "",
  };
}

// MVP 1.2's three family meal occasions (see DECISIONS.md's "Family-occasion
// mode options" entry) - Saturday breakfast has no "bbq" option, the other
// two keep the full sit-down/BBQ/skip set.
describe("weekIntakeSchema familyMeals", () => {
  it("accepts sit_down/skip for Saturday breakfast", () => {
    expect(
      weekIntakeSchema.safeParse(baseBody({ satBreakfast: "sit_down", satEvening: "sit_down", sunLunch: "sit_down" }))
        .success,
    ).toBe(true);
    expect(
      weekIntakeSchema.safeParse(baseBody({ satBreakfast: "skip", satEvening: "sit_down", sunLunch: "sit_down" }))
        .success,
    ).toBe(true);
  });

  it("rejects bbq for Saturday breakfast", () => {
    const result = weekIntakeSchema.safeParse(
      baseBody({ satBreakfast: "bbq", satEvening: "sit_down", sunLunch: "sit_down" }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts bbq for Saturday evening and Sunday lunch", () => {
    expect(
      weekIntakeSchema.safeParse(baseBody({ satBreakfast: "sit_down", satEvening: "bbq", sunLunch: "bbq" })).success,
    ).toBe(true);
  });

  it("rejects a missing familyMeals field entirely", () => {
    const body = baseBody({ satBreakfast: "sit_down", satEvening: "sit_down", sunLunch: "sit_down" }) as Record<
      string,
      unknown
    >;
    delete body.familyMeals;
    expect(weekIntakeSchema.safeParse(body).success).toBe(false);
  });
});
