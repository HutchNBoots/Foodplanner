"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { households } from "@/lib/db/schema";

type Household = typeof households.$inferSelect;

export function SettingsForm({ household }: { household: Household }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: household.name,
    adults: household.adults,
    kidsCount: household.kidsCount,
    sundayDefaultMode: household.sundayDefaultMode as "sit_down" | "bbq" | "skip",
    sundayAdults: household.sundayAdults,
    sundayKids: household.sundayKids,
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
        <h2 className="font-semibold">Sunday defaults</h2>
        <div className="flex flex-wrap gap-2">
          {(["sit_down", "bbq", "skip"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => set("sundayDefaultMode", mode)}
              className={`rounded-full border px-3.5 py-1.5 text-sm ${
                form.sundayDefaultMode === mode
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-neutral-300 text-neutral-700"
              }`}
            >
              {mode === "sit_down" ? "Sit-down lunch" : mode === "bbq" ? "BBQ" : "Skip"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="sundayAdults">
              Sunday adults
            </label>
            <input
              id="sundayAdults"
              type="number"
              min={0}
              className="input"
              value={form.sundayAdults}
              onChange={(e) => set("sundayAdults", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="sundayKids">
              Sunday kids
            </label>
            <input
              id="sundayKids"
              type="number"
              min={0}
              className="input"
              value={form.sundayKids}
              onChange={(e) => set("sundayKids", Number(e.target.value))}
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
