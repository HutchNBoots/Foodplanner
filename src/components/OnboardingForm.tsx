"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { households } from "@/lib/db/schema";

type Household = typeof households.$inferSelect;

/** First-run setup after /signup (see DECISIONS.md's "Sign-up journey"
 * entry) - a deliberately short wizard covering only the 4 fields the
 * operator called out (household name, kids count, supermarket, budget),
 * not the full Settings form. Everything else on the household keeps the
 * schema defaults it already has from `createHouseholdAccount` and can be
 * tweaked later in Settings - carried through unchanged in the PATCH body
 * below since `/api/household` takes the complete set of fields, not a
 * partial update. */
export function OnboardingForm({ household }: { household: Household }) {
  const router = useRouter();
  const [name, setName] = useState(household.name);
  const [kidsCount, setKidsCount] = useState(household.kidsCount);
  const [store, setStore] = useState(household.store);
  const [budgetDefault, setBudgetDefault] = useState(household.budgetDefault ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/household", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        adults: household.adults,
        kidsCount,
        satBreakfastDefaultMode: household.satBreakfastDefaultMode,
        satEveningDefaultMode: household.satEveningDefaultMode,
        sunLunchDefaultMode: household.sunLunchDefaultMode,
        familyAdults: household.familyAdults,
        familyKids: household.familyKids,
        store,
        budgetDefault,
        favoriteProteins: household.favoriteProteins,
        energyDirection: household.energyDirection,
        focuses: household.focuses,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      setError("Something went wrong saving your household - you can fill these in later under Settings.");
      return;
    }

    router.push("/welcome");
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-4">
      <div>
        <label className="label" htmlFor="name">
          Household name
        </label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="kidsCount">
          How many kids?
        </label>
        <input
          id="kidsCount"
          type="number"
          min={0}
          className="input"
          value={kidsCount}
          onChange={(e) => setKidsCount(Number(e.target.value))}
        />
      </div>
      <div>
        <label className="label" htmlFor="store">
          Which supermarket?
        </label>
        <input id="store" className="input" value={store} onChange={(e) => setStore(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="budgetDefault">
          Weekly budget
        </label>
        <input
          id="budgetDefault"
          className="input"
          placeholder="e.g. £70"
          value={budgetDefault}
          onChange={(e) => setBudgetDefault(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={saving}>
        {saving ? "Saving..." : "Continue"}
      </button>
    </form>
  );
}
