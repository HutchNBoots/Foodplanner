import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { weeks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_request: Request, { params }: { params: Promise<{ weekId: string }> }) {
  const { weekId } = await params;
  const [week] = await db
    .select({ status: weeks.status, errorMessage: weeks.errorMessage })
    .from(weeks)
    .where(eq(weeks.id, weekId));

  if (!week) {
    return NextResponse.json({ error: "Week not found." }, { status: 404 });
  }

  return NextResponse.json(week);
}
