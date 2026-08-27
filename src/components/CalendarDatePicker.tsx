"use client";

import { useState } from "react";

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_FORMAT = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

/** Local-date-safe ISO formatter - `date.toISOString()` converts to UTC
 * first, which silently shifts a locally-constructed midnight `Date` back a
 * day for any viewer west of GMT. Every date this component hands out comes
 * from a calendar tap, so getting that wrong would mean the household
 * picking "5 March" and the app silently storing "4 March". */
function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** A compact month-grid date picker for the intake form's delivery date (see
 * DECISIONS.md's "Calendar-based days selection" entry) - the native
 * `<input type="date">` works, but its picker is rendered by the OS/browser
 * and can't be made to match this app's design tokens, and doesn't read as
 * "pick a day off a calendar" the way this feature is meant to feel.
 * `minDate` dates are shown but not selectable, if given - unset by default,
 * so picking a past date (e.g. logging a week retroactively) still works
 * exactly as it always has. */
export function CalendarDatePicker({
  value,
  onChange,
  minDate,
}: {
  value: string;
  onChange: (v: string) => void;
  minDate?: string;
}) {
  const selected = parseISO(value);
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();
  const min = minDate ? parseISO(minDate) : null;

  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  function changeMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-50 hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-ink-800">{MONTH_FORMAT.format(firstOfMonth)}</span>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Next month"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-50 hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800"
        >
          ›
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-ink-400">
        {WEEKDAY_INITIALS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <span key={i} />;
          const iso = toISO(date);
          const isSelected = iso === value;
          const isToday = date.getTime() === today.getTime();
          const isDisabled = min ? date < min : false;
          return (
            <button
              key={i}
              type="button"
              disabled={isDisabled}
              onClick={() => onChange(iso)}
              className={`min-h-11 rounded-lg text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 ${
                isSelected
                  ? "bg-ink-800 text-paper"
                  : isDisabled
                    ? "cursor-not-allowed text-ink-200"
                    : isToday
                      ? "text-ink-800 ring-1 ring-inset ring-ink-300 hover:bg-ink-50"
                      : "text-ink-700 hover:bg-ink-50"
              }`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
