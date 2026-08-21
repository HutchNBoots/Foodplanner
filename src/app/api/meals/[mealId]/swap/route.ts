import { NextResponse } from "next/server";
import { getMeal } from "@/lib/db/queries";
import { swapMealInPlace, SwapNotAllowedError } from "@/lib/weeks/generateAndPersist";
import { GenerationError } from "@/lib/claude/generate";

// A single-meal call (max_tokens: 4000) is small/fast enough to run
// synchronously in the request, unlike full-week generation - but still
// worth raising past Vercel's short default in case the Anthropic call is
// slow, same reasoning as /api/generate's maxDuration, just a smaller number.
export const maxDuration = 60;

/** "Swap this meal" backlog feature (see DECISIONS.md) - regenerates one
 * meal in place. Synchronous (unlike /api/generate's background+poll
 * pattern) since the client is waiting on a single small result, not a
 * whole week. */
export async function POST(_request: Request, { params }: { params: Promise<{ mealId: string }> }) {
  const { mealId } = await params;

  const existing = await getMeal(mealId);
  if (!existing) {
    return NextResponse.json({ error: "Meal not found." }, { status: 404 });
  }

  try {
    await swapMealInPlace(mealId);
  } catch (err) {
    if (err instanceof SwapNotAllowedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Meal swap failed:", err);
    const message = err instanceof GenerationError ? err.message : "Couldn't swap this meal.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ mealId }, { status: 200 });
}
