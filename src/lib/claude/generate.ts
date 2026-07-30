import type Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL, getAnthropicClient } from "./client";
import { weekPlanSchema, weekPlanToolInputSchema, type WeekPlan } from "./schema";
import { buildSystemPrompt, buildUserPrompt } from "./systemPrompt";
import { buildMockWeekPlan } from "./mock";
import type { WeekIntake, households } from "@/lib/db/schema";

type Household = typeof households.$inferSelect;

const TOOL_NAME = "emit_week_plan";

export class GenerationError extends Error {}

export async function generateWeekPlan(params: {
  household: Household;
  weekStartDate: string;
  intake: WeekIntake;
  recentTitles: string[];
  recentFeedback: { rating: string; note: string | null; title: string }[];
}): Promise<WeekPlan> {
  // Escape hatch for the e2e smoke test (and anyone poking at the app
  // without an Anthropic key yet) - see DECISIONS.md.
  if (process.env.MOCK_GENERATION === "1") {
    return buildMockWeekPlan({ weekStartDate: params.weekStartDate, daysMode: params.intake.daysMode });
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

  // Try twice: once plain, once more with the validation error appended so
  // the model can self-correct (see DECISIONS.md on why we still validate
  // server-side even with a forced tool call).
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system,
      messages,
      tools: [tool],
      tool_choice: { type: "tool", name: TOOL_NAME },
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      lastError = "Claude did not return a tool call.";
      continue;
    }

    const parsed = weekPlanSchema.safeParse(toolUse.input);
    if (parsed.success) {
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
