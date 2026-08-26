-- Sign-up journey (see DECISIONS.md's "Sign-up journey" entry). Every
-- household is now an account: an auto-generated `username` ("family1",
-- "family2", ...) plus a `password_hash`. The pre-existing single household
-- (this app was single-tenant before this migration) is backfilled with
-- "family1" and a NULL password_hash rather than a real hash - it keeps
-- working via the transparent-upgrade path in `resolveLogin`
-- (src/lib/auth/login.ts): its first successful login with the shared
-- APP_PASSWORD invite-code value hashes and stores a real password then and
-- there, converting it into an ordinary account with no operator action
-- needed.
ALTER TABLE "households" ADD COLUMN "username" text DEFAULT 'family1' NOT NULL;
--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_username_unique" UNIQUE ("username");
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "password_hash" text;
