import { NextResponse } from "next/server";
import { getMeal } from "@/lib/db/queries";
import { deleteMealInPlace, DeleteNotAllowedError } from "@/lib/weeks/generateAndPersist";

/** "Delete this meal" backlog feature (see DECISIONS.md) - removes one meal
 * and re-aggregates the week's shopping list. Rejects a batch-cook source
 * meal (409) for the same reason "swap" does - other days rely on it as
 * leftovers. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ mealId: string }> }) {
  const { mealId } = await params;

  const existing = await getMeal(mealId);
  if (!existing) {
    return NextResponse.json({ error: "Meal not found." }, { status: 404 });
  }

  try {
    await deleteMealInPlace(mealId);
  } catch (err) {
    if (err instanceof DeleteNotAllowedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Meal delete failed:", err);
    return NextResponse.json({ error: "Couldn't delete this meal." }, { status: 500 });
  }

  return NextResponse.json({ mealId }, { status: 200 });
}
