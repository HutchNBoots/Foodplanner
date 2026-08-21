import { describe, expect, it } from "vitest";
import { countLeftoverSlots, MAX_LEFTOVER_SLOTS, type WeekPlan } from "@/lib/claude/schema";

function planWithLeftovers(leftoverCounts: number[]): WeekPlan {
  return {
    summary: "test",
    days: leftoverCounts.map((count, i) => ({
      day: `Day ${i}`,
      date: `2026-08-0${i + 1}`,
      meals: [
        {
          slot: "dinner",
          track: "adult",
          title: `Meal ${i}`,
          servingsAdults: 2,
          servingsKids: 0,
          ingredients: [{ name: "chicken", quantity: 400, unit: "g", aisle: "Meat & fish", cholesterolLowering: false, lowSaturatedFat: false }],
          method: ["Cook it."],
          macrosPerAdultPortion: { kcal: 500, proteinG: 30, carbsG: 40, fatG: 15, fibreG: 5 },
          photoQuery: "chicken",
          usesFreezerItem: null,
          batchCook:
            count > 0
              ? {
                  makes: count + 2,
                  leftoverFor: Array.from({ length: count }, (_, j) => ({ day: `Day ${j + 1}`, slot: "lunch" as const })),
                  freezerPortions: null,
                }
              : null,
        },
      ],
    })),
  };
}

// MVP 1.2 weekly leftover cap (see DECISIONS.md's "Leftover cap" entry) -
// counted as the total `batchCook.leftoverFor.length` across every meal in
// the plan, combined across adult/kids/family tracks.
describe("countLeftoverSlots", () => {
  it("counts zero for a plan with no batch-cook leftovers", () => {
    expect(countLeftoverSlots(planWithLeftovers([0, 0, 0]))).toBe(0);
  });

  it("sums leftoverFor entries across every meal in the plan", () => {
    expect(countLeftoverSlots(planWithLeftovers([1, 0, 2]))).toBe(3);
  });

  it("does not count freezerPortions toward the total (frozen surplus isn't a same-week leftover)", () => {
    const plan: WeekPlan = {
      summary: "test",
      days: [
        {
          day: "Monday",
          date: "2026-08-03",
          meals: [
            {
              slot: "dinner",
              track: "kids",
              title: "Freezer batch",
              servingsAdults: 0,
              servingsKids: 2,
              ingredients: [{ name: "pasta", quantity: 200, unit: "g", aisle: "Store cupboard", cholesterolLowering: false, lowSaturatedFat: false }],
              method: ["Cook it."],
              macrosPerAdultPortion: { kcal: 350, proteinG: 12, carbsG: 45, fatG: 10, fibreG: 4 },
              photoQuery: "pasta",
              usesFreezerItem: null,
              batchCook: { makes: 8, leftoverFor: [], freezerPortions: 6 },
            },
          ],
        },
      ],
    };
    expect(countLeftoverSlots(plan)).toBe(0);
  });

  it("stays within MAX_LEFTOVER_SLOTS for a normal week (sanity check on the constant)", () => {
    expect(MAX_LEFTOVER_SLOTS).toBe(2);
    expect(countLeftoverSlots(planWithLeftovers([1, 1, 0, 0, 0]))).toBeLessThanOrEqual(MAX_LEFTOVER_SLOTS);
  });

  it("flags a plan that exceeds the cap", () => {
    expect(countLeftoverSlots(planWithLeftovers([2, 1]))).toBeGreaterThan(MAX_LEFTOVER_SLOTS);
  });
});
