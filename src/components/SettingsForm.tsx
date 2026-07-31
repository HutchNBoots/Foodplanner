"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { households } from "@/lib/db/schema";

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

export function SettingsForm({ household }: { household: Household }) {
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
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
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

      <section className="card space-y-4 p-4">
        <h2 className="font-semibold">Family meal occasions</h2>
        <p className="text-xs text-neutral-400">
          Defaults for the week - each is still editable per week in the intake form. Saturday
          breakfast is the softest of the three, on by default but easiest to skip.
        </p>
        {FAMILY_OCCASIONS.map((occasion) => (
          <div key={occasion.key}>
            <span className="label">{occasion.label}</span>
            <div className="flex flex-wrap gap-2">
              {occasion.modes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set(occasion.key, mode)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm ${
                    form[occasion.key] === mode
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-neutral-300 text-neutral-700"
                  }`}
                >
                  {MODE_LABEL[mode]}
                </button>
              ))}
            </div>
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
      </section>

      <button type="submit" className="btn-primary w-full" disabled={saving}>
        {saving ? "Saving..." : "Save settings"}
      </button>
      {saved && <p className="text-center text-sm text-brand-600">Saved.</p>}
    </form>
  );
}
