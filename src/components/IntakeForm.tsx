"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TabStrip } from "./TabStrip";
import { Chip } from "./Chip";
import { CollapsibleTrackSection, TrackSection } from "./IndexTab";

type DaysMode = "full_week" | "weekdays_only" | "mon_to_sat";
type SatBreakfastMode = "sit_down" | "skip";
type OccasionMode = "sit_down" | "bbq" | "skip";
type Effort = "quick" | "mixed" | "more_cooking";
type MealTime = "breakfast" | "lunch" | "dinner";
type MealTimesNeeded = { breakfast: boolean; lunch: boolean; dinner: boolean };

const MEAL_TIMES: { key: MealTime; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
];

const DAYS_OPTIONS: { value: DaysMode; label: string }[] = [
  { value: "full_week", label: "Full week" },
  { value: "weekdays_only", label: "Weekdays" },
  { value: "mon_to_sat", label: "Mon-Sat" },
];

// Saturday breakfast has no "bbq" option (a BBQ breakfast doesn't make
// sense) - the other two family occasions keep the full set, same as MVP1's
// Sunday mode (see DECISIONS.md). Labels shortened for MVP 1.3's tab-strip
// control, which needs single-line labels at ~110px per segment on a 375px
// screen (see DECISIONS.md's UX/interaction pressure-test finding).
const SAT_BREAKFAST_OPTIONS: { value: SatBreakfastMode; label: string }[] = [
  { value: "sit_down", label: "Sit-down" },
  { value: "skip", label: "Skip" },
];

const EVENING_OPTIONS: { value: OccasionMode; label: string }[] = [
  { value: "sit_down", label: "Sit-down" },
  { value: "bbq", label: "BBQ" },
  { value: "skip", label: "Skip" },
];

const SUN_LUNCH_OPTIONS: { value: OccasionMode; label: string }[] = [
  { value: "sit_down", label: "Sit-down" },
  { value: "bbq", label: "BBQ" },
  { value: "skip", label: "Skip" },
];

const EFFORT_OPTIONS: { value: Effort; label: string }[] = [
  { value: "quick", label: "Quick" },
  { value: "mixed", label: "Mixed" },
  { value: "more_cooking", label: "More cooking" },
];

function optionLabel<T extends string>(options: { value: T; label: string }[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function familyOccasionSummary(satBreakfast: SatBreakfastMode, satEvening: OccasionMode, sunLunch: OccasionMode) {
  return `Sat breakfast: ${optionLabel(SAT_BREAKFAST_OPTIONS, satBreakfast)} · Sat evening: ${optionLabel(EVENING_OPTIONS, satEvening)} · Sun lunch: ${optionLabel(SUN_LUNCH_OPTIONS, sunLunch)}`;
}

function mealTimesSummary(mealTimes: MealTimesNeeded) {
  const on = MEAL_TIMES.filter((mt) => mealTimes[mt.key]).map((mt) => mt.label);
  return on.length ? on.join(", ") : "None this week";
}

function listSummary(items: string[], max = 3) {
  if (items.length === 0) return "None selected";
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")} +${items.length - max} more`;
}

export function IntakeForm({
  defaultWeekStartDate,
  defaultSatBreakfastMode,
  defaultSatEveningMode,
  defaultSunLunchMode,
  defaultBudget,
  defaultProteins,
  recentTitles,
  dishStyles,
  deemphasised,
  proteinTypes,
}: {
  defaultWeekStartDate: string;
  defaultSatBreakfastMode: SatBreakfastMode;
  defaultSatEveningMode: OccasionMode;
  defaultSunLunchMode: OccasionMode;
  defaultBudget: string;
  defaultProteins: string[];
  recentTitles: string[];
  dishStyles: string[];
  deemphasised: string[];
  proteinTypes: string[];
}) {
  const router = useRouter();
  const [weekStartDate, setWeekStartDate] = useState(defaultWeekStartDate);
  const [daysMode, setDaysMode] = useState<DaysMode>("full_week");
  // The three family meal occasions (MVP 1.2, see DECISIONS.md) - replaces
  // MVP1's single Sunday-mode picker.
  const [satBreakfast, setSatBreakfast] = useState<SatBreakfastMode>(defaultSatBreakfastMode);
  const [satEvening, setSatEvening] = useState<OccasionMode>(defaultSatEveningMode);
  const [sunLunch, setSunLunch] = useState<OccasionMode>(defaultSunLunchMode);
  // Which meal-times each track needs this week (MVP 2.1, see DECISIONS.md) -
  // lets adults optionally get a breakfast, and lets the kids track be
  // skipped entirely (toggle all three off). Defaults match pre-MVP2.1
  // behaviour exactly - not Settings-backed, just a sensible starting point,
  // same as daysMode/effort below.
  const [parentMeals, setParentMeals] = useState<MealTimesNeeded>({
    breakfast: false,
    lunch: true,
    dinner: true,
  });
  const [kidsMeals, setKidsMeals] = useState<MealTimesNeeded>({
    breakfast: true,
    lunch: true,
    dinner: true,
  });
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  // Per-week cholesterol-lowering focus toggle - biases generation toward
  // ingredients with recognised LDL-cholesterol-lowering properties, shown
  // as a heart-icon badge on qualifying ingredients (see DECISIONS.md).
  const [lowerCholesterol, setLowerCholesterol] = useState(false);
  // Defaults from the household's favorite proteins (MVP 2.1, see
  // DECISIONS.md) instead of always defaulting to every protein - still
  // fully overridable per week.
  const [selectedProteins, setSelectedProteins] = useState<string[]>(defaultProteins);
  const [avoidSelected, setAvoidSelected] = useState<string[]>([]);
  const [avoidCustom, setAvoidCustom] = useState("");
  // Pre-filled from household settings (MVP 1.1, see DECISIONS.md's "Intake
  // form prefill" entry) but fully overridable per week, same as every other
  // field here.
  const [budget, setBudget] = useState(defaultBudget);
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
        familyMeals: { satBreakfast, satEvening, sunLunch },
        parentMeals,
        kidsMeals,
        dishStyles: selectedStyles,
        proteins: selectedProteins,
        avoidRepeating,
        budget,
        effort,
        notes,
        lowerCholesterol,
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
    <form onSubmit={onSubmit} className="mt-6">
      <div className="card p-4">
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
        <TabStrip name="Days needed" options={DAYS_OPTIONS} value={daysMode} onChange={setDaysMode} />
      </div>

      <CollapsibleTrackSection
        color="family"
        label="Family"
        summary={familyOccasionSummary(satBreakfast, satEvening, sunLunch)}
      >
        <div>
          <p className="mb-1.5 text-sm text-ink-600">Saturday breakfast</p>
          <TabStrip options={SAT_BREAKFAST_OPTIONS} value={satBreakfast} onChange={setSatBreakfast} />
        </div>
        <div>
          <p className="mb-1.5 text-sm text-ink-600">Saturday evening</p>
          <TabStrip options={EVENING_OPTIONS} value={satEvening} onChange={setSatEvening} />
        </div>
        <div>
          <p className="mb-1.5 text-sm text-ink-600">Sunday lunch</p>
          <TabStrip options={SUN_LUNCH_OPTIONS} value={sunLunch} onChange={setSunLunch} />
        </div>
      </CollapsibleTrackSection>

      <CollapsibleTrackSection color="parents" label="Parents" summary={`Meals needed: ${mealTimesSummary(parentMeals)}`}>
        <div className="flex flex-wrap gap-2.5">
          {MEAL_TIMES.map((mt) => (
            <Chip
              key={mt.key}
              label={mt.label}
              active={parentMeals[mt.key]}
              onClick={() => setParentMeals((m) => ({ ...m, [mt.key]: !m[mt.key] }))}
            />
          ))}
        </div>
      </CollapsibleTrackSection>

      <CollapsibleTrackSection color="kids" label="Kids" summary={`Meals needed: ${mealTimesSummary(kidsMeals)}`}>
        <div className="flex flex-wrap gap-2.5">
          {MEAL_TIMES.map((mt) => (
            <Chip
              key={mt.key}
              label={mt.label}
              active={kidsMeals[mt.key]}
              onClick={() => setKidsMeals((m) => ({ ...m, [mt.key]: !m[mt.key] }))}
            />
          ))}
        </div>
        {!kidsMeals.breakfast && !kidsMeals.lunch && !kidsMeals.dinner && (
          <p className="text-xs text-ink-500">All three off - no kids meals will be planned this week.</p>
        )}
      </CollapsibleTrackSection>

      <TrackSection color="ink" label="This week">
        <div>
          <span className="label">Dish styles</span>
          <div className="flex flex-wrap gap-2.5">
            {dishStyles.map((style) => (
              <Chip
                key={style}
                label={style}
                muted={deemphasised.includes(style)}
                active={selectedStyles.includes(style)}
                onClick={() => toggle(selectedStyles, setSelectedStyles, style)}
              />
            ))}
          </div>
          {deemphasised.length > 0 && (
            <p className="mt-2 text-xs text-ink-500">
              {deemphasised.join(", ")} {deemphasised.length === 1 ? "is" : "are"} de-emphasised this month
              (warm-weather default) - pick it anyway if you want it.
            </p>
          )}
        </div>
        <div>
          <span className="label">Nutrition focus</span>
          <div className="flex flex-wrap gap-2.5">
            <Chip
              label="♥ Lower cholesterol"
              active={lowerCholesterol}
              onClick={() => setLowerCholesterol((v) => !v)}
            />
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Favours ingredients with recognised cholesterol-lowering properties this week (oats, oily fish, nuts,
            legumes, olive oil...) - qualifying ingredients are marked with ♥ on the recipe.
          </p>
        </div>
      </TrackSection>

      <CollapsibleTrackSection color="ink" label="Proteins" summary={`Using: ${listSummary(selectedProteins)}`}>
        <div className="flex flex-wrap gap-2.5">
          {proteinTypes.map((protein) => (
            <Chip
              key={protein}
              label={protein}
              active={selectedProteins.includes(protein)}
              onClick={() => toggle(selectedProteins, setSelectedProteins, protein)}
            />
          ))}
        </div>
        <p className="text-xs text-ink-500">
          All selected by default - tap one to leave it out entirely this week (e.g. unselect Beef).
        </p>
      </CollapsibleTrackSection>

      <details className="card group mt-5 p-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-semibold text-ink-800 [&::-webkit-details-marker]:hidden">
          Budget, effort &amp; avoid repeating
          <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-ink-400 transition group-open:rotate-180">
            <path d="M5 7l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="mt-4 space-y-4">
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
            <TabStrip name="Effort level" options={EFFORT_OPTIONS} value={effort} onChange={setEffort} />
          </div>
          <div>
            <span className="label">Avoid repeating</span>
            {recentTitles.length > 0 ? (
              <div className="flex flex-wrap gap-2.5">
                {recentTitles.map((title) => (
                  <Chip
                    key={title}
                    label={title}
                    active={avoidSelected.includes(title)}
                    onClick={() => toggle(avoidSelected, setAvoidSelected, title)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-500">No history yet - nothing to suggest.</p>
            )}
            <input
              className="input mt-2"
              placeholder="Anything else to avoid (comma-separated)"
              value={avoidCustom}
              onChange={(e) => setAvoidCustom(e.target.value)}
            />
          </div>
        </div>
      </details>

      <TrackSection color="ink" label="About this week">
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
      </TrackSection>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button type="submit" className="btn-primary mt-6 w-full" disabled={submitting}>
        {submitting ? "Starting..." : "Generate my week"}
      </button>
    </form>
  );
}
