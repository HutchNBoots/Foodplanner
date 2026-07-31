CREATE TABLE "ingredients_canonical" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aisle" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopping_items" ADD COLUMN "checked" boolean DEFAULT false NOT NULL;