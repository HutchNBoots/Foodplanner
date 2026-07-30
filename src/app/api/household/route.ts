import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateHousehold, updateHousehold } from "@/lib/db/queries";

const householdSchema = z.object({
  name: z.string().min(1),
  adults: z.number().int().min(1).max(10),
  kidsCount: z.number().int().min(0).max(10),
  sundayDefaultMode: z.enum(["sit_down", "bbq", "skip"]),
  sundayAdults: z.number().int().min(0).max(10),
  sundayKids: z.number().int().min(0).max(10),
  store: z.string().min(1),
  budgetDefault: z.string().optional(),
});

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = householdSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const household = await getOrCreateHousehold();
  const updated = await updateHousehold(household.id, {
    ...parsed.data,
    budgetDefault: parsed.data.budgetDefault ?? null,
  });
  return NextResponse.json(updated);
}
