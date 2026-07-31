import { NextResponse, after } from "next/server";
import { getOrCreateHousehold, getWeekById, resetWeekForRetry } from "@/lib/db/queries";
import { runWeekGeneration } from "@/lib/weeks/generateAndPersist";

// Same generation call as /api/generate runs here via after() - needs the
// same extended duration, or Vercel would cap this route at its (much
// shorter) default and kill a real generation mid-flight.
export const maxDuration = 300;

/** Retries a failed week's generation in place, reusing its stored intake
 * instead of sending the user back through the whole intake form (MVP 1.1
 * bug fix - see DECISIONS.md's "Retry design"). */
export async function POST(_request: Request, { params }: { params: Promise<{ weekId: string }> }) {
  const { weekId } = await params;
  const week = await getWeekById(weekId);

  if (!week) {
    return NextResponse.json({ error: "Week not found." }, { status: 404 });
  }
  if (week.status !== "error") {
    return NextResponse.json({ error: "Only a failed week can be retried." }, { status: 409 });
  }

  const household = await getOrCreateHousehold();
  await resetWeekForRetry(weekId);

  after(() =>
    runWeekGeneration({
      weekId,
      household,
      weekStartDate: week.weekStartDate,
      intake: week.intakeJson,
    }),
  );

  return NextResponse.json({ weekId }, { status: 202 });
}
