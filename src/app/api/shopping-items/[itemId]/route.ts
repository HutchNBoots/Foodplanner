import { NextResponse } from "next/server";
import { z } from "zod";
import { setShoppingItemChecked } from "@/lib/db/queries";

const bodySchema = z.object({ checked: z.boolean() });

/** Toggles a shopping-list item's ticked-off state (MVP 1.1 "must-ship" CX
 * item, see DECISIONS.md) - persisted so it's usable while actually
 * shopping in-store, from a phone, and survives a device switch. */
export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const updated = await setShoppingItemChecked(itemId, parsed.data.checked);
  if (!updated) {
    return NextResponse.json({ error: "Shopping item not found." }, { status: 404 });
  }
  return NextResponse.json(updated);
}
