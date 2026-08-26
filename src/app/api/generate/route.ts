import { NextResponse, after } from "next/server";
import { createWeek, getCurrentHousehold } from "@/lib/db/queries";
import { weekIntakeSchema } from "@/lib/intake";
import { runWeekGeneration } from "@/lib/weeks/generateAndPersist";

export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = weekIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const intake = parsed.data;

  const household = await getCurrentHousehold();
  const week = await createWeek(household.id, intake.weekStartDate, intake);

  // The Claude call + per-meal image lookups can comfortably take longer
  // than is pleasant to hold a request open for on a phone connection.
  // Respond immediately with the week id; the client polls /api/weeks/[id]
  // for status while this continues in the background (PROJECT.md §4 step 2
  // explicitly calls for a loading state here).
  after(() =>
    runWeekGeneration({
      weekId: week.id,
      household,
      weekStartDate: intake.weekStartDate,
      intake,
    }),
  );

  return NextResponse.json({ weekId: week.id }, { status: 202 });
}
