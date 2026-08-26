// Higher-level login resolution - deliberately its own file rather than
// living in session.ts, since it needs DB access (session.ts stays
// Edge-safe/DB-free so proxy.ts can keep importing it - see DECISIONS.md's
// "Sign-up journey" entry). Only ever called from Node API routes.

import { getHouseholdByUsername, setHouseholdPassword } from "@/lib/db/queries";
import { hashPassword, verifyPassword } from "./password";
import { constantTimeEquals } from "./session";

/** Resolves a username/password login. Handles the one-time transparent
 * upgrade for a household that predates the sign-up journey (`passwordHash`
 * is null): if the given password matches the shared `APP_PASSWORD`
 * (now doubling as the sign-up invite code), it's hashed and stored as that
 * household's real password, and login succeeds - no operator action
 * needed to migrate the pre-existing household. Returns the household's id
 * on success, `null` on any failure (wrong username, wrong password, or a
 * legacy row when `APP_PASSWORD` isn't set/doesn't match) - deliberately
 * not distinguishing which, so a login failure doesn't reveal whether a
 * username exists. */
export async function resolveLogin(username: string, password: string): Promise<string | null> {
  const household = await getHouseholdByUsername(username);
  if (!household) return null;

  if (household.passwordHash) {
    const ok = await verifyPassword(password, household.passwordHash);
    return ok ? household.id : null;
  }

  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword || !constantTimeEquals(password, appPassword)) return null;

  const newHash = await hashPassword(password);
  await setHouseholdPassword(household.id, newHash);
  return household.id;
}
