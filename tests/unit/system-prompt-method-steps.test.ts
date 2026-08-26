import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/claude/systemPrompt";
import type { households } from "@/lib/db/schema";
import { PROTEIN_TYPES } from "@/lib/intake";

function baseHousehold(): typeof households.$inferSelect {
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
    favoriteProteins: [...PROTEIN_TYPES],
    store: "Sainsbury's",
    budgetDefault: null,
    energyDirection: "lose_weight",
    focuses: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

// MVP 1.1 requirement: method steps should ask for temperatures, sensory/
// visual doneness cues, and technique notes - not just terse instructions
// (see REQUIREMENTS.md and DECISIONS.md's "Method steps" entry).
describe("buildSystemPrompt method-step instructions", () => {
  it("asks for temperature/time detail", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt.toLowerCase()).toContain("temperature");
  });

  it("asks for a visual or sensory doneness cue", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt.toLowerCase()).toMatch(/doneness cue|sensory/);
  });

  it("asks for steps usable without the recipe title for context", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt).toContain("without needing the recipe title for context");
  });

  it("still asks for economical wording so a full week fits", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt.toLowerCase()).toContain("concise");
  });
});

// Regression: a real MVP 1.2 generation came back with two meals with empty
// ingredients arrays (violating the schema's ingredients.min(1)), and a
// single retry didn't fix it - see DECISIONS.md's post-MVP1.2 hotfix entry.
// The system prompt now states this as a hard rule up front rather than
// relying solely on the retry loop to catch it after the fact.
describe("buildSystemPrompt ingredients-never-empty rule", () => {
  it("states that every meal's ingredients list must have at least one entry", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt).toContain("never emit an empty list");
  });
});

// Backlog item: kids meals could be more instructive/varied (see
// REQUIREMENTS.md's Backlog section, DECISIONS.md's "Generation
// prompt-tuning pass" entry). Week-to-week repetition stays explicitly
// allowed (a deliberate MVP 1.2 decision) - this only tightens within-week
// variety and clarifies the instructiveness bar is the same as every other
// track, not a shorthand version.
describe("buildSystemPrompt kids-track variety and instructiveness", () => {
  it("asks for within-week variety across kids meal slots", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt).toContain("Within a single week");
  });

  it("still allows week-to-week repetition of kids favourites", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt).toContain('repeating a favourite from a previous week is fine and expected');
  });

  it("clarifies kids meals need the same instructive method steps as every other track", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt).toContain("not a shorthand version");
  });
});

// Operator ask: kids meals should always include a weekly batch-cook that
// stocks the freezer for future weeks (see DECISIONS.md's "Kids weekly
// batch-cook-to-freezer" entry) - strengthens the prior "skew toward
// batch-cook-and-freeze" encouragement into a standing requirement whenever
// the kids track is active. Reuses the existing batchCook.freezerPortions /
// freezer_inventory machinery from the freezer-inventory backlog feature,
// no schema change needed.
describe("buildSystemPrompt kids weekly batch-freeze requirement", () => {
  it("requires at least one kids batch-freeze meal per active kids week", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt).toContain(
      "at least one kids meal must be a batch-cook that also freezes portions for a future week",
    );
  });

  it("frames it as a standing rotating stash, not a one-off or only-when-empty behaviour", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt).toContain("not a one-off");
    expect(prompt).toContain("not just when the freezer happens to be empty");
  });

  it("clarifies freezerPortions doesn't count toward the same-week leftover cap", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt).toContain("does not count toward the weekly leftover cap");
  });
});
