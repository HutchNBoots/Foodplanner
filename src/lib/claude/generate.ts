import type Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL, getAnthropicClient } from "./client";
import {
  countLeftoverSlots,
  MAX_LEFTOVER_SLOTS,
  mealSchema,
  mealToolInputSchema,
  weekPlanSchema,
  weekPlanToolInputSchema,
  type MealPlanItem,
  type WeekPlan,
} from "./schema";
import { buildSwapMealUserPrompt, buildSystemPrompt, buildUserPrompt } from "./systemPrompt";
import { buildMockSwapMeal, buildMockWeekPlan } from "./mock";
import type { WeekIntake, households } from "@/lib/db/schema";

type Household = typeof households.$inferSelect;

const TOOL_NAME = "emit_week_plan";
const SWAP_TOOL_NAME = "emit_meal";

export class GenerationError extends Error {}

export async function generateWeekPlan(params: {
  household: Household;
  weekStartDate: string;
  intake: WeekIntake;
  recentTitles: string[];
  recentFeedback: { rating: string; note: string | null; title: string }[];
  freezerInventory: { itemName: string; portions: number }[];
}): Promise<WeekPlan> {
  // Escape hatch for the e2e smoke test (and anyone poking at the app
  // without an Anthropic key yet) - see DECISIONS.md.
  if (process.env.MOCK_GENERATION === "1") {
    return buildMockWeekPlan({
      weekStartDate: params.weekStartDate,
      daysMode: params.intake.daysMode,
      familyMeals: params.intake.familyMeals,
      parentMeals: params.intake.parentMeals,
      kidsMeals: params.intake.kidsMeals,
    });
  }

  const client = getAnthropicClient();
  const system = buildSystemPrompt(params.household);
  const userMessage = buildUserPrompt(params);

  const tool = {
    name: TOOL_NAME,
    description: "Emit the complete, validated structured plan for one week of meals.",
    input_schema: weekPlanToolInputSchema() as Anthropic.Tool.InputSchema,
  };

  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: userMessage },
  ];

  let lastError = "";

  // Try up to 3 times: once plain, then with the validation error appended
  // each time so the model can self-correct (see DECISIONS.md on why we
  // still validate server-side even with a forced tool call). Raised from 2
  // after a real MVP 1.2 failure showed a single retry wasn't reliably
  // enough - the much larger combined adult+kids+family response gives more
  // surface area for an isolated slip (e.g. one meal's ingredients array
  // coming back empty) to survive one correction attempt.
  for (let attempt = 0; attempt < 3; attempt++) {
    // Streamed rather than a plain `create()` call - the Anthropic SDK
    // requires streaming once a request's own estimated duration can exceed
    // 10 minutes, which the 28000 max_tokens raise (MVP 1.2, for the larger
    // combined adult+kids+family response) tipped this over into hitting in
    // production ("Streaming is required for operations that may take
    // longer than 10 minutes"). `.stream().finalMessage()` waits for the
    // complete response and returns the same `Message` shape `create()`
    // would have, so nothing downstream of this needs to change.
    const response = await client.messages
      .stream({
        model: CLAUDE_MODEL,
        // A full week's plan (ingredients, method, macros for every meal) is a
        // lot of structured JSON - 8000 wasn't enough and produced silently
        // truncated tool input (e.g. missing "days" entirely). Raised to 16000
        // for the adult-only plan, then to 28000 for MVP 1.2's combined
        // adult+kids+family generation (roughly double the meal count) - see
        // DECISIONS.md on why this is one combined call rather than two.
        max_tokens: 28000,
        system,
        messages,
        tools: [tool],
        tool_choice: { type: "tool", name: TOOL_NAME },
      })
      .finalMessage();

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      lastError = "Claude did not return a tool call.";
      continue;
    }

    if (response.stop_reason === "max_tokens") {
      // The tool input is very likely truncated mid-JSON here - fail fast
      // with a clear, specific message instead of letting it fall through to
      // a confusing Zod parse error a step later.
      lastError =
        "Claude's response was cut off before it finished (hit the output token limit) - try again, or request fewer days (e.g. weekdays only) if it keeps happening.";
      continue;
    }

    const parsed = weekPlanSchema.safeParse(toolUse.input);
    if (parsed.success) {
      // MVP 1.2's weekly leftover cap (see DECISIONS.md) - checked the same
      // way a Zod failure is: fed back to the model as a corrective message
      // on the next attempt, rather than silently persisting an
      // over-the-cap plan.
      const leftoverSlots = countLeftoverSlots(parsed.data);
      if (leftoverSlots > MAX_LEFTOVER_SLOTS) {
        lastError = `Too many leftover meal-slots planned (found ${leftoverSlots} across the whole week, max allowed is ${MAX_LEFTOVER_SLOTS} combined across adult/kids/family tracks).`;
        messages.push(
          { role: "assistant", content: JSON.stringify(toolUse.input) },
          {
            role: "user",
            content: `${lastError} Reduce batchCook.leftoverFor entries - cook some of those meals fresh instead, or use batchCook.freezerPortions for surplus meant for a future week instead of a same-week leftover slot.\n\nCall ${TOOL_NAME} again with a corrected, complete plan.`,
          },
        );
        continue;
      }

      return parsed.data;
    }

    lastError = parsed.error.message;
    messages.push(
      { role: "assistant", content: JSON.stringify(toolUse.input) },
      {
        role: "user",
        content: `That didn't match the required schema: ${lastError}\n\nCall ${TOOL_NAME} again with a corrected, complete plan.`,
      },
    );
  }

  throw new GenerationError(`Failed to generate a valid week plan after retrying: ${lastError}`);
}

/** "Swap this meal" backlog feature (see DECISIONS.md) - a single-meal
 * regeneration, structurally the same retry/validate loop as
 * `generateWeekPlan` but scoped to one `emit_meal` call instead of a whole
 * week, with a much smaller token budget. `slot`/`track`/servings are
 * force-overridden on the result server-side (not just prompted for) so a
 * model slip can't change what's actually being replaced. */
export async function generateSwapMeal(params: {
  household: Household;
  intake: WeekIntake;
  currentMeal: { slot: string; track: string; title: string; servingsAdults: number; servingsKids: number };
  otherTitlesThisWeek: string[];
  recentTitles: string[];
}): Promise<MealPlanItem> {
  const { currentMeal } = params;

  if (process.env.MOCK_GENERATION === "1") {
    return buildMockSwapMeal({
      slot: currentMeal.slot as never,
      track: currentMeal.track as never,
      servingsAdults: currentMeal.servingsAdults,
      servingsKids: currentMeal.servingsKids,
    });
  }

  const client = getAnthropicClient();
  const system = buildSystemPrompt(params.household);
  const userMessage = buildSwapMealUserPrompt(params);

  const tool = {
    name: SWAP_TOOL_NAME,
    description: "Emit the one replacement meal.",
    input_schema: mealToolInputSchema() as Anthropic.Tool.InputSchema,
  };

  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: userMessage },
  ];

  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages
      .stream({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        system,
        messages,
        tools: [tool],
        tool_choice: { type: "tool", name: SWAP_TOOL_NAME },
      })
      .finalMessage();

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      lastError = "Claude did not return a tool call.";
      continue;
    }

    const parsed = mealSchema.safeParse(toolUse.input);
    if (parsed.success) {
      // Force the fields that must not change server-side, same reasoning
      // as validating everything else server-side even with a forced tool
      // call - never trust the model alone for the parts correctness
      // actually depends on.
      return {
        ...parsed.data,
        slot: currentMeal.slot as MealPlanItem["slot"],
        track: currentMeal.track as MealPlanItem["track"],
        servingsAdults: currentMeal.servingsAdults,
        servingsKids: currentMeal.servingsKids,
        batchCook: null,
        usesFreezerItem: null,
      };
    }

    lastError = parsed.error.message;
    messages.push(
      { role: "assistant", content: JSON.stringify(toolUse.input) },
      {
        role: "user",
        content: `That didn't match the required schema: ${lastError}\n\nCall ${SWAP_TOOL_NAME} again with a corrected, complete meal.`,
      },
    );
  }

  throw new GenerationError(`Failed to generate a replacement meal after retrying: ${lastError}`);
}
