CREATE TABLE "freezer_inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"item_name" text NOT NULL,
	"portions" integer NOT NULL,
	"frozen_from_week_id" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN "uses_freezer_item" text;--> statement-breakpoint
ALTER TABLE "freezer_inventory" ADD CONSTRAINT "freezer_inventory_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freezer_inventory" ADD CONSTRAINT "freezer_inventory_frozen_from_week_id_weeks_id_fk" FOREIGN KEY ("frozen_from_week_id") REFERENCES "public"."weeks"("id") ON DELETE set null ON UPDATE no action;