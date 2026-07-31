"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DaysMode = "full_week" | "weekdays_only" | "mon_to_sat";
type SundayMode = "sit_down" | "bbq" | "skip";
type Effort = "quick" | "mixed" | "more_cooking";

const DAYS_OPTIONS: { value: DaysMode; label: string }[] = [
  { value: "full_week", label: "Full 7 days" },
  { value: "weekdays_only", label: "Weekdays only (Mon-Fri)" },
  { value: "mon_to_sat", label: "Mon-Sat" },
];

const SUNDAY_OPTIONS: { value: SundayMode; label: string }[] = [
  { value: "sit_down", label: "Sit-down lunch" },
  { value: "bbq", label: "BBQ" },
  { value: "skip", label: "Skip this week" },
];

const EFFORT_OPTIONS: { value: Effort; label: string }[] = [
  { value: "quick", label: "Quick & easy" },
  { value: "mixed", label: "Mixed" },
  { value: "more_cooking", label: "Happy to cook more" },
];

export function IntakeForm({
  defaultWeekStartDate,
  defaultSundayMode,
  recentTitles,
  dishStyles,
  deemphasised,
  proteinTypes,
}: {
  defaultWeekStartDate: string;
  defaultSundayMode: SundayMode;
  recentTitles: string[];
  dishStyles: string[];
  deemphasised: string[];
  proteinTypes: string[];
}) {
  const router = useRouter();
  const [weekStartDate, setWeekStartDate] = useState(defaultWeekStartDate);
  const [daysMode, setDaysMode] = useState<DaysMode>("full_week");
  const [sundayMode, setSundayMode] = useState<SundayMode>(defaultSundayMode);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedProteins, setSelectedProteins] = useState<string[]>(proteinTypes);
  const [avoidSelected, setAvoidSelected] = useState<string[]>([]);
  const [avoidCustom, setAvoidCustom] = useState("");
  const [budget, setBudget] = useState("");
  const [effort, setEffort] = useState<Effort>("mixed");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const avoidRepeating = [
      ...avoidSelected,
      ...avoidCustom
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ];

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekStartDate,
        daysMode,
        sundayMode,
        dishStyles: selectedStyles,
        proteins: selectedProteins,
        avoidRepeating,
        budget,
        effort,
        notes,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong starting generation.");
      setSubmitting(false);
      return;
    }

    const data = (await res.json()) as { weekId: string };
    router.push(`/plan/${data.weekId}`);
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-6">
      <section className="card p-4">
        <label className="label" htmlFor="weekStartDate">
          Week starting (Monday)
        </label>
        <input
          id="weekStartDate"
          type="date"
          className="input"
          value={weekStartDate}
          onChange={(e) => setWeekStartDate(e.target.value)}
          required
        />

        <span className="label mt-4">How many days do you need?</span>
        <div className="flex flex-wrap gap-2">
          {DAYS_OPTIONS.map((opt) => (
            <PillOption
              key={opt.value}
              label={opt.label}
              active={daysMode === opt.value}
              onClick={() => setDaysMode(opt.value)}
            />
          ))}
        </div>
      </section>

      <section className="card p-4">
        <span className="label">Sunday</span>
        <div className="flex flex-wrap gap-2">
          {SUNDAY_OPTIONS.map((opt) => (
            <PillOption
              key={opt.value}
              label={opt.label}
              active={sundayMode === opt.value}
              onClick={() => setSundayMode(opt.value)}
            />
          ))}
        </div>
      </section>

      <section className="card p-4">
        <span className="label">Dish styles this week</span>
        <div className="flex flex-wrap gap-2">
          {dishStyles.map((style) => (
            <PillOption
              key={style}
              label={style}
              muted={deemphasised.includes(style)}
              active={selectedStyles.includes(style)}
              onClick={() => toggle(selectedStyles, setSelectedStyles, style)}
            />
          ))}
        </div>
        {deemphasised.length > 0 && (
          <p className="mt-2 text-xs text-neutral-400">
            {deemphasised.join(", ")} {deemphasised.length === 1 ? "is" : "are"} de-emphasised this month
            (warm-weather default) - pick it anyway if you want it.
          </p>
        )}
      </section>

      <section className="card p-4">
        <span className="label">Proteins to use this week</span>
        <div className="flex flex-wrap gap-2">
          {proteinTypes.map((protein) => (
            <PillOption
              key={protein}
              label={protein}
              active={selectedProteins.includes(protein)}
              onClick={() => toggle(selectedProteins, setSelectedProteins, protein)}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          All selected by default - tap one to leave it out entirely this week (e.g. unselect Beef).
        </p>
      </section>

      <section className="card p-4">
        <span className="label">Avoid repeating</span>
        {recentTitles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {recentTitles.map((title) => (
              <PillOption
                key={title}
                label={title}
                active={avoidSelected.includes(title)}
                onClick={() => toggle(avoidSelected, setAvoidSelected, title)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No history yet - nothing to suggest.</p>
        )}
        <input
          className="input mt-3"
          placeholder="Anything else to avoid (comma-separated)"
          value={avoidCustom}
          onChange={(e) => setAvoidCustom(e.target.value)}
        />
      </section>

      <section className="card grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="budget">
            Budget this week
          </label>
          <input
            id="budget"
            className="input"
            placeholder="e.g. £70, or 'keep it cheap'"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
        <div>
          <span className="label">Effort level</span>
          <div className="flex flex-wrap gap-2">
            {EFFORT_OPTIONS.map((opt) => (
              <PillOption
                key={opt.value}
                label={opt.label}
                active={effort === opt.value}
                onClick={() => setEffort(opt.value)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="card p-4">
        <label className="label" htmlFor="notes">
          Anything else? (guests, leftovers to use up, cravings)
        </label>
        <textarea
          id="notes"
          className="input"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? "Starting..." : "Generate my week"}
      </button>
    </form>
  );
}

function PillOption({
  label,
  active,
  muted,
  onClick,
}: {
  label: string;
  active: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : muted
            ? "border-neutral-200 text-neutral-400 hover:bg-neutral-50"
            : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {label}
    </button>
  );
}
