"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { households } from "@/lib/db/schema";
import { TabStrip } from "./TabStrip";
import { Chip } from "./Chip";
import { TrackSection } from "./IndexTab";

type Household = typeof households.$inferSelect;

// The three family meal occasions (MVP 1.2, see DECISIONS.md) - Saturday
// breakfast has no "bbq" option (a BBQ breakfast doesn't make sense), the
// other two keep the full sit-down/BBQ/skip set from MVP1's Sunday mode.
const FAMILY_OCCASIONS = [
  { key: "satBreakfastDefaultMode", label: "Saturday breakfast", modes: ["sit_down", "skip"] as const },
  { key: "satEveningDefaultMode", label: "Saturday evening", modes: ["sit_down", "bbq", "skip"] as const },
  { key: "sunLunchDefaultMode", label: "Sunday lunch", modes: ["sit_down", "bbq", "skip"] as const },
] as const;

const MODE_LABEL: Record<string, string> = { sit_down: "Sit-down", bbq: "BBQ", skip: "Skip" };

type EnergyDirection = "lose_weight" | "balanced" | "build_muscle";
type NutritionFocus = "increase_protein" | "reduce_cholesterol";

// Two independent axes (see DECISIONS.md's "Goals selector: two-axis
// redesign" entry) - calorie direction is single-select (3 options fits one
// TabStrip row), food-quality focuses are multi-select chips stackable on
// top of any direction. Same pattern as IntakeForm's per-week picker - this
// is just the household default, still fully overridable per week.
const ENERGY_DIRECTION_OPTIONS: { value: EnergyDirection; label: string }[] = [
  { value: "lose_weight", label: "Lose weight" },
  { value: "balanced", label: "Balanced" },
  { value: "build_muscle", label: "Build muscle" },
];
const FOCUS_OPTIONS: { value: NutritionFocus; label: string }[] = [
  { value: "increase_protein", label: "Increase protein" },
  { value: "reduce_cholesterol", label: "Reduce cholesterol" },
];

export function SettingsForm({
  household,
  proteinTypes,
}: {
  household: Household;
  proteinTypes: string[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: household.name,
    adults: household.adults,
    kidsCount: household.kidsCount,
    satBreakfastDefaultMode: household.satBreakfastDefaultMode as "sit_down" | "skip",
    satEveningDefaultMode: household.satEveningDefaultMode as "sit_down" | "bbq" | "skip",
    sunLunchDefaultMode: household.sunLunchDefaultMode as "sit_down" | "bbq" | "skip",
    familyAdults: household.familyAdults,
    familyKids: household.familyKids,
    store: household.store,
    budgetDefault: household.budgetDefault ?? "",
    favoriteProteins: household.favoriteProteins,
    energyDirection: household.energyDirection as EnergyDirection,
    focuses: household.focuses as NutritionFocus[],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function toggleProtein(protein: string) {
    set(
      "favoriteProteins",
      form.favoriteProteins.includes(protein)
        ? form.favoriteProteins.filter((p) => p !== protein)
        : [...form.favoriteProteins, protein],
    );
  }

  function toggleFocus(focus: NutritionFocus) {
    set(
      "focuses",
      form.focuses.includes(focus) ? form.focuses.filter((f) => f !== focus) : [...form.focuses, focus],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/household", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="card space-y-4 p-4">
        <div>
          <span className="label">Username</span>
          <p className="data-figure text-lg font-semibold text-ink-800">{household.username}</p>
          <p className="mt-1 text-xs text-ink-500">
            What you log in with - not editable here. This is separate from the household name below,
            which is just a display name.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="name">
            Household name
          </label>
          <input
            id="name"
            className="input"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="adults">
              Adults
            </label>
            <input
              id="adults"
              type="number"
              min={1}
              className="input"
              value={form.adults}
              onChange={(e) => set("adults", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="kids">
              Kids
            </label>
            <input
              id="kids"
              type="number"
              min={0}
              className="input"
              value={form.kidsCount}
              onChange={(e) => set("kidsCount", Number(e.target.value))}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="store">
            Store
          </label>
          <input
            id="store"
            className="input"
            value={form.store}
            onChange={(e) => set("store", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="budgetDefault">
            Default weekly budget
          </label>
          <input
            id="budgetDefault"
            className="input"
            placeholder="e.g. £70"
            value={form.budgetDefault}
            onChange={(e) => set("budgetDefault", e.target.value)}
          />
        </div>
      </section>

      <TrackSection color="family" label="Family">
        <div>
          <h2 className="section-title text-base">Family meal occasions</h2>
          <p className="mt-1 text-xs text-ink-500">
            Defaults for the week - each is still editable per week in the intake form. Saturday
            breakfast is the softest of the three, on by default but easiest to skip.
          </p>
        </div>
        {FAMILY_OCCASIONS.map((occasion) => (
          <div key={occasion.key}>
            <span className="label">{occasion.label}</span>
            <TabStrip
              name={occasion.label}
              options={occasion.modes.map((mode) => ({ value: mode, label: MODE_LABEL[mode] ?? mode }))}
              value={form[occasion.key]}
              onChange={(value) => set(occasion.key, value as never)}
            />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="familyAdults">
              Family-occasion adults
            </label>
            <input
              id="familyAdults"
              type="number"
              min={0}
              className="input"
              value={form.familyAdults}
              onChange={(e) => set("familyAdults", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="familyKids">
              Family-occasion kids
            </label>
            <input
              id="familyKids"
              type="number"
              min={0}
              className="input"
              value={form.familyKids}
              onChange={(e) => set("familyKids", Number(e.target.value))}
            />
          </div>
        </div>
      </TrackSection>

      <TrackSection color="ink" label="Nutrition goal">
        <div>
          <p className="mt-1 text-xs text-ink-500">
            Default nutrition framing for adult meals each week - still fully overridable per week on the
            intake form. Kids and family-occasion meals always stay balanced regardless of this setting.
          </p>
        </div>
        <div>
          <span className="label">Direction</span>
          <TabStrip
            name="Nutrition direction"
            options={ENERGY_DIRECTION_OPTIONS}
            value={form.energyDirection}
            onChange={(v) => set("energyDirection", v)}
          />
        </div>
        <div>
          <span className="label">Focus (optional, stack as many as you like)</span>
          <div className="flex flex-wrap gap-2.5">
            {FOCUS_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                active={form.focuses.includes(opt.value)}
                onClick={() => toggleFocus(opt.value)}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-500">
            &quot;Increase protein&quot; applies whichever direction is selected above - higher protein helps
            both weight loss (satiety, preserving muscle in a deficit) and muscle building, so it&apos;s not
            tied to one direction. &quot;Reduce cholesterol&quot; favours ingredients with recognised
            cholesterol-lowering properties (oats, oily fish, nuts, legumes, olive oil...) and
            lower-saturated-fat choices (low-fat dairy, lean/trimmed meat, skinless poultry...), marked on
            qualifying ingredients.
          </p>
        </div>
        <p className="text-xs text-ink-500">
          General everyday guidance, not individualised advice - talk to a healthcare professional for anything
          specific to you.
        </p>
      </TrackSection>

      <TrackSection color="ink" label="Proteins">
        <div>
          <h2 className="section-title text-base">Favorite proteins</h2>
          <p className="mt-1 text-xs text-ink-500">
            Selected by default each week on the intake form&apos;s protein picker - still fully
            overridable per week.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {proteinTypes.map((protein) => (
            <Chip
              key={protein}
              label={protein}
              active={form.favoriteProteins.includes(protein)}
              onClick={() => toggleProtein(protein)}
            />
          ))}
        </div>
      </TrackSection>

      <button type="submit" className="btn-primary w-full" disabled={saving}>
        {saving ? "Saving..." : "Save settings"}
      </button>
      {saved && <p className="text-center text-sm text-sage-600">Saved.</p>}
    </form>
  );
}
