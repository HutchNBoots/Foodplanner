-- Goals selector: two-axis redesign (see DECISIONS.md's "Goals selector:
-- two-axis redesign" entry). Replaces the single 4-way `goal` column with
-- an independent `energy_direction` (lose_weight/balanced/build_muscle) and
-- a stackable `focuses` array (increase_protein/reduce_cholesterol).
--
-- Backfill preserves every existing household's effective settings exactly:
-- "reduce_cholesterol" had no calorie-direction opinion, so it maps to
-- "balanced" direction + the reduce_cholesterol focus; the other three
-- values map straight across with no focus.
ALTER TABLE "households" ADD COLUMN "energy_direction" text DEFAULT 'lose_weight' NOT NULL;
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "focuses" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "households" SET "energy_direction" = CASE WHEN "goal" = 'reduce_cholesterol' THEN 'balanced' ELSE "goal" END;
--> statement-breakpoint
UPDATE "households" SET "focuses" = '["reduce_cholesterol"]'::jsonb WHERE "goal" = 'reduce_cholesterol';
--> statement-breakpoint
ALTER TABLE "households" DROP COLUMN "goal";
