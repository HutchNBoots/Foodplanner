-- MVP 1.2: family meal occasions (Saturday breakfast, Saturday evening,
-- Sunday lunch), kids/family meal tracks, leftover-cap support. Written by
-- hand rather than via `drizzle-kit generate` because the household-column
-- renames below need `drizzle-kit`'s interactive rename resolver, which
-- can't run in this non-TTY environment - see DECISIONS.md.

-- households: rename+preserve the Sunday-era columns rather than drop+add,
-- since they map directly onto the new fields (see DECISIONS.md).
ALTER TABLE "households" RENAME COLUMN "sunday_default_mode" TO "sun_lunch_default_mode";
--> statement-breakpoint
ALTER TABLE "households" RENAME COLUMN "sunday_adults" TO "family_adults";
--> statement-breakpoint
ALTER TABLE "households" RENAME COLUMN "sunday_kids" TO "family_kids";
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "sat_breakfast_default_mode" text DEFAULT 'sit_down' NOT NULL;
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "sat_evening_default_mode" text DEFAULT 'sit_down' NOT NULL;
--> statement-breakpoint

-- meals: `track` (adult/kids/family) alongside the existing `slot` - see
-- DECISIONS.md's "Data model" entry. Existing rows default to 'adult'
-- (pre-MVP1.2 `sunday_special` rows are special-cased back to "family" at
-- render/filter time instead of rewriting this column - see DECISIONS.md).
ALTER TABLE "meals" ADD COLUMN "track" text DEFAULT 'adult' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN "freezer_portions" integer;
