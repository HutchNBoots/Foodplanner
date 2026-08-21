import type { WeekIntake } from "@/lib/db/schema";
import { TrackSection } from "./IndexTab";

/** Surfaces what was actually asked for when this week was generated - the
 * full intake is already persisted verbatim on `weeks.intakeJson` (see
 * DECISIONS.md's "MVP 1.3 follow-up" entry), this just renders the two
 * free-form fields (notes, avoid-repeating) at the top of the plan instead
 * of leaving them write-only. Renders nothing if neither was set. */
export function WeekIntakeSummary({ intake }: { intake: WeekIntake }) {
  const hasNotes = intake.notes.trim().length > 0;
  const hasAvoid = intake.avoidRepeating.length > 0;
  if (!hasNotes && !hasAvoid) return null;

  return (
    <TrackSection color="ink" label="About this week">
      {hasNotes && <p className="text-sm text-ink-700">{intake.notes}</p>}
      {hasAvoid && (
        <p className="text-sm text-ink-500">
          <span className="font-medium text-ink-700">Avoiding:</span> {intake.avoidRepeating.join(", ")}
        </p>
      )}
    </TrackSection>
  );
}
