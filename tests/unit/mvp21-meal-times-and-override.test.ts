import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/claude/systemPrompt";
import { PROTEIN_TYPES } from "@/lib/intake";
import type { households, WeekIntake } from "@/lib/db/schema";

type Household = typeof households.$inferSelect;

function baseHousehold(overrides: Partial<Household> = {}): Household {
  return {
    id: "h1",
    name: "Test household",
    adults: 2,
    kidsCount: 2,
    satBreakfastDefaultMode: "sit_down",
    satEveningDefaultMode: "sit_down",
    sunLunchDefaultMode: "sit_down",
    familyAdults: 2,
    familyKids: 2,
    store: "Sainsbury's",
    budgetDefault: null,
    favoriteProteins: [...PROTEIN_TYPES],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Household;
}

function baseIntake(overrides: Partial<WeekIntake> = {}): WeekIntake {
  return {
    daysMode: "full_week",
    familyMeals: { satBreakfast: "sit_down", satEvening: "sit_down", sunLunch: "sit_down" },
    parentMeals: { breakfast: false, lunch: true, dinner: true },
    kidsMeals: { breakfast: true, lunch: true, dinner: true },
    dishStyles: [],
    proteins: [...PROTEIN_TYPES],
    avoidRepeating: [],
    budget: "",
    effort: "mixed",
    notes: "",
    goal: "lose_weight",
    ...overrides,
  };
}

describe("buildUserPrompt meal-times line (MVP 2.1)", () => {
  it("labels a fully-off track as skipped entirely", () => {
    const prompt = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake({ kidsMeals: { breakfast: false, lunch: false, dinner: false } }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(prompt).toContain(
      'Kids (track "kids"): none - skip this track entirely this week.',
    );
  });

  it("labels a partially-on track with what's excluded", () => {
    const prompt = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake({ parentMeals: { breakfast: false, lunch: true, dinner: true } }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(prompt).toContain('Meal-times needed this week - parents (track "adult"): lunch, dinner (no breakfast).');
  });

  it("labels a fully-on track with no exclusion note", () => {
    const prompt = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake({ parentMeals: { breakfast: true, lunch: true, dinner: true } }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(prompt).toContain('parents (track "adult"): breakfast, lunch, dinner.');
  });
});

describe("buildUserPrompt notes override framing (MVP 2.1)", () => {
  it("frames notes as overriding standing defaults, not just additional context", () => {
    const prompt = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake({ notes: "Camping this week, no oven." }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(prompt).toContain("IMPORTANT - this week's specific circumstances");
    expect(prompt).toContain("override the standing household defaults");
    expect(prompt).toContain("Camping this week, no oven.");
  });
});

describe("buildSystemPrompt stronger override language (MVP 2.1)", () => {
  it("tells the model standing defaults yield to conflicting free-text notes", () => {
    const prompt = buildSystemPrompt(baseHousehold());

    expect(prompt).toContain("standing defaults, not hard constraints");
    expect(prompt).toContain("the notes win");
    expect(prompt).toContain("camping this week, no oven");
  });

  it("describes adult breakfast and kids meal-times as per-week choices, not fixed rules", () => {
    const prompt = buildSystemPrompt(baseHousehold());

    expect(prompt).toContain("historically adults never got a breakfast, but that's now a per-week choice");
    expect(prompt).toContain("the kids track can be skipped entirely some weeks");
  });
});
