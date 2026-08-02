import type { MealTrack } from "@/lib/meals/track";

export type TrackColor = "parents" | "kids" | "family" | "ink";

/** Maps the existing `MealTrack` data value to its MVP 1.3 display identity -
 * a name a household member recognises ("Parents") and the track color that
 * carries it through cards/tabs/index-tabs consistently (see DECISIONS.md's
 * "MVP 1.3" entry). Purely presentational - `MealTrack` itself is untouched. */
export const TRACK_META: Record<MealTrack, { label: string; color: TrackColor }> = {
  adult: { label: "Parents", color: "parents" },
  kids: { label: "Kids", color: "kids" },
  family: { label: "Family", color: "family" },
};

export const TRACK_COLOR_CLASSES: Record<
  TrackColor,
  { tab: string; solid: string; solidText: string; soft: string; softText: string; border: string; ring: string }
> = {
  parents: {
    tab: "bg-parents-600 text-parents-50",
    solid: "bg-parents-600",
    solidText: "text-parents-50",
    soft: "bg-parents-50",
    softText: "text-parents-700",
    border: "border-parents-600",
    ring: "focus-visible:ring-parents-600",
  },
  kids: {
    tab: "bg-kids-600 text-kids-50",
    solid: "bg-kids-600",
    solidText: "text-kids-50",
    soft: "bg-kids-50",
    softText: "text-kids-700",
    border: "border-kids-600",
    ring: "focus-visible:ring-kids-600",
  },
  family: {
    tab: "bg-family-600 text-family-50",
    solid: "bg-family-600",
    solidText: "text-family-50",
    soft: "bg-family-50",
    softText: "text-family-700",
    border: "border-family-600",
    ring: "focus-visible:ring-family-600",
  },
  ink: {
    tab: "bg-ink-800 text-paper",
    solid: "bg-ink-800",
    solidText: "text-paper",
    soft: "bg-ink-100",
    softText: "text-ink-700",
    border: "border-ink-800",
    ring: "focus-visible:ring-ink-800",
  },
};
