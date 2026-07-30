CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`week_id` text NOT NULL,
	`rating` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`week_id`) REFERENCES `weeks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'Our household' NOT NULL,
	`adults` integer DEFAULT 2 NOT NULL,
	`kids_count` integer DEFAULT 2 NOT NULL,
	`sunday_default_mode` text DEFAULT 'sit_down' NOT NULL,
	`sunday_adults` integer DEFAULT 2 NOT NULL,
	`sunday_kids` integer DEFAULT 2 NOT NULL,
	`store` text DEFAULT 'Sainsbury''s' NOT NULL,
	`budget_default` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`week_id` text NOT NULL,
	`day_date` text NOT NULL,
	`day_of_week` text NOT NULL,
	`slot` text NOT NULL,
	`title` text NOT NULL,
	`servings_adults` integer NOT NULL,
	`servings_kids` integer DEFAULT 0 NOT NULL,
	`ingredients_json` text NOT NULL,
	`method_json` text NOT NULL,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`fibre_g` real NOT NULL,
	`image_url` text,
	`image_credit_json` text,
	`image_source` text,
	`batch_makes` integer,
	`leftover_for_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`week_id`) REFERENCES `weeks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `shopping_items` (
	`id` text PRIMARY KEY NOT NULL,
	`week_id` text NOT NULL,
	`product_name` text NOT NULL,
	`quantity` real,
	`unit` text,
	`display_quantity` text NOT NULL,
	`aisle` text NOT NULL,
	`used_in_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`week_id`) REFERENCES `weeks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `weeks` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`week_start_date` text NOT NULL,
	`status` text DEFAULT 'generating' NOT NULL,
	`error_message` text,
	`intake_json` text NOT NULL,
	`plan_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
