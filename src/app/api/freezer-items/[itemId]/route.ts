import { NextResponse } from "next/server";
import { removeFreezerItem } from "@/lib/db/queries";

/** Manual "we ate/binned this" removal for the freezer inventory backlog
 * feature (see DECISIONS.md, Settings' freezer list) - a household member
 * clearing an item without waiting for a future generation to consume it.
 * Idempotent: removing an already-gone item is still a 200, not a 404 - the
 * end state (item not in the list) is the same either way. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  await removeFreezerItem(itemId);
  return NextResponse.json({ itemId });
}
