import { NextResponse } from "next/server";
import { z } from "zod";
import { addFeedback } from "@/lib/db/queries";

const feedbackSchema = z.object({
  mealId: z.string().min(1),
  weekId: z.string().min(1),
  rating: z.enum(["loved", "too_much_effort", "too_bland", "repeat"]),
  note: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const row = await addFeedback(parsed.data.mealId, parsed.data.weekId, parsed.data.rating, parsed.data.note);
  return NextResponse.json(row);
}
