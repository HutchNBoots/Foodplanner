-- MVP 2.1: favorite proteins default for the intake form's protein picker.
-- Written with an explicit SQL DEFAULT (matching PROTEIN_TYPES in
-- src/lib/intake.ts) rather than the drizzle-kit-generated bare NOT NULL -
-- `$defaultFn` is an application-level default (computed by drizzle-orm in
-- JS at insert time), not a SQL-level one, so drizzle-kit can't derive a SQL
-- DEFAULT from it automatically. Without one, this ALTER TABLE would fail
-- against the real production households table, which already has a row.
ALTER TABLE "households" ADD COLUMN "favorite_proteins" jsonb DEFAULT '["Chicken","Beef","Pork","Fish & seafood","Turkey","Eggs","Plant-based"]'::jsonb NOT NULL;
