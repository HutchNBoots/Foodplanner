"use client";

import { useState } from "react";
import type { FeedbackRating } from "@/lib/db/schema";

const OPTIONS: { value: FeedbackRating; label: string }[] = [
  { value: "loved", label: "Loved it" },
  { value: "repeat", label: "Repeat this" },
  { value: "too_much_effort", label: "Too much effort" },
  { value: "too_bland", label: "Too bland" },
];

export function FeedbackControls({
  mealId,
  weekId,
  initialRating,
}: {
  mealId: string;
  weekId: string;
  initialRating: FeedbackRating | null;
}) {
  const [rating, setRating] = useState<FeedbackRating | null>(initialRating);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(value: FeedbackRating, noteText?: string) {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealId, weekId, rating: value, note: noteText || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      setRating(value);
      setSaved(true);
    }
  }

  return (
    <div className="mt-3 border-t border-ink-100 pt-3">
      {/* 44px min-height + gap-2.5, matching the tap-target floor MVP 1.3
          established everywhere else (see DECISIONS.md's "Multi-agent app
          review" entry - this row was the one place that pass missed). */}
      <div className="flex flex-wrap gap-2.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={saving}
            onClick={() => submit(opt.value)}
            className={`min-h-11 rounded-lg border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
              rating === opt.value
                ? "border-sage-600 bg-sage-50 text-sage-700"
                : "border-ink-300 text-ink-600 hover:bg-ink-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowNote((v) => !v)}
          className="min-h-11 rounded-lg border border-ink-300 px-3 py-1 text-xs text-ink-500 transition hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          + note
        </button>
      </div>
      {showNote && (
        <div className="mt-2 flex gap-2">
          <input
            className="input"
            placeholder="Optional note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary shrink-0"
            disabled={saving || !rating}
            onClick={() => rating && submit(rating, note)}
          >
            Save
          </button>
        </div>
      )}
      {saved && <p className="mt-1 text-xs text-sage-600">Saved - this&apos;ll steer next week&apos;s plan.</p>}
    </div>
  );
}
