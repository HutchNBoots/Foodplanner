import { NextResponse } from "next/server";
import { deleteWeek } from "@/lib/db/queries";

/** History page "delete this week" - removes the week and everything
 * derived from it (meals, shopping list, feedback - all cascade via FK, see
 * `deleteWeek`). Idempotent: deleting an already-gone week is still a 200. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ weekId: string }> }) {
  const { weekId } = await params;
  await deleteWeek(weekId);
  return NextResponse.json({ weekId });
}
