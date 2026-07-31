import { z } from "zod";

export const PROTEIN_TYPES = [
  "Chicken",
  "Beef",
  "Pork",
  "Fish & seafood",
  "Turkey",
  "Eggs",
  "Plant-based",
] as const;

export const weekIntakeSchema = z.object({
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (yyyy-mm-dd)."),
  daysMode: z.enum(["full_week", "weekdays_only", "mon_to_sat"]),
  sundayMode: z.enum(["sit_down", "bbq", "skip"]),
  dishStyles: z.array(z.string()).default([]),
  // Proteins to actually use this week - defaults to all of them (nothing
  // excluded) if the client ever omits the field.
  proteins: z.array(z.string()).default([...PROTEIN_TYPES]),
  avoidRepeating: z.array(z.string()).default([]),
  budget: z.string().default(""),
  effort: z.enum(["quick", "mixed", "more_cooking"]),
  notes: z.string().default(""),
});

export type WeekIntakeInput = z.infer<typeof weekIntakeSchema>;

/** Defaults the intake form's week picker to the coming Monday (or today, if
 * today already is one) so starting a new week is a single confirm tap. */
export function upcomingMonday(from: Date = new Date()): string {
  const date = new Date(from);
  const day = date.getDay(); // 0 = Sunday
  const daysUntilMonday = day === 1 ? 0 : ((8 - day) % 7 || 7);
  date.setDate(date.getDate() + (day === 1 ? 0 : daysUntilMonday));
  return date.toISOString().slice(0, 10);
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** `Date.getDay()` is provably 0-6, but its return type is plain `number` -
 * this cast is what lets tuple indexing stay non-optional under
 * `noUncheckedIndexedAccess` instead of forcing `| undefined` everywhere. */
function dayName(date: Date): string {
  return DAY_NAMES[date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6];
}

/** Expands an intake's daysMode + weekStartDate into the concrete list of
 * (date, dayOfWeek) pairs the generation prompt should plan for. */
export function daysForIntake(intake: Pick<WeekIntakeInput, "weekStartDate" | "daysMode">) {
  const start = new Date(`${intake.weekStartDate}T00:00:00`);
  const count = intake.daysMode === "full_week" ? 7 : intake.daysMode === "mon_to_sat" ? 6 : 5;

  return Array.from({ length: count }, (_, i) => {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    return { date: date.toISOString().slice(0, 10), dayOfWeek: dayName(date) };
  });
}
