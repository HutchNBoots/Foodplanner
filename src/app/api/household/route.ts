import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateHousehold, updateHousehold } from "@/lib/db/queries";
import { GOALS } from "@/lib/intake";

const householdSchema = z.object({
  name: z.string().min(1),
  adults: z.number().int().min(1).max(10),
  kidsCount: z.number().int().min(0).max(10),
  // The three family meal occasions (MVP 1.2, see DECISIONS.md) - Saturday
  // breakfast has no "bbq" option, the other two keep the full set.
  satBreakfastDefaultMode: z.enum(["sit_down", "skip"]),
  satEveningDefaultMode: z.enum(["sit_down", "bbq", "skip"]),
  sunLunchDefaultMode: z.enum(["sit_down", "bbq", "skip"]),
  familyAdults: z.number().int().min(0).max(10),
  familyKids: z.number().int().min(0).max(10),
  store: z.string().min(1),
  budgetDefault: z.string().optional(),
  favoriteProteins: z.array(z.string()),
  goal: z.enum(GOALS),
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
