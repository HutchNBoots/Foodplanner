import { describe, expect, it } from "vitest";
import { weekPlanSchema, weekPlanToolInputSchema } from "@/lib/claude/schema";
import { buildMockWeekPlan } from "@/lib/claude/mock";

const validPlan = {
  summary: "A varied week of high-protein meals.",
  days: [
    {
      day: "Monday",
      date: "2026-08-03",
      meals: [
        {
          slot: "dinner",
          title: "Chicken tray bake",
          servingsAdults: 2,
          servingsKids: 0,
          ingredients: [{ name: "chicken breast", quantity: 400, unit: "g", aisle: "Meat & fish" }],
          method: ["Preheat the oven.", "Roast for 25 minutes."],
          macrosPerAdultPortion: { kcal: 520, proteinG: 38, carbsG: 40, fatG: 18, fibreG: 8 },
          photoQuery: "chicken tray bake",
          batchCook: null,
        },
      ],
    },
  ],
};

describe("weekPlanSchema", () => {
  it("accepts a well-formed plan matching what the tool call should return", () => {
    const result = weekPlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
  });

  it("rejects a plan missing required macro fields", () => {
    const broken = structuredClone(validPlan);
    // @ts-expect-error - deliberately malformed for the test
    delete broken.days[0].meals[0].macrosPerAdultPortion.proteinG;

    const result = weekPlanSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it("rejects an ingredient with an aisle outside the allowed list", () => {
    const broken = structuredClone(validPlan);
    broken.days[0]!.meals[0]!.ingredients[0]!.aisle = "Not a real aisle";

    const result = weekPlanSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it("rejects a day with no meals", () => {
    const broken = structuredClone(validPlan);
    broken.days[0]!.meals = [];

    const result = weekPlanSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it("derives a tool input_schema with the expected top-level shape", () => {
    const schema = weekPlanToolInputSchema();
    expect(schema.type).toBe("object");
    expect(schema).not.toHaveProperty("$schema");
    expect(schema.properties).toHaveProperty("days");
    expect(schema.properties).toHaveProperty("summary");
  });
});

describe("buildMockWeekPlan", () => {
  it("produces output that validates against weekPlanSchema for every daysMode", () => {
    for (const daysMode of ["full_week", "weekdays_only", "mon_to_sat"] as const) {
      const plan = buildMockWeekPlan({ weekStartDate: "2026-08-03", daysMode });
      const result = weekPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    }
  });

  it("produces the correct number of days for each mode", () => {
    expect(buildMockWeekPlan({ weekStartDate: "2026-08-03", daysMode: "full_week" }).days).toHaveLength(7);
    expect(
      buildMockWeekPlan({ weekStartDate: "2026-08-03", daysMode: "weekdays_only" }).days,
    ).toHaveLength(5);
    expect(buildMockWeekPlan({ weekStartDate: "2026-08-03", daysMode: "mon_to_sat" }).days).toHaveLength(6);
  });
});
